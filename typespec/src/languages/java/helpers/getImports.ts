import { getDependentModels } from '../../../utils/getters.js';
import { BuildModelProps } from './builders.js';
import { getJavaModelPackageName, getModelClassName } from './javaHelpers.js';

type GetImportsProps = BuildModelProps & {};

export function getImports(props: GetImportsProps) {
  const models = getDependentModels(props.model);
  return models
    .filter((model) => !!model.name)
    .map((model) => {
      const className = getModelClassName({
        ...props,
        model,
      });
      return (
        getJavaModelPackageName(props.packageName, model) + '.' + className
      );
    });
}
