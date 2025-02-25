import {
  EmitContext,
  emitFile,
  Namespace,
  resolvePath,
} from '@typespec/compiler';
import { buildGeneralModel } from '../../languages/java/helpers/modelBuilder.js';
import {
  getJavaModelPackageName,
  getJavaModelPathName,
} from '../../languages/java/helpers/javaHelpers.js';
import { JavaFile } from '../../languages/java/primitives/javafile.js';
import { JavaBaseProps } from '../../languages/java/types.js';
import { recursivelyGetModels } from '../../utils/getters.js';
import { isEInnsynEntity } from '../../utils/typecheckers.js';

export function emitEntityModels(
  context: EmitContext,
  defaultProps: JavaBaseProps,
  eInnsynNamespace: Namespace,
) {
  const defaultImports = [
    'no.einnsyn.backend.common.expandablefield.ExpandableField',
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
      className: model.name + 'DTO',
      parent: modelFile,
      addConstructors: false,
      addSubModels: true,
      addGetters: false,
      addSetters: false,
      addBuilder: false,
      entitySuffix: 'DTO',
      validate: true,
      addLombokGetters: true,
      addLombokSetters: true,
      addInlineEnums: true,
    });
    modelFile.addClass(modelClass);

    if (!model.baseModel) {
      modelClass.addImplements('no.einnsyn.backend.common.hasid.HasId');
    }

    // Emit file
    emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        `${modelPathName}/${model.name}DTO.java`,
      ),
      content: modelFile.toString(),
    });
  });
}
