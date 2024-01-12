import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import {
  capitalize,
  getOperationName,
  getRequestBodyType,
  lc,
} from '../../utils/handlebarsHelpers';
import {
  Entity,
  EntityOperation,
  JAVA_SERVER_PACKAGE,
} from './javaServerGenerator';

/**
 * Get a list of resources that needs to be imported for a entity's model class
 *
 * @param property
 * @returns
 */
export const getJavaModelImports = (entityOrSchema: Entity | SchemaObject) => {
  const resources: Record<string, boolean> = {};
  const schema =
    (entityOrSchema as Entity).schema ?? (entityOrSchema as SchemaObject);
  const properties = schema?.properties ?? {};

  for (const propertyName in properties) {
    const property = properties[propertyName] as SchemaObject;
    const propertyResources = getJavaImportsForProperty(property);
    propertyResources.forEach((resourceId) => (resources[resourceId] = true));
  }

  // If this entity extends another entity, we need to import that entity
  const extendsResource = schema?.['x-extends'];
  if (extendsResource) {
    const resourcePath =
      JAVA_SERVER_PACKAGE +
      '.entities.' +
      lc(extendsResource) +
      '.models.' +
      capitalize(extendsResource) +
      'DTO';
    resources[resourcePath] = true;
  }

  // Import HasId if this doesn't extend anything and has an ID property
  if (!extendsResource && properties.id) {
    resources[JAVA_SERVER_PACKAGE + '.entities.HasId'] = true;
  }

  // All models needs Getter and Setter
  resources['lombok.Getter'] = true;
  resources['lombok.Setter'] = true;

  return Object.keys(resources);
};

/**
 *
 * @param entity
 * @returns
 */
export const getJavaControllerImports = (
  entity: Entity,
  spec: OpenAPIObject,
) => {
  const resources: Record<string, boolean> = {};

  for (const operationWrapper of entity.operationList) {
    // Find response type
    const successResponse = getResponse(operationWrapper);
    const responseType = successResponse?.['x-resourceId'];

    // Handle list responses
    const responseData = successResponse?.properties?.data as SchemaObject;
    if (responseData?.type === 'array') {
      const resourcePath =
        JAVA_SERVER_PACKAGE + '.common.resultlist.ResultList';
      resources[resourcePath] = true;
    }

    // Add response object
    if (responseType !== undefined) {
      const resourcePath =
        JAVA_SERVER_PACKAGE +
        '.entities.' +
        lc(responseType) +
        '.models.' +
        capitalize(responseType) +
        'DTO';
      resources[resourcePath] = true;
      resources['org.springframework.http.ResponseEntity'] = true;
    }

    // Add request object
    const requestBody = getRequestBody(operationWrapper.operation);
    if (requestBody) {
      const resourceId = requestBody['x-resourceId'];
      if (resourceId) {
        resources[
          JAVA_SERVER_PACKAGE +
            '.entities.' +
            lc(resourceId) +
            '.models.' +
            capitalize(resourceId)
        ] = true;
      } else {
        const modelImports = getJavaModelImports(requestBody);
        modelImports.forEach((modelImport) => (resources[modelImport] = true));
      }
    }

    // Path parameters
    const pathParameters = getPathParameters(operationWrapper.operation);
    pathParameters.forEach((pathParameter) => {
      resources['jakarta.validation.Valid'] = true;
      resources['org.springframework.web.bind.annotation.PathVariable'] = true;
      if (pathParameter?.required) {
        resources['jakarta.validation.constraints.NotNull'] = true;
      }
      if (/Id$/i.test(pathParameter?.name ?? '')) {
        const existingObjectPath =
          JAVA_SERVER_PACKAGE +
          '.features.validation.existingobject.ExistingObject';
        resources[existingObjectPath] = true;
        if (operationWrapper.entityName != entity.name) {
          const servicePath =
            JAVA_SERVER_PACKAGE +
            '.entities.' +
            lc(operationWrapper.entityName) +
            '.' +
            capitalize(operationWrapper.entityName) +
            'Service';
          resources[servicePath] = true;
        }
      }
    });

    // Query parameters
    const queryParametersClass = getQueryParametersClass(
      operationWrapper,
      spec,
    );
    if (queryParametersClass?.className) {
      const resourcePath =
        JAVA_SERVER_PACKAGE +
        '.entities.' +
        lc(entity.name) +
        '.models.' +
        capitalize(queryParametersClass.className) +
        'DTO';
      resources[resourcePath] = true;
    }

    // Add spring imports
    switch (operationWrapper.method) {
      case 'get':
        resources['org.springframework.web.bind.annotation.GetMapping'] = true;
        break;
      case 'post':
        resources['java.net.URI'] = true;
        resources['org.springframework.web.bind.annotation.PostMapping'] = true;
        resources['org.springframework.web.bind.annotation.RequestBody'] = true;
        break;
      case 'put':
        resources['org.springframework.web.bind.annotation.PutMapping'] = true;
        resources['org.springframework.web.bind.annotation.RequestBody'] = true;
        break;
      case 'delete':
        resources['org.springframework.web.bind.annotation.DeleteMapping'] =
          true;
        break;
    }
  }
  return Object.keys(resources);
};

