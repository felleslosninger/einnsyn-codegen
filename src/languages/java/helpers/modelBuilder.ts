import {
	getDoc,
	type Model,
	type ModelProperty,
	type Union,
} from "@typespec/compiler";
import { isReadonlyProperty } from "@typespec/openapi";
import {
	getBodyProperties,
	getDefaultValue,
	getExpandableEntity,
	getFixedValue,
	getInheritedProperties,
	getListType,
} from "../../../utils/getters.js";
import { pascalCase } from "../../../utils/stringUtils.js";
import {
	isEInnsynEntity,
	isEnum,
	isExpandableField,
	isFinal,
	isList,
	isNumberUnion,
	isStringUnion,
} from "../../../utils/typecheckers.js";
import Class from "../primitives/class.js";
import Enum from "../primitives/enum.js";
import Field from "../primitives/field.js";
import Method from "../primitives/method.js";
import Parameter from "../primitives/parameter.js";
import type { JavaProps, JavaPropsWithModel } from "../types.js";
import { getJavaType } from "./javaHelpers.js";
import { getValidationAnnotations } from "./validationAnnotations.js";
import { getFlattenedModel } from "../../../utils/modelUtils.js";

const defaultProps: Partial<JavaProps> = {
	addFieldVariables: true,
	addGetters: true,
	addSetters: false,
	addConstructors: false,
	addBuilder: false,
	addSubModels: false,
	addLombokGetters: false,
	addLombokSetters: false,
	addInlineEnums: false,
	isBuilder: false,
	wrapExpandableFields: true,
	entitySuffix: "",
	setDefaultValues: true,
	validate: false,
	stringEnums: true,
};

export function buildGeneralModel(incomingProps: JavaPropsWithModel) {
	const className = incomingProps.className ?? incomingProps.model.name;
	const clazz = new Class(incomingProps.parent, className);

	// Update props with new parent
	const props = {
		className,
		...defaultProps,
		...incomingProps,
		parent: clazz,
	};

	// We need a constructor if we have Builder
	if (props.addBuilder) {
		props.addConstructors = true;
		props.addFieldVariables = true;
	}

	// We need fieldVariables if we have setters/getters
	if (props.addSetters || props.addGetters) {
		props.addFieldVariables = true;
	}

	// Extend base model
	if (props.model.baseModel) {
		const [extendsClassName, extendsImports] = getJavaType({
			...props,
			type: props.model.baseModel,
		});
		clazz.setExtends(extendsClassName);
		clazz.addImport(...extendsImports);
	}

	if (props.addFieldVariables) {
		const [fields, fieldImports] = getFieldVariables(props);
		clazz.addField(...fields);
		clazz.addImport(...fieldImports);
	}

	if (props.addConstructors) {
		const [constructors, constructorImports] = getConstructors(props);
		clazz.addMethod(...constructors);
		clazz.addImport(...constructorImports);
	}

	if (props.addGetters) {
		const [getters, getterImports] = getGetters(props);
		clazz.addMethod(...getters);
		clazz.addImport(...getterImports);
	}

	if (props.addSetters) {
		const [setters, setterImports] = getSetters(props);
		clazz.addMethod(...setters);
		clazz.addImport(...setterImports);
	}

	if (props.addBuilder) {
		// Don't add builder methods if the model has subclasses. This will cause a name clash.
		if (props.model?.derivedModels.length === 0) {
			// .builder() method
			const [builderMethod, builderMethodImports] = getBuilderMethod(props);
			clazz.addMethod(builderMethod);
			clazz.addImport(...builderMethodImports);

			// // .of() method
			const [ofMethod, ofMethodImports] = getOfMethod(props);
			clazz.addMethod(ofMethod);
			clazz.addImport(...ofMethodImports);
		}

		// Get a new model with all inherited properties
		const flattenedModel = getFlattenedModel(props.model);

		// Builder class
		const builderClass = buildGeneralModel({
			...props,
			model: flattenedModel,
			className: "Builder",
			addFieldVariables: true,
			addGetters: true,
			addSetters: true,
			addBuilder: false,
			addConstructors: false,
			isBuilder: true,
			parent: clazz,
			skipReadOnlyProperties: true,
		});
		builderClass.setStatic(true);

		// Add build() method
		builderClass.addMethod(getBuildMethod(props));

		clazz.addClass(builderClass);
	}

	// Add subclasses
	if (props.addSubModels) {
		const subModelClasses = getSubModelClasses(props);
		clazz.addClass(...subModelClasses);
	}

	// Add documentation
	clazz.setDocumentation(getDoc(props.context.program, props.model));

	// Add lombok getters/setters
	if (props.addLombokGetters) {
		clazz.addAnnotation("lombok.Getter");
	}
	if (props.addLombokSetters) {
		clazz.addAnnotation("lombok.Setter");
	}

	// Add inline enums
	if (props.addInlineEnums) {
		const enums = getEnums(props);
		clazz.addEnum(...enums);
	}

	return clazz;
}

