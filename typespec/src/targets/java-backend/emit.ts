import {
  EmitContext,
  emitFile,
  isTemplateDeclaration,
  Namespace,
  resolvePath,
} from '@typespec/compiler';
import {
  getJavaEntityPackageName,
  getJavaEntityPathName,
  getJavaModelPackageName,
  getJavaModelPathName,
  getJavaType,
} from '../../languages/java/helpers/javaHelpers.js';
import { JavaFile } from '../../languages/java/primitives/javafile.js';
import {
  getBodyPropertyType,
  getOperationsByNamespace,
  recursivelyGetModels,
} from '../../utils/getters.js';
import { pascalCase } from '../../utils/stringutils.js';
import {
  isEInnsynEntity,
  isEInnsynEntityUnion,
} from '../../utils/typecheckers.js';
import { buildController } from './buildController.js';
import { buildIdPrefixMap } from './buildIdPrefixMap.js';
import { buildModel } from './buildModel.js';
import { buildUnionModel } from './buildUnionModel.js';
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
    // Don't emit models that refer to another emitted model
    const bodyPropertyType = getBodyPropertyType(model);
    if (
      (bodyPropertyType?.kind === 'Model' && bodyPropertyType.name) ||
      (bodyPropertyType?.kind === 'TemplateParameter' &&
        isEInnsynEntity(bodyPropertyType.constraint?.type))
    ) {
      continue;
    }

    // TypeSpec currently doesn't support emitting generic models
    if (isTemplateDeclaration(model)) {
      continue;
    }

    // Put entities in their own package, common models in common package
    const modelPackageName = getJavaModelPackageName(model);
    const modelPathName = getJavaModelPathName(model);
    const modelFile = new JavaFile(context, modelPackageName);
    const className = getJavaType(model);
    modelFile.addClass(buildModel(context, modelFile, model, className));

    await emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        `${modelPathName}/${className}.java`,
      ),
      content: modelFile.toString(),
    });

    // Emit union properties
    for (const [, prop] of model.properties) {
      if (isEInnsynEntityUnion(prop.type) && prop.type.kind === 'Union') {
        const unionClassName = pascalCase(model.name, prop.name);
        const unionModel = prop.type;
        const unionModelFile = new JavaFile(context, modelPackageName);
        unionModelFile.addClass(
          buildUnionModel(context, unionModelFile, unionModel, unionClassName),
        );

        await emitFile(context.program, {
          path: resolvePath(
            context.emitterOutputDir,
            `${modelPathName}/${unionClassName}.java`,
          ),
          content: unionModelFile.toString(),
        });

        // Create type adapter
        const adapterFile = new JavaFile(context, modelPackageName);
        adapterFile.addClass(
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
            `${modelPathName}/${unionClassName}TypeAdapter.java`,
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
    const packageName = getJavaEntityPackageName(namespace);
    const pathName = getJavaEntityPathName(namespace);

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

  // Emit ID prefix map
  const packageName = 'no.einnsyn.backend.utils.idgenerator';
  const idPrefixFile = new JavaFile(context, packageName);
  idPrefixFile.addClass(buildIdPrefixMap(context, idPrefixFile, models));
  await emitFile(context.program, {
    path: resolvePath(
      context.emitterOutputDir,
      'no/einnsyn/backend/utils/idgenerator/IdPrefix.java',
    ),
    content: idPrefixFile.toString(),
  });
}
