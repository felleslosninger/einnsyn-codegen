/**
 * Build:
 * - Model (Returned objects)
 * - ModelRequest (Request objects)
 *
 * - RootModel (Root object)
 *
 *
 * Create:
 * alt 1: client.addSaksmappe((b) -> b.setOffentligTittel("foo").addJournalpost(...));
 * alt 2: client.saksmappe().add(b -> b.setOffentligTittel("foo").addJournalpost(...));
 *
 * Iterate:
 * alt 1: client.saksmappe(parameters?).forEach();
 * alt 2: client.saksmappe().list(parameters?).forEach();
 *
 * Get:
 * alt 1: client.saksmappe(id, parameters?);
 * alt 2: client.saksmappe(id).get(parameters?);
 * alt 3: client.saksmappe().get(id, parameters?);
 *
 * Update: *
 * client.saksmappe(id).update(b -> b.setOffentligTittel("foo").addJournalpost(...)) ???
 *
 * Delete:
 * client.saksmappe(id).delete();
 */

import {
  EmitContext,
  emitFile,
  isTemplateDeclaration,
  Namespace,
  resolvePath,
} from '@typespec/compiler';
import {
  getBodyPropertyType,
  recursivelyGetModels,
} from '../../utils/getters.js';
import { isEInnsynEntity } from '../../utils/typecheckers.js';
import {
  getJavaEntityPackageName,
  getJavaEntityPathName,
  getJavaModelPackageName,
  getJavaModelPathName,
  getJavaType,
  JavaTypeOptions,
} from '../../languages/java/helpers/javaHelpers.js';
import { JavaFile } from '../../languages/java/primitives/javafile.js';
import { buildModel } from './buildModel.js';
import { PACKAGE_NAME } from './variables.js';
import { EmitterOptions } from '../../types.js';
import { buildBuildableModel } from './buildBuildableModel.js';

export default async function emit(
  context: EmitContext<EmitterOptions>,
  eInnsynNamespace: Namespace,
) {
  context.options.packageName = PACKAGE_NAME;

  // Emit models
  const models = recursivelyGetModels(eInnsynNamespace);
  for (const model of models) {
    if (!isEInnsynEntity(model)) {
      continue;
    }

    // TypeSpec currently doesn't support emitting generic models
    if (isTemplateDeclaration(model)) {
      continue;
    }
    // Put entities in their own package, common models in common package
    const javaTypeOptions = {
      wrapExpandableFields: true,
      entitySuffix: '',
    };
    const modelPackageName = getJavaEntityPackageName(PACKAGE_NAME, model);
    const modelPathName = getJavaEntityPathName(PACKAGE_NAME, model);
    const modelFile = new JavaFile(context, modelPackageName);
    const className = getJavaType(javaTypeOptions, model);
    modelFile.addClass(
      buildModel(context, modelFile, model, javaTypeOptions, className),
    );

    await emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        `${modelPathName}/${className}.java`,
      ),
      content: modelFile.toString(),
    });
  }

  // Emit request models
  for (const model of models) {
    if (!isEInnsynEntity(model)) {
      continue;
    }

    // Don't emit models that refer to another emitted model
    // const bodyPropertyType = getBodyPropertyType(model);
    // if (
    //   (bodyPropertyType?.kind === 'Model' && bodyPropertyType.name) ||
    //   (bodyPropertyType?.kind === 'TemplateParameter' &&
    //     isEInnsynEntity(bodyPropertyType.constraint?.type))
    // ) {
    //   continue;
    // }

    // // TypeSpec currently doesn't support emitting generic models
    // if (isTemplateDeclaration(model)) {
    //   continue;
    // }

    // Put entities in their own package, common models in common package
    const requestJavaTypeOptions: JavaTypeOptions = {
      wrapExpandableFields: false,
      entitySuffix: 'Request',
    };
    const modelPackageName = getJavaEntityPackageName(PACKAGE_NAME, model);
    const modelPathName = getJavaEntityPathName(PACKAGE_NAME, model);
    const modelFile = new JavaFile(context, modelPackageName);
    const className = `${getJavaType(requestJavaTypeOptions, model)}`;
    modelFile.addClass(
      buildBuildableModel(
        context,
        modelFile,
        model,
        requestJavaTypeOptions,
        className,
      ),
    );

    await emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        `${modelPathName}/${className}.java`,
      ),
      content: modelFile.toString(),
    });
  }
}
