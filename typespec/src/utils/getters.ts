import {
	ignoreDiagnostics,
	isType,
	type Model,
	type ModelProperty,
	type Namespace,
	type Program,
	type Type,
} from "@typespec/compiler";
import { getHttpOperation, type HttpOperation } from "@typespec/http";
import { isEInnsynEntity, isEInnsynId } from "./typecheckers.js";

export function getExpandableEntity(type?: Type): Model | undefined {
	if (type === undefined) {
		return;
	}

	if (type.kind !== "Union") {
		return;
	}

	if (type.variants.size !== 2) {
		return;
	}

	const variants = Array.from(type.variants.values());
	if (!variants.find((variant) => isEInnsynId(variant.type))) {
		return; // No eInnsynId
	}

	return variants.find((variant) => isEInnsynEntity(variant.type))?.type as
		| Model
		| undefined;
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
	while (ns?.namespace?.name) {
		path.unshift(ns.name);
		ns = ns.namespace;
	}
	return path;
}

export function getBodyPropertyType(model: Model): Type | undefined {
	for (const [key, value] of model.properties) {
		if (value?.decorators.find((d) => d.definition?.name === "@body")) {
			return value.type;
		}
	}
}

export function getBodyPropertyModel(model: Model): Model | undefined {
	const bodyPropertyType = getBodyPropertyType(model);
	if (bodyPropertyType?.kind === "Model") {
		return bodyPropertyType;
	}
}

export function getBodyProperties(model: Model | undefined): ModelProperty[] {
	if (model === undefined) {
		return [];
	}
	const propertyModel = getBodyPropertyModel(model) ?? model;
	return Array.from(propertyModel.properties.values());
}

/**
 *
 */
export function getInheritedProperties(model: Model): ModelProperty[] {
	const properties: ModelProperty[] = [];
	const ancestors: Model[] = [];
	let parent: Model | undefined = model.baseModel;
	// Get all ancestors first, we want to iterate from the top down
	while (parent) {
		ancestors.unshift(parent);
		parent = parent.baseModel;
	}
	for (const ancestor of ancestors) {
		for (const [, property] of ancestor.properties) {
			properties.push(property);
		}
	}
	return properties;
}

/**
 * Recursively get all models in a namespace
 * @param namespace
 * @returns
 */
export function recursivelyGetModels(namespace: Namespace) {
	const models: Model[] = [];

	for (const [key, model] of namespace.models) {
		models.push(model);
	}

	for (const [nsName, ns] of namespace.namespaces) {
		models.push(...recursivelyGetModels(ns));
	}

	models.sort((a, b) => a.name.localeCompare(b.name));

	return models;
}

/**
 *
 * @param program
 * @param namespace
 * @returns
 */
export function getOperationsByNamespace(
	program: Program,
	namespace: Namespace,
) {
	const result: [Namespace, HttpOperation[]][] = [];
	const httpOperations: HttpOperation[] = [];

	// Operations on namespace
	for (const [, operation] of namespace.operations) {
		if (!operation.isFinished) {
			continue;
		}
		const httpOperation = ignoreDiagnostics(
			getHttpOperation(program, operation),
		);
		httpOperations.push(httpOperation);
	}

	// Operations in interface
	for (const [, int] of namespace.interfaces) {
		for (const [, operation] of int.operations) {
			if (!operation.isFinished) {
				continue;
			}
			const httpOperation = ignoreDiagnostics(
				getHttpOperation(program, operation),
			);
			httpOperations.push(httpOperation);
		}
	}

	if (httpOperations.length > 0) {
		httpOperations.sort((a, b) => {
			if (a.path === b.path) {
				return a.verb.localeCompare(b.verb);
			}
			return a.path.localeCompare(b.path);
		});
		result.push([namespace, httpOperations]);
	}

	// Recurse namespaces
	for (const [nsName, ns] of namespace.namespaces) {
		result.push(...getOperationsByNamespace(program, ns));
	}

	return result;
}

/**
 * Return the URI root for an entity
 *
 * @param entity
 * @returns
 */
export function getEntityURI(entity: Model): string {
	return entity.name ? `/${entity.name.toLowerCase()}` : "";
}

/**
 *
 * @param type
 * @returns
 */
export function getDependentModels(type: Type): Model[] {
	if (type.kind !== "Model") {
		return [];
	}
	const result: Model[] = [type];

	for (const template of type.templateMapper?.args ?? []) {
		if (isType(template)) {
			result.push(...getDependentModels(template));
		}
	}

	return result;
}

/**
 *
 * @param type
 * @returns
 */
export function getListType(type: Type): Type | undefined {
	if (
		type.kind === "Model" &&
		type.name === "Array" &&
		type.templateMapper?.args[0]?.entityKind === "Type"
	) {
		return type.templateMapper?.args[0];
	}
}

/**
 * Get the default value from a model property
 *
 * @param modelProperty
 * @returns
 */
export function getDefaultValue(
	modelProperty: ModelProperty,
): string | number | boolean | undefined {
	switch (modelProperty.type.kind) {
		case "Scalar": {
			const type = modelProperty.type;
			switch (type.name) {
				case "integer":
				case "string":
				case "boolean":
					if (modelProperty.defaultValue?.valueKind === "StringValue") {
						return modelProperty.defaultValue.value;
					}
					if (modelProperty.defaultValue?.valueKind === "NumericValue") {
						return modelProperty.defaultValue.value.asNumber() ?? undefined;
					}
					if (modelProperty.defaultValue?.valueKind === "BooleanValue") {
						return modelProperty.defaultValue.value;
					}
					return undefined;
			}
			break;
		}
		case "String":
		case "Number":
		case "Boolean":
			return modelProperty.type.value.toString();
		case "Union": {
			const defaultValue = modelProperty.defaultValue;
			if (
				defaultValue?.valueKind === "StringValue" ||
				defaultValue?.valueKind === "BooleanValue"
			) {
				return defaultValue?.value;
			}
			if (defaultValue?.valueKind === "NumericValue") {
				return defaultValue?.value.asNumber() ?? undefined;
			}
			break;
		}

		default:
			return undefined;
	}
}

/**
 * If this is a fixed value (e.g. prop: "value"), return it.
 *
 * @param modelProperty
 * @returns
 */
export function getFixedValue(modelProperty: ModelProperty) {
	if (
		modelProperty.type.kind === "String" ||
		modelProperty.type.kind === "Number" ||
		modelProperty.type.kind === "Boolean"
	) {
		return getDefaultValue(modelProperty);
	}
}
