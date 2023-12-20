import {
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import { Entity, EntityOperation } from './tsGenerator';
import { capitalize, deCapitalize } from '../../utils/handlebarsHelpers';

/**
 * Get TypeScript datatype for a property or parameter object
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
      if (
        schemaObject.format === 'date' ||
        schemaObject.format === 'date-time'
      ) {
        return 'Date';
      } else {
        return 'string';
      }
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return getDataType(schemaObject.items as SchemaObject) + '[]';
    case 'object':
      return 'any';
  }

  // Type not found, this is probably a ExpandableField
  const resources: Record<string, boolean> = {};
  const anyOf =
    schemaObject.anyOf ?? (schemaObject.items as SchemaObject)?.anyOf;
  anyOf?.forEach((anyOfPropertyUntyped) => {
    const anyOfProperty = anyOfPropertyUntyped as SchemaObject;
    const resourceId = anyOfProperty['x-resourceId'];
    if (resourceId !== undefined) {
      resources[resourceId] = true;
    }
  });
  if (Object.keys(resources).length > 0) {
    return Object.keys(resources).join(' | ');
  }

  return 'any';
};

/**
 * Substitute path variables in a operation's path string: /path/{variable}/path
 *
 * @param entityOperation
 */
export const generatePath = (entityOperation: EntityOperation) => {
  const originalPath = entityOperation.path ?? '';
  const modifiedPath =
    "'" +
    originalPath.replace(/{([^}]+)}/g, (a: string, b: string) => {
      return "' + " + b + " + '";
    }) +
    "'";
  return modifiedPath.replace(/\+ \'\'/g, '');
};

/**
 * Get a list of resources that needs to be imported for a entity's model class
 *
 * @param property
 * @returns
 */
export const getModelImports = (entity: Entity) => {
  const resources: Record<string, boolean> = {};
  const properties = entity.schema?.properties ?? {};
  const entityResourceId = entity.schema?.['x-resourceId'];

  for (const propertyName in properties) {
    const property = properties[propertyName] as SchemaObject;
    const anyOf = property.anyOf ?? (property.items as SchemaObject)?.anyOf;
    anyOf?.forEach((anyOfPropertyUntyped) => {
      const anyOfProperty = anyOfPropertyUntyped as SchemaObject;
      const resourceId = anyOfProperty['x-resourceId'];
      if (resourceId !== undefined && resourceId !== entityResourceId) {
        resources[resourceId] = true;
      }
    });
  }

  return Object.keys(resources);
};

/**
 * Get a list of resources that needs to be imported for a entity's Resource class
 *
 * @param entity
 * @returns
 */
export const getResourceImports = (entity: Entity) => {
  const resources: Record<string, boolean> = {};

  for (const operation of entity.operationList) {
    let responseType = getResponseType(operation)?.replace(/\[\]$/, '');
    let bodyType = getRequestBodyType(operation)?.replace(/\[\]$/, '');

    if (responseType) {
      const regexMatch = RegExp(/ResultList<([^>]+)>$/).exec(responseType);
      if (regexMatch) {
        const genericClass = regexMatch[1] ?? '';
        responseType = genericClass;
        resources.ResultList = true;
      }
      resources[responseType] = true;
    }

    if (bodyType) {
      resources[bodyType] = true;
    }
  }

  return Object.keys(resources);
};

/**
 * Get resourceIds for ExpandableField properties
 *
 * @param property
 * @returns
 */
export const getResourcesForProperty = (property: SchemaObject) => {
  const resources: Record<string, boolean> = {};
  const anyOf = property.anyOf ?? (property.items as SchemaObject)?.anyOf;
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
      return {
        name: parameterObject.name,
        datatype: getDataType(parameterObject),
      };
    })
    .filter((x) => x !== undefined);
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
  const operation = entityOperation.operation;
  const successResponse =
    operation.responses?.['200']?.content?.['application/json']?.schema;

  // If there is no application/json success response, skip (it might be a binary download)
  if (!successResponse) {
    return;
  }

  let responsetype = successResponse['x-resourceId'];
  if (!responsetype) {
    // This should be a list of resources
    responsetype =
      successResponse.properties?.data?.items?.['x-resourceId'] + '[]';
  }

  if (!responsetype) {
    console.error('Could not find response type for ' + entityOperation.path);
    return;
  }

  if (responsetype === 'ResultList') {
    const listType =
      successResponse.properties?.data?.items?.['x-resourceId'] ?? 'unknown';
    responsetype = 'ResultList<' + listType + '>';
  }

  return responsetype;
};

/**
 * Get the request body type for an operation
 *
 * @param entityOperation
 * @returns
 */
const getRequestBodyType = (
  entityOperation: EntityOperation,
): string | undefined => {
  const operation = entityOperation.operation;
  const requestBody = operation.requestBody as RequestBodyObject;
  const content = requestBody?.content;
  const schema = content?.['application/json']?.schema as SchemaObject;
  const bodyType = schema?.['x-resourceId'];
  return bodyType;
};

/**
 * Get the validator function for a response type
 *
 * @param entityOperation
 * @returns
 */
export const getResponseValidator = (entityOperation: EntityOperation) => {
  let responseType = getResponseType(entityOperation);
  if (!responseType) {
    return '';
  }
  if (responseType.match(/\[\]$/)) {
    return `${deCapitalize(responseType.slice(0, -2))}.isValidList`;
  }
  if (responseType.match(/ResultList<[^>]+>$/)) {
    const genericClass = responseType.match(/<([^>]+)>$/)?.[1] ?? '';
    return `${deCapitalize(genericClass)}.isValidResultList`;
  }
  return `${deCapitalize(responseType)}.isValid`;
};

/**
 * Generate the name for a resource's operation
 *
 * @param entity
 * @param entityOperation
 * @returns
 */
const getOperationName = (
  entityName: string,
  entityOperation: EntityOperation,
) => {
  const operation = entityOperation.operation;
  let operationId = operation.operationId;
  if (!operationId) {
    return undefined;
  }

  // GetSaksmappe, PostSaksmappe operations should be named "get", "post"
  if (operationId === capitalize(entityOperation.method) + entityName) {
    return entityOperation.method;
  }
  // GetSaksmappeList should be named "list"
  else if (operationId === 'Get' + entityName + 'List') {
    return 'list';
  }
  // PostSaksmappeJournalpost (add journalpost to Saksmappe) should be named postJournalpost
  else {
    const stripPrefixRE = new RegExp(
      '^' + capitalize(entityOperation.method) + entityName,
    );
    return deCapitalize(
      operationId.replace(stripPrefixRE, capitalize(entityOperation.method)),
    );
  }
};

export const addTSHandlebarsHelpers = (handlebars: typeof Handlebars) => {
  handlebars.registerHelper('ts-datatype', getDataType);
  handlebars.registerHelper('ts-generate-path', generatePath);
  handlebars.registerHelper('ts-model-imports', getModelImports);
  handlebars.registerHelper('ts-resource-imports', getResourceImports);
  handlebars.registerHelper(
    'ts-resources-for-property',
    getResourcesForProperty,
  );
  handlebars.registerHelper('ts-path-parameters', getPathParameters);
  handlebars.registerHelper('ts-query-parameters', getQueryParameters);
  handlebars.registerHelper('ts-responsevalidator', getResponseValidator);
  handlebars.registerHelper('ts-responsetype', getResponseType);
  handlebars.registerHelper('ts-requestbodytype', getRequestBodyType);
  handlebars.registerHelper('ts-operation-name', getOperationName);
};
