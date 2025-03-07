import {
	type EmitContext,
	type Model,
	type Namespace,
	emitFile,
	isErrorModel,
	resolvePath,
} from "@typespec/compiler";
import { getTSTypeName } from "../../languages/typescript/helpers/getTSTypeName.js";
import {
	getTSEntityPathName,
	getTSModelClassName,
} from "../../languages/typescript/helpers/tsHelpers.js";
import TSClass from "../../languages/typescript/primitives/tsClass.js";
import { TSFile } from "../../languages/typescript/primitives/tsFile.js";
import { TSTypeProperty } from "../../languages/typescript/primitives/tsTypeProperty.js";
import type {
	TSImportType,
	TSProps,
	TSPropsWithModel,
} from "../../languages/typescript/types.js";
import {
	getBodyProperties,
	getBodyPropertyType,
	getFixedValue,
	recursivelyGetModels,
} from "../../utils/getters.js";
import type TSPrimitive from "../../languages/typescript/primitives/tsPrimitive.js";
import TSFunction from "../../languages/typescript/primitives/tsFunction.js";
import { TSFunctionParameter } from "../../languages/typescript/primitives/tsFunctionParameter.js";
import { cloneModel } from "../../utils/modelUtils.js";
import { pascalCase } from "../../utils/stringUtils.js";

type PropertyRepresentation = {
	name: string;
	type: string;
	required: boolean;
	fixedValue?: string | number | boolean;
};

export function emitExceptionModels(
	context: EmitContext,
	defaultProps: TSProps,
	eInnsynNamespace: Namespace,
) {
	const errorPathName = "common/error/EInnsynError";
	const errorFile = new TSFile(errorPathName);

	const models = recursivelyGetModels(eInnsynNamespace)
		.filter((model) => isErrorModel(context.program, model))
		// Don't emit "wrappers" with a @body parameter:
		.filter((model) => !getBodyPropertyType(model))
		// Sort by base model first
		.sort((a, b) => {
			if (a.baseModel === undefined) {
				return -1;
			}
			if (b.baseModel !== undefined) {
				return 1;
			}
			return a.name.localeCompare(b.name);
		});

	for (const initialModel of models) {
		// We can't have a message property in the model, as it's already defined in the Exception class
		const model = cloneModel(initialModel);
		if (model.properties.has("message")) {
			model.properties.delete("message");
		}

		// Create class
		const className = getTSModelClassName({
			...defaultProps,
			model,
		});
		const modelClass = new TSClass(errorFile, className);

		// Get properties
		const [inheritedProperties, inheritedImports] = getInheritedProperties({
			...defaultProps,
			model,
		});
		const [properties, propertyImports] = getProperties({
			...defaultProps,
			model,
		});
		// Remove properties that are inherited from the base model
		const propertiesWithoutInherited = properties.filter(
			(p) => !inheritedProperties.find((ip) => ip.name === p.name),
		);

		for (const property of propertiesWithoutInherited) {
			const typeProperty = new TSTypeProperty(
				errorFile,
				property.name,
				property.type,
			);
			typeProperty.optional = !property.required;
			modelClass.addProperty(typeProperty);
		}

		// Extend base model
		if (model.baseModel) {
			const [baseType, baseImports] = getTSTypeName({
				...defaultProps,
				type: model.baseModel,
				tsTypeImport: false,
			});
			modelClass.addExtends(baseType);
		} else {
			modelClass.addExtends("Error");
		}
		errorFile.addClass({ clazz: modelClass, isExported: true });

		// Constructor
		modelClass.addMethod(
			createConstructor(
				modelClass,
				model.name,
				properties,
				inheritedProperties,
			),
		);
	}

	// Create resolver method
	const resolverMethod = new TSFunction(errorFile, "resolveError");
	resolverMethod.addParameter(
		new TSFunctionParameter(resolverMethod, "json", "unknown"),
	);

	// Build switch statements
	const switchStatements = models.map((model) => {
		const className = getTSModelClassName({
			...defaultProps,
			model,
		});
		const typeProperty = model.properties.get("type");
		const typeValue = typeProperty
			? `'${getFixedValue(typeProperty)}'`
			: "undefined";

		// Get constructor arguments
		const [properties] = getProperties({
			...defaultProps,
			model,
		});
		const [inheritedProperties] = getInheritedProperties({
			...defaultProps,
			model,
		});
		// Replace all inherited properties that are overridden by the current model
		const overriddenInherited = inheritedProperties.map((prop) => {
			const override = properties.find((p) => p.name === prop.name);
			return override ?? prop;
		});
		const constructorParameters = [...overriddenInherited, ...properties]
			// Don't add parameters with a fixed value
			.filter((p) => p.fixedValue === undefined)
			// Don't add overrides, they are already added
			.reduce(onlyOnce, []);
		const constructorArgs = constructorParameters
			.map((p) => `(json as ${className}).${p.name}`)
			.join(", ");

		return [
			`case ${typeValue}:`,
			`return new ${className}(${constructorArgs});`,
		].join("\n");
	});
	switchStatements.push(
		"default: return new EInnsynError('Unknown error', type);",
	);
	resolverMethod.addBody(
		"const type = (json as { type: string })?.type;",
		"switch (type) {",
		...switchStatements,
		"}",
	);
	errorFile.addFunction(resolverMethod);

	// Emit file
	emitFile(context.program, {
		path: resolvePath(
			context.emitterOutputDir,
			`typescript-client/${errorPathName}.ts`,
		),
		content: errorFile.toString(),
	});
}

