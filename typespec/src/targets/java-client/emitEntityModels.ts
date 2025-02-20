import {
  EmitContext,
  emitFile,
  Namespace,
  resolvePath,
} from '@typespec/compiler';
import { buildGeneralModel } from '../../languages/java/helpers/builders.js';
import {
  getJavaModelPackageName,
  getJavaModelPathName,
} from '../../languages/java/helpers/javaHelpers.js';
import { JavaFile } from '../../languages/java/primitives/javafile.js';
import { Props } from '../../types.js';
import { recursivelyGetModels } from '../../utils/getters.js';
import { isEInnsynEntity } from '../../utils/typecheckers.js';

export function emitEntityModels(
  context: EmitContext,
  defaultProps: Props,
  eInnsynNamespace: Namespace,
) {
  const defaultImports = [
    'no.einnsyn.apiclient.common.expandablefield.ExpandableField',
    'java.util.List',
    'java.util.ArrayList',
  ];

  const models = recursivelyGetModels(eInnsynNamespace).filter((model) =>
    isEInnsynEntity(model),
  );

  models.forEach((model) => {
    // Create java file
    const modelPackageName = getJavaModelPackageName(
      defaultProps.packageName,
      model,
    );
    const modelPathName = getJavaModelPathName(defaultProps.packageName, model);
    const modelFile = new JavaFile(modelPackageName);
    modelFile.addImport(...defaultImports);

    // Create model class
    const modelClass = buildGeneralModel({
      ...defaultProps,
      context,
      model: model,
      className: model.name,
      addGetters: true,
      parent: modelFile,
      addConstructors: false,
      addSubModels: true,
    });
    modelFile.addClass(modelClass);

    if (!model.baseModel) {
      modelClass.addImplements('no.einnsyn.apiclient.common.hasid.HasId');
    }

    // Emit file
    emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        `${modelPathName}/${model.name}.java`,
      ),
      content: modelFile.toString(),
    });
  });

  // Emit eInnsyn entity request models
  models
    .filter((model) => isEInnsynEntity(model))
    .forEach((model) => {
      // Create java file
      const modelPackageName = getJavaModelPackageName(
        defaultProps.packageName,
        model,
      );
      const modelPathName = getJavaModelPathName(
        defaultProps.packageName,
        model,
      );
      const modelFile = new JavaFile(modelPackageName);
      modelFile.addImport(...defaultImports);

      // Create request model class
      const modelClass = buildGeneralModel({
        ...defaultProps,
        context,
        model: model,
        className: `${model.name}Request`,
        addBuilder: true,
        addSubModels: true,
        parent: modelFile,
        entitySuffix: 'Request',
        skipReadOnlyProperties: true,
        setDefaultValues: false,
      });
      modelFile.addClass(modelClass);

      // Emit file
      emitFile(context.program, {
        path: resolvePath(
          context.emitterOutputDir,
          `${modelPathName}/${model.name}Request.java`,
        ),
        content: modelFile.toString(),
      });
    });
}
