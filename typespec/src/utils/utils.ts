import { Model, Namespace, Type } from '@typespec/compiler';

export function isEInnsynEntity(obj: Model): boolean {
  return (
    obj.name === 'Base' ||
    (obj.baseModel !== undefined && isEInnsynEntity(obj.baseModel))
  );
}

export function isEInnsynEntityNamespace(
  namespace: Namespace | undefined,
): boolean {
  if (!namespace) {
    return false;
  }
  for (const [key, model] of namespace.models) {
    if (isEInnsynEntity(model)) {
      return true;
    }
  }
  return false;
}

export function getEInnsynEntityFromType(type: Type): Model | undefined {
  if (type.kind === 'Model' && isEInnsynEntity(type)) {
    return type;
  }

  if (type.kind !== 'Union') {
    return;
  }

  const variants = type.variants;
  if (variants.size !== 2) {
    return;
  }

  const variantList = Array.from(variants.values());
  const idVariant = variantList[0].type;
  if (idVariant.kind !== 'Scalar') {
    return;
  }

  const entityVariant = variantList[1].type;
  if (entityVariant.kind != 'Model' || !isEInnsynEntity(entityVariant)) {
    return;
  }

  return entityVariant;
}

export function getModelPath(model: Model): string[] {
  if (!model.namespace) {
    return [];
  }
  return getNamespacePath(model.namespace);
}

export function getNamespacePath(namespace: Namespace): string[] {
  const path: string[] = [];
  let ns: Namespace | undefined = namespace;
  // Traverse up the namespace tree, don't add the top-level namespace
  while (ns && ns.namespace?.name) {
    path.unshift(ns.name);
    ns = ns.namespace;
  }
  return path;
}

export function getBodyProperty(model: Model) {
  for (const [key, value] of model.properties) {
    if (value?.decorators.find((d) => d.definition?.name === '@body')) {
      return value;
    }
  }
}

export function constVarName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

export function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function camelCase(s: string): string {
  return s.replace(/[ -]([a-zA-Z])/g, (g) => g[1].toUpperCase());
}

export function pascalCase(s: string): string {
  return ucFirst(camelCase(s));
}
