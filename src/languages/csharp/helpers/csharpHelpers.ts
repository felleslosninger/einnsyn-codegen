import type { Model, ModelProperty, Namespace, Type } from "@typespec/compiler";
import {
	getBodyPropertyModel,
	getExpandableEntity,
	getListType,
	getModelPath,
	getNamespacePath,
} from "../../../utils/getters.js";
import { pascalCase } from "../../../utils/stringUtils.js";
import {
	isBoolean,
	isDouble,
	isEInnsynEntity,
	isEInnsynEntityNamespace,
	isInteger,
	isList,
	isNumberUnion,
	isString,
	isStringUnion,
} from "../../../utils/typecheckers.js";
import type { CSharpProps, CSharpPropsWithModel } from "../types.js";

const CSHARP_KEYWORDS = new Set([
	"abstract",
	"as",
	"base",
	"bool",
	"break",
	"byte",
	"case",
	"catch",
	"char",
	"checked",
	"class",
	"const",
	"continue",
	"decimal",
	"default",
	"delegate",
	"do",
	"double",
	"else",
	"enum",
	"event",
	"explicit",
	"extern",
	"false",
	"finally",
	"fixed",
	"float",
	"for",
	"foreach",
	"goto",
	"if",
	"implicit",
	"in",
	"int",
	"interface",
	"internal",
	"is",
	"lock",
	"long",
	"namespace",
	"new",
	"null",
	"object",
	"operator",
	"out",
	"override",
	"params",
	"private",
	"protected",
	"public",
	"readonly",
	"ref",
	"return",
	"sbyte",
	"sealed",
	"short",
	"sizeof",
	"stackalloc",
	"static",
	"string",
	"struct",
	"switch",
	"this",
	"throw",
	"true",
	"try",
	"typeof",
	"uint",
	"ulong",
	"unchecked",
	"unsafe",
	"ushort",
	"using",
	"virtual",
	"void",
	"volatile",
	"while",
]);

export type GetCSharpTypeProps = CSharpProps & {
	type?: Type;
	propertyName?: string;
	inlineModelClassName?: string;
	entitySuffix?: string;
	wrapExpandableFields?: boolean;
	stringEnums?: boolean;
};

export function getCSharpType(props: GetCSharpTypeProps): [string, string[]] {
	const {
		type,
		propertyName,
		inlineModelClassName,
		wrapExpandableFields = true,
		stringEnums = false,
	} = props;

	if (!type) {
		return ["object", []];
	}

	if (type.kind === "ModelProperty") {
		return getCSharpType({
			...props,
			type: type.type,
			propertyName: propertyName ?? type.name,
		});
	}

	if (isList(type) && type.kind === "Model") {
		const listType = getListType(type);
		const [listCSharpType, imports] = getCSharpType({
			...props,
			type: listType,
			propertyName,
		});
		return [
			`List<${listCSharpType}>`,
			[...imports, "System.Collections.Generic"],
		];
	}

	const expandableEntity = getExpandableEntity(type);
	if (expandableEntity) {
		const [expandableType, imports] = getCSharpType({
			...props,
			type: expandableEntity,
		});
		if (!wrapExpandableFields) {
			return [expandableType, imports];
		}
		return [
			`ExpandableField<${expandableType}>`,
			[...imports, "EInnsyn.Sdk.Common.ExpandableField"],
		];
	}

	if (!stringEnums && (isStringUnion(type) || isNumberUnion(type))) {
		return [getEnumTypeName(propertyName), []];
	}

	if (isString(props.context, type)) {
		return ["string", []];
	}

	if (isDouble(type)) {
		return ["double", []];
	}

	if (isInteger(type)) {
		return ["int", []];
	}

	if (isBoolean(type)) {
		return ["bool", []];
	}

	if (type.kind === "Model") {
		const bodyPropertyModel = getBodyPropertyModel(type);
		if (bodyPropertyModel?.name) {
			return getCSharpType({ ...props, type: bodyPropertyModel });
		}
	}

	if (type.kind === "Model" && type.name) {
		if (type.name === "PaginatedList") {
			const imports = [
				"EInnsyn.Sdk.Common.Responses",
				"System.Collections.Generic",
			];
			const generic = type.templateMapper?.args[0];
			if (generic?.entityKind === "Type") {
				const [genericType, genericImports] = getCSharpType({
					...props,
					type: generic,
				});
				return [
					`PaginatedList<${genericType}>`,
					[...imports, ...genericImports],
				];
			}
			return ["PaginatedList<object>", imports];
		}

		const className = getCSharpModelClassName({
			...props,
			model: type,
			entitySuffix: props.entitySuffix,
		});
		const modelNamespace = getCSharpModelNamespace(props.rootNamespace, type);
		const imports: string[] = [];
		const qualifiedClassName = modelNamespace
			? `global::${modelNamespace}.${className}`
			: className;

		const generics: string[] = [];
		for (const arg of type.templateMapper?.args ?? []) {
			if (arg.entityKind !== "Type") {
				continue;
			}
			const [argType, argImports] = getCSharpType({
				...props,
				type: arg,
			});
			generics.push(argType);
			imports.push(...argImports);
		}

		if (generics.length) {
			return [`${qualifiedClassName}<${generics.join(", ")}>`, imports];
		}
		return [qualifiedClassName, imports];
	}

	if (type.kind === "Model") {
		return [
			inlineModelClassName ?? getCSharpInlineModelClassName(propertyName),
			[],
		];
	}

	return ["object", []];
}

