import {
	type BooleanLiteral,
	type EmitContext,
	type Model,
	type ModelProperty,
	type Namespace,
	type NumericLiteral,
	type Program,
	type Scalar,
	type StringLiteral,
	type Type,
	type Union,
	getFormat,
	getLifecycleVisibilityEnum,
	getPattern,
	hasVisibility,
} from "@typespec/compiler";
import { getExpandableEntity, getListType } from "./getters.js";

export type UrlType = Scalar;
export function isUrlProperty(
	context: EmitContext,
	type: Type,
): type is UrlType {
	return (
		(type.kind === "ModelProperty" &&
			(getFormat(context.program, type) === "url" ||
				(type.type.kind === "Scalar" && type.type.name === "url"))) ||
		(type.kind === "Scalar" && type.name === "url")
	);
}

export type EmailType = Scalar;
export function isEmailProperty(
	context: EmitContext,
	type: Type,
): type is EmailType {
	return (
		(type.kind === "ModelProperty" &&
			(getFormat(context.program, type) === "email" ||
				(type.type.kind === "Scalar" && type.type.name === "email"))) ||
		(type.kind === "Scalar" && type.name === "email")
	);
}

export type DateType = Scalar;
export function isDateProperty(
	context: EmitContext,
	type: Type,
): type is DateType {
	return (
		(type.kind === "ModelProperty" &&
			(getFormat(context.program, type) === "date" ||
				(type.type.kind === "Scalar" && type.type.name === "plainDate"))) ||
		(type.kind === "Scalar" && type.name === "plainDate")
	);
}

export type DateTimeType = Scalar;
export function isDateTimeProperty(
	context: EmitContext,
	type: Type,
): type is DateTimeType {
	return (
		(type.kind === "ModelProperty" &&
			(getFormat(context.program, type) === "date-time" ||
				(type.type.kind === "Scalar" && type.type.name === "utcDateTime"))) ||
		(type.kind === "Scalar" && type.name === "utcDateTime")
	);
}

export type PasswordType = Scalar;
export function isPasswordProperty(
	context: EmitContext,
	type: Type,
): type is PasswordType {
	return (
		(type.kind === "ModelProperty" &&
			(getFormat(context.program, type) === "password" ||
				(type.type.kind === "Scalar" && type.type.name === "password"))) ||
		(type.kind === "Scalar" && type.name === "password")
	);
}

export type EInnsynIdType = Scalar;
export function isEInnsynId(type: Type): type is EInnsynIdType {
	return type.kind === "Scalar" && type.name === "eInnsynId";
}

export type ListType = Model;
export function isList(type: Type) {
	return type.kind === "Model" && type.name === "Array";
}

export type StringUnionType = Union;
export function isStringUnion(type?: Type): type is StringUnionType {
	if (type === undefined) {
		return false;
	}
	if (type.kind !== "Union") {
		return false;
	}
	for (const [key, variant] of type.variants) {
		if (variant.type.kind !== "String") {
			return false;
		}
	}
	return true;
}

export type NumberUnionType = Union;
export function isNumberUnion(type?: Type): type is NumberUnionType {
	if (type === undefined) {
		return false;
	}
	if (type.kind !== "Union") {
		return false;
	}
	for (const [key, variant] of type.variants) {
		if (variant.type.kind !== "Number") {
			return false;
		}
	}
	return true;
}

export function isEnum(type?: Type) {
	if (type === undefined) {
		return false;
	}
	return (
		isStringUnion(type) ||
		isNumberUnion(type) ||
		isStringUnion(getListType(type)) ||
		isNumberUnion(getListType(type))
	);
}

export function isDefaultString(context: EmitContext, modelProperty: Type) {
	return (
		modelProperty.kind === "ModelProperty" &&
		modelProperty.type.kind === "Scalar" &&
		modelProperty.type.name === "string" &&
		!getFormat(context.program, modelProperty) &&
		!getPattern(context.program, modelProperty)
	);
}

export type StringType = StringLiteral | Scalar | StringUnionType;
export function isString(type: Type) {
	return (
		(type.kind === "Scalar" &&
			(type.name === "string" ||
				type.name === "plainDate" ||
				type.name === "utcDateTime" ||
				type.name === "url" ||
				type.name === "eInnsynId")) ||
		type.kind === "String" ||
		isStringUnion(type)
	);
}

export type DoubleType = NumericLiteral | Scalar;
export function isDouble(type: Type): type is DoubleType {
	return (
		(type.kind === "Scalar" && type.name === "double") ||
		type.kind === "Number" ||
		isNumberUnion(type)
	);
}

export type IntegerType = Scalar;
export function isInteger(type: Type) {
	return type.kind === "Scalar" && type.name === "integer";
}

export type BooleanType = BooleanLiteral | Scalar;
export function isBoolean(type: Type): type is BooleanLiteral {
	return (
		(type.kind === "Scalar" && type.name === "boolean") ||
		type.kind === "Boolean"
	);
}

export function isEInnsynEntity(type?: Type): boolean {
	return (
		type !== undefined &&
		type.kind === "Model" &&
		(type.name === "Base" ||
			(type.baseModel !== undefined && isEInnsynEntity(type.baseModel)))
	);
}

export function isExpandableField(type?: Type): boolean {
	return !!getExpandableEntity(type);
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

/**
 * Check if the model property is a final constant
 *
 * @param modelProperty
 * @returns
 */
export function isFinal(modelProperty: ModelProperty): boolean {
	switch (modelProperty.type.kind) {
		case "String":
		case "Number":
		case "Boolean":
			return true;
		default:
			return false;
	}
}

export function isWriteonlyProperty(
	program: Program,
	modelProperty: ModelProperty,
): boolean {
	const lifecycleEnum = getLifecycleVisibilityEnum(program);
	const read = lifecycleEnum.members.get("Read");
	const create = lifecycleEnum.members.get("Create");
	const update = lifecycleEnum.members.get("Update");

	if (!read || !create || !update) {
		throw new Error("Cannot find lifecycle enum members");
	}

	return (
		!hasVisibility(program, modelProperty, read) &&
		(hasVisibility(program, modelProperty, create) ||
			hasVisibility(program, modelProperty, update))
	);
}
