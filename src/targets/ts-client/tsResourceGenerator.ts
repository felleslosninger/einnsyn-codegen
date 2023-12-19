import fs from 'fs';
import Handlebars from 'handlebars';
import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import { TS_OUT_PATH, TS_TEMPLATE_PATH } from './tsConfig';
import * as prettier from 'prettier';

const MODEL_PATH = TS_OUT_PATH + '/model';
const RESOURCE_PATH = TS_OUT_PATH + '/resource';

// Load handlebars templates
const handlebars = Handlebars.create();

const capitalize = (s: string) => {
  return s.charAt(0).toUpperCase() + s.slice(1);
};
handlebars.registerHelper('capitalize', capitalize);

const deCapitalize = (s: string) => {
  return s.charAt(0).toLowerCase() + s.slice(1);
};
handlebars.registerHelper('deCapitalize', deCapitalize);

// Add lowercase "lc" helper
handlebars.registerHelper('lc', function (str: string) {
  return str?.toLowerCase();
});

// Add lowercase "uc" helper
handlebars.registerHelper('uc', function (str: string) {
  return str?.toUpperCase();
});

// Add equality "eq" helper
handlebars.registerHelper(
  'eq',
  function (this: any, a: string, b: string, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  },
);

// Add equality "ne" helper
handlebars.registerHelper(
  'ne',
  function (this: any, a: string, b: string, options) {
    return a !== b ? options.fn(this) : options.inverse(this);
  },
);

/**
 * Get TypeScript datatype for a property or parameter object
 *
 * @param property
 * @returns
 */
const getDataType = (property: ParameterObject | SchemaObject): string => {
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

  // Type not found, this might be a ExpandableField
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
handlebars.registerHelper('ts-datatype', getDataType);

/**
 *
 * @param entityOperation
 */
const generatePath = (entityOperation: EntityOperation) => {
  const originalPath = entityOperation.path ?? '';
  const modifiedPath =
    "'" +
    originalPath.replace(/{([^}]+)}/g, (a: string, b: string) => {
      return "' + param_" + b + " + '";
    }) +
    "'";
  return modifiedPath.replace(/\+ \'\'/g, '');
};
handlebars.registerHelper('ts-generate-path', generatePath);

/**
 *
 * @param property
 * @returns
 */
const getRequiredResources = (entity: Entity) => {
  const resources: Record<string, boolean> = {};
  const properties = entity.schema.properties ?? {};
  const entityResourceId = entity.schema['x-resourceId'];

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
handlebars.registerHelper('ts-required-resources', getRequiredResources);

//
const getResourcesForProperty = (property: SchemaObject) => {
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
handlebars.registerHelper('ts-resources-for-property', getResourcesForProperty);

/**
 *
 * @param entity
 * @returns
 */
const getRequiredControllerResources = (entity: Entity) => {
  const resources: Record<string, boolean> = {};

  for (const operation of entity.operationList) {
    let responseType = getResponseType(operation)?.replace(/\[\]$/, '');
    let bodyType = getBodyType(operation)?.replace(/\[\]$/, '');

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
handlebars.registerHelper(
  'ts-required-controller-resources',
  getRequiredControllerResources,
);

/**
 * Get path parameters for an operation
 *
 * @param operation
 * @returns
 */
const getPathParameters = (operation: OperationObject) => {
  const parameters = operation.parameters ?? [];
  return parameters
    .map((parameter) => {
      const parameterObject = parameter as ParameterObject;
      if (parameterObject.in !== 'path') {
        return undefined;
      }
      return {
        name: parameterObject.name,
        datatype: getDataType(parameterObject),
      };
    })
    .filter((x) => x !== undefined);
};
handlebars.registerHelper('ts-path-parameters', getPathParameters);

/**
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
handlebars.registerHelper('ts-operation-name', getOperationName);

/**
 *
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
handlebars.registerHelper('ts-responsetype', getResponseType);
handlebars.registerHelper('ts-responsevalidator', (entityOperation) => {
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
});

/**
 *
 * @param entityOperation
 * @returns
 */
const getBodyType = (entityOperation: EntityOperation): string | undefined => {
  const operation = entityOperation.operation;
  const requestBody = operation.requestBody as RequestBodyObject;
  const content = requestBody?.content;
  const schema = content?.['application/json']?.schema as SchemaObject;
  const bodyType = schema?.['x-resourceId'];
  return bodyType;
};
handlebars.registerHelper('bodytype', getBodyType);

type Entity = {
  name: string;
  schema: SchemaObject;
  operationList: EntityOperation[];
};

type EntityOperation = {
  path: string;
  method: string;
  operation: OperationObject;
};

export const generateResources = async (spec: OpenAPIObject) => {
  const entityList: {
    [key: string]: Entity;
  } = {};

  // Iterate all schemas
  const schemas = spec.components?.schemas ?? {};
  for (const name in schemas) {
    const schema = schemas[name] as SchemaObject;

    if (
      schema.properties?.id === undefined ||
      schema['x-resourceId'] === undefined
    ) {
      continue;
    }

    entityList[name] = {
      name,
      schema,
      operationList: [],
    };
  }

  // Iterate all paths, group them by matching root entity
  for (const path in spec.paths) {
    // Look up entity name from path
    const entityName = capitalize(path.split('/')[1] ?? '');
    const entity = entityList[entityName];

    // Entity not found
    if (!entity) {
      console.error('Entity from path "' + path + '" not found: ' + entityName);
      continue;
    }

    // Add operations to entity
    const pathItem = spec.paths[path];
    for (const methodUntyped in pathItem) {
      const method = methodUntyped as keyof typeof pathItem;
      const operation = pathItem[method] as OperationObject;
      const operationId = operation.operationId;
      if (!operationId) {
        continue;
      }

      entity.operationList.push({
        path,
        method,
        operation,
      });
    }
  }

  // Iterate all entities
  for (const name in entityList) {
    const entity = entityList[name];

    if (entity.operationList.length > 0) {
      await render(
        `${TS_TEMPLATE_PATH}/Resource.ts.hbs`,
        `${RESOURCE_PATH}/${name}Resource.ts`,
        entity,
      );
    }

    await render(
      `${TS_TEMPLATE_PATH}/Model.ts.hbs`,
      `${MODEL_PATH}/${name}.ts`,
      entity,
    );
  }
};

/**
 *
 * @param templatePath
 * @param outputPath
 * @param context
 */
const render = async (
  templatePath: string,
  outputPath: string,
  context: Record<string, unknown>,
) => {
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const template = handlebars.compile(templateSource);
  let output = template(context);
  try {
    output = await prettier.format(template(context), {
      parser: 'typescript',
      singleQuote: true,
    });
  } catch (e) {
    console.error('Error formatting ' + outputPath);
  }
  await fs.promises.mkdir(outputPath.replace(/\/[^/]+$/, ''), {
    recursive: true,
  });
  await fs.promises.writeFile(outputPath, output);
};
