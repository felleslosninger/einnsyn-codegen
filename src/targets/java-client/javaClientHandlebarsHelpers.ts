import {
  OperationObject,
  ParameterObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import { capitalize, lc } from '../../utils/handlebarsHelpers';
import {
  getPathParameters,
  getPropertyList,
  getPropertyObject,
  getRequestBody,
  getRequestBodyType,
  getResourceIds,
  getResponseBody,
} from '../../utils/helpers';
import { getJavaServerDataType } from '../java-server/javaServerHandlebarsHelpers';
import {
  Entity,
  EntityOperation,
  JAVA_CLIENT_PACKAGE,
} from './javaClientGenerator';

export const getJavaClientPackageName = () => {
  return JAVA_CLIENT_PACKAGE;
};

export const getJavaClientServiceImports = (entity: Entity) => {
  const resources: Record<string, boolean> = {};

  resources[JAVA_CLIENT_PACKAGE + '.exceptions.EInnsynException'] = true;

  for (const operationWrapper of entity.operationList) {
    // Add response object
    const responseBody = getResponseBody(operationWrapper.operation);
    if (responseBody) {
      const resourceIds = getResourceIds(responseBody);
      if (resourceIds.join() === 'ResultList') {
        resourceIds.shift();
        const dataItems = (responseBody.properties?.data as SchemaObject)
          ?.items as SchemaObject;
        const dataItemsResources = getResourceIds(dataItems);
        resourceIds.push(...dataItemsResources);
        resources[JAVA_CLIENT_PACKAGE + '.common.resultlist.ResultList'] = true;
      }
      if (resourceIds.length > 1) {
        resources[
          JAVA_CLIENT_PACKAGE +
            '.entities.' +
            lc(entity.name) +
            '.UnionResource' +
            operationWrapper.operation.operationId
        ] = true;
      }
    }

    // Add request object
    const requestBody = getRequestBody(operationWrapper.operation);
    if (requestBody) {
      const modelImports = getJavaClientModelImports(requestBody);
      modelImports.forEach((modelImport) => (resources[modelImport] = true));
    }

    // Query parameters
    const xRequestQuery = operationWrapper.operation['x-request-query'];
    if (xRequestQuery) {
      const {
        'x-has-props': hasProps,
        'x-custom-entity': customEntity,
        'x-custom-name': customName,
      } = xRequestQuery;
      if (hasProps) {
        const customQueryObjectPath =
          JAVA_CLIENT_PACKAGE +
          '.entities.' +
          lc(customEntity) +
          '.' +
          capitalize(customName);
        resources[customQueryObjectPath] = true;
      }
    }
  }
  return Object.keys(resources);
};

/**
 * Get a list of resources that needs to be imported for a entity's model class
 *
 * @param property
 * @returns
 */
export const getJavaClientModelImports = (
  entityOrSchema: Entity | SchemaObject,
) => {
  const resources: Record<string, boolean> = {};
  const schema =
    (entityOrSchema as Entity).schema ?? (entityOrSchema as SchemaObject);
  const properties = getPropertyObject(schema, true) ?? {};

  for (const propertyName in properties) {
    const property = properties[propertyName] as SchemaObject;
    const propertyResources = getJavaClientImportsForProperty(property);
    propertyResources.forEach((resourceId) => (resources[resourceId] = true));
  }

  const resourceIds = getResourceIds(schema);
  if (resourceIds[0] === 'ResultList') {
    // Handle ResultList separately (it is not an entity)
    resourceIds.shift();
    resources[JAVA_CLIENT_PACKAGE + '.common.resultlist.ResultList'] = true;

    // Push the data items resources
    const dataItems = (schema.properties?.data as SchemaObject)
      ?.items as SchemaObject;
    const dataItemsResources = getResourceIds(dataItems);
    resourceIds.push(...dataItemsResources);
  }

  if (resourceIds.length > 0) {
    resources[JAVA_CLIENT_PACKAGE + '.common.expandablefield.ExpandableField'] =
      true;
  }

  resourceIds.forEach((resourceId) => {
    const resourcePath =
      JAVA_CLIENT_PACKAGE +
      '.entities.' +
      lc(resourceId) +
      '.' +
      capitalize(resourceId);
    resources[resourcePath] = true;
  });

  // Import HasId if this doesn't extend anything and has an ID property
  if (properties.id) {
    resources[JAVA_CLIENT_PACKAGE + '.common.hasid.HasId'] = true;
  }

  return Object.keys(resources);
};

/**
 * Get required import statements for a property
 *
 * @param property
 * @returns
 */
export const getJavaClientImportsForProperty = (property: SchemaObject) => {
  const res: Record<string, boolean> = {};

  // If this property references a resource, it will have a resourceId
  // ExpandableFields are always anyOf, since it's anyOf the resource or a string
  getResourceIds(property).forEach((resourceId) => {
    const resourcePath =
      JAVA_CLIENT_PACKAGE +
      '.entities.' +
      lc(resourceId) +
      '.' +
      capitalize(resourceId);
    res[resourcePath] = true;
    if (!property.readOnly) {
      res[JAVA_CLIENT_PACKAGE + '.common.expandablefield.ExpandableField'] =
        true;
      res['java.util.function.UnaryOperator'] = true;
    }
  });

  if (property.type === 'array') {
    res['java.util.List'] = true;
    res['java.util.ArrayList'] = true;
  }

  // If this is an array, check child items
  if (property.type === 'array') {
    const items = property.items as SchemaObject;
    const itemsResources = getJavaClientImportsForProperty(items);
    itemsResources.forEach((resourceId) => (res[resourceId] = true));
  }

  return Object.keys(res);
};

export const getJavaClientListItemDataType = (property: SchemaObject) => {
  const items = property.items as SchemaObject;
  return getJavaClientDatatype(items);
};

export const getExpandedDataType = (property: SchemaObject) => {
  const resourceIds = getResourceIds(property);
  if (resourceIds.length > 1) {
    return (
      'UnionResource' + capitalize(property['x-expandableField'] ?? 'unnamed')
    );
  } else {
    return resourceIds.join();
  }
};

export const isUnionResource = (property: SchemaObject) => {
  const resourceIds = getResourceIds(property);
  return resourceIds.length > 1;
};

export const filterWriteable = (properties: Record<string, SchemaObject>) => {
  const res: Record<string, SchemaObject> = {};
  for (const propertyName in properties) {
    const property = properties[propertyName];
    if (property.readOnly) {
      continue;
    }
    res[propertyName] = property;
  }
  return res;
};

export const getJavaClientDatatype = (
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
      return (
        'List<' +
        getJavaClientDatatype(schemaObject.items as SchemaObject) +
        '>'
      );
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
    //const wrapperClass =
    //  'UnionResource' + capitalize(property['x-expandableField'] ?? 'unnamed');
    //return 'ExpandableField<' + wrapperClass + '>';
    return (
      'UnionResource' + capitalize(property['x-expandableField'] ?? 'unnamed')
    );
  }

  // Expandable field with one possible type
  if (Object.keys(resources).length === 1) {
    return 'ExpandableField<' + Object.keys(resources).join() + '>';
  }

  console.log('Unknown datatype', property);

  return 'Object';
};

