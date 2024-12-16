import {
  EmitContext,
  emitFile,
  ignoreDiagnostics,
  Model,
  Namespace,
  Program,
  resolvePath,
} from '@typespec/compiler';
import {
  getAllHttpServices,
  getHttpOperation,
  HttpOperation,
} from '@typespec/http';
import {
  getJavaPackageName,
  getJavaPathName,
} from './languages/java/helpers/modelPropertyHelpers.js';
import { JavaFile } from './languages/java/primitives/javafile.js';
import { buildController } from './targets/java-backend/buildController.js';
import { buildModel } from './targets/java-backend/buildModel.js';
import { isEInnsynEntity } from './utils/utils.js';

export async function $onEmit(context: EmitContext) {
  if (context.program.compilerOptions.noEmit) {
    return;
  }

  const program = context.program;
  const [httpService] = ignoreDiagnostics(getAllHttpServices(program)).filter(
    (s) => s.namespace.name === 'EInnsyn',
  );

  const eInnsynNamespace = httpService.namespace;
  if (!eInnsynNamespace) {
    return;
  }

  // Emit models
  await processModels(eInnsynNamespace, async (model) => {
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

    // Emit enums / sub-models
  });

  // Emit controllers
  await processOperationsByNamespace(
    program,
    eInnsynNamespace,
    async (namespace, operations) => {
      const packageName = getJavaPackageName(namespace);
      const pathName = getJavaPathName(namespace);

      const controllerFile = new JavaFile(context, packageName);
      controllerFile.addClass(
        buildController(context, controllerFile, namespace.name, operations),
      );

      await emitFile(program, {
        path: resolvePath(
          context.emitterOutputDir,
          pathName + '/' + namespace.name + 'Controller.java',
        ),
        content: controllerFile.toString(),
      });
    },
  );
}

const processModels = async (
  namespace: Namespace,
  callback: (model: Model) => Promise<void>,
) => {
  for (const [key, model] of namespace.models) {
    await callback(model);
  }

  for (const [nsName, ns] of namespace.namespaces) {
    await processModels(ns, callback);
  }
};

const processOperationsByNamespace = async (
  program: Program,
  namespace: Namespace,
  callback: (
    namespace: Namespace,
    operations: HttpOperation[],
  ) => Promise<void>,
) => {
  const httpOperations: HttpOperation[] = [];

  // Operations on namespace
  for (const [, operation] of namespace.operations) {
    if (!operation.isFinished) {
      continue;
    }
    const httpOperation = ignoreDiagnostics(
      getHttpOperation(program, operation),
    );
    httpOperations.push(httpOperation);
  }

  // Operations in interface
  for (const [, int] of namespace.interfaces) {
    for (const [, operation] of int.operations) {
      if (!operation.isFinished) {
        continue;
      }
      const httpOperation = ignoreDiagnostics(
        getHttpOperation(program, operation),
      );
      httpOperations.push(httpOperation);
    }
  }

  if (httpOperations.length > 0) {
    await callback(namespace, httpOperations);
  }

  // Recurse namespaces
  for (const [nsName, ns] of namespace.namespaces) {
    await processOperationsByNamespace(program, ns, callback);
  }
};
