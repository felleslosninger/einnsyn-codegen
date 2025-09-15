import {
  EnumMember,
  getLifecycleVisibilityEnum,
  getMaxLength,
  getMaxValue,
  getMinLength,
  getMinValue,
  getPattern, getVisibilityForClass,
  isStringType,
  type ModelProperty, Program,
  type Type
} from '@typespec/compiler';
import { isReadonlyProperty } from "@typespec/openapi";
import {
	getDefaultValue,
	getExpandableEntity,
} from "../../../utils/getters.js";
import { pascalCase } from "../../../utils/stringUtils.js";
import {
	isDateOrDateTimeProperty,
	isDateProperty,
	isDateTimeProperty,
	isDefaultString,
	isEmailProperty,
	isList,
	isNumberUnion,
	isPasswordProperty,
	isStringUnion,
	isUrlProperty,
} from "../../../utils/typecheckers.js";
import type { JavaProps } from "../types.js";
import { getJavaEntityPackageName } from "./javaHelpers.js";

type Annotation = [string, string?];

export function getValidationAnnotations(
	props: JavaProps & { modelProperty: ModelProperty; type?: Type },
): [Annotation[], string[]] {
	const annotations: Annotation[] = [];
	const imports: string[] = [];

	const {
		context,
		packageName,
		modelProperty,
		type = modelProperty.type,
	} = props;

	if (isUrlProperty(context, modelProperty ?? type)) {
		annotations.push(["org.hibernate.validator.constraints.URL"]);
	}

	if (isEmailProperty(context, modelProperty ?? type)) {
		annotations.push(["jakarta.validation.constraints.Email"]);
	}

	if (modelProperty.name === "publisertDatoBefore") {
		console.log(modelProperty.type);
	}

	if (isDateOrDateTimeProperty(context, modelProperty ?? type)) {
		annotations.push([
			"no.einnsyn.backend.validation.isodatetime.IsoDateTime",
			"format = IsoDateTime.Format.ISO_DATE_OR_DATE_TIME",
		]);
		imports.push("no.einnsyn.backend.validation.isodatetime.IsoDateTime");
	}

	if (isDateProperty(context, modelProperty ?? type)) {
		annotations.push([
			"no.einnsyn.backend.validation.isodatetime.IsoDateTime",
			"format = IsoDateTime.Format.ISO_DATE",
		]);
		imports.push("no.einnsyn.backend.validation.isodatetime.IsoDateTime");
	}

	if (isDateTimeProperty(context, modelProperty ?? type)) {
		annotations.push([
			"no.einnsyn.backend.validation.isodatetime.IsoDateTime",
			"format = IsoDateTime.Format.ISO_DATE_TIME",
		]);
		imports.push("no.einnsyn.backend.validation.isodatetime.IsoDateTime");
	}

	if (isPasswordProperty(context, modelProperty ?? type)) {
		annotations.push(["no.einnsyn.backend.validation.password.Password"]);
	}

	const pattern = getPattern(context.program, modelProperty);
	if (pattern) {
		annotations.push([
			"jakarta.validation.constraints.Pattern",
			`regexp = "${pattern}"`,
		]);
	}

	const maxLength = getMaxLength(context.program, modelProperty);
	const minLength = getMinLength(context.program, modelProperty);
	if (maxLength !== undefined && minLength !== undefined) {
		annotations.push([
			"jakarta.validation.constraints.Size",
			`min = ${minLength}, max = ${maxLength}`,
		]);
	} else if (maxLength !== undefined) {
		annotations.push([
			"jakarta.validation.constraints.Size",
			`max = ${maxLength}`,
		]);
	} else if (minLength !== undefined) {
		annotations.push([
			"jakarta.validation.constraints.Size",
			`min = ${minLength}`,
		]);
	}

	const minValue = getMinValue(context.program, modelProperty);
	if (minValue !== undefined) {
		annotations.push(["jakarta.validation.constraints.Min", `${minValue}`]);
	}

	const maxValue = getMaxValue(context.program, modelProperty);
	if (maxValue !== undefined) {
		annotations.push(["jakarta.validation.constraints.Max", `${maxValue}`]);
	}

	if (isStringUnion(type) || isNumberUnion(type)) {
		annotations.push([
			"no.einnsyn.backend.validation.validenum.ValidEnum",
			`enumClass = ${pascalCase(modelProperty.name)}Enum.class`,
		]);
	}

	const entity = getExpandableEntity(type);
	if (entity) {
		const packageNameBase = getJavaEntityPackageName(packageName, entity);
		const serviceName = `${pascalCase(entity.name)}Service`;
		const entityPackageName = `${packageNameBase}.${pascalCase(entity.name)}`;
		const servicePackageName = `${packageNameBase}.${serviceName}`;
		imports.push(
			entityPackageName,
			servicePackageName,
			"no.einnsyn.backend.validation.validationgroups.Insert",
			"no.einnsyn.backend.validation.validationgroups.Update",
			"no.einnsyn.backend.common.expandablefield.ExpandableField",
		);
		annotations.push([
			"no.einnsyn.backend.validation.expandableobject.ExpandableObject",
			`service = ${serviceName}.class, groups = {Insert.class, Update.class}`,
		]);
		annotations.push(["jakarta.validation.Valid"]);
	}

	if (isDefaultString(context, modelProperty)) {
		annotations.push(["no.einnsyn.backend.validation.nossn.NoSSN"]);
		if (maxLength === undefined && minLength === undefined) {
			annotations.push(["jakarta.validation.constraints.Size", "max = 500"]);
		}
	}

	if (isList(type) && type.kind === "Model") {
		if (type.indexer !== undefined) {
			imports.push("java.util.List");
			const [nestedAnnotations, nestedImports] = getValidationAnnotations({
				...props,
				type: type.indexer.value,
			});
			annotations.push(...nestedAnnotations);
			imports.push(...nestedImports);
		}
		// TODO: Template?
	}
	const isReadOnly = isReadonlyProperty(context.program, modelProperty);
  const isReadAndUpdate = isReadAndUpdateProperty(context.program, modelProperty);
  const isRequired = !modelProperty.optional;
	const value = getDefaultValue(modelProperty);
	if (isReadOnly && value === undefined) {
		imports.push(
			"no.einnsyn.backend.validation.validationgroups.Insert",
			"no.einnsyn.backend.validation.validationgroups.Update",
		);
		annotations.push([
			"jakarta.validation.constraints.Null",
			"groups = {Insert.class, Update.class}",
		]);
	} else if (isReadAndUpdate && !isRequired && value === undefined) {
		imports.push(
			"no.einnsyn.backend.validation.validationgroups.Insert",
		);
    annotations.push([
      "jakarta.validation.constraints.Null",
      "groups = {Insert.class}",
    ]);
	} else if (isRequired && !isReadOnly) {
		imports.push("no.einnsyn.backend.validation.validationgroups.Insert");
		if (isStringType(context.program, modelProperty.type)) {
			annotations.push([
				"jakarta.validation.constraints.NotBlank",
				"groups = {Insert.class}",
			]);
		} else {
			annotations.push([
				"jakarta.validation.constraints.NotNull",
				"groups = {Insert.class}",
			]);
		}
	}

	return [annotations, imports];
}

/**
 * Checks if the property is allowed for both read and update operations.
 * @param program
 * @param property
 */
function isReadAndUpdateProperty(program: Program, property: ModelProperty) {
  const Lifecycle = getLifecycleVisibilityEnum(program);
  const visibility = getVisibilityForClass(program, property, getLifecycleVisibilityEnum(program));
  return visibility.size === 2
    && visibility.has(<EnumMember>Lifecycle.members.get("Read"))
    && visibility.has(<EnumMember>Lifecycle.members.get("Update"));
}
