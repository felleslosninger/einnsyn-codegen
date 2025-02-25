import {
  DecoratorApplication,
  Model,
  ModelProperty,
  ProjectionStatementNode,
  SourceModel,
} from '@typespec/compiler';
import { createRekeyableMap } from '@typespec/compiler/utils';
import { HttpOperationParameter } from '@typespec/http';
import { JavaProps } from '../languages/java/types.js';

/**
 * A parameter model represents a model (class) with multiple parameters, i.e. ListParameters, GetParameters etc.
 */
type ParameterModel = {
  model: Model | undefined;
  params: HttpOperationParameter[];
};

/**
 * Group the given parameters by their source model. If a parameter has no source model,
 * it will be grouped with other parameters with no source model.
 *
 * @param httpOperation
 */
function getParameterModels(
  parameters: HttpOperationParameter[],
): ParameterModel[] {
  const parameterModels: ParameterModel[] = [];
  for (const queryParameter of parameters) {
    const sourceModel = queryParameter.param.sourceProperty?.model;

    // Check if this sourceModel is already found
    const foundObject = parameterModels.find((f) => f.model === sourceModel);
    if (foundObject) {
      foundObject.params.push(queryParameter);
      continue;
    }

    // Check if this sourceModel extends a previously found model
    const foundModel = parameterModels.find((f) => {
      let baseModel = sourceModel;
      while (baseModel) {
        if (baseModel === f.model) {
          return true;
        }
        baseModel = baseModel.baseModel;
      }
    });
    if (foundModel) {
      foundModel.params.push(queryParameter);
      continue;
    }

    // Check if this sourceModel is extended by a previously found model
    const foundSubclass = parameterModels.find((f) => {
      let baseModel = f.model;
      while (baseModel) {
        if (baseModel === sourceModel) {
          return true;
        }
        baseModel = baseModel.baseModel;
      }
    });
    if (foundSubclass) {
      foundSubclass.params.push(queryParameter);
      continue;
    }

    // Create a new object
    parameterModels.push({
      model: sourceModel,
      params: [queryParameter],
    });
  }

  // Sort the objects by which has a source model and the number of parameters, to determine which is most feasible to extend
  parameterModels.sort((a, b) => {
    if (a.model && !b.model) {
      return -1;
    }
    if (!a.model && b.model) {
      return 1;
    }
    return a.params.length - b.params.length;
  });

  return parameterModels;
}

/**
 * Given a list of parameters, return the model with the most common parameters together with the remaining parameters.
 * @param props
 * @returns
 */
export function getExtendedParameterModel(
  props: JavaProps & {
    parameters: HttpOperationParameter[];
  },
): [
  extendsModel: Model | undefined,
  remainingParameters: HttpOperationParameter[],
] {
  const { parameters } = props;
  const allModels = getParameterModels(parameters);

  // No parameters found
  if (allModels.length === 0) {
    return [undefined, []];
  }

  // If we have an extendable model, extend it
  if (allModels[0]?.model) {
    const model = allModels[0].model;

    const remainingModels = allModels.slice(1);
    const remainingParameters = remainingModels.reduce(
      (acc, cur) => acc.concat(cur.params),
      [] as HttpOperationParameter[],
    );
    return [model, remainingParameters];
  }

  // We don't have an extendable model, create a new one with all parameters
  const allParameters = allModels.reduce(
    (acc, cur) => acc.concat(cur.params),
    [] as HttpOperationParameter[],
  );

  return [undefined, allParameters];
}

/**
 * Create a Model from a name, base model and parameters.
 */
export function createParameterModel(props: {
  name: string;
  parameters: HttpOperationParameter[];
  baseModel?: Model;
  derivedModels?: Model[];
  sourceModels?: SourceModel[];
  projections?: ProjectionStatementNode[];
  decorators?: DecoratorApplication[];
}): Model {
  const modelProperties: ModelProperty[] = props.parameters.map(
    (parameter) => parameter.param,
  );

  const model: Model = {
    kind: 'Model',
    entityKind: 'Type',
    name: props.name,
    baseModel: props.baseModel,
    derivedModels: props.derivedModels ?? [],
    sourceModels: props.sourceModels ?? [],
    projections: props.projections ?? [],
    decorators: props.decorators ?? [],
    projectionsByName: (name: string) => [],
    isFinished: true,
    properties: createRekeyableMap(modelProperties.map((p) => [p.name, p])),
  };

  return model;
}
