import type { Model, Namespace, Type } from "@typespec/compiler";
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
	isEnum,
	isInteger,
	isList,
	isString,
} from "../../../utils/typecheckers.js";
import type { JavaProps, JavaPropsWithModel } from "../types.js";
import { getImports } from "./getImports.js";

export type JavaTypeProps = JavaProps & {
	type?: Type;
	propertyName?: string;
	parentName?: string;
	entitySuffix?: string;
	model?: Model; // Not needed
	_visiting?: ReadonlySet<Type>;
};

export function getJavaType(props: JavaTypeProps): [string, string[]] {
	const { type, propertyName = "", wrapExpandableFields = true } = props;
	if (type === undefined) {
		return ["unknown", []];
	}

	// For lists, recurse on the list type
	if (isList(type) && type.kind === "Model") {
		if (type.kind === "Model" && type.indexer !== undefined) {
			const listType = getListType(type);
			const [listJavaType, imports] = getJavaType({
				...props,
				type: listType,
			});
			return [`List<${listJavaType}>`, imports];
		}
		// This is a generic alias. Not yet supported by TypeSpec
		return ["List<?>", []];
	}

	if (!props.stringEnums && isEnum(type)) {
		return [pascalCase(propertyName || "unknown", "Enum"), []];
	}

	// Absolute or relative time strings
	if (type.kind === "Scalar" && type.name === "timeString") {
		return ["String", []];
	}

	if (isString(props.context, type)) {
		return ["String", []];
	}

	if (isDouble(type)) {
		return ["Double", []];
	}

	if (isInteger(type)) {
		return ["Integer", []];
	}

	if (isBoolean(type)) {
		return ["Boolean", []];
	}

	// Expandable fields
	const expandableEntity = getExpandableEntity(type);
	if (expandableEntity) {
		const [returnType, imports] = getJavaType({
			...props,
			type: expandableEntity,
		});
		if (wrapExpandableFields) {
			return [`ExpandableField<${returnType}>`, imports];
		}
		return [returnType, imports];
	}

	// Recurse for models that have a @body property
	if (type.kind === "Model") {
		const bodyPropertyModel = getBodyPropertyModel(type);
		if (bodyPropertyModel?.name) {
			return getJavaType({ ...props, type: bodyPropertyModel });
		}
	}

	// An object with a given name (entity, queryparameters etc.)
	if (type.kind === "Model" && type.name) {
		const className = getModelClassName({ ...props, model: type });
		const imports = getImports({ ...props, model: type });

		// Find generics
		const visiting = new Set(props._visiting).add(type);
		const generics: string[] = [];
		type.templateMapper?.args.forEach((arg) => {
			if (arg.entityKind === "Type") {
				if (visiting.has(arg)) {
					generics.push("unknown");
					return;
				}
				const [templateType, templateTypeImports] = getJavaType({
					...props,
					type: arg,
					_visiting: visiting,
				});
				generics.push(templateType);
				imports.push(...templateTypeImports);
			}
		});

		const javaType = pascalCase(className || propertyName);
		const javaTypeWithGenerics =
			generics.length > 0 ? `${javaType}<${generics.join(", ")}>` : javaType;
		return [javaTypeWithGenerics, imports];
	}

	// Inline model, generate name from property name
	if (type.kind === "Model") {
		return [pascalCase(propertyName), getImports({ ...props, model: type })];
	}

	return ["unknown", []];
}

export function getJavaEntityPackageName(
	packageName: string,
	obj: Model | Namespace,
): string {
	const path = getJavaEntityPathArray(packageName, obj);
	return path.join(".").toLowerCase();
}

export function getJavaModelPackageName(
	packageName: string,
	model: Model | Namespace,
): string {
	const path = getJavaModelPathArray(packageName, model);
	return path.join(".").toLowerCase();
}

export function getJavaEntityPathName(
	packageName: string,
	obj: Model | Namespace,
): string {
	return getJavaEntityPathArray(packageName, obj).join("/").toLowerCase();
}

export function getJavaModelPathName(
	packageName: string,
	model: Model | Namespace,
): string {
	return getJavaModelPathArray(packageName, model).join("/").toLowerCase();
}

export function getJavaEntityPathArray(
	packageName: string,
	obj: Model | Namespace,
): string[] {
	const path = packageName.split(".");
	const namespace = obj.kind === "Model" ? obj.namespace : obj;

	if (isEInnsynEntityNamespace(namespace)) {
		path.push("entities");
	} else {
		path.push("common");
	}

	if (obj.kind === "Model") {
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
	pathArray.push("models");
	return pathArray;
}

export function getModelClassName(props: JavaPropsWithModel) {
	const { model, entitySuffix = "" } = props;
	return isEInnsynEntity(model) ? model.name + entitySuffix : model.name;
}
