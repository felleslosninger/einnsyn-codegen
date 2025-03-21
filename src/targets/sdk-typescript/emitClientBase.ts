import {
	type EmitContext,
	type Namespace,
	emitFile,
	isErrorModel,
	resolvePath,
} from "@typespec/compiler";
import {
	getTSEntityPathName,
	getTSModelClassName,
} from "../../languages/typescript/helpers/tsHelpers.js";
import TSClass from "../../languages/typescript/primitives/tsClass.js";
import { TSFile } from "../../languages/typescript/primitives/tsFile.js";
import TSFunction from "../../languages/typescript/primitives/tsFunction.js";
import { TSFunctionParameter } from "../../languages/typescript/primitives/tsFunctionParameter.js";
import { TSTypeProperty } from "../../languages/typescript/primitives/tsTypeProperty.js";
import type { TSProps } from "../../languages/typescript/types.js";
import {
	getBodyPropertyType,
	getOperationsByNamespace,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { pascalCase } from "../../utils/stringUtils.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";

export function emitClientBase(
	context: EmitContext,
	defaultProps: TSProps,
	eInnsynNamespace: Namespace,
) {
	const operationsByNamespace = getOperationsByNamespace(
		context.program,
		eInnsynNamespace,
	);

	const pathName = ".";
	const file = new TSFile(pathName);
	const clientBaseClass = new TSClass(file, "EInnsynClientBase");
	file.addClass({
		clazz: clientBaseClass,
		isExported: true,
	});

	// Add constructor
	const constructorMethod = new TSFunction(
		clientBaseClass,
		"EInnsynClientBase",
	);
	clientBaseClass.addMethod(constructorMethod);
	constructorMethod.isConstructor = true;

	// Add eInnsynOptions constructor parameter
	constructorMethod.addParameter(
		new TSFunctionParameter(constructorMethod, "requester", "EInnsynRequester"),
	);
	constructorMethod.addImport({
		modulePath: "./EInnsynRequester",
		importList: ["EInnsynRequester"],
		isType: true,
	});

	for (const [namespace] of operationsByNamespace) {
		const namespaceName = namespace.name;
		const className = `${pascalCase(namespaceName)}Resource`;
		// Add field variable
		const typeProperty = new TSTypeProperty(
			clientBaseClass,
			`${namespaceName.toLowerCase()}`,
			className,
		);
		const path = getTSEntityPathName(namespace);
		typeProperty.addImport({
			modulePath: `${path}/${namespaceName}Resource`,
			importList: [className],
		});
		typeProperty.readonly = true;
		clientBaseClass.addProperty(typeProperty);

		// Instantiate from constructor
		constructorMethod.addBody(
			`this.${namespaceName.toLowerCase()} = new ${pascalCase(namespaceName)}Resource(requester);`,
		);
	}

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
		file.addExportFrom(importPath, [{ name: modelName, isType: true }]);

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
		path: resolvePath(
			context.emitterOutputDir,
			"sdk-typescript/EInnsynClientBase.ts",
		),
		content: file.toString(),
	});
}
