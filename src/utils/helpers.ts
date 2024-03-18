import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  RequestBodyObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import { capitalize, deCapitalize } from './handlebarsHelpers';

// Ugly, but necessary(?).
let spec: OpenAPIObject;
export const setSpec = (specIn: OpenAPIObject) => {
  spec = specIn;
};

export type OperationMetadata = {
  path: string;
  summary?: string;
  description?: string;
  method?: string;
  operation: OperationObject;
  entity?: EntityMetadata;
  entityName?: string;
};

/**
 * Get a list of all operations, including metadata from their "parent" nodes.
 *
 * @param spec
 * @returns
 */
export const getOperations = (spec: OpenAPIObject) => {
  const pathList = Object.keys(spec.paths).map((path) => {
    return {
      path,
      pathItemObject: spec.paths[path],
    };
  });

  const operationList = pathList.reduce((acc, pathItem) => {
    const pathItemObject = pathItem.pathItemObject;
    const path = pathItem.path;
    const entityName = capitalize(path.split('/')[1] ?? '');
    return [
      ...acc,
      ...(['get', 'put', 'post', 'delete']
        .map((requestMethodUntyped) => {
          const requestMethod = requestMethodUntyped as keyof PathItemObject;
          if (pathItemObject[requestMethod]) {
            return {
              path,
              summary: pathItemObject.summary,
              description: pathItemObject.description,
              method: requestMethod,
              operation: pathItemObject[requestMethod] as OperationObject,
              entityName,
            };
          }
        })
        .filter((x) => x !== undefined) as OperationMetadata[]),
    ];
  }, [] as OperationMetadata[]);

  return operationList;
};

export type EntityMetadata = {
  entityName: string;
  schema?: SchemaObject;
};

const findEntityName = (entityNames: string[], path: string) => {
  const firstPath = path.split('/')[1] ?? '';
  return (
    entityNames.find(
      (entityName) => entityName.toLowerCase() === firstPath.toLowerCase(),
    ) ?? capitalize(firstPath)
  );
};

/**
 *
 * @param spec
 * @returns
 */
export const getEntities = (spec: OpenAPIObject) => {
  const schemas = spec.components?.schemas ?? {};
  const entityMetadataList: EntityMetadata[] = [];
  const entityMap: Record<string, EntityMetadata> = {};
  const operationList = getOperations(spec);

  // Add operations for each entity
  for (const schemaName in schemas) {
    const entitySchema = schemas[schemaName] as SchemaObject;
    const entityMetadata: EntityMetadata = {
      entityName: schemaName,
      schema: entitySchema,
    };
    entityMap[schemaName] = entityMetadata;
    entityMetadataList.push(entityMetadata);
  }

  // Add operations to each entity
  const entityNames = Object.keys(schemas);
  for (const operation of operationList) {
    const entityName = findEntityName(entityNames, operation.path);
    console.log('Found entity name', entityName, operation.path);
    if (entityName) {
      let entityMetadata = entityMap[entityName];
      if (!entityMetadata) {
        entityMetadata = {
          entityName,
          schema: schemas[entityName] as SchemaObject,
        };
        entityMetadataList.push(entityMetadata);
      }
      operation.entity = entityMetadata;
      operation.entityName = entityName;
    }
  }

  return entityMetadataList;
};

export const getEntityOperationList = (entityName: string) => {
  const operationList = getOperations(spec);
  return operationList.filter(
    (operation) => operation.entityName === entityName,
  );
};

type PropertyMetadata = {
  propertyName: string;
  propertySchema: SchemaObject;
};

/**
 * Get properties from the givent schema, merged with all extended schemas
 * @param entitySchema
 * @returns
 */
export const getPropertyObject = (
  entitySchema: SchemaObject,
  extended = false,
) => {
  let propertyObject: Record<string, SchemaObject> = {};

  // Initialize own props
  const properties = entitySchema?.properties ?? {};
  for (const propertyName in properties) {
    const propertySchema = properties[propertyName] as SchemaObject;
    propertyObject[propertyName] = propertySchema;
  }

  // Extend superclass props
  if (extended) {
    const extendsClass = entitySchema?.['x-extends'];
    if (extendsClass && spec?.components?.schemas?.[extendsClass]) {
      const extendsSchema = spec.components.schemas[
        extendsClass
      ] as SchemaObject;
      if (extendsSchema) {
        const extendsProperties = getPropertyObject(extendsSchema, extended);
        propertyObject = {
          ...extendsProperties,
          ...propertyObject,
        };
      }
    }
  }

  return propertyObject;
};

