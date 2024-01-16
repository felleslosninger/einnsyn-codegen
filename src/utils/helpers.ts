import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  SchemaObject,
} from 'openapi3-ts/oas30';

export const forEachOperation = (
  spec: OpenAPIObject,
  callback: (operation: OperationObject, path: string, method: string) => void,
) => {
  for (const path in spec.paths) {
    const pathItem = spec.paths[path];
    for (const requestMethod in pathItem) {
      if (!['get', 'post', 'put', 'delete'].includes(requestMethod)) {
        continue;
      }

      const operation = pathItem[requestMethod as keyof typeof pathItem];
      callback(operation, path, requestMethod);
    }
  }
};

export const forEachEntity = (
  spec: OpenAPIObject,
  callback: (entityName: string, entity: any) => void,
) => {
  const schemas = spec.components?.schemas ?? {};
  for (const schemaName in schemas) {
    const schema = schemas[schemaName];
    callback(schemaName, schema);
  }
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

export const getResourceIds = (schema: SchemaObject) => {
  const resources: Record<string, boolean> = {};
  const anyOf =
    schema?.anyOf ??
    ((schema?.items as SchemaObject)?.anyOf ?? schema?.items
      ? [schema?.items as SchemaObject]
      : [schema]);
  anyOf?.forEach((anyOfPropertyUntyped) => {
    const anyOfProperty = anyOfPropertyUntyped as SchemaObject;
    const resourceId = anyOfProperty?.['x-resourceId'];
    if (resourceId !== undefined) {
      resources[resourceId] = true;
    }
  });
  return Object.keys(resources);
};

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
    .filter((x) => x !== undefined) as ParameterObject[];
};
