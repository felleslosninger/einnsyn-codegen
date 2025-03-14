import {
	type EmitContext,
	type Namespace,
	emitFile,
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
import { recursivelyGetModels } from "../../utils/getters.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";

export function emitEntityModels(
	context: EmitContext,
	defaultProps: JavaBaseProps,
	eInnsynNamespace: Namespace,
) {
	const defaultImports = [
		"no.einnsyn.sdk.common.expandablefield.ExpandableField",
		"java.util.List",
		"java.util.ArrayList",
	];

	const models = recursivelyGetModels(eInnsynNamespace).filter((model) =>
		isEInnsynEntity(model),
	);
	//.filter((model) => model.derivedModels.length === 0);

	for (const model of models) {
		// // Subclassing complicates things unnecessarily, so we flatten the model
		// model = getFlattenedModel(model);

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
			stringEnums: false,
			setDefaultValues: false,
		});
		modelFile.addClass(modelClass);

		if (!model.baseModel) {
			modelClass.setExtends("Resource");
			modelClass.addImport("no.einnsyn.sdk.common.entity.Resource");
			modelClass.addImplements("no.einnsyn.sdk.common.entity.HasId");
		}

		// Emit enums
		const enums = getEnums({ ...defaultProps, model: model });
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

	// Emit eInnsyn entity request models
	for (const model of models) {
		// // Subclassing complicates things unnecessarily, so we flatten the model
		// model = getFlattenedModel(model);

		// Create java file
		const modelPackageName = getJavaModelPackageName(
			defaultProps.packageName,
			model,
		);
		const modelPathName = getJavaModelPathName(defaultProps.packageName, model);
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
			entitySuffix: "Request",
			skipReadOnlyProperties: true,
			setDefaultValues: false,
			stringEnums: false,
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
	}
}
