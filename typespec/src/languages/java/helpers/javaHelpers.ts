import { Entity, isType, Model, Namespace, Type } from '@typespec/compiler';
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

export type JavaTypeOptions = {
  entitySuffix?: string;
  wrapExpandableFields?: boolean;
};

export function getJavaType(
  options: JavaTypeOptions,
  type: Type,
  propertyName?: string,
  parentName?: string,
): string;
export function getJavaType(
  type: Type,
  propertyName?: string,
  parentName?: string,
): string;
export function getJavaType(
  ...args: (JavaTypeOptions | Type | string | undefined)[]
): string {
  let i = 0;
  const options =
    typeof args[i] === 'object' && !isType(args[i] as Entity)
      ? (args[i++] as JavaTypeOptions)
      : {
          entitySuffix: 'DTO',
          wrapExpandableFields: true,
        };
  const type = args[i++] as Type;
  const propertyName = (args[i++] as string) ?? '';
  const parentName = (args[i++] as string) ?? '';

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
        getJavaType(options, type.indexer.value, propertyName, parentName) +
        '>'
      );
    }
    // This is a generic alias. Not yet supported by TypeSpec
    return 'List<unknown>';
  }

  const expandableEntity = getExpandableEntity(type);
  if (expandableEntity) {
    if (options.wrapExpandableFields) {
      return 'ExpandableField<' + getJavaType(options, expandableEntity) + '>';
    } else {
      return getJavaType(options, expandableEntity);
    }
  }

  // Recurse for models that have a @body property
  if (type.kind === 'Model') {
    const bodyPropertyModel = getBodyPropertyModel(type);
    if (bodyPropertyModel && bodyPropertyModel.name) {
      return getJavaType(options, bodyPropertyModel, propertyName, parentName);
    }
  }

  if (type.kind === 'Model' && type.name) {
    const className =
      isEInnsynEntity(type) && options.entitySuffix
        ? type.name + options.entitySuffix
        : type.name;

    // If there are template arguments, add them to the generic base type
    if (type.kind === 'Model' && type.templateMapper?.args) {
      const generics = type.templateMapper.args.map((template) => {
        if (
          template.entityKind === 'Type' &&
          (template.kind === 'Model' || template.kind === 'Union')
        ) {
          return getJavaType(options, template, propertyName, parentName);
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

export function getJavaEntityPackageName(
  packageName: string,
  obj: Model | Namespace,
): string {
  const path = getJavaEntityPathArray(packageName, obj);
  return path.join('.').toLowerCase();
}

export function getJavaModelPackageName(
  packageName: string,
  model: Model | Namespace,
): string {
  const path = getJavaModelPathArray(packageName, model);
  return path.join('.').toLowerCase();
}

export function getJavaEntityPathName(
  packageName: string,
  obj: Model | Namespace,
): string {
  return getJavaEntityPathArray(packageName, obj).join('/').toLowerCase();
}

export function getJavaModelPathName(
  packageName: string,
  model: Model | Namespace,
): string {
  return getJavaModelPathArray(packageName, model).join('/').toLowerCase();
}

export function getJavaEntityPathArray(
  packageName: string,
  obj: Model | Namespace,
): string[] {
  const path = packageName.split('.');
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

export function getJavaModelPathArray(
  packageName: string,
  model: Model | Namespace,
): string[] {
  const pathArray = getJavaEntityPathArray(packageName, model);
  pathArray.push('models');
  return pathArray;
}
