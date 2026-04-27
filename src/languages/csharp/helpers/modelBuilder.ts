import { getDoc, type Model, type Type } from "@typespec/compiler";
import { isReadonlyProperty } from "@typespec/openapi";
import { getFixedValue, getListType } from "../../../utils/getters.js";
import { pascalCase } from "../../../utils/stringUtils.js";
import {
	isEnum,
	isExpandableField,
	isWriteonlyProperty,
} from "../../../utils/typecheckers.js";
import { CSharpClass } from "../primitives/csharpClass.js";
import { CSharpEnum } from "../primitives/csharpEnum.js";
import { CSharpProperty } from "../primitives/csharpProperty.js";
import type { CSharpProps, CSharpPropsWithModel } from "../types.js";
import {
	csharpStringLiteral,
	getJsonSerializationUsing,
	jsonConverter,
	jsonDerivedType,
	jsonIgnore,
	jsonPolymorphic,
	jsonPropertyName,
	jsonStringEnumMemberName,
} from "./csharpAttributes.js";
import {
	ensureNullable,
	getCSharpInlineModelClassName,
	getCSharpType,
	getEnumTypeName,
	getEnumValues,
	isCSharpValueType,
	toCSharpPropertyName,
	toEnumMemberName,
} from "./csharpHelpers.js";

export type BuildCSharpModelProps = CSharpPropsWithModel & {
	className: string;
	skipReadOnlyProperties?: boolean;
	skipWriteOnlyProperties?: boolean;
	requestModel?: boolean;
	entitySuffix?: string;
	asPartial?: boolean;
	appendDerivedTypesForBase?: boolean;
};

/**
 * Builds a C# model class, including nested inline models and nested enums.
 */
