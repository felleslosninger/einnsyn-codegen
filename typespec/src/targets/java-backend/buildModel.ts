import {
  EmitContext,
  getDoc,
  isTemplateDeclaration,
  Model,
} from '@typespec/compiler';
import { addAnnotations } from '../../languages/java/helpers/addAnnotations.js';
import { getJavaType } from '../../languages/java/helpers/javaHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import Enum from '../../languages/java/primitives/enum.js';
import Field from '../../languages/java/primitives/field.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import { getBodyPropertyModel, getDefaultValue } from '../../utils/getters.js';
import { pascalCase } from '../../utils/stringutils.js';
import {
  isEInnsynEntity,
  isFinal,
  isNumberUnion,
  isStringUnion,
} from '../../utils/typecheckers.js';

export function buildModel(
  context: EmitContext,
  parent: JavaPrimitive | undefined,
  model: Model,
  className = model.name,
): Class {
  const isEntityModel = isEInnsynEntity(model);
  const modelClass = new Class(context, parent, className, model.baseModel);
  const entityName = model.name;
  modelClass.setDocumentation(getDoc(context.program, model));
  modelClass.addAnnotation('lombok.Getter');
  modelClass.addAnnotation('lombok.Setter');

  // Add import for base model (if any)
  const baseModel = model.baseModel;
  if (baseModel) {
    modelClass.addImport(baseModel);
  }

  // Get properties from @body property if there is one
  const targetModel = getBodyPropertyModel(model) ?? model;
  const properties = targetModel.properties;

  // The base entity model should implement HasId
  if (isEntityModel && !model.baseModel) {
    modelClass.addImplements('no.einnsyn.backend.common.hasid.HasId');
  }

  // Add generics if this is a template declaration
  // (currently not supported by TypeSpec?)
  if (isTemplateDeclaration(model)) {
    for (const templateParameter of model.node.templateParameters) {
      modelClass.addGeneric(templateParameter.symbol?.name);
    }
  }

  // Add fields
  for (const modelProperty of properties.values()) {
    const rawType = getJavaType(
      modelProperty.type,
      modelProperty.name,
      entityName,
    );
    const propertyType = isEInnsynEntity(modelProperty.type)
      ? `ExpandableField<${rawType}>`
      : rawType;
    const field = new Field(
      context,
      modelClass,
      modelProperty.name,
      propertyType,
    );
    field.setDocumentation(getDoc(context.program, modelProperty));
    addAnnotations(context, field, modelProperty);
    field.setFinal(isFinal(modelProperty));
    field.setValue(getDefaultValue(modelProperty));
    modelClass.addField(field);

    // Add enum if this is a union of strings or numbers
    if (
      isStringUnion(modelProperty.type) ||
      isNumberUnion(modelProperty.type)
    ) {
      const enumObj = new Enum(
        context,
        modelClass,
        pascalCase(modelProperty.name + 'Enum'),
      );
      for (const [key, variant] of modelProperty.type.variants) {
        if (variant.type.kind === 'String') {
          enumObj.addValue(variant.type.value);
        }
        if (variant.type.kind === 'Number') {
          enumObj.addValue(variant.type.value.toString());
        }
      }
      modelClass.addEnum(enumObj);
    }

    // If this is an array / map, use the target model
    const targetModel =
      modelProperty.type.kind === 'Model' && modelProperty.type.indexer
        ? modelProperty.type.indexer.value
        : modelProperty.type;

    // Create sub model if this is a model without a name
    if (targetModel.kind === 'Model' && !targetModel.name) {
      const subModel = buildModel(
        context,
        modelClass,
        targetModel,
        pascalCase(modelProperty.name),
      );
      modelClass.addClass(subModel);
    }
  }

  return modelClass;
}
