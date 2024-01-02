import { ParameterObject, SchemaObject } from 'openapi3-ts/oas30';
import { Entity } from './javaServerGenerator';

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
        return 'int';
      } else {
        return 'long';
      }
    case 'number':
      if (schemaObject.format === 'float') {
        return 'float';
      } else {
        return 'double';
      }
    case 'boolean':
      return 'Boolean';
    case 'array':
      return getDataType(schemaObject.items as SchemaObject) + '[]';
    case 'object':
      return 'Object';
  }

  // Type not found, this is probably an ExpandableField
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

export const addJavaServerHandlebarsHelpers = (
  handlebars: typeof Handlebars,
) => {};