export function buildModelClass(props: BuildCSharpModelProps): CSharpClass {
	const {
		className,
		model,
		requestModel = false,
		skipReadOnlyProperties = false,
		skipWriteOnlyProperties = false,
		asPartial = false,
		appendDerivedTypesForBase = false,
	} = props;

	const clazz = new CSharpClass(props.parent, className);
	clazz.setPartial(asPartial);

	if (!requestModel && model.derivedModels.length > 0) {
		clazz.setAbstract(true);
	}

	if (model.baseModel) {
		const [baseType, baseImports] = getCSharpType({
			...props,
			type: model.baseModel,
			entitySuffix: props.entitySuffix,
			stringEnums: false,
		});
		clazz.addBaseType(baseType);
		clazz.addUsing(...baseImports);
	}

	if (!requestModel && model.name === "Base") {
		clazz.addBaseType("IHasId");
		clazz.addUsing("EInnsyn.Sdk.Common.Entity");
	}

	if (!requestModel && model.name === "Base" && appendDerivedTypesForBase) {
		clazz.addUsing(getJsonSerializationUsing());
		clazz.addAttribute(jsonPolymorphic("entity"));
		for (const derived of getLeafDerivedModels(model)) {
			if (!derived.name) {
				continue;
			}
			const [derivedTypeName] = getCSharpType({
				...props,
				type: derived,
				stringEnums: false,
			});
			clazz.addAttribute(jsonDerivedType(derivedTypeName, derived.name));
		}
	}

	const enumMap = new Map<string, CSharpEnum>();
	const properties = [...model.properties.values()].filter((property) => {
		const shouldSkipReadOnly =
			skipReadOnlyProperties &&
			isReadonlyProperty(props.context.program, property);
		const shouldSkipWriteOnly =
			skipWriteOnlyProperties &&
			isWriteonlyProperty(props.context.program, property);
		return !shouldSkipReadOnly && !shouldSkipWriteOnly;
	});
	const nestedClassNameByProperty = new Map<string, string>();
	const usedNestedTypeNames = new Set<string>([className]);
	for (const property of properties) {
		const inlineModel = getInlineAnonymousModel(property.type);
		if (!inlineModel) {
			continue;
		}
		const nestedClassName = ensureUniqueMemberName(
			getCSharpInlineModelClassName(property.name),
			usedNestedTypeNames,
			"Model",
		);
		nestedClassNameByProperty.set(property.name, nestedClassName);
	}
	const usedMemberNames = new Set<string>([
		className,
		...nestedClassNameByProperty.values(),
	]);
	const propertyNameByProperty = new Map<string, string>();
	for (const property of properties) {
		const propertyName = ensureUniqueMemberName(
			toCSharpPropertyName(property.name, className),
			usedMemberNames,
			"Value",
		);
		propertyNameByProperty.set(property.name, propertyName);
	}

	for (const property of properties) {
		const inlineModelClassName = nestedClassNameByProperty.get(property.name);

		const [propertyTypeRaw, propertyImports] = getCSharpType({
			...props,
			type: property,
			propertyName: property.name,
			inlineModelClassName,
			entitySuffix: props.entitySuffix,
			stringEnums: false,
		});
		clazz.addUsing(...propertyImports);

		let propertyType = propertyTypeRaw;
		if (requestModel || property.optional) {
			propertyType = ensureNullable(propertyType);
		}

		const propertyField = new CSharpProperty(
			clazz,
			propertyType,
			propertyNameByProperty.get(property.name) ?? "",
		);
		if (
			isPolymorphicDiscriminatorShadowProperty(
				model,
				property.name,
				requestModel,
			)
		) {
			// With System.Text.Json polymorphism on Base (discriminator: "entity"), a normal
			// property with the same JSON name is treated as conflicting metadata in .NET 10.
			propertyField.addAttribute(jsonIgnore());
		} else {
			propertyField.addAttribute(jsonPropertyName(property.name));
			propertyField.addAttribute(
				jsonIgnore(getJsonIgnoreCondition(propertyType)),
			);
		}
		propertyField.addUsing(getJsonSerializationUsing());

		const fixedValue = getFixedValue(property);
		if (!requestModel && fixedValue !== undefined) {
			const initializer = getFixedValueInitializer(fixedValue, propertyType);
			if (initializer !== undefined) {
				propertyField.setInitializer(initializer);
			}
		} else if (isNonNullableReferenceType(propertyType)) {
			// Generated DTOs are materialized by serializers, not user constructors.
			propertyField.setInitializer("null!");
		}

		const doc = getDoc(props.context.program, property);
		if (doc) {
			propertyField.addDocumentation(...toXmlSummary(doc));
		}

		clazz.addProperty(propertyField.toString());

		if (isEnum(property.type)) {
			const unionType = getListType(property.type) ?? property.type;
			const enumName = getEnumTypeName(property.name);
			if (!enumMap.has(enumName)) {
				const enumType = new CSharpEnum(clazz, enumName);
				enumType.addUsing(getJsonSerializationUsing());
				enumType.addAttribute(jsonConverter("JsonStringEnumConverter"));
				for (const value of getEnumValues(unionType)) {
					enumType.addValue({
						name: toEnumMemberName(value),
						attributes: [jsonStringEnumMemberName(value)],
					});
				}
				enumMap.set(enumName, enumType);
			}
		}

		const inlineModel = getInlineAnonymousModel(property.type);
		if (inlineModel) {
			const nestedClassName = nestedClassNameByProperty.get(property.name);
			if (!nestedClassName) {
				continue;
			}
			const nestedClass = buildModelClass({
				...props,
				model: inlineModel,
				className: nestedClassName,
				requestModel,
				skipReadOnlyProperties,
				skipWriteOnlyProperties,
				entitySuffix: props.entitySuffix,
				asPartial: false,
				appendDerivedTypesForBase: false,
				parent: clazz,
			});
			clazz.addNested(nestedClass.toString());
		}
	}

	for (const enumType of enumMap.values()) {
		clazz.addNested(enumType.toString());
	}

	return clazz;
}

/**
 * Flattens a model inheritance tree to leaf descendants. Used for
 * JsonDerivedType emission on the polymorphic base.
 */
function getLeafDerivedModels(model: Model): Model[] {
	if (model.derivedModels.length === 0) {
		return [model];
	}
	return model.derivedModels.flatMap((derived) =>
		getLeafDerivedModels(derived),
	);
}

