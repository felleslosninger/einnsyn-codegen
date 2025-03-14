import {
	type EmitContext,
	type Model,
	type Namespace,
	emitFile,
	isErrorModel,
	resolvePath,
} from "@typespec/compiler";
import { isReadonlyProperty } from "@typespec/openapi";
import {
	getJavaModelPackageName,
	getJavaModelPathName,
	getJavaType,
} from "../../languages/java/helpers/javaHelpers.js";
import { buildGeneralModel } from "../../languages/java/helpers/modelBuilder.js";
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
	getFixedValue,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { cloneModel } from "../../utils/modelUtils.js";
import { pascalCase } from "../../utils/stringUtils.js";

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
		"no.einnsyn.sdk.common.expandablefield.ExpandableField",
		"java.util.List",
		"java.util.ArrayList",
	];

	const models = recursivelyGetModels(eInnsynNamespace).filter((model) =>
		isErrorModel(context.program, model),
	);
	for (const model of models) {
		// Create java file
		const modelPackageName = getJavaModelPackageName(
			defaultProps.packageName,
			model,
		);
		const modelPathName = getJavaModelPathName(defaultProps.packageName, model);
		const modelFile = new JavaFile(modelPackageName);
		modelFile.addImport(...defaultImports);

		const props = {
			...defaultProps,
			context,
			model: model,
			className: model.name,
			addGetters: true,
			addSubModels: true,
			parent: modelFile,
		};

		/**
		 *
		 */
		// const getExceptionConstructorParameters = (
		// 	model: Model,
		// ): {
		// 	inheritedParameters: [string, string][];
		// 	parameters: [string, string][];
		// } => {
		// 	const parameters: [string, string][] = getBodyProperties(model)
		// 		.filter((p) => !isReadonlyProperty(context.program, p))
		// 		.map((p) => [
		// 			p.name,
		// 			getJavaType({ ...props, type: p.type, propertyName: p.name })[0],
		// 		]);

		// 	if (model.baseModel) {
		// 		const parentParameters = getExceptionConstructorParameters(
		// 			model.baseModel,
		// 		);
		// 		return {
		// 			inheritedParameters: [
		// 				...parentParameters.inheritedParameters,
		// 				...parentParameters.parameters,
		// 			],
		// 			parameters,
		// 		};
		// 	}
		// 	return {
		// 		inheritedParameters: [
		// 			["message", "String"],
		// 			["cause", "Throwable"],
		// 		],
		// 		parameters: parameters.filter(([name]) => name !== "message"),
		// 	};
		// };

		const getGetter = (name: string) => {
			return `get${pascalCase(name)}()`;
		};

		// We can't have a message property in the model, as it's already defined in the Exception class
		const modelWithoutMessage = cloneModel(model);
		if (modelWithoutMessage.properties.has("message")) {
			modelWithoutMessage.properties.delete("message");
		}

		// Create model class
		const modelClass = buildGeneralModel({
			...props,
			model: modelWithoutMessage,
			addConstructors: false,
			addSubModels: true,
		});
		modelFile.addClass(modelClass);

		if (!model.baseModel) {
			modelClass.setExtends("Exception");
		}

		// Create constructor with all properties
		const [properties, propertyImports] = getProperties({
			...props,
		});
		const [inheritedProperties, inheritedImports] = getInheritedProperties({
			...props,
		});
		modelClass.addImport(...propertyImports, ...inheritedImports);
		modelClass.addMethod(
			createConstructor(
				modelClass,
				model.name,
				properties,
				inheritedProperties,
			),
		);

		// Create Object constructor (get an Exception instance from a parsed object)
		const objectConstructor = new Method(modelClass, model.name);
		objectConstructor.addParameter(
			new Parameter(modelClass, "object", `${model.name}.DTO`),
		);
		// Add super() call
		if (model.baseModel) {
			objectConstructor.addBody("super(object);");
		} else {
			objectConstructor.addBody("super(object.getMessage());");
		}

		// Set properties that are not inherited from parents
		const ownProperties = properties.filter(
			(p) => !inheritedProperties.find((ip) => ip.name === p.name),
		);
		for (const { name } of ownProperties) {
			objectConstructor.addBody(`this.${name} = object.${getGetter(name)};`);
		}
		modelClass.addMethod(objectConstructor);

		// Add DTO class
		const dtoClass = buildGeneralModel({
			...props,
			className: "DTO",
			addFieldVariables: true,
			addGetters: true,
			addSetters: false,
			addConstructors: false,
			addSubModels: false,
		});
		if (model.baseModel) {
			dtoClass.setExtends(`${model.baseModel.name}.DTO`);
		}
		dtoClass.setStatic(true);
		modelClass.addClass(dtoClass);

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
	parent: JavaPrimitive,
	name: string,
	properties: PropertyRepresentation[],
	inheritedProperties: PropertyRepresentation[],
) {
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
	const handleProperties = [...overriddenInheritedProperties, ...properties]
		// Don't add parameters with a fixed value
		.filter((p) => p.fixedValue === undefined)
		// Don't add overrides, they are already added
		.reduce(onlyOnce, []);
	for (const { name, javaType } of handleProperties) {
		constructorMethod.addParameter(
			new Parameter(constructorMethod, name, javaType),
		);
	}

	// Add super() call
	constructorMethod.addBody(
		`super(${overriddenInheritedProperties
			.map(({ name, fixedValue }) => {
				if (typeof fixedValue === "string") {
					return `"${fixedValue}"`;
				}
				if (typeof fixedValue === "boolean") {
					return fixedValue ? "true" : "false";
				}
				if (typeof fixedValue === "number") {
					return fixedValue.toString();
				}
				return name;
			})
			.join(", ")});`,
	);

	// Set properties that are not inherited from parents
	const ownProperties = properties.filter(
		(p) => !inheritedProperties.find((ip) => ip.name === p.name),
	);
	for (const { name } of ownProperties) {
		constructorMethod.addBody(`this.${name} = ${name};`);
	}

	return constructorMethod;
}

function getProperties(
	props: JavaPropsWithModel,
): [PropertyRepresentation[], imports: string[]] {
	const imports: string[] = [];
	return [
		getBodyProperties(props.model).map((p) => {
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
}

function getInheritedProperties(
	props: JavaPropsWithModel,
): [PropertyRepresentation[], imports: string[]] {
	const imports: string[] = [];
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
	return [
		[
			{ name: "message", javaType: "String", required: true },
			{ name: "cause", javaType: "Throwable", required: false },
		],
		imports,
	];
}
