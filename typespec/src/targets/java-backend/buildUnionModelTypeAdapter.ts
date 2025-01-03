import { EmitContext, Union } from '@typespec/compiler';
import { getJavaType } from '../../languages/java/helpers/javaHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import Method from '../../languages/java/primitives/method.js';
import Parameter from '../../languages/java/primitives/parameter.js';

export function buildUnionModelTypeAdapter(
  context: EmitContext,
  parent: JavaPrimitive | undefined,
  model: Union,
  entityName = model.name ?? 'Unnamed',
): Class {
  const className = `${entityName}TypeAdapter`;

  const modelClass = new Class(context, parent, className);
  modelClass.addAnnotation(
    'org.springframework.context.annotation.Configuration',
  );
  modelClass.addImport(
    'org.springframework.boot.autoconfigure.gson.GsonBuilderCustomizer',
    'com.google.gson.JsonDeserializationContext',
    'com.google.gson.JsonDeserializer',
    'com.google.gson.JsonElement',
    'com.google.gson.JsonParseException',
    'com.google.gson.JsonPrimitive',
    'com.google.gson.JsonSerializationContext',
    'java.lang.reflect.Type',
  );

  const properties: { name: string; type: string }[] = [];
  for (const [a, unionVariant] of model.variants) {
    const type = unionVariant.type;
    if (type.kind === 'Model') {
      const entityName = type.name;
      const javaType = getJavaType(type, '', entityName);
      properties.push({
        name: entityName,
        type: javaType,
      });
      modelClass.addImport(type);
    }
  }

  // Add GsonBuilderCustomizer
  const beanMethod = new Method(
    context,
    modelClass,
    'GsonBuilderCustomizer',
    `register${entityName}TypeAdapter`,
  );
  beanMethod.addAnnotation('org.springframework.context.annotation.Bean');
  beanMethod.setBody(
    [
      `return builder -> {`,
      `builder.registerTypeAdapter(${entityName}.class, new Serializer());`,
      `builder.registerTypeAdapter(${entityName}.class, new Deserializer());`,
      `};`,
    ].join('\n'),
  );
  modelClass.addMethod(beanMethod);

  // Add Serializer
  const serializer = new Class(context, modelClass, 'Serializer');
  modelClass.addClass(serializer);
  serializer.addImplements(
    'com.google.gson.JsonSerializer<' + entityName + '>',
  );

  const serializeMethod = new Method(
    context,
    serializer,
    'JsonElement',
    'serialize',
  );
  serializer.addMethod(serializeMethod);
  serializeMethod.addAnnotation('@Override');
  serializeMethod.addParameter(
    new Parameter(context, serializer, 'src', entityName),
  );
  serializeMethod.addParameter(
    new Parameter(context, serializer, 'typeOfSrc', 'Type'),
  );
  serializeMethod.addParameter(
    new Parameter(context, serializer, 'context', 'JsonSerializationContext'),
  );
  let serializerBody: string[] = [];
  for (const { name, type } of properties) {
    serializerBody.push(`if (src.get${name}() != null) {`);
    serializerBody.push(
      `  return context.serialize(src.get${name}(), ${type}.class);`,
    );
    serializerBody.push(`}`);
  }
  serializerBody.push(`return new JsonPrimitive(src.getId());`);
  serializeMethod.setBody(serializerBody.join('\n'));

  // Add Deserializer
  const deserializer = new Class(context, modelClass, 'Deserializer');
  modelClass.addClass(deserializer);
  deserializer.addImplements(
    'com.google.gson.JsonDeserializer<' + entityName + '>',
  );

  const deserializeMethod = new Method(
    context,
    deserializer,
    entityName,
    'deserialize',
  );
  deserializer.addMethod(deserializeMethod);
  deserializeMethod.addAnnotation('@Override');
  deserializeMethod.addParameter(
    new Parameter(context, deserializer, 'json', 'JsonElement'),
  );
  deserializeMethod.addParameter(
    new Parameter(context, deserializer, 'typeOfT', 'Type'),
  );
  deserializeMethod.addParameter(
    new Parameter(
      context,
      deserializer,
      'context',
      'JsonDeserializationContext',
    ),
  );
  //let deserializerBody = '';
  let deserializerBody: string[] = [];
  deserializerBody.push(`if (json.isJsonNull()) {`);
  deserializerBody.push(`  return null;`);
  deserializerBody.push(`}`);
  deserializerBody.push('');
  deserializerBody.push(`if (json.isJsonPrimitive()) {`);
  deserializerBody.push(`  var jsonPrimitive = json.getAsJsonPrimitive();`);
  deserializerBody.push(`  if (jsonPrimitive.isString()) {`);
  deserializerBody.push(
    `    return new ${entityName}(jsonPrimitive.getAsString());`,
  );
  deserializerBody.push(`  }`);
  deserializerBody.push(`}`);
  deserializerBody.push('');
  deserializerBody.push(`if (json.isJsonObject()) {`);
  deserializerBody.push(`  var jsonObject = json.getAsJsonObject();`);
  deserializerBody.push(
    `  var entity = jsonObject.get("entity").getAsString();`,
  );
  deserializerBody.push(`  switch (entity) {`);
  for (const { name, type } of properties) {
    deserializerBody.push(`    case "${name}":`);
    deserializerBody.push(
      `      ${type} ${name} = context.deserialize(jsonObject, ${type}.class);`,
    );
    deserializerBody.push(`      return new ${entityName}(${name});`);
  }
  deserializerBody.push(`  }`);
  deserializerBody.push(`}`);
  deserializerBody.push('');
  deserializerBody.push(
    `throw new JsonParseException("Cannot deserialize ${entityName} " + json);`,
  );
  deserializeMethod.setBody(deserializerBody.join('\n'));

  return modelClass;
}