/**
 * Get required import statements for a property
 *
 * @param property
 * @returns
 */
export const getJavaImportsForProperty = (property: SchemaObject) => {
  const res: Record<string, boolean> = {};

  // If this property references a resource, it will have a resourceId
  // ExpandableFields are always anyOf, since it's anyOf the resource or a string
  getResourceIdsFromSchema(property).forEach((resourceId) => {
    const resourcePath =
      JAVA_SERVER_PACKAGE +
      '.entities.' +
      lc(resourceId) +
      '.models.' +
      capitalize(resourceId) +
      'DTO';
    res[resourcePath] = true;
    const expandablePath =
      JAVA_SERVER_PACKAGE + '.common.expandablefield.ExpandableField';
    res[expandablePath] = true;
  });

  if (property.type === 'array') res['java.util.List'] = true;

  if (property.minimum) res['jakarta.validation.constraints.Min'] = true;
  if (property.maximum) res['jakarta.validation.constraints.Max'] = true;
  if (property.minLength || property.maxLength)
    res['jakarta.validation.constraints.Size'] = true;
  if (property.pattern) res['jakarta.validation.constraints.Pattern'] = true;

  if (property['readOnly']) {
    res['jakarta.validation.constraints.Null'] = true;
    res[JAVA_SERVER_PACKAGE + '.features.validation.validationgroups.Insert'] =
      true;
    res[JAVA_SERVER_PACKAGE + '.features.validation.validationgroups.Update'] =
      true;
  } else if (property['x-required']) {
    res['jakarta.validation.constraints.NotNull'] = true;
    res[JAVA_SERVER_PACKAGE + '.features.validation.validationgroups.Insert'] =
      true;
  }

  if (property.type === 'string') {
    res['jakarta.validation.constraints.Size'] = true;
    switch (property.format) {
      case 'date-time':
      case 'date':
        res['org.springframework.format.annotation.DateTimeFormat'] = true;
        break;
      case 'email':
        res['jakarta.validation.constraints.Email'] = true;
        break;
      case 'url':
        res['org.hibernate.validator.constraints.URL'] = true;
        break;
      case 'password:':
        break;
      default:
        if (!property.enum) {
          res[JAVA_SERVER_PACKAGE + '.features.validation.nossn.NoSSN'] = true;
        }
        break;
    }
    if (property.enum && property.enum.length > 1) {
      res[JAVA_SERVER_PACKAGE + '.features.validation.validenum.ValidEnum'] =
        true;
    }
  }

  if (property['x-expandableField']) res['jakarta.validation.Valid'] = true;

  // If this is an array, check child items
  if (property.type === 'array') {
    const items = property.items as SchemaObject;
    const itemsResources = getJavaImportsForProperty(items);
    itemsResources.forEach((resourceId) => (res[resourceId] = true));
  }

  return Object.keys(res);
};

