import {
	type EmitContext,
	emitFile,
	isErrorModel,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import type { TSProps } from "../../languages/typescript/types.js";
import { TSFile } from "../../languages/typescript/primitives/tsFile.js";
import TSClass from "../../languages/typescript/primitives/tsClass.js";
import {
	getBodyPropertyType,
	recursivelyGetModels,
} from "../../utils/getters.js";
import {
	getTSEntityPathName,
	getTSModelClassName,
} from "../../languages/typescript/helpers/tsHelpers.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";

export function emitTypes(
	context: EmitContext,
	defaultProps: TSProps,
	eInnsynNamespace: Namespace,
) {
	const pathName = ".";
	const file = new TSFile(pathName);
	const clientBaseClass = new TSClass(file, "EInnsynClientBase");
	file.addClass({
		clazz: clientBaseClass,
		isExported: true,
	});

	// Export all entity types
	const models = recursivelyGetModels(eInnsynNamespace)
		// Don't emit "wrappers" with a @body parameter:
		.filter((model) => !getBodyPropertyType(model));
	for (const model of models) {
		const modelName = getTSModelClassName({ ...defaultProps, model });
		const pathName = getTSEntityPathName(model);
		const importPath = isErrorModel(context.program, model)
			? "./common/error/EInnsynError"
			: `./${pathName}/${modelName}`;

		// Export model
		const isError = isErrorModel(context.program, model);
		file.addExportFrom(importPath, [{ name: modelName, isType: !isError }]);

		if (isEInnsynEntity(model)) {
			// Export isModel and Request model for entities
			file.addExportFrom(importPath, [
				{ name: `${modelName}Request`, isType: true },
				{ name: `is${modelName}`, isType: false },
			]);
		}
	}

	// Emit file
	emitFile(context.program, {
		path: resolvePath(context.emitterOutputDir, "sdk-typescript/typeUtils.ts"),
		content: file.toString(),
	});
}
