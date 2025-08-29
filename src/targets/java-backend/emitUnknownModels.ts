import {
	type EmitContext,
	emitFile,
	isErrorModel,
	isTemplateDeclaration,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import {
	getJavaModelPackageName,
	getJavaModelPathName,
} from "../../languages/java/helpers/javaHelpers.js";
import { buildGeneralModel } from "../../languages/java/helpers/modelBuilder.js";
import { JavaFile } from "../../languages/java/primitives/javafile.js";
import type { JavaBaseProps } from "../../languages/java/types.js";
import {
	getBodyPropertyType,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";

export function emitUnknownModels(
	context: EmitContext,
	defaultProps: JavaBaseProps,
	eInnsynNamespace: Namespace,
) {
	const defaultImports = [
		"no.einnsyn.backend.common.expandablefield.ExpandableField",
		"java.util.List",
		"java.util.ArrayList",
	];

	const models = recursivelyGetModels(eInnsynNamespace)
		// No entity models:
		.filter((model) => !isEInnsynEntity(model))
		// No generic models:
		.filter((model) => !isTemplateDeclaration(model))
		// No error models
		.filter((model) => !isErrorModel(context.program, model))
		// Don't emit models that has another emitted model as @body
		.filter((model) => {
			const bodyProperty = getBodyPropertyType(model);
			if (bodyProperty?.kind === "Model" && bodyProperty.name) {
				return false;
			}
			return true;
		});

	for (const model of models) {
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
			parent: modelFile,
			addGetters: false,
			addSetters: false,
			addBuilder: false,
			addConstructors: false,
			addSubModels: true,
			validate: true,
			addLombokGetters: true,
			addLombokSetters: true,
			addInlineEnums: true,
		});
		modelFile.addClass(modelClass);

		// Emit file
		emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`${modelPathName}/${model.name}.java`,
			),
			content: modelFile.toString(),
		});
	}
}