export const javaClientHasId = (entitySchema: Entity) => {
  const properties = getPropertyObject(entitySchema ?? {}, true) ?? {};
  return properties.id !== undefined;
};

export const javaClientGeneratePathString = (operation: EntityOperation) => {
  const originalPath = operation.path ?? '';
  const modifiedPath =
    '"' +
    originalPath.replace(/{([^}]+)}/g, (a: string, b: string) => {
      return '" + ' + b + ' + "';
    }) +
    '"';
  return modifiedPath.replace(/\s*\+\s*""/g, '');
};

/**
 *
 * @param operationWrapper
 * @returns
 */
export const getJavaClientOperationParameters = (
  operationWrapper: EntityOperation,
  withQueryParameters = true,
) => {
  const operation = operationWrapper.operation;
  const parameters: {
    name: string;
    datatype: string;
  }[] = [];

  // Add path parameters
  const pathParameters = getPathParameters(operation);
  pathParameters.forEach((pathParameter) => {
    if (pathParameter) {
      parameters.push({
        name: pathParameter.name,
        datatype: getJavaClientDatatype(pathParameter),
      });
    }
  });

  // Add query parameter object
  const xRequestQuery = operation['x-request-query'];
  if (withQueryParameters && xRequestQuery) {
    const extendName = xRequestQuery['x-extend-name'];
    const customName = xRequestQuery['x-custom-name'];
    const allProps = xRequestQuery['x-all-props'] ?? {};
    if (Object.keys(allProps).length > 0) {
      parameters.push({
        name: 'query',
        datatype: customName ?? extendName,
      });
    }
  }

  // Add request body
  const requestBody = getRequestBody(operation);
  if (requestBody) {
    const requestBodyType = getRequestBodyType(operation);
    parameters.push({
      name: 'body',
      datatype: requestBodyType ?? '',
    });
  }

  return parameters;
};

/**
 * Get the response type for an operation
 *
 * @param operation
 * @returns
 */
export const getJavaClientResponseType = (
  operation: OperationObject,
): string | undefined => {
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
        'ResultList<' + resourceIds.map((resourceId) => resourceId).join() + '>'
      );
    } else if (resourceIds.length > 1) {
      return 'ResultList<' + 'UnionResource' + operation.operationId + '>';
    } else {
      throw new Error('Unknown response type');
    }
  }

  // If we have one resource type, return that
  if (resourceIds.length === 1) {
    return resourceIds.join();
  }
  // For multiple types, return a union type
  else if (resourceIds.length > 1) {
    return 'UnionResource' + operation.operationId;
  } else {
    throw new Error('Unknown response type');
  }
};

export const addJavaClientHandlebarsHelpers = (
  handlebars: typeof Handlebars,
) => {
  handlebars.registerHelper(
    'java-client-package-name',
    getJavaClientPackageName,
  );
  handlebars.registerHelper(
    'java-client-model-imports',
    getJavaClientModelImports,
  );
  handlebars.registerHelper(
    'java-client-imports-for-property',
    getJavaClientImportsForProperty,
  );
  handlebars.registerHelper('is-union-resource', isUnionResource);
  handlebars.registerHelper('filter-writeable', filterWriteable);
  handlebars.registerHelper('java-client-has-id', javaClientHasId);
  handlebars.registerHelper('java-client-datatype', getJavaClientDatatype);
  handlebars.registerHelper(
    'java-client-generate-path-string',
    javaClientGeneratePathString,
  );
  handlebars.registerHelper('java-expanded-datatype', getExpandedDataType);
  handlebars.registerHelper(
    'java-client-list-item-datatype',
    getJavaClientListItemDataType,
  );
  handlebars.registerHelper('get-resource-ids', getResourceIds);
  handlebars.registerHelper('java-server-datatype', getJavaServerDataType);
  handlebars.registerHelper(
    'java-client-response-type',
    getJavaClientResponseType,
  );
  handlebars.registerHelper(
    'java-client-operation-parameters',
    getJavaClientOperationParameters,
  );
  handlebars.registerHelper(
    'java-client-service-imports',
    getJavaClientServiceImports,
  );
};
