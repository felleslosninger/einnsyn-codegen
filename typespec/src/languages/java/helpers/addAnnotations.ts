import {
  EmitContext,
  getMaxLength,
  getMaxValue,
  getMinLength,
  getMinValue,
  getPattern,
  isStringType,
  ModelProperty,
  Type,
} from '@typespec/compiler';
import { isReadonlyProperty } from '@typespec/openapi';
import {
  getDefaultValue,
  getExpandableEntity,
} from '../../../utils/getters.js';
import { pascalCase } from '../../../utils/stringutils.js';
import {
  isDateProperty,
  isDateTimeProperty,
  isDefaultString,
  isEmailProperty,
  isList,
  isNumberUnion,
  isPasswordProperty,
  isStringUnion,
  isUrlProperty,
} from '../../../utils/typecheckers.js';
import JavaPrimitive from '../primitives/javaprimitive.js';
import { getJavaEntityPackageName } from './javaHelpers.js';
import { EmitterOptions } from '../../../types.js';

type ExcludeAnnotations = {
  validate?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

export function addAnnotations(
  context: EmitContext<EmitterOptions>,
  javaPrimitive: JavaPrimitive,
  modelProperty: ModelProperty,
  exclude: ExcludeAnnotations = {},
  type: Type = modelProperty.type,
) {
  if (!exclude.validate) {
    if (isUrlProperty(context, modelProperty ?? type)) {
      javaPrimitive.addAnnotation('org.hibernate.validator.constraints.URL');
    }

    if (isEmailProperty(context, modelProperty ?? type)) {
      javaPrimitive.addAnnotation('jakarta.validation.constraints.Email');
    }

    if (isDateProperty(context, modelProperty ?? type)) {
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.isodatetime.IsoDateTime',
        'format = IsoDateTime.Format.ISO_DATE',
      );
    }

    if (isDateTimeProperty(context, modelProperty ?? type)) {
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.isodatetime.IsoDateTime',
        'format = IsoDateTime.Format.ISO_DATE_TIME',
      );
    }

    if (isPasswordProperty(context, modelProperty ?? type)) {
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.password.Password',
      );
    }

    const pattern = getPattern(context.program, modelProperty);
    if (pattern) {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.Pattern',
        `regexp = "${pattern}"`,
      );
    }

    const maxLength = getMaxLength(context.program, modelProperty);
    const minLength = getMinLength(context.program, modelProperty);
    if (maxLength !== undefined && minLength !== undefined) {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.Size',
        `min = ${minLength}, max = ${maxLength}`,
      );
    } else if (maxLength !== undefined) {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.Size',
        `max = ${maxLength}`,
      );
    } else if (minLength !== undefined) {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.Size',
        `min = ${minLength}`,
      );
    }

    const minValue = getMinValue(context.program, modelProperty);
    if (minValue !== undefined) {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.Min',
        `${minValue}`,
      );
    }

    const maxValue = getMaxValue(context.program, modelProperty);
    if (maxValue !== undefined) {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.Max',
        `${maxValue}`,
      );
    }

    if (isStringUnion(type) || isNumberUnion(type)) {
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.validenum.ValidEnum',
        `enumClass = ${pascalCase(modelProperty.name)}Enum.class`,
      );
    }

    const entity = getExpandableEntity(type);
    if (entity) {
      const serviceName = pascalCase(entity.name) + 'Service';
      javaPrimitive.addImport(entity);
      javaPrimitive.addImport(
        getJavaEntityPackageName(context.options.packageName, entity) +
          '.' +
          serviceName,
      );
      javaPrimitive.addImport(
        'no.einnsyn.backend.validation.validationgroups.Insert',
      );
      javaPrimitive.addImport(
        'no.einnsyn.backend.validation.validationgroups.Update',
      );
      javaPrimitive.addImport(
        'no.einnsyn.backend.common.expandablefield.ExpandableField',
      );
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.expandableobject.ExpandableObject',
        `service = ${serviceName}.class, groups = {Insert.class, Update.class}`,
      );
      javaPrimitive.addAnnotation('jakarta.validation.Valid');
    }

    if (isDefaultString(context, modelProperty)) {
      javaPrimitive.addAnnotation('no.einnsyn.backend.validation.nossn.NoSSN');
      if (maxLength === undefined && minLength === undefined) {
        javaPrimitive.addAnnotation(
          'jakarta.validation.constraints.Size',
          'max = 500',
        );
      }
    }
  }

  if (isList(type) && type.kind === 'Model') {
    if (type.indexer !== undefined) {
      javaPrimitive.addImport('java.util.List');
      addAnnotations(
        context,
        javaPrimitive,
        modelProperty,
        exclude,
        type.indexer.value,
      );
    }
    // TODO: Template?
  }

  const isReadOnly = isReadonlyProperty(context.program, modelProperty);
  const value = getDefaultValue(modelProperty);
  if (!exclude.readOnly && isReadOnly && value === undefined) {
    javaPrimitive.addImport(
      'no.einnsyn.backend.validation.validationgroups.Insert',
    );
    javaPrimitive.addImport(
      'no.einnsyn.backend.validation.validationgroups.Update',
    );
    javaPrimitive.addAnnotation(
      'jakarta.validation.constraints.Null',
      'groups = {Insert.class, Update.class}',
    );
  }

  const isRequired = modelProperty.optional === false;
  if (!exclude.required && isRequired && !isReadOnly) {
    javaPrimitive.addImport(
      'no.einnsyn.backend.validation.validationgroups.Insert',
    );
    if (isStringType(context.program, modelProperty.type)) {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.NotBlank',
        'groups = {Insert.class}',
      );
    } else {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.NotNull',
        'groups = {Insert.class}',
      );
    }
  }
}
