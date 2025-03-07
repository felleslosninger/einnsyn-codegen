import {
	type EmitContext,
	type Namespace,
	emitFile,
	isErrorModel,
	isTemplateDeclaration,
	resolvePath,
} from "@typespec/compiler";
import { getTSTypeName } from "../../languages/typescript/helpers/getTSTypeName.js";
import { getTypeDefinition } from "../../languages/typescript/helpers/getTypeDefinition.js";
import {
	getTSEntityPathName,
	getTSModelClassName,
} from "../../languages/typescript/helpers/tsHelpers.js";
import { TSFile } from "../../languages/typescript/primitives/tsFile.js";
import TSInterface from "../../languages/typescript/primitives/tsInterface.js";
import type { TSProps } from "../../languages/typescript/types.js";
import {
	getBodyPropertyType,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";

export function emitUnknownModels(
	context: EmitContext,
	defaultProps: TSProps,
	eInnsynNamespace: Namespace,
) {
	const models = recursivelyGetModels(eInnsynNamespace)
		// No entity models:
		.filter((model) => !isEInnsynEntity(model))
		// No generic models:
		.filter((model) => !isTemplateDeclaration(model))
		// No error models
		.filter((model) => !isErrorModel(context.program, model))
		// Don't emit "wrappers" with a @body parameter:
		.filter((model) => !getBodyPropertyType(model));

	for (const model of models) {
		// Create java file
		const className = getTSModelClassName({
			...defaultProps,
			model,
		});
		const modelPathName = `${getTSEntityPathName(model)}/${className}`;
		const modelFile = new TSFile(modelPathName);

		// Add entity interface
		const int = new TSInterface(modelFile, className);
		int.typeDefinition = getTypeDefinition({
			...defaultProps,
			parent: int,
			model,
		});

		if (model.baseModel) {
			const [baseType, baseImports] = getTSTypeName({
				...defaultProps,
				type: model.baseModel,
			});
			int.addImport(...baseImports);
			int.addExtends(baseType);
		}
		modelFile.addInterface({ int, isExported: true });

		// Emit file
		emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`typescript-client/${modelPathName}.ts`,
			),
			content: modelFile.toString(),
		});
	}
}