function getFieldVariables(props: JavaPropsWithModel): [Field[], string[]] {
	const { context, model, parent, skipReadOnlyProperties } = props;
	const properties = getBodyProperties(model);
	const inheritedProperties = getInheritedProperties(model);
	const entityName = model.name;
	const fields: Field[] = [];
	const imports: string[] = [];
	const addedProperty = new Set<string>(inheritedProperties.map((p) => p.name));

	const filteredProperties = properties
		// Skip read-only
		.filter(
			(p) => !skipReadOnlyProperties || !isReadonlyProperty(context.program, p),
		)
		// Skip already added (overridden?) properties
		.filter((p) => !addedProperty.has(p.name));

	for (const property of filteredProperties) {
		const name = property.name;
		const [javaType, javaTypeImports] = getJavaType({
			...props,
			type: property.type,
			propertyName: property.name,
			parentName: entityName,
		});
		const field = new Field(parent, name, javaType);
		field.setVisibility("protected");
		field.setDocumentation(getDoc(context.program, property));

		// Set default value
		if (
			props.setDefaultValues !== false ||
			getFixedValue(property) !== undefined
		) {
			field.setValue(getDefaultValue(property));
		}

		if (props.validate) {
			const [validationAnnotations, validationImports] =
				getValidationAnnotations({ ...props, modelProperty: property });
			for (const [annotation, args] of validationAnnotations) {
				field.addAnnotation(annotation, args);
			}
			imports.push(...validationImports);
		}

		if (isFinal(property)) {
			field.setFinal(true);
		}

		fields.push(field);
		imports.push(...javaTypeImports);

		addedProperty.add(name);
	}

	return [fields, imports];
}

export function getConstructors(
	props: JavaPropsWithModel,
): [Method[], string[]] {
	const { context, model, className, parent } = props;
	const notDefault = (prop: ModelProperty) =>
		!isReadonlyProperty(context.program, prop);
	const properties = getBodyProperties(model).filter(notDefault);
	const inheritedProperties = getInheritedProperties(model).filter(notDefault);
	const allProperties = [...inheritedProperties, ...properties];
	const constructors: Method[] = [];
	const imports: string[] = [];

	const constructor = new Method(parent, className ?? model.name);

	allProperties
		// Don't add method parameter for fixed values
		.filter((prop) => getFixedValue(prop) === undefined)
		.forEach(({ name, type }) => {
			const [javaType, javaTypeImports] = getJavaType({
				...props,
				type,
				propertyName: name,
				parentName: className,
			});
			constructor.addParameter(new Parameter(parent, name, javaType));
			imports.push(...javaTypeImports);
		});

	const superArgs = inheritedProperties
		.filter((prop) => getFixedValue(prop) === undefined)
		.map((prop) => prop.name);
	constructor.addBody(`super(${superArgs.join(", ")});`);

	properties
		// Don't set fixed values
		.filter((prop) => getFixedValue(prop) === undefined)
		.forEach((prop) => {
			constructor.addBody(`this.${prop.name} = ${prop.name};`);
		});

	constructors.push(constructor);
	return [constructors, imports];
}

function getGetters(props: JavaPropsWithModel): [Method[], string[]] {
	const { context, model, parent, skipReadOnlyProperties } = props;
	const properties = getBodyProperties(model);
	const entityName = model.name;
	const getters: Method[] = [];
	const imports: string[] = [];

	properties
		.filter(
			(prop) =>
				!skipReadOnlyProperties || !isReadonlyProperty(context.program, prop),
		)
		.forEach((property) => {
			const name = property.name;
			const [javaType, javaTypeImports] = getJavaType({
				...props,
				type: property.type,
				propertyName: property.name,
				parentName: entityName,
			});

			const getter = new Method(parent, javaType, "get" + pascalCase(name));
			getter.addBody(`return ${name};`);
			getter.setDocumentation(getDoc(props.context.program, property));

			getters.push(getter);
			imports.push(...javaTypeImports);
		});

	return [getters, imports];
}