/**
 * Detects `entity` properties that shadow the Base discriminator. These
 * must be ignored to avoid System.Text.Json metadata conflicts.
 */
function isPolymorphicDiscriminatorShadowProperty(
	model: Model,
	propertyName: string,
	requestModel: boolean,
) {
	if (requestModel || propertyName !== "entity") {
		return false;
	}

	let current: Model | undefined = model;
	while (current) {
		if (current.name === "Base") {
			return true;
		}
		current = current.baseModel;
	}

	return false;
}

/**
 * Ensures generated member names are unique within a class scope.
 */
function ensureUniqueMemberName(
	baseName: string,
	usedNames: Set<string>,
	conflictSuffix: string,
) {
	let candidate = baseName;
	let index = 0;
	while (usedNames.has(candidate)) {
		index += 1;
		candidate =
			index === 1
				? `${baseName}${conflictSuffix}`
				: `${baseName}${conflictSuffix}${index}`;
	}
	usedNames.add(candidate);
	return candidate;
}

/**
 * Converts fixed TypeSpec values into C# initializers when possible.
 */
function getFixedValueInitializer(fixedValue: unknown, propertyType: string) {
	const normalizedType = propertyType.endsWith("?")
		? propertyType.slice(0, -1)
		: propertyType;

	if (typeof fixedValue === "number") {
		return String(fixedValue);
	}

	if (typeof fixedValue === "boolean") {
		return fixedValue ? "true" : "false";
	}

	if (typeof fixedValue === "string") {
		if (normalizedType === "int") {
			const parsed = Number.parseInt(fixedValue, 10);
			if (!Number.isNaN(parsed)) {
				return String(parsed);
			}
		}
		if (normalizedType === "double") {
			const parsed = Number(fixedValue);
			if (!Number.isNaN(parsed)) {
				return String(parsed);
			}
		}
		if (normalizedType === "bool") {
			if (fixedValue === "true" || fixedValue === "false") {
				return fixedValue;
			}
		}
		return csharpStringLiteral(fixedValue);
	}

	return undefined;
}

function escapeXml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function isNonNullableReferenceType(typeName: string) {
	if (typeName.endsWith("?")) {
		return false;
	}
	return !isCSharpValueType(typeName);
}

function getJsonIgnoreCondition(typeName: string) {
	if (typeName.endsWith("?")) {
		return "WhenWritingNull";
	}

	return isCSharpValueType(typeName) ? "WhenWritingDefault" : "WhenWritingNull";
}

/**
 * Converts plain text docs into XML `<summary>` lines for generated C#.
 */
function toXmlSummary(value: string): string[] {
	const normalizedLines = value.replace(/\r\n/g, "\n").split("\n");

	while (normalizedLines.length > 0 && normalizedLines[0]?.trim() === "") {
		normalizedLines.shift();
	}

	while (
		normalizedLines.length > 0 &&
		normalizedLines[normalizedLines.length - 1]?.trim() === ""
	) {
		normalizedLines.pop();
	}

	if (normalizedLines.length === 0) {
		return ["/// <summary></summary>"];
	}

	const escapedLines = normalizedLines.map((line) => escapeXml(line.trimEnd()));
	if (escapedLines.length === 1) {
		return [`/// <summary>${escapedLines[0]}</summary>`];
	}

	return [
		"/// <summary>",
		...escapedLines.map((line) => (line.length > 0 ? `/// ${line}` : "///")),
		"/// </summary>",
	];
}

export function buildModelClasses(props: BuildCSharpModelProps) {
	const clazz = buildModelClass(props);
	return clazz.toString();
}

export function getRootModelName(props: CSharpProps) {
	if (!props.model) {
		return "Unknown";
	}
	return pascalCase(props.model.name || props.className || "Unknown");
}

function getInlineAnonymousModel(type: Type): Model | undefined {
	const listType = getListType(type);
	const inlineModel = listType ?? type;
	if (
		inlineModel.kind !== "Model" ||
		inlineModel.name ||
		isExpandableField(inlineModel)
	) {
		return undefined;
	}
	return inlineModel;
}
