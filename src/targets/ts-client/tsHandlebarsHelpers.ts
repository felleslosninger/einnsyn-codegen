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
      return 'string';
    case 'integer':
    case 'number':
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
    const resourceList = Object.keys(resources);
    resourceList.push('string'); // Un-expanded ExpandableFields are IDs
    return '(' + resourceList.join(' | ') + ')';
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
  return modifiedPath.replace(/\+ ''/g, '');
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

  // Add required imports for each property
  for (const propertyName in properties) {
    const property = properties[propertyName] as SchemaObject;
    const propertyResources = getImportsForProperty(property);
    propertyResources.forEach((resourceId) => (resources[resourceId] = true));
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

  if (entity.schema?.['x-resourceId'] !== undefined) {
    resources[entity.name] = true;
  }

  for (const operation of entity.operationList) {
    let responseType = getResponseType(operation)?.replace(/\[\]$/, '');
    let bodyType = getRequestBodyType(operation)?.replace(/\[\]$/, '');

    if (responseType) {
      const regexMatch = RegExp(/ResultList<([^>]+)>$/).exec(responseType);
      if (regexMatch) {
        const genericClasses = regexMatch[1] ?? '';
        resources.ResultList = true;
        genericClasses.split(/\s*\|\s*/).forEach((genericClass) => {
          resources[genericClass] = true;
        });
      } else {
        resources[responseType] = true;
      }
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
export const getImportsForProperty = (property: SchemaObject) => {
  const res: Record<string, boolean> = {};

  // If this property references a resource, it will have a resourceId
  // ExpandableFields are always anyOf, since it's anyOf the resource or a string
  const anyOf = property.anyOf ?? (property.items as SchemaObject)?.anyOf;
  anyOf?.forEach((anyOfPropertyUntyped) => {
    const anyOfProperty = anyOfPropertyUntyped as SchemaObject;
    const resourceId = anyOfProperty['x-resourceId'];
    if (resourceId !== undefined) {
      res[resourceId] = true;
    }
  });

  // Annotations for java:
  // if (property.minimum) res['jakarta.validation.constraints.Min'] = true;
  // if (property.maximum) res['jakarta.validation.constraints.Max'] = true;
  // if (property.minLength || property.maxLength)
  //   res['jakarta.validation.constraints.Size'] = true;
  // if (property.pattern) res['jakarta.validation.constraints.Pattern'] = true;
  // if (property['x-required'])
  //   res['jakarta.validation.constraints.NotNull'] = true;

  return Object.keys(res);
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
 * Get the response type for an operation
 *
 * @param operation
 * @returns
 */
const getResponseType = (
  entityOperation: EntityOperation,
): string | undefined => {
  const operation = entityOperation.operation;
  const successResponse = operation.responses?.['200']?.content?.[
    'application/json'
  ]?.schema as SchemaObject;

  // If there is no application/json success response, skip (it might be a binary download)
  if (!successResponse) {
    return;
  }

  // If the response is a single resource, return the resource type)
  let responsetype = successResponse['x-resourceId'];

  // ResponseList is a special case, it is a generic list of resources
  const data = successResponse.properties?.data as SchemaObject;
  if (data?.type === 'array') {
    const resourceIds = [];
    const items = data.items as SchemaObject;
    if (items?.['x-resourceId'] !== undefined) {
      resourceIds.push(items?.['x-resourceId']);
    }
    items.anyOf?.forEach((anyOfProperty) => {
      resourceIds.push((anyOfProperty as SchemaObject)['x-resourceId']);
    });
    if (resourceIds.length > 0) {
      responsetype = 'ResultList<' + resourceIds.join(' | ') + '>';
    }
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
export const getResponseValidator = (
  entityOperation: EntityOperation,
  parameter: string,
) => {
  let responseType = getResponseType(entityOperation);
  if (!responseType) {
    return '';
  }
  if (responseType.match(/\[\]$/)) {
    return `${deCapitalize(
      responseType.slice(0, -2),
    )}.isValidList(${parameter})`;
  }
  if (responseType.match(/ResultList<[^>]+>$/)) {
    const genericClassString = responseType.match(/<([^>]+)>$/)?.[1] ?? '';
    const genericClasses = genericClassString.split(/\s*\|\s*/);
    const resources = genericClasses
      .map((genericClass) => capitalize(genericClass))
      .join(' | ');
    const resourceValidators = genericClasses
      .map((genericClass) => deCapitalize(genericClass) + '.isValid')
      .join(', ');
    return `resultList.isValid<${resources}>(${parameter}, [${resourceValidators}], query?.expand ?? [])`;
  }
  return `${deCapitalize(responseType)}.isValid(${parameter})`;
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

  const method = entityOperation.method;
  const methodAlias =
    method === 'post' ? 'add' : method === 'put' ? 'update' : method;

  // GetSaksmappe, PostSaksmappe operations should be named "get", "post"
  if (operationId === capitalize(entityOperation.method) + entityName) {
    return methodAlias;
  }
  // GetSaksmappeList should be named "list"
  else if (operationId === 'Get' + entityName + 'List') {
    return 'list';
  }
  // PostSaksmappeJournalpost (add journalpost to Saksmappe) should be named postJournalpost
  else {
    const stripPrefixRE = new RegExp('^' + capitalize(method) + entityName);
    return deCapitalize(
      operationId.replace(stripPrefixRE, capitalize(methodAlias)),
    );
  }
};

export const addTSHandlebarsHelpers = (handlebars: typeof Handlebars) => {
  handlebars.registerHelper('ts-datatype', getDataType);
  handlebars.registerHelper('ts-generate-path', generatePath);
  handlebars.registerHelper('ts-model-imports', getModelImports);
  handlebars.registerHelper('ts-resource-imports', getResourceImports);
  handlebars.registerHelper('ts-resources-for-property', getImportsForProperty);
  handlebars.registerHelper('ts-path-parameters', getPathParameters);
  handlebars.registerHelper('ts-query-parameters', getQueryParameters);
  handlebars.registerHelper('ts-responsevalidator', getResponseValidator);
  handlebars.registerHelper('ts-responsetype', getResponseType);
  handlebars.registerHelper('ts-requestbodytype', getRequestBodyType);
  handlebars.registerHelper('ts-operation-name', getOperationName);
};
