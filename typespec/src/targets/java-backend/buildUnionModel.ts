import { EmitContext, Union } from '@typespec/compiler';
import { getJavaType } from '../../languages/java/helpers/javaHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import Field from '../../languages/java/primitives/field.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import Method from '../../languages/java/primitives/method.js';
import Parameter from '../../languages/java/primitives/parameter.js';
import { camelCase, pascalCase } from '../../utils/stringutils.js';

export function buildUnionModel(
  context: EmitContext,
  parent: JavaPrimitive | undefined,
  model: Union,
  entityName = model.name ?? 'Unnamed',
): Class {
  const modelClass = new Class(context, parent, entityName);
  //modelClass.setDocumentation(model.documentation);
  modelClass.addAnnotation('lombok.Getter');
  modelClass.addImplements('no.einnsyn.backend.common.hasid.HasId');

  // Add id field
  const allFields = [{ name: 'id', type: 'String' }];
  for (const [a, unionVariant] of model.variants) {
    const type = unionVariant.type;
    if (type.kind === 'Model') {
      allFields.push({
        name: camelCase(type.name.toString()),
        type: getJavaType(type, '', entityName),
      });
    }
  }

  for (const { name, type } of allFields) {
    // Add field variable
    const field = new Field(context, modelClass, name, type);
    field.addAnnotation('jakarta.validation.Valid');
    modelClass.addField(field);

    // Add constructor
    const constructor = new Method(context, modelClass, entityName);
    constructor.addParameter(new Parameter(context, modelClass, name, type));
    constructor.setBody(`this.${name} = ${name};`);
    modelClass.addMethod(constructor);
  }

  // Add checkers for each type
  for (const [, unionVariant] of model.variants) {
    const type = unionVariant.type;
    if (type.kind === 'Model') {
      const fieldName = camelCase(type.name.toString());
      const className = pascalCase(type.name.toString());
      const methodName = `is${className}`;
      const method = new Method(context, modelClass, 'boolean', methodName);
      method.setBody(
        `return ${fieldName} != null || id.startsWith(IdGenerator.getPrefix(${className}.class) + "_");\n`,
      );
      modelClass.addMethod(method);
      modelClass.addImport(type);
      modelClass.addImport('no.einnsyn.backend.utils.idgenerator.IdGenerator');
    }
  }

  return modelClass;
}