function getSetters(props: JavaPropsWithModel): [Method[], string[]] {
	const { context, model, parent, skipReadOnlyProperties, isBuilder } = props;
	const properties = getBodyProperties(model);
	const entityName = model.name;
	const setters: Method[] = [];
	const imports: string[] = [];
	const returnType = props.isBuilder ? "Builder" : "void";

	properties
		.filter(
			(prop) =>
				!skipReadOnlyProperties || !isReadonlyProperty(context.program, prop),
		)
		.forEach((property) => {
			const name = property.name;
			const [javaType, javaTypeImports] = getJavaType({
				...props,
				type: property.type,
				propertyName: property.name,
				parentName: entityName,
				wrapExpandableFields: false,
			});

			const setterName = isBuilder ? name : "set" + pascalCase(name);

			// Add setter method
			const setter = new Method(parent, returnType, setterName);
			setter.addParameter(new Parameter(parent, name, javaType));
			// If the property is an expandable field, we need to wrap it
			if (
				isList(property.type) &&
				isExpandableField(getListType(property.type))
			) {
				setter.addImport("java.util.stream.Collectors");
				setter.addBody(
					`this.${name} = ${name}.stream().map(ExpandableField::new).collect(Collectors.toList());`,
				);
			} else if (isExpandableField(property.type)) {
				setter.addBody(`this.${name} = new ExpandableField<>(${name});`);
			} else {
				setter.addBody(`this.${name} = ${name};`);
			}
			if (props.isBuilder) {
				setter.addBody(`return this;`);
			}
			setter.setDocumentation(getDoc(context.program, property));
			setters.push(setter);
			imports.push(...javaTypeImports);

			// Add setProperty(id)
			if (isExpandableField(property.type)) {
				const setter = new Method(parent, returnType, setterName);
				setter.addParameter(new Parameter(parent, "id", "String"));
				setter.addBody(`this.${name} = new ExpandableField<>(id);`);
				if (props.isBuilder) {
					setter.addBody(`return this;`);
				}
				setter.setDocumentation(getDoc(context.program, property));
				setters.push(setter);
			}

			// Add addProperty(propertyTypeRequest) method
			const listType = getListType(property.type);
			if (listType) {
				const listType = getListType(property.type);
				const [targetJavaType, targetJavaTypeImports] = getJavaType({
					...props,
					type: listType,
					propertyName: property.name,
					parentName: entityName,
					wrapExpandableFields: false,
				});

				const adder = new Method(parent, returnType, "add" + pascalCase(name));
				adder.addParameter(new Parameter(parent, name, targetJavaType));
				adder.addBody(
					`if (this.${name} == null) {`,
					`this.${name} = new ArrayList<>();`,
					`}`,
				);
				if (isExpandableField(listType)) {
					const expandableEntity = getExpandableEntity(listType);
					const [expandableJavaType, expandableJavaTypeImports] = getJavaType({
						...props,
						type: expandableEntity,
					});
					adder.addBody(
						`this.${name}.add(new ExpandableField<${expandableJavaType}>(${name}));`,
					);
					imports.push(...expandableJavaTypeImports);
				} else {
					adder.addBody(`this.${name}.add(${name});`);
				}

				if (props.isBuilder) {
					adder.addBody(`return this;`);
				}

				adder.setDocumentation(getDoc(context.program, property));
				setters.push(adder);
				imports.push(...targetJavaTypeImports);
			}

			// Add addProperty(builder) method
			if (listType && isExpandableField(listType)) {
				const [targetJavaType, targetJavaTypeImports] = getJavaType({
					...props,
					type: listType,
					propertyName: property.name,
					parentName: entityName,
					wrapExpandableFields: false,
				});
				const adder = new Method(parent, returnType, "add" + pascalCase(name));
				adder.addParameter(
					new Parameter(
						parent,
						"builderFunction",
						`Function<${targetJavaType}.Builder, ${targetJavaType}.Builder>`,
					),
				);
				adder.addBody(
					`if (this.${name} == null) {`,
					`this.${name} = new ArrayList<>();`,
					`}`,
					`this.${name}.add(new ExpandableField<>(builderFunction.apply(new ${targetJavaType}.Builder()).build()));`,
				);
				if (props.isBuilder) {
					adder.addBody(`return this;`);
				}
				adder.addImport("java.util.function.Function");
				adder.setDocumentation(getDoc(context.program, property));
				setters.push(adder);
				imports.push(...targetJavaTypeImports);
			}

			// Add addProperty(id) method
			if (listType && isExpandableField(listType)) {
				const [targetJavaType, targetJavaTypeImports] = getJavaType({
					...props,
					type: listType,
					propertyName: property.name,
					parentName: entityName,
					wrapExpandableFields: false,
				});
				const adder = new Method(parent, returnType, "add" + pascalCase(name));
				adder.addParameter(new Parameter(parent, "id", "String"));
				adder.addBody(
					`if (this.${name} == null) {`,
					`this.${name} = new ArrayList<>();`,
					`}`,
					`this.${name}.add(new ExpandableField<>(id));`,
				);
				if (props.isBuilder) {
					adder.addBody(`return this;`);
				}
				adder.setDocumentation(getDoc(context.program, property));
				setters.push(adder);
				imports.push(...targetJavaTypeImports);
			}
		});

	return [setters, imports];
}