export const getPropertyList = (
  entitySchema: SchemaObject = {},
  extended = false,
) => {
  const propertyObject = getPropertyObject(entitySchema, extended);
  const propertyNameList = Object.keys(propertyObject);
  const propertyList: PropertyMetadata[] = propertyNameList.map(
    (propertyName) => {
      return {
        propertyName,
        propertySchema: propertyObject[propertyName],
      };
    },
  );
  return propertyList;
};

export const getResponseBody = (operation: OperationObject) => {
  const response = operation.responses?.['200']?.content?.['application/json']
    ?.schema as SchemaObject;
  return response;
};

export const getRequestBody = (
  operation: OperationObject,
): Record<string, any> | undefined => {
  const requestBody = (operation.requestBody as RequestBodyObject)?.content?.[
    'application/json'
  ]?.schema;
  return requestBody as Record<string, any>;
};

export const getRequestBodyType = (
  operation: OperationObject,
): string | undefined => {
  const requestBody = getRequestBody(operation);
  if (requestBody) {
    return requestBody['x-resourceId'] ?? operation.operationId;
  }
  return undefined;
};

export const getResources = (schema: SchemaObject) => {
  const resources: Record<string, SchemaObject> = {};
  const anyOf =
    schema?.anyOf ??
    (schema?.items as SchemaObject)?.anyOf ??
    (schema?.items ? [schema?.items as SchemaObject] : [schema]);
  anyOf?.forEach((anyOfPropertyUntyped) => {
    const anyOfProperty = anyOfPropertyUntyped as SchemaObject;
    const resourceId = anyOfProperty?.['x-resourceId'];
    if (resourceId !== undefined) {
      resources[resourceId] = anyOfProperty;
    }
  });

  return Object.keys(resources).map((key) => resources[key]);
};

export const getResourceIds = (schema: SchemaObject) => {
  const resources = getResources(schema);
  const resourceIds = resources.map((resource) => resource['x-resourceId']);
  return resourceIds;
};

export const getPathParameters = (operation: OperationObject) => {
  const parameters = operation.parameters ?? [];
  return parameters.filter((parameter) => {
    const parameterObject = parameter as ParameterObject;
    return parameterObject.in === 'path';
  }) as ParameterObject[];
};

export const getQueryParameters = (operation: OperationObject) => {
  const parameters = operation.parameters ?? [];
  return parameters.filter((parameter) => {
    const parameterObject = parameter as ParameterObject;
    return parameterObject.in === 'query';
  }) as ParameterObject[];
};

export const isUnionResource = (schema: SchemaObject) => {
  return getResourceIds(schema).length > 1;
};

export const hasOperations = (entityName: string) => {
  return getEntityOperationList(entityName).length > 0;
};

/**
 * Generate a simplified name for an operation
 *
 * @param entity
 * @param entityOperation
 * @returns
 */
export const getOperationName = (operationMetadata: OperationMetadata) => {
  const operation = operationMetadata.operation;
  const entityName = operationMetadata.entityName;
  const method = operationMetadata.method;
  const operationId = operation.operationId;
  if (!operationId) {
    return undefined;
  }

  const methodAlias =
    method === 'post' ? 'add' : method === 'put' ? 'update' : method;

  // GetSaksmappe, PostSaksmappe operations should be named "get", "post"
  if (operationId === capitalize(method) + entityName) {
    return methodAlias;
  }
  // GetSaksmappeList should be named "list"
  else if (operationId === 'Get' + entityName + 'List') {
    return 'list';
  }
  // Lookup
  else if (operationId === 'Lookup' + entityName) {
    return 'lookup';
  }
  // PostSaksmappeJournalpost (add journalpost to Saksmappe) should be named postJournalpost
  else {
    const stripPrefixRE = new RegExp(
      '^(' + capitalize(method) + entityName + ')([A-Z]|$)',
    );
    let operationName = deCapitalize(
      operationId.replace(stripPrefixRE, capitalize(methodAlias) + '$2'),
    );
    operationName = operationName.replace(/^post/, 'add');
    operationName = operationName.replace(/^put/, 'update');
    return operationName;
  }
};

export const isList = (property: SchemaObject) => {
  return property.type === 'array';
};

export const isExpandableField = (property: SchemaObject) => {
  return getResourceIds(property).length > 0;
};

export const isExpandableFieldList = (property: SchemaObject) => {
  return isList(property) && isExpandableField(property.items as SchemaObject);
};
