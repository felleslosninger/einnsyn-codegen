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
import {
	buildGeneralModel,
	getEnums,
} from "../../languages/java/helpers/modelBuilder.js";
import { JavaFile } from "../../languages/java/primitives/javafile.js";
import type { JavaBaseProps } from "../../languages/java/types.js";
import {
	getBodyPropertyType,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { getFlattenedModel } from "../../utils/modelUtils.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";

export function emitUnknownModels(
	context: EmitContext,
	defaultProps: JavaBaseProps,
	eInnsynNamespace: Namespace,
) {
	const defaultImports = [
		"no.einnsyn.sdk.common.expandablefield.ExpandableField",
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
		// Inheritance complicates things unnecessarily, so we flatten the model
		const flattenedModel = getFlattenedModel(model);

		// Create java file
		const modelPackageName = getJavaModelPackageName(
			defaultProps.packageName,
			flattenedModel,
		);
		const modelPathName = getJavaModelPathName(
			defaultProps.packageName,
			flattenedModel,
		);
		const modelFile = new JavaFile(modelPackageName);
		modelFile.addImport(...defaultImports);

		// Create model class
		const modelClass = buildGeneralModel({
			...defaultProps,
			context,
			model: flattenedModel,
			className: flattenedModel.name,
			addGetters: true,
			addBuilder: true,
			parent: modelFile,
			addConstructors: true,
			addSubModels: true,
			stringEnums: false,
			setDefaultValues: false,
		});
		modelFile.addClass(modelClass);

		// Emit enums
		const enums = getEnums({ ...defaultProps, model: flattenedModel });
		for (const e of enums) {
			const enumFile = new JavaFile(modelPackageName);
			// hack, since the JavaFile (parent) is made after the Enum (child):
			enumFile.addImport("com.google.gson.annotations.SerializedName");
			enumFile.addEnum(e);
			emitFile(context.program, {
				path: resolvePath(
					context.emitterOutputDir,
					`${modelPathName}/${e.getName()}.java`,
				),
				content: enumFile.toString(),
			});
		}

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
