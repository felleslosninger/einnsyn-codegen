import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import {
  capitalize,
  getOperationName,
  getRequestBodyType,
  lc,
} from '../../utils/handlebarsHelpers';
import {
  getRequestBody,
  getResourceIds,
  getResponseBody,
} from '../../utils/helpers';
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

  const resourceIds = getResourceIds(schema);
  if (resourceIds[0] === 'ResultList') {
    // Handle ResultList separately (it is not an entity)
    resourceIds.shift();
    resources[JAVA_SERVER_PACKAGE + '.common.resultlist.ResultList'] = true;

    // Push the data items resources
    const dataItems = (schema.properties?.data as SchemaObject)
      ?.items as SchemaObject;
    const dataItemsResources = getResourceIds(dataItems);
    resourceIds.push(...dataItemsResources);
  }

  // If this entity extends another entity, we need to import that entity
  const extendsResource = schema?.['x-extends'];
  if (extendsResource) {
    const extendsEntity = schema?.['x-extends-entity'];
    if (extendsEntity) {
      const extendsEntityPath =
        JAVA_SERVER_PACKAGE +
        '.entities.' +
        lc(extendsEntity) +
        '.models.' +
        capitalize(extendsResource) +
        'DTO';
      resources[extendsEntityPath] = true;
    } else {
      resourceIds.push(extendsResource);
    }
  }

  resourceIds.forEach((resourceId) => {
    const resourcePath =
      JAVA_SERVER_PACKAGE +
      '.entities.' +
      lc(resourceId) +
      '.models.' +
      capitalize(resourceId) +
      'DTO';
    resources[resourcePath] = true;
  });

  // Import HasId if this doesn't extend anything and has an ID property
  if (!extendsResource && properties.id) {
    resources[JAVA_SERVER_PACKAGE + '.common.hasid.HasId'] = true;
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
export const getJavaControllerImports = (entity: Entity) => {
  const resources: Record<string, boolean> = {};

  for (const operationWrapper of entity.operationList) {
    // Add response object
    const responseBody = getResponseBody(operationWrapper.operation);
    if (responseBody) {
      resources['org.springframework.http.ResponseEntity'] = true;
      const resourceIds = getResourceIds(responseBody);
      if (resourceIds.join() === 'ResultList') {
        resourceIds.shift();
        const dataItems = (responseBody.properties?.data as SchemaObject)
          ?.items as SchemaObject;
        const dataItemsResources = getResourceIds(dataItems);
        resourceIds.push(...dataItemsResources);
        resources[JAVA_SERVER_PACKAGE + '.common.resultlist.ResultList'] = true;
      }
      if (resourceIds.length > 1) {
        resources[
          JAVA_SERVER_PACKAGE +
            '.entities.' +
            lc(entity.name) +
            '.models.UnionResource' +
            operationWrapper.operation.operationId
        ] = true;
      }
    }

    // Add request object
    const requestBody = getRequestBody(operationWrapper.operation);
    if (requestBody) {
      const modelImports = getJavaModelImports(requestBody);
      modelImports.forEach((modelImport) => (resources[modelImport] = true));
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
          JAVA_SERVER_PACKAGE + '.validation.existingobject.ExistingObject';
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
    const xRequestQuery = operationWrapper.operation['x-request-query'];
    if (xRequestQuery) {
      const {
        'x-extend-entity': extendEntityName,
        'x-extend-name': extendName,
        'x-custom-name': customName,
        'x-custom-entity': customEntity,
      } = xRequestQuery;
      if (extendEntityName && extendName) {
        const baseQueryObjectPath =
          JAVA_SERVER_PACKAGE +
          '.entities.' +
          lc(extendEntityName) +
          '.models.' +
          capitalize(extendName) +
          'DTO';
        resources[baseQueryObjectPath] = true;
        resources['jakarta.validation.Valid'] = true;
      }
      if (customName && customEntity) {
        const customQueryObjectPath =
          JAVA_SERVER_PACKAGE +
          '.entities.' +
          lc(customEntity) +
          '.models.' +
          capitalize(customName) +
          'DTO';
        resources[customQueryObjectPath] = true;
        resources['jakarta.validation.Valid'] = true;
      }
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
  getResourceIds(property).forEach((resourceId) => {
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
    res[JAVA_SERVER_PACKAGE + '.validation.validationgroups.Insert'] = true;
    res[JAVA_SERVER_PACKAGE + '.validation.validationgroups.Update'] = true;
  } else if (property['x-required']) {
    res['jakarta.validation.constraints.NotNull'] = true;
    res[JAVA_SERVER_PACKAGE + '.validation.validationgroups.Insert'] = true;
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
          res[JAVA_SERVER_PACKAGE + '.validation.nossn.NoSSN'] = true;
        }
        break;
    }
    if (property.enum && property.enum.length > 1) {
      res[JAVA_SERVER_PACKAGE + '.validation.validenum.ValidEnum'] = true;
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
  getResourceIds(schemaObject).forEach(
    (resourceId) => (resources[resourceId] = true),
  );

  // Expandable field with multiple possible types
  if (Object.keys(resources).length > 1) {
    const wrapperClass =
      'UnionResource' + capitalize(property['x-expandableField'] ?? 'unnamed');
    return 'ExpandableField<' + wrapperClass + '>';
  }

  // Expandable field with one possible type
  if (Object.keys(resources).length === 1) {
    return 'ExpandableField<' + Object.keys(resources).join() + 'DTO>';
  }

  console.log('Unknown datatype', property);

  return 'Object';
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
    const resourceIds = propertySchema && getResourceIds(propertySchema);
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

/**
 * Get the response type for an operation
 *
 * @param operation
 * @returns
 */
const getResponseType = (operation: OperationObject): string | undefined => {
  // If there is no application/json success response, skip (it might be a binary download)
  const successResponse = getResponseBody(operation);
  if (!successResponse) {
    return 'byte[]';
  }

  // For resultLists, find the type of the items
  let resourceIds = getResourceIds(successResponse);
  if (resourceIds[0] === 'ResultList') {
    resourceIds = getResourceIds(
      (successResponse.properties?.data as SchemaObject)?.items as SchemaObject,
    );
    if (resourceIds.length === 1) {
      return (
        'ResultList<' +
        resourceIds.map((resourceId) => resourceId + 'DTO').join() +
        '>'
      );
    } else if (resourceIds.length > 1) {
      return 'ResultList<' + 'UnionResource' + operation.operationId + '>';
    } else {
      throw new Error('Unknown response type');
    }
  }

  // If we have one resource type, return that
  if (resourceIds.length === 1) {
    return resourceIds.join() + 'DTO';
  }
  // For multiple types, return a union type
  else if (resourceIds.length > 1) {
    return 'UnionResource' + operation.operationId;
  } else {
    throw new Error('Unknown response type');
  }
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
  const xRequestQuery = operation['x-request-query'];
  if (xRequestQuery) {
    const extendName = xRequestQuery['x-extend-name'];
    const customName = xRequestQuery['x-custom-name'];
    if (extendName || customName) {
      parameters.push({
        name: 'query',
        datatype: (customName ?? extendName) + 'DTO',
        annotations: ['@Valid'],
      });
    }
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
  handlebars.registerHelper('java-response-type', getResponseType);
  handlebars.registerHelper('java-package-name', getJavaPackageName);
  handlebars.registerHelper('java-service-name', getJavaServiceName);
  handlebars.registerHelper(
    'java-operation-parameters',
    getOperationParameters,
  );
};
