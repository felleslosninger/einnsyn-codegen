import {
	type EmitContext,
	emitFile,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import { getDocumentation } from "../../languages/typescript/helpers/getJSDoc.js";
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
	clientBaseClass.setDocumentation(
		"Base client exposing one resource accessor per API namespace.",
	);
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
	constructorMethod.setDocumentation("Create a new eInnsyn client.");
	constructorMethod.addDocTag(
		"@param requester The transport used to perform the HTTP requests.",
	);
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
		typeProperty.setDocumentation(
			getDocumentation(context.program, namespace) ??
				`Operations on the \`${namespaceName}\` resource.`,
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
