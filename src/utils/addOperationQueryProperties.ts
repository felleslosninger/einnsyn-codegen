import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  ResponseObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import { capitalize } from './handlebarsHelpers';
import { getQueryParameters } from './helpers';

export const addOperationQueryProperties = (spec: OpenAPIObject) => {
  // Create query parameter objects for each operation. We want paths like
  // GET /bruker/innsynskrav
  // to inherit (or extend, if needed) query parameters from
  // GET /innsynskrav
  // so that the same object can be used and type checked throughout the codebase.
  const entityQueryProperties: {
    [key: string]: Record<string, Record<string, SchemaObject>>;
  } = {};

  // Add base query parameters
  const baseQueryParameters = spec.components?.schemas
    ?.QueryParameters as SchemaObject;
  const baseListQueryParameters = spec.components?.schemas
    ?.ListQueryParameters as SchemaObject;
  entityQueryProperties.Base = {
    get: baseQueryParameters.properties as Record<string, SchemaObject>,
    list: baseListQueryParameters.properties as Record<string, SchemaObject>,
  };

  // Add query parameters to base entity
  const baseEntity = spec.components?.schemas?.Base as SchemaObject;
  baseEntity['x-request-query'] = {
    get: {
      'x-custom-name': 'BaseGetQuery',
      'x-custom-props': baseQueryParameters.properties,
    },
    list: {
      'x-custom-name': 'BaseListQuery',
      'x-custom-props': baseListQueryParameters.properties,
    },
  };

  // First, create a index of all operations query properties by their return entity
  // and method
  for (const path in spec.paths) {
    const pathItem = spec.paths[path];
    for (const requestMethod in pathItem) {
      if (!['get', 'post', 'put', 'delete'].includes(requestMethod)) {
        continue;
      }

      const operation = pathItem[requestMethod as keyof typeof pathItem];
      const { queryProperties, method, entityName } = parseOperation(
        requestMethod,
        operation,
      );
      if (!entityName) {
        continue;
      }

      entityQueryProperties[entityName] =
        entityQueryProperties[entityName] ?? {};

      // Merge in potential query parameters from the path
      const existingQueryProperties = entityQueryProperties[entityName][method];
      if (existingQueryProperties) {
        entityQueryProperties[entityName][method] = {
          ...existingQueryProperties,
          ...queryProperties,
        };
      } else {
        entityQueryProperties[entityName][method] = queryProperties ?? {};
      }
    }
  }

  // Inherit query parameters from super-objects
  for (const path in spec.paths) {
    const pathItem = spec.paths[path];
    for (const requestMethod in pathItem) {
      const operation = pathItem[
        requestMethod as keyof typeof pathItem
      ] as OperationObject;
      const { method, entityName } = parseOperation(requestMethod, operation);

      const entity = spec.components?.schemas?.[entityName] as SchemaObject;
      const properties = entityQueryProperties[entityName] ?? {};
      const queryProperties = properties[method] ?? {};

      if (entity) {
        const { extendName, extendEntityName, remainingProperties } = getSuper(
          entity,
          method,
          { ...queryProperties },
        );

        operation['x-request-query'] = {
          'x-extend-name': extendName,
          'x-extend-entity': extendEntityName,
          'x-custom-entity': entityName,
          'x-custom-name':
            capitalize(entityName) + capitalize(method) + 'Query',
          'x-custom-props': remainingProperties,
          'x-has-custom-props': Object.keys(remainingProperties).length > 0,
          'x-all-props': queryProperties,
          'x-has-props': Object.keys(queryProperties).length > 0,
        };
        entity['x-request-query'] = entity['x-request-query'] ?? {};
        entity['x-request-query'][method] = operation['x-request-query'];
      }
      // No entity (/search?)
      else {
        const entityName = capitalize(path.split('/')[1] ?? '');
        const queryParameterList = getQueryParameters(operation);
        const queryParameters = queryParameterList.reduce(
          (acc, p) => {
            acc[p.name] = p.schema as SchemaObject;
            return acc;
          },
          {} as { [key: string]: SchemaObject },
        );
        operation['x-request-query'] = {
          'x-no-entity': true,
          'x-custom-entity': entityName,
          'x-custom-name': capitalize(operation.operationId) + 'Query',
          'x-has-custom-props': Object.keys(queryParameters).length > 0,
          'x-custom-props': queryParameters,
          'x-all-props': queryParameters,
          'x-has-props': Object.keys(queryProperties).length > 0,
        };
      }
    }
  }

  function getSuper(
    entity: SchemaObject,
    method: string,
    queryProperties: Record<string, SchemaObject>,
  ): {
    extendName?: string;
    extendEntityName?: string;
    remainingProperties: Record<string, SchemaObject>;
    missingProperties?: boolean;
  } {
    const superName = entity['x-extends'];
    const superEntity =
      (spec.components?.schemas as SchemaObject)?.[superName] ?? {};
    const superProps = entityQueryProperties[superName]?.[method];

    if (!superName) {
      return {
        remainingProperties: queryProperties,
      };
    }

    // Recurse
    const {
      extendName,
      extendEntityName,
      remainingProperties,
      missingProperties,
    } = getSuper(superEntity, method, queryProperties);

    // If we're missing properties from super, return and don't extend
    if (missingProperties) {
      return {
        remainingProperties: queryProperties,
        missingProperties: true,
      };
    }

    // Check if all properties in super are present in queryProperties
    if (superProps) {
      for (const propName in superProps) {
        const superProp = superProps[propName];
        const prop = remainingProperties[propName];
        if (isDifferent(superProp, prop)) {
          return {
            remainingProperties: queryProperties,
            missingProperties: true,
          };
        }
        delete remainingProperties[propName];
      }
      return {
        extendName: capitalize(superName) + capitalize(method) + 'Query',
        extendEntityName: superName,
        remainingProperties,
        missingProperties: false,
      };
    }

    // No super properties, return remaining properties
    return {
      extendName,
      extendEntityName,
      remainingProperties,
      missingProperties: false,
    };
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
 * Parse an operation object and return enriched properties
 *
 * @param requestMethod
 * @param operation
 * @returns
 */
const parseOperation = (requestMethod: string, operation: OperationObject) => {
  // Get the query parameters from the path
  const operationParameters = operation.parameters as ParameterObject[];
  const operationQueryParameters = operationParameters?.filter(
    (p) => p.in === 'query',
  );
  const queryProperties = operationQueryParameters?.reduce(
    (acc, p) => {
      acc[p.name] = p.schema as SchemaObject;
      return acc;
    },
    {} as { [key: string]: SchemaObject },
  );
  const queryPropertiesSchema = {
    properties: queryProperties,
  } as SchemaObject;

  const response = operation.responses?.['200'] as ResponseObject;
  const responseBody = response?.content?.['application/json']
    ?.schema as SchemaObject;
  const isList = responseBody?.['x-resourceId'] === 'ResultList';

  // Find the entity object
  const entity = isList
    ? ((responseBody?.properties?.data as SchemaObject)?.items as SchemaObject)
    : responseBody;
  const entityName = entity?.['x-resourceId'];

  const method =
    requestMethod === 'get' ? (isList ? 'list' : 'get') : requestMethod;

  return {
    queryProperties,
    queryPropertiesSchema,
    response,
    entity,
    isList,
    entityName,
    method,
  };
};
