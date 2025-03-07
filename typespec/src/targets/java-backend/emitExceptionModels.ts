import {
	type EmitContext,
	emitFile,
	isErrorModel,
	type Model,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import {
	getJavaModelPackageName,
	getJavaModelPathName,
	getJavaType,
} from "../../languages/java/helpers/javaHelpers.js";
import {
	buildGeneralModel,
	getSubModelClasses,
} from "../../languages/java/helpers/modelBuilder.js";
import { JavaFile } from "../../languages/java/primitives/javafile.js";
import type JavaPrimitive from "../../languages/java/primitives/javaprimitive.js";
import Method from "../../languages/java/primitives/method.js";
import Parameter from "../../languages/java/primitives/parameter.js";
import type {
	JavaBaseProps,
	JavaPropsWithModel,
} from "../../languages/java/types.js";
import {
	getBodyProperties,
	getBodyPropertyType,
	getFixedValue,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { cloneModel, getFlattenedModel } from "../../utils/modelUtils.js";

type PropertyRepresentation = {
	name: string;
	javaType: string;
	required: boolean;
	fixedValue?: string | number | boolean;
};

export function emitExceptionModels(
	context: EmitContext,
	defaultProps: JavaBaseProps,
	eInnsynNamespace: Namespace,
) {
	const defaultImports = [
		"no.einnsyn.backend.common.expandablefield.ExpandableField",
		"java.util.List",
		"java.util.ArrayList",
	];

	const models = recursivelyGetModels(eInnsynNamespace)
		.filter((model) => isErrorModel(context.program, model))
		// Don't emit "wrappers" with a @body parameter:
		.filter((model) => !getBodyPropertyType(model));

	for (const model of models) {
		// Create java file
		const modelPackageName = getJavaModelPackageName(
			defaultProps.packageName,
			model,
		);
		const modelPathName = getJavaModelPathName(defaultProps.packageName, model);
		const modelFile = new JavaFile(modelPackageName);
		modelFile.addImport(...defaultImports);

		const props: JavaPropsWithModel = {
			...defaultProps,
			context,
			model: model,
			className: model.name,
			addGetters: false,
			addSetters: false,
			addSubModels: true,
			addConstructors: true,
			addLombokGetters: true,
			parent: modelFile,
		};

		const getProperties = (
			model: Model,
		): [PropertyRepresentation[], imports: string[]] => {
			const imports: string[] = [];
			return [
				getBodyProperties(model).map((p) => {
					const [javaType, newImports] = getJavaType({
						...props,
						type: p.type,
						propertyName: p.name,
					});
					imports.push(...newImports);
					return {
						name: p.name,
						javaType: javaType,
						required: !p.optional,
						fixedValue: getFixedValue(p),
					};
				}),
				imports,
			];
		};

		const getInheritedProperties = (
			model: Model,
		): [PropertyRepresentation[], imports: string[]] => {
			const imports: string[] = [];

			if (model.baseModel) {
				const [inheritedProperties, inheritedImports] = getInheritedProperties(
					model.baseModel,
				);
				imports.push(...inheritedImports);
				const [unfilteredBodyProperties, bodyImports] = getProperties(
					model.baseModel,
				);
				const bodyProperties = unfilteredBodyProperties.filter(
					(prop) => !inheritedProperties.some((ip) => ip.name === prop.name),
				);
				imports.push(...bodyImports);
				return [[...inheritedProperties, ...bodyProperties], imports];
			}
			return [
				[
					{ name: "message", javaType: "String", required: true },
					{ name: "cause", javaType: "Throwable", required: false },
				],
				imports,
			];
		};

		// Remove "message" from base model
		const modelWithoutMessage = cloneModel(model);
		if (modelWithoutMessage.properties.has("message")) {
			modelWithoutMessage.properties.delete("message");
		}

		// Create model class
		const modelClass = buildGeneralModel({
			...props,
			model: modelWithoutMessage,
			addConstructors: false,
			addSubModels: false,
		});
		modelFile.addClass(modelClass);

		if (!model.baseModel) {
			modelClass.setExtends("Exception");
		}

		// Create constructors
		const [properties, propertyImports] = getProperties(model);
		const [inheritedProperties, inheritedImports] =
			getInheritedProperties(model);
		modelClass.addImport(...propertyImports, ...inheritedImports);

		// Create constructor with all properties
		modelClass.addMethod(
			createConstructor(
				modelClass,
				model.name,
				properties,
				inheritedProperties,
			),
		);

		// Create constructor with only requred properties
		modelClass.addMethod(
			createConstructor(
				modelClass,
				model.name,
				properties.filter((p) => p.required),
				inheritedProperties.filter((p) => p.required),
			),
		);

		// Add ClientResponse method
		const flattenedModel = getFlattenedModel(props.model);
		const clientResponse = buildGeneralModel({
			...props,
			model: flattenedModel,
			className: "ClientResponse",
			addFieldVariables: true,
			addConstructors: true,
			parent: modelClass,
			addSubModels: false,
		});
		clientResponse.setStatic(true);
		clientResponse.addImplements(
			"no.einnsyn.backend.common.responses.models.ErrorResponse",
		);
		modelClass.addClass(clientResponse);

		// Add toClientResponse method
		const toClientResponse = new Method(
			modelClass,
			"ErrorResponse",
			"toClientResponse",
		);
		const clientResponseConstructorProps = getBodyProperties(flattenedModel)
			.filter((prop) => getFixedValue(prop) === undefined)
			.map((p) => `this.${getGetter(p.name)}`)
			.join(", ");
		toClientResponse.addBody(
			`return new ClientResponse(${clientResponseConstructorProps});`,
		);
		modelClass.addMethod(toClientResponse);

		// Add sub models
		const subModels = getSubModelClasses({
			...props,
			model: model,
			addConstructors: true,
		});
		modelClass.addClass(...subModels);

		// Emit file
		emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`${modelPathName}/${model.name}.java`,
			),
			content: modelFile.toString(),
		});
	}
}

