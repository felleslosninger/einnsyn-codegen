import { Model, ModelProperty, Namespace, Type } from '@typespec/compiler';
import {
  isBoolean,
  isDouble,
  isInteger,
  isList,
  isString,
} from '../../../utils/typeHelpers.js';
import {
  getBodyProperty,
  getEInnsynEntityFromType,
  getModelPath,
  getNamespacePath,
  isEInnsynEntityNamespace,
  pascalCase,
} from '../../../utils/utils.js';

export function getJavaType(type: Type, propertyName = ''): string {
  if (type === undefined) {
    return 'unknown';
  }

  if (isString(type)) {
    return 'String';
  }

  if (isDouble(type)) {
    return 'Double';
  }

  if (isInteger(type)) {
    return 'Integer';
  }

  if (isBoolean(type)) {
    return 'Boolean';
  }

  const eInnsynEntity = getEInnsynEntityFromType(type);
  if (eInnsynEntity) {
    return 'ExpandableField<' + eInnsynEntity.name + 'DTO>';
  }

  if (isList(type) && type.kind === 'Model') {
    if (type.kind === 'Model' && type.indexer !== undefined) {
      return 'List<' + getJavaType(type.indexer.value, propertyName) + '>';
    }
    if (propertyName === 'fieldErrors') {
      console.log(type);
    }
    //console.log(propertyName);
    //console.log(type);
    // Template?
    //console.log(type.templateNode?.templateParameters);
    return 'List<unknown>';
  }

  if (type.kind === 'Model' && type.name) {
    const bodyProperty = getBodyProperty(type);
    // If the body property is a model, return the model DTO
    if (
      bodyProperty &&
      bodyProperty.type.kind === 'Model' &&
      bodyProperty.type.name
    ) {
      return pascalCase(bodyProperty.type.name) + 'DTO';
    }

    // If there are template arguments, add them to the generic base type
    if (bodyProperty?.type?.kind === 'Model') {
      const generics = (bodyProperty.type.templateMapper?.args ?? []).map(
        (template) =>
          template.entityKind === 'Type' &&
          template.kind === 'Model' &&
          template.name + 'DTO',
      );
      return pascalCase(type.name) + '<' + generics + '>';
    }

    // Return base type
    return pascalCase(type.name || propertyName);
  }

  // Inline model, generate name from property name
  if (type.kind === 'Model') {
    return pascalCase(propertyName);
  }

  return 'unknown';
}

export function getJavaPackageName(obj: Model | Namespace): string {
  const path = getJavaPathArray(obj);
  return path.join('.').toLowerCase();
}

export function getJavaPathName(obj: Model | Namespace): string {
  return getJavaPathArray(obj).join('/').toLowerCase();
}

export function getJavaPathArray(obj: Model | Namespace): string[] {
  const path = ['no', 'einnsyn', 'backend'];
  const namespace = obj.kind === 'Model' ? obj.namespace : obj;

  if (isEInnsynEntityNamespace(namespace)) {
    path.push('entities');
  } else {
    path.push('common');
  }

  if (obj.kind === 'Model') {
    path.push(...getModelPath(obj));
  } else {
    path.push(...getNamespacePath(obj));
  }

  return path;
}

export function isFinal(modelProperty: ModelProperty): boolean {
  switch (modelProperty.type.kind) {
    case 'String':
    case 'Number':
    case 'Boolean':
      return true;
    default:
      return false;
  }
}

export function getDefaultValue(
  modelProperty: ModelProperty,
): string | number | boolean | undefined {
  switch (modelProperty.type.kind) {
    case 'Scalar':
      const type = modelProperty.type;
      switch (type.name) {
        case 'integer':
        case 'string':
        case 'boolean':
          if (modelProperty.defaultValue?.valueKind === 'StringValue') {
            return modelProperty.defaultValue.value;
          }
          if (modelProperty.defaultValue?.valueKind === 'NumericValue') {
            return modelProperty.defaultValue.value.asNumber() ?? undefined;
          }
          if (modelProperty.defaultValue?.valueKind === 'BooleanValue') {
            return modelProperty.defaultValue.value;
          }
          return undefined;
      }
      break;
    case 'String':
    case 'Number':
    case 'Boolean':
      return modelProperty.type.value.toString();
    case 'Union':
      const defaultValue = modelProperty.defaultValue;
      if (
        defaultValue?.valueKind === 'StringValue' ||
        defaultValue?.valueKind === 'BooleanValue'
      ) {
        return defaultValue?.value;
      }
      if (defaultValue?.valueKind === 'NumericValue') {
        defaultValue?.value.asNumber();
      }

    default:
      return undefined;
  }
}
