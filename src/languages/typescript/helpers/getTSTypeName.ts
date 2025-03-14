import type { Type } from "@typespec/compiler";
import {
	getBodyPropertyModel,
	getExpandableEntity,
	getFixedValue,
	getListType,
} from "../../../utils/getters.js";
import { pascalCase } from "../../../utils/stringUtils.js";
import {
	isBoolean,
	isDouble,
	isFinal,
	isInteger,
	isList,
	isNumberUnion,
	isString,
	isStringUnion,
} from "../../../utils/typecheckers.js";
import type { TSImportType, TSProps } from "../types.js";
import { getTSImports, getTSModelClassName } from "./tsHelpers.js";
import { getTypeDefinition } from "./getTypeDefinition.js";

export type GetTSTypeNameProps = TSProps & {
	type?: Type;
	propertyName?: string;
	entitySuffix?: string;
	tsTypeImport?: boolean;
};

export function getTSTypeName(
	props: GetTSTypeNameProps,
): [string, TSImportType[]] {
	const { type, propertyName } = props;
	if (type === undefined) {
		return ["unknown", []];
	}

	// Union
	if (isStringUnion(type) || isNumberUnion(type)) {
		const variants = Array.from(type.variants);
		const unionTypes = variants.map(([, unionVariant]) => {
			if (unionVariant.type.kind === "String") {
				return `'${unionVariant.type.value}'`;
			}
			if (unionVariant.type.kind === "Number") {
				return unionVariant.type.value;
			}
		});
		return [unionTypes.join(" | "), []];
	}

	// For lists, recurse on the list type
	if (isList(type) && type.kind === "Model") {
		if (type.kind === "Model" && type.indexer !== undefined) {
			const listType = getListType(type);
			const [listTSType, imports] = getTSTypeName({
				...props,
				type: listType,
			});
			return [`Array<${listTSType}>`, imports];
		}
		// This is a generic alias. Not yet supported by TypeSpec
		return ["Array<unknown>", []];
	}

	// For model properties, recurse and set propertyName
	if (type.kind === "ModelProperty") {
		// Check if this property has a fixed value, if so, the type should be this value
		const fixedValue = getFixedValue(type);
		if (typeof fixedValue === "string") {
			return [`"${fixedValue}"`, []];
		}
		if (typeof fixedValue === "number") {
			return [`${fixedValue}`, []];
		}
		if (typeof fixedValue === "boolean") {
			return [`${fixedValue}`, []];
		}

		return getTSTypeName({
			...props,
			type: type.type,
			propertyName: propertyName,
		});
	}

	if (isString(type)) {
		return ["string", []];
	}

	if (isDouble(type) || isInteger(type)) {
		return ["number", []];
	}

	if (isBoolean(type)) {
		return ["boolean", []];
	}

	// Expandable fields
	const expandableEntity = getExpandableEntity(type);
	if (expandableEntity) {
		const [returnType, imports] = getTSTypeName({
			...props,
			type: expandableEntity,
		});
		return [`${returnType} | string`, imports];
	}

	// Recurse for models that have a @body property
	if (type.kind === "Model") {
		const bodyPropertyModel = getBodyPropertyModel(type);
		if (bodyPropertyModel?.name) {
			return getTSTypeName({ ...props, type: bodyPropertyModel });
		}
	}

	// An object with a given name (entity, queryparameters etc.)
	if (type.kind === "Model" && type.name) {
		const className = getTSModelClassName({ ...props, model: type });
		const imports = getTSImports({
			...props,
			model: type,
			tsTypeImport: props.tsTypeImport !== false,
		});

		// Find generics
		const generics: string[] = [];
		type.templateMapper?.args.map((arg) => {
			if (arg.entityKind === "Type") {
				// TODO: This might cause an infinite loop for some data sets
				const [templateType, templateTypeImports] = getTSTypeName({
					...props,
					type: arg,
				});
				generics.push(templateType);
				imports.push(...templateTypeImports);
			}
		});

		const referenceName = pascalCase((className || propertyName) ?? "unknown");
		const referenceNameWithGenerics =
			generics.length > 0
				? `${referenceName}<${generics.join(", ")}>`
				: referenceName;
		return [referenceNameWithGenerics, imports];
	}

	// Inline model, generate name from property name
	if (type.kind === "Model") {
		const typeDefinition = getTypeDefinition({ ...props, model: type });
		return [typeDefinition.toString(), []];
	}

	return ["unknown", []];
}
