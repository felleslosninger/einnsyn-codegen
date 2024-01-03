import { ParameterObject, SchemaObject } from 'openapi3-ts/oas30';
import { Entity, JAVA_PACKAGE } from './javaServerGenerator';
import { capitalize, deCapitalize } from '../../utils/handlebarsHelpers';

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
    const resourcePath = getJavaPackageName(extendsResource, true);
    resources[resourcePath] = true;
  }

  return Object.keys(resources);
};

/**
 * Get resourceIds for ExpandableField properties
 *
 * @param property
 * @returns
 */
export const getJavaImportsForProperty = (property: SchemaObject) => {
  const res: Record<string, boolean> = {};

  // If this property references a resource, it will have a resourceId
  // ExpandableFields are always anyOf, since it's anyOf the resource or a string
  const anyOf = property.anyOf ?? (property.items as SchemaObject)?.anyOf;
  anyOf?.forEach((anyOfPropertyUntyped) => {
    const anyOfProperty = anyOfPropertyUntyped as SchemaObject;
    const resourceId = anyOfProperty['x-resourceId'];
    if (resourceId !== undefined) {
      const resourcePath = getJavaPackageName(resourceId, true);
      res[resourcePath] = true;
      res[JAVA_PACKAGE + '.entities.expandablefield.ExpandableField'] = true;
    }
  });

  if (property.type === 'array') res['java.util.List'] = true;

  if (property.type === 'string')
    res['jakarta.validation.constraints.Size'] = true;

  if (property.minimum) res['jakarta.validation.constraints.Min'] = true;
  if (property.maximum) res['jakarta.validation.constraints.Max'] = true;
  if (property.minLength || property.maxLength)
    res['jakarta.validation.constraints.Size'] = true;
  if (property.pattern) res['jakarta.validation.constraints.Pattern'] = true;

  if (property['readOnly']) {
    res['jakarta.validation.constraints.Null'] = true;
    res['no.einnsyn.apiv3.features.validation.validationGroups.Insert'] = true;
    res['no.einnsyn.apiv3.features.validation.validationGroups.Update'] = true;
  } else if (property['x-required']) {
    res['jakarta.validation.constraints.NotNull'] = true;
    res['no.einnsyn.apiv3.features.validation.validationGroups.Insert'] = true;
  }

  switch (property.format) {
    case 'date-time':
    case 'date':
      res['org.springframework.format.annotation.DateTimeFormat'] = true;
      break;
    case 'email':
      res['jakarta.validation.constraints.Email'] = true;
      break;
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
      return 'List<' + getDataType(schemaObject.items as SchemaObject) + '>';
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

  // Expandable field with multiple possible types
  if (Object.keys(resources).length > 1) {
    const resourceList = Object.keys(resources);
    const wrapperClass =
      'ExpandableWrapper' +
      capitalize(property['x-expandableField'] ?? 'unnamed');
    return 'ExpandableField<' + wrapperClass + '>';
  }

  // Expandable field with one possible type
  if (Object.keys(resources).length === 1) {
    return 'ExpandableField<' + Object.keys(resources).join() + 'JSON>';
  }

  return 'Object';
};

export const getJavaPackageName = (name: string, withClass: boolean) => {
  const base = JAVA_PACKAGE + '.entities.' + deCapitalize(name) + '.models';
  if (withClass === true) {
    return base + '.' + capitalize(name) + 'JSON';
  }
  return base;
};

export const addJavaServerHandlebarsHelpers = (
  handlebars: typeof Handlebars,
) => {
  handlebars.registerHelper('java-datatype', getDataType);
  handlebars.registerHelper('java-model-imports', getJavaModelImports);
  handlebars.registerHelper('java-package-name', getJavaPackageName);
  handlebars.registerHelper(
    'java-resources-for-property',
    getJavaImportsForProperty,
  );
};
