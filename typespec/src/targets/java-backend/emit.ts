import {
  EmitContext,
  emitFile,
  Namespace,
  resolvePath,
} from '@typespec/compiler';
import {
  getJavaPackageName,
  getJavaPathName,
} from '../../languages/java/helpers/javaHelpers.js';
import { JavaFile } from '../../languages/java/primitives/javafile.js';
import { buildController } from './buildController.js';
import { buildModel } from './buildModel.js';
import { buildUnionModel } from './buildUnionModel.js';
import {
  getOperationsByNamespace,
  recursivelyGetModels,
} from '../../utils/getters.js';
import {
  isEInnsynEntity,
  isEInnsynEntityUnion,
} from '../../utils/typecheckers.js';
import { pascalCase } from '../../utils/stringutils.js';
import { buildUnionModelTypeAdapter } from './buildUnionModelTypeAdapter.js';

/**
 * Emit DTO models, and controllers for the given namespace
 *
 * @param context
 * @param eInnsynNamespace
 */
export default async function emit(
  context: EmitContext,
  eInnsynNamespace: Namespace,
) {
  // Emit models
  const models = recursivelyGetModels(eInnsynNamespace);
  for (const model of models) {
    // Put entities in their own package, common models in common package
    const packageName = getJavaPackageName(model);
    const pathName = getJavaPathName(model);
    const modelFile = new JavaFile(context, packageName);
    const className = isEInnsynEntity(model) ? model.name + 'DTO' : model.name;
    modelFile.addClass(buildModel(context, modelFile, model, className));

    await emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        `${pathName}/${className}.java`,
      ),
      content: modelFile.toString(),
    });

    // Emit union properties
    for (const [, prop] of model.properties) {
      if (isEInnsynEntityUnion(prop.type) && prop.type.kind === 'Union') {
        const unionClassName = pascalCase(model.name, prop.name);
        const unionModel = prop.type;
        const unionModelFile = new JavaFile(context, packageName);
        unionModelFile.addClass(
          buildUnionModel(context, unionModelFile, unionModel, unionClassName),
        );

        await emitFile(context.program, {
          path: resolvePath(
            context.emitterOutputDir,
            `${pathName}/${unionClassName}.java`,
          ),
          content: unionModelFile.toString(),
        });

        // Create type adapter
        const adapterFile = new JavaFile(context, packageName);
        const typeAdapterClass = adapterFile.addClass(
          buildUnionModelTypeAdapter(
            context,
            adapterFile,
            unionModel,
            unionClassName,
          ),
        );

        await emitFile(context.program, {
          path: resolvePath(
            context.emitterOutputDir,
            `${pathName}/${unionClassName}TypeAdapter.java`,
          ),
          content: adapterFile.toString(),
        });
      }
    }
  }

  // Emit controllers
  const operationsByNamespace = getOperationsByNamespace(
    context.program,
    eInnsynNamespace,
  );
  for (const [namespace, operations] of operationsByNamespace) {
    const packageName = getJavaPackageName(namespace);
    const pathName = getJavaPathName(namespace);

    const controllerFile = new JavaFile(context, packageName);
    controllerFile.addClass(
      buildController(context, controllerFile, namespace.name, operations),
    );

    await emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        pathName + '/' + namespace.name + 'Controller.java',
      ),
      content: controllerFile.toString(),
    });
  }
}