/**
 * Get Java datatype for a property or parameter object
 *
 * @param property
 * @returns
 */
export const getDataType = (
  property: ParameterObject | SchemaObject,
): string => {
  const schemaObject = ((property as ParameterObject).schema ??
    property) as SchemaObject;

  switch (schemaObject.type) {
    case 'string':
      return 'String';
    case 'integer':
      if (schemaObject.format === 'int64') {
        return 'Long';
      } else {
        return 'Integer';
      }
    case 'number':
      if (schemaObject.format === 'float') {
        return 'Float';
      } else {
        return 'Double';
      }
    case 'boolean':
      return 'Boolean';
    case 'array':
      return 'List<' + getDataType(schemaObject.items as SchemaObject) + '>';
    case 'object':
      return 'Object';
  }

  // Type not found, this is probably an ExpandableField
  const resources: Record<string, boolean> = {};
  getResourceIdsFromSchema(schemaObject).forEach(
    (resourceId) => (resources[resourceId] = true),
  );

  // Expandable field with multiple possible types
  if (Object.keys(resources).length > 1) {
    const wrapperClass =
      'UnionProperty' + capitalize(property['x-expandableField'] ?? 'unnamed');
    return 'ExpandableField<' + wrapperClass + '>';
  }

  // Expandable field with one possible type
  if (Object.keys(resources).length === 1) {
    return 'ExpandableField<' + Object.keys(resources).join() + 'DTO>';
  }

  console.log('Unknown datatype', property);

  return 'Object';
};

export const getResourceIdsFromSchema = (schema: SchemaObject) => {
  const resources: Record<string, boolean> = {};
  const anyOf =
    schema?.anyOf ??
    ((schema?.items as SchemaObject)?.anyOf ?? schema?.items
      ? [schema?.items as SchemaObject]
      : [schema]);
  anyOf?.forEach((anyOfPropertyUntyped) => {
    const anyOfProperty = anyOfPropertyUntyped as SchemaObject;
    const resourceId = anyOfProperty['x-resourceId'];
    if (resourceId !== undefined) {
      resources[resourceId] = true;
    }
  });
  return Object.keys(resources);
};

/**
 *
 * @param operation
 * @param pathParam
 * @returns
 */
export function getPathParamValidator(
  pathParam: string,
  operationWrapper: EntityOperation,
) {
  const operation = operationWrapper.operation;
  const parameters = operation.parameters ?? [];
  const parameter = parameters.find(
    (parameter) => (parameter as ParameterObject).name === pathParam,
  ) as ParameterObject;

  let string = '';

  if (parameter?.required) {
    string += '@NotNull ';
  }

  // If parameter ends with `id`, assume that the previous path name is the resource name
  const pathParts = operationWrapper.pathParts;
  const partIndex = pathParts.indexOf('{' + pathParam + '}');

  // If partIndex === 1, this is the ID of the root resource
  if (partIndex === 1 && /id$/i.test(pathParam)) {
    string +=
      '@ExistingObject(service = ' +
      operationWrapper.entityName +
      'Service.class) ';
  }

  // If this is the third part, we need to get the resource name from the second part
  // /enhet/id_abc/underenhet/id_def
  if (partIndex === 3 && /id$/i.test(pathParam)) {
    const propertyName = pathParts[2];
    const propertySchema = operationWrapper.entity.schema?.properties?.[
      propertyName
    ] as SchemaObject;
    const resourceIds =
      propertySchema && getResourceIdsFromSchema(propertySchema);
    if (resourceIds?.length === 1) {
      string +=
        '@ExistingObject(service = ' +
        capitalize(resourceIds[0]) +
        'Service.class) ';
    }
  }

  return string;
}

export function getJavaPackageName() {
  return JAVA_SERVER_PACKAGE;
}

