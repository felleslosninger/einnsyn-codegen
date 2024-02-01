import { ParameterObject, SchemaObject } from 'openapi3-ts/oas30';
import { capitalize, lc } from '../../utils/handlebarsHelpers';
import {
  EntityMetadata,
  OperationMetadata,
  getPathParameters,
  getRequestBody,
  getRequestBodyType,
  getResourceIds,
  getResponseBody,
} from '../../utils/helpers';
import { JAVA_SERVER_PACKAGE } from './javaServerGenerator';

export function getJavaServerPackageName() {
  return JAVA_SERVER_PACKAGE;
}

/**
 * Get a list of resources that needs to be imported for a entity's model class
 *
 * @param property
 * @returns
 */
export const getJavaServerModelImports = (
  entityOrSchema: EntityMetadata | SchemaObject,
) => {
  const resources: Record<string, boolean> = {};
  const schema =
    (entityOrSchema as EntityMetadata).entitySchema ??
    (entityOrSchema as SchemaObject);
  const properties = schema?.properties ?? {};

  for (const propertyName in properties) {
    const property = properties[propertyName] as SchemaObject;
    const propertyResources = getJavaServerImportsForProperty(property);
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
 * @param entityMetadata
 * @returns
 */
export const getJavaServerControllerImports = (
  entityMetadata: EntityMetadata,
) => {
  const resources: Record<string, boolean> = {};

  resources[JAVA_SERVER_PACKAGE + '.common.exceptions.EInnsynException'] = true;

  for (const operationMetadata of entityMetadata.entityOperationList) {
    // Add response object
    const responseBody = getResponseBody(operationMetadata.operation);
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
        const className =
          capitalize(entityMetadata.entityName) +
          capitalize(operationMetadata.operation.operationId) +
          'ResponseDTO';
        resources[
          JAVA_SERVER_PACKAGE +
            '.entities.' +
            lc(entityMetadata.entityName) +
            '.models.' +
            className
        ] = true;
      }
    }

    // Add request object
    const requestBody = getRequestBody(operationMetadata.operation);
    if (requestBody) {
      const modelImports = getJavaServerModelImports(requestBody);
      modelImports.forEach((modelImport) => (resources[modelImport] = true));
      if (operationMetadata.method === 'post') {
        resources['org.springframework.validation.annotation.Validated'] = true;
        resources[JAVA_SERVER_PACKAGE + '.validation.validationgroups.Insert'] =
          true;
      } else if (operationMetadata.method === 'put') {
        resources['org.springframework.validation.annotation.Validated'] = true;
        resources[JAVA_SERVER_PACKAGE + '.validation.validationgroups.Update'] =
          true;
      } else {
        resources['jakarta.validation.Valid'] = true;
      }
    }

    // Path parameters
    const pathParameters = getPathParameters(operationMetadata.operation);
    pathParameters.forEach((pathParameter) => {
      resources['jakarta.validation.Valid'] = true;
      resources['org.springframework.web.bind.annotation.PathVariable'] = true;
      if (pathParameter?.required) {
        resources['jakarta.validation.constraints.NotNull'] = true;
      }
      const resourceId = pathParameter?.['x-resourceId'];
      if (resourceId) {
        const existingObjectPath =
          JAVA_SERVER_PACKAGE + '.validation.existingobject.ExistingObject';
        resources[existingObjectPath] = true;
        const servicePath =
          JAVA_SERVER_PACKAGE +
          '.entities.' +
          lc(resourceId) +
          '.' +
          capitalize(resourceId) +
          'Service';
        resources[servicePath] = true;
      }
    });

    // Query parameters
    const xRequestQuery = operationMetadata.operation['x-request-query'];
    if (xRequestQuery) {
      const {
        'x-extend-entity': extendEntityName,
        'x-extend-name': extendName,
        'x-custom-name': customName,
        'x-custom-entity': customEntity,
        'x-has-custom-props': hasCustomProps,
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
      if (hasCustomProps && customName && customEntity) {
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
    switch (operationMetadata.method) {
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
export const getJavaServerImportsForProperty = (property: SchemaObject) => {
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
      case 'password':
        res[JAVA_SERVER_PACKAGE + '.validation.password.Password'] = true;
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
    const itemsResources = getJavaServerImportsForProperty(items);
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
export const getJavaServerDataType = (
  property: ParameterObject | SchemaObject,
  propertyName: string,
  entityName: string,
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
        getJavaServerDataType(
          schemaObject.items as SchemaObject,
          propertyName,
          entityName,
        ) +
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
    const className = capitalize(entityName) + capitalize(propertyName) + 'DTO';
    return 'ExpandableField<' + className + '>';
  }

  // Expandable field with one possible type
  if (Object.keys(resources).length === 1) {
    return 'ExpandableField<' + Object.keys(resources).join() + 'DTO>';
  }

  console.log('Unknown datatype', property);

  return 'Object';
};

/**
 * Get the response type for an operation
 *
 * @param operationMetadata
 * @returns
 */
export const getJavaServerResponseType = (
  operationMetadata: OperationMetadata,
): string | undefined => {
  // If there is no application/json success response, skip (it might be a binary download)
  const operation = operationMetadata.operation;
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
      const className =
        capitalize(operationMetadata.entityName) +
        capitalize(operation.operationId) +
        'ResponseDTO';
      return 'ResultList<' + className + '>';
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
    const className =
      capitalize(operationMetadata.entityName) +
      capitalize(operation.operationId) +
      'ResponseDTO';
    return className;
  } else {
    throw new Error('Unknown response type');
  }
};

export const getJavaServerOperationParameters = (
  operationMetadata: OperationMetadata,
) => {
  const operation = operationMetadata.operation;
  const parameters: {
    name: string;
    datatype: string;
    annotations: string[];
  }[] = [];

  const entityName = capitalize(operationMetadata.path.split('/')[1] ?? '');

  // Add path parameters
  const pathParameters = getPathParameters(operation);
  pathParameters.forEach((pathParameter) => {
    if (pathParameter) {
      const annotations = ['@Valid', '@PathVariable'];

      if (pathParameter.required) {
        annotations.push('@NotNull');
      }

      const resourceId = pathParameter?.['x-resourceId'];
      if (resourceId) {
        annotations.push(
          '@ExistingObject(service = ' +
            capitalize(resourceId) +
            'Service.class)',
        );
      }
      parameters.push({
        name: pathParameter.name,
        datatype: getJavaServerDataType(
          pathParameter,
          pathParameter.name,
          entityName,
        ),
        annotations,
      });
    }
  });

  // Add query parameter object
  const xRequestQuery = operation['x-request-query'];
  if (xRequestQuery) {
    const extendName = xRequestQuery['x-extend-name'];
    const customName = xRequestQuery['x-custom-name'];
    const hasCustomProps = xRequestQuery['x-has-custom-props'];
    if (extendName || hasCustomProps) {
      const dataType = hasCustomProps ? customName : extendName;
      parameters.push({
        name: 'query',
        datatype: (dataType ?? extendName) + 'DTO',
        annotations: ['@Valid'],
      });
    }
  }

  // Add request body
  const requestBody = getRequestBody(operation);
  if (requestBody) {
    const requestBodyType = getRequestBodyType(operation);
    const annotations = ['@RequestBody'];
    if (operationMetadata.method === 'post') {
      annotations.push('@Validated(Insert.class)');
    } else if (operationMetadata.method === 'put') {
      annotations.push('@Validated(Update.class)');
    } else {
      annotations.push('@Valid');
    }

    parameters.push({
      name: 'body',
      datatype: requestBodyType + 'DTO',
      annotations,
    });
  }

  return parameters;
};

export const addJavaServerHandlebarsHelpers = (
  handlebars: typeof Handlebars,
) => {
  handlebars.registerHelper('java-server-datatype', getJavaServerDataType);
  handlebars.registerHelper(
    'java-server-model-imports',
    getJavaServerModelImports,
  );
  handlebars.registerHelper(
    'java-server-controller-imports',
    getJavaServerControllerImports,
  );
  handlebars.registerHelper(
    'java-server-response-type',
    getJavaServerResponseType,
  );
  handlebars.registerHelper(
    'java-server-package-name',
    getJavaServerPackageName,
  );
  handlebars.registerHelper(
    'java-server-operation-parameters',
    getJavaServerOperationParameters,
  );
};
