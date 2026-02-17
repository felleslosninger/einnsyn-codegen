import {
	type EmitContext,
	emitFile,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import {
	getCSharpEntityNamespace,
	toCSharpPropertyName,
} from "../../languages/csharp/helpers/csharpHelpers.js";
import { CSharpClass } from "../../languages/csharp/primitives/csharpClass.js";
import { CSharpFile } from "../../languages/csharp/primitives/csharpFile.js";
import { CSharpMethod } from "../../languages/csharp/primitives/csharpMethod.js";
import { CSharpProperty } from "../../languages/csharp/primitives/csharpProperty.js";
import type { CSharpBaseProps } from "../../languages/csharp/types.js";
import { getOperationsByNamespace } from "../../utils/getters.js";
import { pascalCase } from "../../utils/stringUtils.js";
import { OUTPUT_ROOT } from "./variables.js";

export function emitClientBase(
	context: EmitContext,
	defaultProps: CSharpBaseProps,
	eInnsynNamespace: Namespace,
) {
	const file = new CSharpFile(defaultProps.rootNamespace);
	file.addUsing("EInnsyn.Sdk.Net");

	const className = "EInnsynClientBase";
	const clientClass = new CSharpClass(file, className);
	clientClass.setPartial(true);
	const requesterProperty = new CSharpProperty(
		clientClass,
		"ApiRequester",
		"Requester",
	);
	requesterProperty.setVisibility("protected");
	requesterProperty.setHasSetter(false);
	clientClass.addProperty(requesterProperty.toString());

	const operationsByNamespace = getOperationsByNamespace(
		context.program,
		eInnsynNamespace,
	);

	const constructorBody: string[] = ["Requester = requester;"];

	for (const [namespace] of operationsByNamespace) {
		const operationClassName = `${pascalCase(namespace.name)}Operations`;
		const propertyName = toCSharpPropertyName(namespace.name);
		const operationProperty = new CSharpProperty(
			clientClass,
			operationClassName,
			propertyName,
		);
		operationProperty.setHasSetter(false);
		clientClass.addProperty(operationProperty.toString());
		constructorBody.push(
			`${propertyName} = new ${operationClassName}(requester);`,
		);
		file.addUsing(
			getCSharpEntityNamespace(defaultProps.rootNamespace, namespace),
		);
	}

	const constructorMethod = new CSharpMethod(clientClass, "EInnsynClientBase");
	constructorMethod.setConstructor(true);
	constructorMethod.setVisibility("protected");
	constructorMethod.addParameter("ApiRequester requester");
	constructorMethod.addBody(...constructorBody);
	clientClass.addMethod(constructorMethod.toString());

	file.addMember(clientClass.toString());

	emitFile(context.program, {
		path: resolvePath(
			context.emitterOutputDir,
			`${OUTPUT_ROOT}/EInnsynClientBase.g.cs`,
		),
		content: file.toString(),
	});
}