export const getResponse = (entityOperation: EntityOperation) => {
  const operation = entityOperation.operation;
  const successResponse = operation.responses?.['200']?.content?.[
    'application/json'
  ]?.schema as SchemaObject;
  return successResponse;
};

export const getResponseResourceId = (entityOperation: EntityOperation) => {
  const successResponse = getResponse(entityOperation);
  return successResponse?.['x-resourceId'];
};

/**
 * Get the response type for an operation
 *
 * @param operation
 * @returns
 */
const getResponseType = (
  entityOperation: EntityOperation,
): string | undefined => {
  const successResponse = getResponse(entityOperation);

  // If there is no application/json success response, skip (it might be a binary download)
  if (!successResponse) {
    return 'byte[]';
  }

  // If the response is a single resource, return the resource type)
  let responsetype = successResponse['x-resourceId'] + 'DTO';

  // ResponseList is a special case, it is a generic list of resources
  const data = successResponse.properties?.data as SchemaObject;
  if (data?.type === 'array') {
    const items = data.items as SchemaObject;
    const resourceIds = getResourceIdsFromSchema(items);
    // Responses should always have a single type
    if (resourceIds.length === 1) {
      responsetype =
        'ResultList<' +
        resourceIds.map((resourceId) => resourceId + 'DTO').join() +
        '>';
    }
  }

  return responsetype;
};

/**
 * Get path parameters for an operation
 *
 * @param operation
 * @returns
 */
export const getPathParameters = (operation: OperationObject) => {
  const parameters = operation.parameters ?? [];
  return parameters
    .map((parameter) => {
      const parameterObject = parameter as ParameterObject;
      if (parameterObject.in !== 'path') {
        return undefined;
      }
      return {
        name: parameterObject.name,
        description: parameterObject.description,
        required: parameterObject.required,
        datatype: getDataType(parameterObject),
      };
    })
    .filter((x) => x !== undefined);
};

export const getOperationParameters = (
  operationWrapper: EntityOperation,
  spec: OpenAPIObject,
) => {
  const operation = operationWrapper.operation;
  const parameters: {
    name: string;
    datatype: string;
    annotations: string[];
  }[] = [];

  // Add path parameters
  const pathParameters = getPathParameters(operation);
  pathParameters.forEach((pathParameter) => {
    if (pathParameter) {
      parameters.push({
        name: pathParameter.name,
        datatype: pathParameter.datatype,
        annotations: [
          '@Valid',
          '@PathVariable',
          getPathParamValidator(pathParameter.name, operationWrapper),
        ],
      });
    }
  });

  // Add query parameter object
  const queryParameters = getQueryParametersClass(operationWrapper, spec);
  if (queryParameters.className) {
    parameters.push({
      name: 'query',
      datatype: queryParameters.className + 'DTO',
      annotations: ['@Valid'],
    });
  }

  // Add request body
  const requestBody = getRequestBody(operation);
  if (requestBody) {
    const requestBodyType = getRequestBodyType(operation);
    parameters.push({
      name: 'body',
      datatype: requestBodyType + 'DTO',
      annotations: ['@Valid', '@RequestBody'],
    });
  }

  return parameters;
};

export const getRequestBody = (operation: OperationObject) => {
  const requestBodyObject = operation.requestBody as RequestBodyObject;
  return requestBodyObject?.content?.['application/json']
    ?.schema as SchemaObject;
};

/**
 * Get query parameters for an operation
 *
 * @param operation
 * @returns
 */
export const getQueryParameters = (operation: OperationObject) => {
  const parameters = operation.parameters ?? [];
  return parameters
    .map((parameter) => {
      const parameterObject = parameter as ParameterObject;
      if (parameterObject.in !== 'query') {
        return undefined;
      }

      return parameterObject;
    })
    .filter((x) => x !== undefined);
};

/**
 *
 * @param operation
 * @param spec
 * @returns
 */