function getBuilderMethod(props: JavaProps): [Method, string[]] {
	const builderMethod = new Method(props.parent, "Builder", "builder");
	builderMethod.setStatic(true);
	builderMethod.addBody("return new Builder();");
	return [builderMethod, []];
}

function getOfMethod(props: JavaPropsWithModel): [Method, string[]] {
	const ofMethod = new Method(
		props.parent,
		props.className ?? props.model.name,
		"of",
	);
	ofMethod.setStatic(true);
	ofMethod.addParameter(
		new Parameter(
			props.parent,
			"builderFunction",
			"Function<Builder, Builder>",
		),
	);
	ofMethod.addBody("return builderFunction.apply(new Builder()).build();");

	return [ofMethod, ["java.util.function.Function"]];
}

function getBuildMethod(props: JavaPropsWithModel) {
	const { model } = props;
	const properties = getBodyProperties(model);
	const inheritedProperties = getInheritedProperties(model);
	const allProperties = [...inheritedProperties, ...properties].filter(
		(p) => !isReadonlyProperty(props.context.program, p),
	);
	const buildMethod = new Method(
		props.parent,
		props.className ?? props.model.name,
		"build",
	);
	buildMethod.addBody(
		`return new ${props.className} (${allProperties.map((p) => `this.${p.name}`)});`,
	);

	return buildMethod;
}

export function getEnums(props: JavaPropsWithModel) {
	const { model, parent } = props;
	const properties = getBodyProperties(model);

	const enums = properties
		.filter((p) => p.kind === "ModelProperty")
		.filter((p) => isEnum(p.type))
		.map((p) => {
			const type = isList(p.type) ? getListType(p.type) : p.type;
			if (!type) {
				return;
			}
			const union = type as Union;
			const enumVar = new Enum(parent, pascalCase(`${p.name}Enum`));
			for (const [key, variant] of union.variants) {
				if (variant.type.kind === "String") {
					enumVar.addValue(variant.type.value);
				}
				if (variant.type.kind === "Number") {
					enumVar.addValue(variant.type.value.toString());
				}
			}
			return enumVar;
		})
		.filter((e) => !!e);
	return enums;
}

export function getSubModelClasses(props: JavaPropsWithModel) {
	const { model, skipReadOnlyProperties } = props;
	const properties = getBodyProperties(model);
	const classes: Class[] = [];

	// Filter properties by non-eInnsynEntity models
	properties
		.filter(
			(property) =>
				!skipReadOnlyProperties ||
				!isReadonlyProperty(props.context.program, property),
		)
		.filter((property) => {
			const model = isList(property.type)
				? getListType(property.type)
				: property.type;
			return (
				model?.kind === "Model" &&
				model.name === "" &&
				!isEInnsynEntity(model) &&
				!isExpandableField(model)
			);
		})
		.forEach((property) => {
			const model = (
				isList(property.type) ? getListType(property.type) : property.type
			) as Model;
			const [javaType, javaTypeImports] = getJavaType({
				...props,
				type: model,
				propertyName: property.name,
			});
			const subModelClass = buildGeneralModel({
				...props,
				model,
				className: javaType,
			});
			subModelClass.setStatic(true);
			subModelClass.addImport(...javaTypeImports);
			classes.push(subModelClass);
		});

	return classes;
}
