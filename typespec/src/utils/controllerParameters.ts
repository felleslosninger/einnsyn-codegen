import { Model } from '@typespec/compiler';
import { HttpOperationParameter } from '@typespec/http';

/**
 * A parameter model represents a model (class) with multiple parameters, i.e. ListParameters, GetParameters etc.
 */
type ParameterModel = {
  model: Model | undefined;
  params: HttpOperationParameter[];
};

/**
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

type ExtendedParameterModel = {
  name: string;
  extend: Model | undefined;
  params: HttpOperationParameter[];
};

export function getExtendedParameterModel(
  parameters: HttpOperationParameter[],
  defaultName = 'Parameters',
): ExtendedParameterModel | undefined {
  const allModels = getParameterModels(parameters);

  // No parameters found
  if (allModels.length === 0) {
    return undefined;
  }

  // We don't need to create a new model
  if (allModels.length === 1 && allModels[0].model) {
    return {
      name: allModels[0].model.name,
      extend: allModels[0].model,
      params: [],
    };
  }

  // If we have an extendable model, extend it
  if (allModels[0].model) {
    const remainingModels = allModels.slice(1);
    const remainingParameters = remainingModels.reduce(
      (acc, cur) => acc.concat(cur.params),
      [] as HttpOperationParameter[],
    );
    return {
      name: defaultName,
      extend: allModels[0].model,
      params: remainingParameters,
    };
  }

  // We don't have an extendable model, create a new one with all parameters
  const allParameters = allModels.reduce(
    (acc, cur) => acc.concat(cur.params),
    [] as HttpOperationParameter[],
  );

  return {
    name: defaultName,
    extend: undefined,
    params: allParameters,
  };
}