export const getQueryParametersClass = (
  operationWrapper: EntityOperation,
  spec: OpenAPIObject,
) => {
  const operation = operationWrapper.operation;
  const queryParameters = getQueryParameters(operation);
  const response = getResponse(operationWrapper);
  const isList = (response?.properties?.data as SchemaObject)?.type === 'array';
  const baseClassName = isList ? 'ListQueryParameters' : 'QueryParameters';
  const baseClass = spec.components?.schemas?.[baseClassName] as SchemaObject;
  const className =
    capitalize(operationWrapper.entityName) +
    capitalize(operation.operationId) +
    'QueryParameters';

  if (queryParameters.length === 0) {
    return {};
  }

  // Create property object from query parameters
  const properties: Record<string, SchemaObject> = {};
  queryParameters.forEach((queryParameter) => {
    const name = queryParameter?.name as keyof SchemaObject;
    const schema = queryParameter?.schema as SchemaObject;
    // Add required parameter?
    if (name) properties[name] = schema;
  });

  // Check differences between query parameters and base class
  let missingProperties = false;
  const baseClassProperties = baseClass.properties ?? {};
  for (const propertyName in baseClassProperties) {
    const baseProperty = baseClassProperties[propertyName] as SchemaObject;
    if (isDifferent(baseProperty, properties[propertyName])) {
      missingProperties = true;
      break;
    }
  }

  // If there are missing properties, create a new class that doesn't extend the base class
  if (missingProperties) {
    return {
      className,
      properties,
    };
  }

  // Check if we have additional properties
  else {
    let hasAdditionalProperties = false;
    hasAdditionalProperties = isDifferent(properties, baseClassProperties);

    // There are additional properties, create a new class that extends the base class
    if (hasAdditionalProperties) {
      // Remove properties that are already in the base class
      for (const propertyName in baseClassProperties) {
        delete properties[propertyName];
      }
      return {
        className,
        extends: baseClassName,
        properties,
      };
    }
    // There are no additional properties, use the base class
    else {
      return {
        className: baseClassName,
      };
    }
  }
};

const isDifferent = (propA?: any, propB?: any): boolean => {
  if (Array.isArray(propA) && Array.isArray(propB)) {
    if (propA.length !== propB.length) return true;
    for (let i = 0; i < propA.length; i++) {
      if (isDifferent(propA[i], propB[i])) return true;
    }
  } else if (typeof propA === 'object' && typeof propB === 'object') {
    for (const p in propA) {
      const valA = propA[p];
      const valB = propB[p];
      if (isDifferent(valA, valB)) {
        return true;
      }
    }
  } else {
    return propA !== propB;
  }
  return false;
};

/**
 *
 * @param entityName
 * @param method
 * @param operation
 * @returns
 */
export const getJavaServiceName = (
  entityName: string,
  method: string,
  operation: OperationObject,
) => {
  const operationName = getOperationName(entityName, method, operation);
  // Remove entityName from operationName
  return operationName;
};

export const addJavaServerHandlebarsHelpers = (
  handlebars: typeof Handlebars,
) => {
  handlebars.registerHelper('java-datatype', getDataType);
  handlebars.registerHelper('java-model-imports', getJavaModelImports);
  handlebars.registerHelper(
    'java-controller-imports',
    getJavaControllerImports,
  );
  handlebars.registerHelper('java-response', getResponse);
  handlebars.registerHelper('java-response-resourceId', getResponseResourceId);
  handlebars.registerHelper('java-response-type', getResponseType);
  handlebars.registerHelper('java-package-name', getJavaPackageName);
  handlebars.registerHelper('java-path-param-validator', getPathParamValidator);
  handlebars.registerHelper(
    'java-resources-for-property',
    getJavaImportsForProperty,
  );
  handlebars.registerHelper('java-service-name', getJavaServiceName);
  handlebars.registerHelper(
    'java-operation-parameters',
    getOperationParameters,
  );
  handlebars.registerHelper('java-request-body', getRequestBody);
};