function getGetter(name: string) {
	return `get${name.charAt(0).toUpperCase()}${name.slice(1)}()`;
}

function createConstructor(
	parent: JavaPrimitive,
	name: string,
	properties: PropertyRepresentation[],
	inheritedProperties: PropertyRepresentation[],
) {
	const onlyOnce = (
		uniqueProperties: PropertyRepresentation[],
		currentProperty: PropertyRepresentation,
	) => {
		if (uniqueProperties.find((p) => p.name === currentProperty.name)) {
			return uniqueProperties;
		}
		return [...uniqueProperties, currentProperty];
	};
	const constructorMethod = new Method(parent, name);

	// Replace all inherited properties that are overridden by the current model
	const overriddenInheritedProperties = [...inheritedProperties];
	for (const prop of properties) {
		const index = overriddenInheritedProperties.findIndex(
			(p) => p.name === prop.name,
		);
		if (index >= 0) {
			overriddenInheritedProperties[index] = prop;
		}
	}

	// Add parameters
	[...overriddenInheritedProperties, ...properties]
		// Don't add parameters with a fixed value
		.filter((p) => p.fixedValue === undefined)
		// Don't add overrides, they are already added
		.reduce(onlyOnce, [])
		.forEach(({ name, javaType }) =>
			constructorMethod.addParameter(
				new Parameter(constructorMethod, name, javaType),
			),
		);

	// Add super() call
	constructorMethod.addBody(
		`super(${overriddenInheritedProperties
			.map(({ name, fixedValue }) => {
				if (typeof fixedValue === "string") {
					return (fixedValue = `"${fixedValue}"`);
				} else if (typeof fixedValue === "boolean") {
					return (fixedValue = fixedValue ? "true" : "false");
				} else if (typeof fixedValue === "number") {
					return (fixedValue = fixedValue.toString());
				} else {
					return name;
				}
			})
			.join(", ")});`,
	);

	// Set properties
	properties
		// Don't set properties that are inherited from parents
		.filter((p) => !inheritedProperties.find((ip) => ip.name === p.name))
		.forEach(({ name, fixedValue }) => {
			constructorMethod.addBody(`this.${name} = ${name};`);
		});

	return constructorMethod;
}