export function getCSharpModelClassName(props: CSharpPropsWithModel) {
	const { model, entitySuffix = "" } = props;
	const modelName = (model.name || "Anonymous").replace(/ErrorError$/, "Error");
	if (isEInnsynEntity(model)) {
		return `${pascalCase(modelName)}${entitySuffix}`;
	}
	return pascalCase(modelName);
}

export function getCSharpEntityNamespace(
	rootNamespace: string,
	obj: Model | Namespace,
) {
	return [rootNamespace, ...getCSharpEntityPathArray(obj)].join(".");
}

export function getCSharpModelNamespace(rootNamespace: string, model: Model) {
	return [rootNamespace, ...getCSharpModelPathArray(model)].join(".");
}

export function getCSharpEntityPath(obj: Model | Namespace) {
	return getCSharpEntityPathArray(obj).join("/");
}

export function getCSharpModelPath(model: Model) {
	return getCSharpModelPathArray(model).join("/");
}

export function getCSharpEntityPathArray(obj: Model | Namespace): string[] {
	const path: string[] = [];
	const namespace = obj.kind === "Model" ? obj.namespace : obj;

	if (isEInnsynEntityNamespace(namespace)) {
		path.push("Entities");
	} else {
		path.push("Common");
	}

	if (obj.kind === "Model") {
		path.push(...getModelPath(obj).map((segment) => pascalCase(segment)));
	} else {
		path.push(...getNamespacePath(obj).map((segment) => pascalCase(segment)));
	}

	return path;
}

export function getCSharpModelPathArray(model: Model): string[] {
	return [...getCSharpEntityPathArray(model), "Models"];
}

export function getEnumTypeName(propertyName?: string) {
	return pascalCase(propertyName ?? "Unknown", "Enum");
}

export function getCSharpInlineModelClassName(propertyName?: string) {
	return pascalCase(propertyName ?? "Anonymous", "Model");
}

export function toCSharpPropertyName(name: string, enclosingTypeName?: string) {
	let candidate = pascalCase(name);
	if (!candidate || candidate === "_") {
		candidate = "Value";
	}
	if (!/^[a-zA-Z_]/.test(candidate)) {
		candidate = `Value${candidate}`;
	}
	if (candidate === "Params") {
		candidate = "Parameters";
	}
	if (candidate === "Event") {
		candidate = "EventValue";
	}
	if (enclosingTypeName && candidate === enclosingTypeName) {
		return `${candidate}Value`;
	}
	return candidate;
}

export function toCSharpParameterName(name: string) {
	if (name === "_") {
		return "value";
	}
	if (name === "params") {
		return "parameters";
	}

	if (CSHARP_KEYWORDS.has(name)) {
		return `${name}Value`;
	}

	return name;
}

export function isCSharpValueType(typeName: string) {
	return (
		typeName === "bool" ||
		typeName === "int" ||
		typeName === "double" ||
		typeName === "DateTime" ||
		typeName === "DateOnly" ||
		typeName === "TimeOnly" ||
		typeName.endsWith("Enum")
	);
}

export function ensureNullable(typeName: string) {
	return typeName.endsWith("?") ? typeName : `${typeName}?`;
}

export function renderPathTemplate(pathTemplate: string) {
	return `$"${pathTemplate}"`;
}

export function getEnumValues(type: Type) {
	if (!isStringUnion(type) && !isNumberUnion(type)) {
		return [];
	}
	return [...type.variants.values()].map((variant) => {
		if (variant.type.kind === "String") {
			return variant.type.value;
		}
		if (variant.type.kind === "Number") {
			return String(variant.type.value);
		}
		return "";
	});
}

export function toEnumMemberName(value: string) {
	const cleaned = value
		.replaceAll(/[^a-zA-Z0-9]+/g, " ")
		.trim()
		.split(/\s+/)
		.map((segment) => pascalCase(segment))
		.join("");

	if (!cleaned) {
		return "Unknown";
	}
	if (/^[0-9]/.test(cleaned)) {
		return `Value${cleaned}`;
	}
	return cleaned;
}

export function getAllModelProperties(model: Model): ModelProperty[] {
	const properties: ModelProperty[] = [];
	const parent = model.baseModel;
	if (parent) {
		properties.push(...getAllModelProperties(parent));
	}
	properties.push(...model.properties.values());
	return properties;
}