const onlyOnce = (
	uniqueProperties: PropertyRepresentation[],
	currentProperty: PropertyRepresentation,
) => {
	if (uniqueProperties.find((p) => p.name === currentProperty.name)) {
		return uniqueProperties;
	}
	return [...uniqueProperties, currentProperty];
};

function createConstructor(
	parent: TSPrimitive,
	name: string,
	properties: PropertyRepresentation[],
	inheritedProperties: PropertyRepresentation[],
) {
	const constructorMethod = new TSFunction(parent, name);
	constructorMethod.isConstructor = true;

	// Replace all inherited properties that are overridden by the current model
	const overriddenInherited = inheritedProperties.map((prop) => {
		const override = properties.find((p) => p.name === prop.name);
		return override ?? prop;
	});

	// Combine all properties that should be parameters to the constructor
	const constructorParameters = [...overriddenInherited, ...properties]
		// Don't add parameters with a fixed value
		.filter((p) => p.fixedValue === undefined)
		// Don't add overrides, they are already added
		.reduce(onlyOnce, []);

	// Add parameters to the constructor
	for (const { name, type, required } of constructorParameters) {
		const parameter = new TSFunctionParameter(constructorMethod, name, type);
		parameter.optional = !required;
		constructorMethod.addParameter(parameter);
	}

	// Add super() call
	const superArguments = overriddenInherited
		.map(({ name, fixedValue }) => {
			if (typeof fixedValue === "string") return `"${fixedValue}"`;
			if (typeof fixedValue === "boolean") return fixedValue ? "true" : "false";
			if (typeof fixedValue === "number") return fixedValue.toString();
			return name;
		})
		.join(", ");
	constructorMethod.addBody(`super(${superArguments});`);

	// Set properties that are not inherited from parents
	const ownProperties = properties.filter(
		(p) => !inheritedProperties.find((ip) => ip.name === p.name),
	);
	for (const { name } of ownProperties) {
		constructorMethod.addBody(`this.${name} = ${name};`);
	}

	return constructorMethod;
}

/**
 * Extracts properties from the model along with their type information and imports.
 */
function getProperties(
	props: TSPropsWithModel,
): [PropertyRepresentation[], imports: TSImportType[]] {
	const imports: TSImportType[] = [];
	return [
		getBodyProperties(props.model).map((p) => {
			const [javaType, newImports] = getTSTypeName({
				...props,
				type: p.type,
				propertyName: p.name,
			});
			imports.push(...newImports);
			return {
				name: p.name,
				type: javaType,
				required: !p.optional,
				fixedValue: getFixedValue(p),
			};
		}),
		imports,
	];
}

/**
 * Recursively retrieves inherited properties for a model.
 */
function getInheritedProperties(
	props: TSPropsWithModel,
): [PropertyRepresentation[], imports: TSImportType[]] {
	const imports: TSImportType[] = [];
	const model = props.model;

	if (model.baseModel) {
		const [inheritedProperties, inheritedImports] = getInheritedProperties({
			...props,
			model: model.baseModel,
		});
		imports.push(...inheritedImports);
		const [unfilteredBodyProperties, bodyImports] = getProperties({
			...props,
			model: model.baseModel,
		});
		const bodyProperties = unfilteredBodyProperties.filter(
			(prop) => !inheritedProperties.some((ip) => ip.name === prop.name),
		);
		imports.push(...bodyImports);
		return [[...inheritedProperties, ...bodyProperties], imports];
	}
	return [[{ name: "message", type: "string", required: true }], imports];
}
