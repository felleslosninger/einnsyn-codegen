import {
  ArrayLiteralNode,
  BooleanLiteral,
  EmitContext,
  getFormat,
  getPattern,
  Model,
  NumericLiteral,
  Scalar,
  StringLiteral,
  Type,
  Union,
} from '@typespec/compiler';

export type UrlType = Scalar;
export function isUrl(context: EmitContext, type: Type): type is UrlType {
  return (
    type.kind === 'Scalar' &&
    (type.name === 'url' || getFormat(context.program, type) === 'url')
  );
}

export type EmailType = Scalar;
export function isEmail(context: EmitContext, type: Type): type is EmailType {
  return (
    type.kind === 'Scalar' &&
    (type.name === 'email' || getFormat(context.program, type) === 'email')
  );
}

export type DateType = Scalar;
export function isDate(context: EmitContext, type: Type): type is DateType {
  return (
    type.kind === 'Scalar' &&
    (type.name === 'plainDate' || getFormat(context.program, type) === 'date')
  );
}

export type DateTimeType = Scalar;
export function isDateTime(
  context: EmitContext,
  type: Type,
): type is DateTimeType {
  return (
    type.kind === 'Scalar' &&
    (type.name === 'utcDateTime' ||
      getFormat(context.program, type) === 'date-time')
  );
}

export type EInnsynIdType = Scalar;
export function isEInnsynId(type: Type): type is EInnsynIdType {
  return type.kind === 'Scalar' && type.name === 'eInnsynId';
}

export type ListType = Model;
export function isList(type: Type) {
  return type.kind === 'Model' && type.name === 'Array';
}

export type StringUnionType = Union;
export function isStringUnion(type: Type): type is StringUnionType {
  if (type.kind !== 'Union') {
    return false;
  }
  for (const [key, variant] of type.variants) {
    if (variant.type.kind !== 'String') {
      return false;
    }
  }
  return true;
}

export type NumberUnionType = Union;
export function isNumberUnion(type: Type): type is NumberUnionType {
  if (type.kind !== 'Union') {
    return false;
  }
  for (const [key, variant] of type.variants) {
    if (variant.type.kind !== 'Number') {
      return false;
    }
  }
  return true;
}

export function isDefaultString(context: EmitContext, type: Type) {
  return (
    type.kind === 'Scalar' &&
    type.name === 'string' &&
    !getFormat(context.program, type) &&
    !getPattern(context.program, type)
  );
}

export type StringType = StringLiteral | Scalar | StringUnionType;
export function isString(type: Type) {
  return (
    (type.kind === 'Scalar' &&
      (type.name === 'string' ||
        type.name === 'plainDate' ||
        type.name === 'utcDateTime' ||
        type.name === 'url' ||
        type.name === 'eInnsynId')) ||
    type.kind === 'String' ||
    isStringUnion(type)
  );
}

export type DoubleType = NumericLiteral | Scalar;
export function isDouble(type: Type): type is DoubleType {
  return (
    (type.kind === 'Scalar' && type.name === 'double') ||
    type.kind === 'Number' ||
    isNumberUnion(type)
  );
}

export type IntegerType = Scalar;
export function isInteger(type: Type) {
  return type.kind === 'Scalar' && type.name === 'integer';
}

export type BooleanType = BooleanLiteral | Scalar;
export function isBoolean(type: Type): type is BooleanLiteral {
  return (
    (type.kind === 'Scalar' && type.name === 'boolean') ||
    type.kind === 'Boolean'
  );
}
