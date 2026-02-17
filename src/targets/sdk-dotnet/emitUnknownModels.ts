import {
	type EmitContext,
	emitFile,
	isErrorModel,
	isTemplateDeclaration,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import {
	getCSharpModelClassName,
	getCSharpModelNamespace,
	getCSharpModelPath,
} from "../../languages/csharp/helpers/csharpHelpers.js";
import { buildModelClass } from "../../languages/csharp/helpers/modelBuilder.js";
import { CSharpFile } from "../../languages/csharp/primitives/csharpFile.js";
import type { CSharpBaseProps } from "../../languages/csharp/types.js";
import {
	getBodyPropertyType,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";
import { OUTPUT_ROOT } from "./variables.js";

export function emitUnknownModels(
	context: EmitContext,
	defaultProps: CSharpBaseProps,
	eInnsynNamespace: Namespace,
) {
	const models = recursivelyGetModels(eInnsynNamespace)
		.filter((model) => !isEInnsynEntity(model))
		.filter((model) => !isTemplateDeclaration(model))
		.filter((model) => !isErrorModel(context.program, model))
		.filter((model) => {
			const bodyProperty = getBodyPropertyType(model);
			if (bodyProperty?.kind === "Model" && bodyProperty.name) {
				return false;
			}
			return true;
		});

	for (const model of models) {
		const className = getCSharpModelClassName({
			...defaultProps,
			model,
		});

		const file = new CSharpFile(
			getCSharpModelNamespace(defaultProps.rootNamespace, model),
		);
		file.addUsing("System");

		const modelClass = buildModelClass({
			...defaultProps,
			parent: file,
			model,
			className,
			requestModel: false,
		});
		file.addMember(modelClass.toString());

		emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`${OUTPUT_ROOT}/${getCSharpModelPath(model)}/${className}.g.cs`,
			),
			content: file.toString(),
		});
	}
}
