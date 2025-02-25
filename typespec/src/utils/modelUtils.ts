import { Model, ModelProperty } from '@typespec/compiler';
import { createRekeyableMap } from '@typespec/compiler/utils';

export function getFlattenedModel(model: Model): Model {
  const ancestors: Model[] = [];

  let baseModel: Model | undefined = model;
  while (baseModel) {
    ancestors.push(baseModel);
    baseModel = baseModel.baseModel;
  }

  // Iterate bottom-up
  const modelProperties: ModelProperty[] = [];
  ancestors
    .reverse()
    .forEach((ancestor) =>
      modelProperties.push(...ancestor.properties.values()),
    );

  const flattenedModel: Model = {
    kind: 'Model',
    entityKind: 'Type',
    name: model.name,
    derivedModels: [],
    sourceModels: [],
    projections: [],
    decorators: model.decorators ?? [],
    projectionsByName: (name: string) => [],
    isFinished: true,
    properties: createRekeyableMap(modelProperties.map((p) => [p.name, p])),
  };

  return flattenedModel;
}

export function cloneModel(model: Model) {
  return {
    ...model,
    properties: createRekeyableMap(
      Array.from(model.properties.values()).map((p) => [
        p.name,
        { ...p, decorators: [...p.decorators] },
      ]),
    ),
  };
}
