import { EmitContext, getDoc, Model } from '@typespec/compiler';
import Class from '../../languages/java/primitives/class.js';
import { isEInnsynEntity } from '../../utils/typecheckers.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import { EmitterOptions } from '../../types.js';
import Field from '../../languages/java/primitives/field.js';
import Method from '../../languages/java/primitives/method.js';
import { pascalCase } from '../../utils/stringutils.js';
import Parameter from '../../languages/java/primitives/parameter.js';
import {
  getJavaType,
  JavaTypeOptions,
} from '../../languages/java/helpers/javaHelpers.js';

export function buildModel(
  context: EmitContext<EmitterOptions>,
  parent: JavaPrimitive | undefined,
  model: Model,
  javaTypeOptions: JavaTypeOptions,
  className = model.name,
): Class {
  const isEntityModel = isEInnsynEntity(model);
  const modelClass = new Class(context, parent, className, model.baseModel);
  const entityName = model.name;
  modelClass.setDocumentation(getDoc(context.program, model));

  // Add properties
  const properties = model.properties;
  for (const property of properties.values()) {
    const rawType = getJavaType(
      javaTypeOptions,
      property.type,
      property.name,
      entityName,
    );

    // Add field variable
    const field = new Field(context, modelClass, property.name, rawType);
    field.setVisibility('private');
    field.setDocumentation(getDoc(context.program, property));
    modelClass.addField(field);

    // Add getter
    const getter = new Method(
      context,
      modelClass,
      rawType,
      'get' + pascalCase(property.name),
    );
    getter.setBody(`return ${property.name};`);
    getter.setDocumentation(getDoc(context.program, property));
    modelClass.addMethod(getter);
  }

  return modelClass;
}
