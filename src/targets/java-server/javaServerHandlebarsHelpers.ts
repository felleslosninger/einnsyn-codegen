import {
  OperationObject,
  ParameterObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import {
  capitalize,
  getOperationName,
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
export const getJavaModelImports = (entity: Entity) => {
  const resources: Record<string, boolean> = {};
  const properties = entity.schema?.properties ?? {};

  for (const propertyName in properties) {
    const property = properties[propertyName] as SchemaObject;
    const propertyResources = getJavaImportsForProperty(property);
    propertyResources.forEach((resourceId) => (resources[resourceId] = true));
  }

  // If this entity extends another entity, we need to import that entity
  const extendsResource = entity.schema?.['x-extends'];
  if (extendsResource) {
    const resourcePath = getJavaPackageName(extendsResource, true, 'models');
    resources[resourcePath] = true;
  }

  return Object.keys(resources);
};

/**
 *
 * @param entity
 * @returns
 */
export const getJavaControllerImports = (entity: Entity) => {
  const resources: Record<string, boolean> = {};

  // Add service
  const servicePath = getJavaPackageName(entity.name, entity.name + 'Service');
  resources[servicePath] = true;

  for (const operationWrapper of entity.operationList) {
    // Find response type
    const successResponse = operationWrapper.operation.responses?.['200']
      ?.content?.['application/json']?.schema as SchemaObject;
    const responseType = successResponse?.['x-resourceId'];

    // Handle list responses

    if (responseType !== undefined) {
      const resourcePath = getJavaPackageName(responseType, true, 'models');
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
        resources['org.springframework.web.bind.annotation.PostMapping'] = true;
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

export const getJavaImports = (
  object: SchemaObject | Entity | ParameterObject,
  { model = false, controller = false },
): string[] => {
  const resources: Record<string, boolean> = {};

  // This is an Entity or ParameterObject
  if ((object as Entity).schema) {
    return getJavaImports((object as Entity).schema!, { model, controller });
  }

  // Recursively add imports for properties
  if ((object as SchemaObject).properties) {
    const properties = (object as SchemaObject).properties ?? {};
    for (const propertyName in properties) {
      const property = properties[propertyName] as SchemaObject;
      const propertyResources = getJavaImports(property, { model, controller });
      propertyResources.forEach((resourceId) => (resources[resourceId] = true));
    }
  }

  if (model) {
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
    const resourcePath = getJavaPackageName(resourceId, true, 'models');
    res[resourcePath] = true;
    res[getJavaPackageName('ExpandableField', 'ExpandableField')] = true;
  });

  if (property.type === 'array') res['java.util.List'] = true;

  if (property.minimum) res['jakarta.validation.constraints.Min'] = true;
  if (property.maximum) res['jakarta.validation.constraints.Max'] = true;
  if (property.minLength || property.maxLength)
    res['jakarta.validation.constraints.Size'] = true;
  if (property.pattern) res['jakarta.validation.constraints.Pattern'] = true;

  if (property['readOnly']) {
    res['jakarta.validation.constraints.Null'] = true;
    res[JAVA_SERVER_PACKAGE + '.features.validation.validationGroups.Insert'] =
      true;
    res[JAVA_SERVER_PACKAGE + '.features.validation.validationGroups.Update'] =
      true;
  } else if (property['x-required']) {
    res['jakarta.validation.constraints.NotNull'] = true;
    res[JAVA_SERVER_PACKAGE + '.features.validation.validationGroups.Insert'] =
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
        res['jakarta.validation.constraints.URL'] = true;
        break;
      default:
        res['no.einnsyn.apiv3.features.validation.NoSSN'] = true;
        break;
    }
  }

  if (property['x-expandableField']) res['jakarta.validation.Valid'] = true;

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
      if (schemaObject.format === 'int32') {
        return 'Integer';
      } else {
        return 'Long';
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
      'ExpandableWrapper' +
      capitalize(property['x-expandableField'] ?? 'unnamed');
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
  const anyOf = schema?.anyOf ?? (schema?.items as SchemaObject)?.anyOf;
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
    const resourceIds = getResourceIdsFromSchema(propertySchema);
    if (resourceIds.length === 1) {
      string +=
        '@ExistingObject(service = ' +
        capitalize(resourceIds[0]) +
        'Service.class) ';
    }
  }

  return string;
}

export function getJavaPackageName(
  name: string,
  withClass?: boolean,
  prefix?: string,
): string;
export function getJavaPackageName(name: string, prefix?: string): string;
export function getJavaPackageName(
  name: string,
  a?: boolean | string,
  b?: string,
) {
  const withClass = typeof a === 'boolean' ? a : false;
  const prefix = typeof a === 'string' ? a : b;
  let packageName = JAVA_SERVER_PACKAGE + '.entities.' + lc(name);
  if (typeof prefix === 'string') {
    packageName += '.' + prefix;
  }
  if (withClass === true) {
    packageName += '.' + capitalize(name) + 'DTO';
  }
  return packageName;
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
    // If there are multiple resourceIds, we need a union type
    if (resourceIds.length > 1) {
    }
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
 * If the operation has non-standard query parameters, we need to create a
 * class for them. If not, use the standard classes.
 * @param operation
 */
export const getQueryParametersClassName = (
  operationWrapper: EntityOperation,
) => {
  const { operation, entityName, method } = operationWrapper;

  // Check if return type is a list
  const response = getResponse(operationWrapper);
  const data = response?.properties?.data as SchemaObject;
  const isList = data?.type === 'array';
  const suffix = isList ? 'ListQueryParameters' : 'QueryParameters';

  // Check if operation has non-standard query parameters
  if (needsQueryParametersClassName(operationWrapper)) {
    return capitalize(getOperationName(entityName, method, operation)) + suffix;
  }

  // Return default query parameters class
  return suffix;
};

/**
 * Check if this operation needs a custom query parameters class
 *
 * @param operationWrapper
 * @returns
 */
export const needsQueryParametersClassName = (
  operationWrapper: EntityOperation,
) => {
  const queryParameters = getQueryParameters(operationWrapper.operation);
  return queryParameters.length > 0;
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
  handlebars.registerHelper('java-path-parameters', getPathParameters);
  handlebars.registerHelper('java-query-parameters', getQueryParameters);
  handlebars.registerHelper('java-path-param-validator', getPathParamValidator);
  handlebars.registerHelper(
    'java-resources-for-property',
    getJavaImportsForProperty,
  );
  handlebars.registerHelper('java-service-name', getJavaServiceName);
  handlebars.registerHelper(
    'java-query-parameters-class-name',
    getQueryParametersClassName,
  );
};
