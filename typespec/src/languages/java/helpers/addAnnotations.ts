import {
  EmitContext,
  getMaxLength,
  getMinLength,
  getMinValue,
  getPattern,
  isStringType,
  ModelProperty,
  Type,
} from '@typespec/compiler';
import { isReadonlyProperty } from '@typespec/openapi';
import {
  isDate,
  isDateTime,
  isDefaultString,
  isEInnsynId,
  isEmail,
  isList,
  isNumberUnion,
  isStringUnion,
  isUrl,
} from '../../../utils/typecheckers.js';
import JavaPrimitive from '../primitives/javaprimitive.js';
import { getExpandableEntity } from '../../../utils/getters.js';
import { getJavaPackageName } from './javaHelpers.js';
import { pascalCase } from '../../../utils/stringutils.js';

type ExcludeAnnotations = {
  validate?: boolean;
  readOnly?: boolean;
  required?: boolean;
};

export function addAnnotations(
  context: EmitContext,
  javaPrimitive: JavaPrimitive,
  modelProperty: ModelProperty,
  exclude: ExcludeAnnotations = {},
  type: Type = modelProperty.type,
) {
  if (!exclude.validate) {
    if (isUrl(context, type)) {
      javaPrimitive.addAnnotation('org.hibernate.validator.constraints.URL');
    }

    if (isEmail(context, type)) {
      javaPrimitive.addAnnotation('jakarta.validation.constraints.Email');
    }

    if (isDate(context, type)) {
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.isodatetime.IsoDate',
        'format = IsoDate.Format.ISO_DATE',
      );
    }

    if (isDateTime(context, type)) {
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.isodatetime.IsoDateTime',
        'format = IsoDateTime.Format.ISO_DATE_TIME',
      );
    }

    if (isEInnsynId(type)) {
      // Detect entity type from template argument
      const generic = type.templateMapper?.args[0];
      const entityModel =
        generic?.entityKind === 'Type' && generic.kind === 'Model' && generic;
      if (entityModel) {
        const serviceName = pascalCase(entityModel.name) + 'Service';
        javaPrimitive.addImport(
          getJavaPackageName(entityModel) + '.' + serviceName,
        );
        javaPrimitive.addAnnotation(
          'no.einnsyn.backend.validation.expandableobject.ExpandableObject',
          `service = ${serviceName}.class, mustExist = true`,
        );
      }
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

    const maxValue = getMaxLength(context.program, modelProperty);
    if (maxValue !== undefined) {
      javaPrimitive.addAnnotation(
        'jakarta.validation.constraints.Max',
        `${maxValue}`,
      );
    }

    if (isStringUnion(type) || isNumberUnion(type)) {
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.validenum.ValidEnum',
        `enumClass = {${pascalCase(modelProperty.name)}Enum.class}`,
      );
    }

    const entity = getExpandableEntity(modelProperty.type);
    if (entity) {
      const serviceName = pascalCase(entity.name) + 'Service';
      javaPrimitive.addImport(getJavaPackageName(entity) + '.' + serviceName);
      javaPrimitive.addImport(
        'no.einnsyn.backend.validation.validationgroups.Insert',
      );
      javaPrimitive.addImport(
        'no.einnsyn.backend.validation.validationgroups.Update',
      );
      javaPrimitive.addAnnotation('jakarta.validation.Valid');
      javaPrimitive.addAnnotation(
        'no.einnsyn.backend.validation.expandableobject.ExpandableObject',
        `service = ${serviceName}.class, groups = {Insert.class, Update.class}`,
      );
    }

    if (isDefaultString(context, type)) {
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
  if (!exclude.readOnly && isReadOnly) {
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
