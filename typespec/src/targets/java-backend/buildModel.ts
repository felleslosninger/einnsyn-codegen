import { EmitContext, isTemplateDeclaration, Model } from '@typespec/compiler';
import { addAnnotations } from '../../languages/java/helpers/addAnnotations.js';
import {
  getDefaultValue,
  getJavaType,
  isFinal,
} from '../../languages/java/helpers/modelPropertyHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import Enum from '../../languages/java/primitives/enum.js';
import Field from '../../languages/java/primitives/field.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import { isNumberUnion, isStringUnion } from '../../utils/typeHelpers.js';
import {
  getBodyProperty,
  isEInnsynEntity,
  pascalCase,
} from '../../utils/utils.js';

export function buildModel(
  context: EmitContext,
  parent: JavaPrimitive | undefined,
  model: Model,
  className = model.name,
): Class {
  const isEntityModel = isEInnsynEntity(model);
  const modelClass = new Class(context, parent, className, model.baseModel);
  modelClass.addAnnotation('lombok.Getter');

  // Add import for base model (if any)
  const baseModel = model.baseModel;
  if (baseModel) {
    modelClass.addImport(baseModel);
  }

  // Get properties from @body property if there is one
  const bodyProperty = getBodyProperty(model);
  const properties =
    bodyProperty?.type.kind === 'Model'
      ? bodyProperty.type.properties
      : model.properties;

  // The base entity model should implement HasId
  if (isEntityModel && !model.baseModel) {
    modelClass.addImplements('no.einnsyn.backend.common.hasid.HasId');
    modelClass.addAnnotation('lombok.Setter');
  }

  // Add generics if this is a template declaration
  if (isTemplateDeclaration(model)) {
    // console.log(className);
    // console.log(model.templateMapper);
    // console.log(model.templateNode);
    // console.log(model.node.templateParameters);
    for (const templateParameter of model.node.templateParameters) {
      modelClass.addGeneric(templateParameter.symbol?.name);
    }
  }

  // Make class abstract if this model has derived models
  if (model.derivedModels.length > 0) {
    modelClass.setAbstract(true);
  }

  // Add fields
  for (const modelProperty of properties.values()) {
    const field = new Field(
      context,
      modelClass,
      modelProperty.name,
      getJavaType(modelProperty.type, modelProperty.name),
    );
    if (modelProperty.name === 'items') {
      //console.log(modelProperty);
    }
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

    if (targetModel.kind === 'Model' && !targetModel.name) {
      const subModel = buildModel(
        context,
        modelClass,
        targetModel,
        pascalCase(modelProperty.name),
      );
      modelClass.addClass(subModel);
    }

    // TODO: Add potential sub-model
  }

  return modelClass;
}
