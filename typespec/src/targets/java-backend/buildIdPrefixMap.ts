import { EmitContext, Model } from '@typespec/compiler';
import { getExtensions } from '@typespec/openapi';
import Class from '../../languages/java/primitives/class.js';
import Field from '../../languages/java/primitives/field.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import { EmitterOptions } from '../../types.js';

export function buildIdPrefixMap(
  context: EmitContext<EmitterOptions>,
  parent: JavaPrimitive | undefined,
  models: Model[],
) {
  const modelClass = new Class(context, parent, 'IdPrefix');
  modelClass.addImport('java.util.Map');

  const field = new Field(context, modelClass, 'map', 'Map<String, String>');
  field.setFinal(true);
  field.setVisibility('public');
  field.setStatic(true);
  modelClass.addField(field);

  const mapEntries: string[] = [];
  for (const model of models) {
    const modelName = model.name?.toLowerCase();
    const extensions = getExtensions(context.program, model);
    const idPrefix = extensions.get('x-idPrefix');
    if (modelName && idPrefix) {
      mapEntries.push(`Map.entry("${modelName}", "${idPrefix}")`);
    }
  }
  field.setRawValue(`Map.ofEntries(${mapEntries.join(', ')})`);

  return modelClass;
}
