import { Model, Namespace, Type } from '@typespec/compiler';
import {
  getBodyPropertyModel,
  getExpandableEntity,
  getModelPath,
  getNamespacePath,
} from '../../../utils/getters.js';
import { pascalCase } from '../../../utils/stringutils.js';
import {
  isBoolean,
  isDouble,
  isEInnsynEntity,
  isEInnsynEntityNamespace,
  isEInnsynEntityUnion,
  isInteger,
  isList,
  isString,
} from '../../../utils/typecheckers.js';

export function getJavaType(
  type: Type,
  propertyName = '',
  parentName = '',
): string {
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

  if (isList(type) && type.kind === 'Model') {
    if (type.kind === 'Model' && type.indexer !== undefined) {
      return (
        'List<' +
        getJavaType(type.indexer.value, propertyName, parentName) +
        '>'
      );
    }
    // This is a generic alias. Not yet supported by TypeSpec
    //console.log(type.templateNode?.templateParameters);
    return 'List<unknown>';
  }

  const expandableEntity = getExpandableEntity(type);
  if (expandableEntity) {
    return 'ExpandableField<' + getJavaType(expandableEntity) + '>';
  }

  // Recurse for models that have a @body property
  if (type.kind === 'Model') {
    const bodyPropertyModel = getBodyPropertyModel(type);
    if (bodyPropertyModel) {
      return getJavaType(bodyPropertyModel, propertyName, parentName);
    }
  }

  if (type.kind === 'Model' && type.name) {
    const className = isEInnsynEntity(type) ? type.name + 'DTO' : type.name;

    // If there are template arguments, add them to the generic base type
    if (type.kind === 'Model' && type.templateMapper?.args) {
      const generics = type.templateMapper.args.map((template) => {
        if (
          template.entityKind === 'Type' &&
          (template.kind === 'Model' || template.kind === 'Union')
        ) {
          return getJavaType(template, propertyName, parentName);
        }
      });
      return pascalCase(className) + '<' + generics + '>';
    }

    // Return base type
    return pascalCase(className || propertyName);
  }

  if (isEInnsynEntityUnion(type)) {
    return pascalCase(parentName, propertyName);
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
