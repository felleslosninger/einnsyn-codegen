import {
	type EmitContext,
	emitFile,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import { getTSEntityPathName } from "../../languages/typescript/helpers/tsHelpers.js";
import TSClass from "../../languages/typescript/primitives/tsClass.js";
import { TSFile } from "../../languages/typescript/primitives/tsFile.js";
import TSFunction from "../../languages/typescript/primitives/tsFunction.js";
import { TSFunctionParameter } from "../../languages/typescript/primitives/tsFunctionParameter.js";
import { TSTypeProperty } from "../../languages/typescript/primitives/tsTypeProperty.js";
import type { TSProps } from "../../languages/typescript/types.js";
import { getOperationsByNamespace } from "../../utils/getters.js";
import { pascalCase } from "../../utils/stringUtils.js";

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

	// Emit file
	emitFile(context.program, {
		path: resolvePath(
			context.emitterOutputDir,
			"sdk-typescript/EInnsynClientBase.ts",
		),
		content: file.toString(),
	});
}
