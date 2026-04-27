import {
	type EmitContext,
	emitFile,
	type Namespace,
	resolvePath,
	type Type,
} from "@typespec/compiler";
import type { HttpOperation } from "@typespec/http";
import {
	getCSharpEntityNamespace,
	getCSharpEntityPath,
	getCSharpType,
	renderPathTemplate,
	toCSharpParameterName,
} from "../../languages/csharp/helpers/csharpHelpers.js";
import { buildModelClass } from "../../languages/csharp/helpers/modelBuilder.js";
import { CSharpClass } from "../../languages/csharp/primitives/csharpClass.js";
import { CSharpFile } from "../../languages/csharp/primitives/csharpFile.js";
import { CSharpMethod } from "../../languages/csharp/primitives/csharpMethod.js";
import type { CSharpBaseProps } from "../../languages/csharp/types.js";
import {
	getBodyPropertyModel,
	getOperationsByNamespace,
} from "../../utils/getters.js";
import {
	createParameterModel,
	getExtendedParameterModel,
} from "../../utils/operationsUtils.js";
import { pascalCase } from "../../utils/stringUtils.js";
import { isEInnsynEntityNamespace } from "../../utils/typecheckers.js";
import { OUTPUT_ROOT } from "./variables.js";

export function emitOperations(
	context: EmitContext,
	defaultProps: CSharpBaseProps,
	eInnsynNamespace: Namespace,
) {
	const operationsByNamespace = getOperationsByNamespace(
		context.program,
		eInnsynNamespace,
	);

	for (const [namespace, operations] of operationsByNamespace) {
		emitNamespaceOperations(context, defaultProps, namespace, operations);
	}
}

function emitNamespaceOperations(
	context: EmitContext,
	defaultProps: CSharpBaseProps,
	namespace: Namespace,
	operations: HttpOperation[],
) {
	const namespaceName = getCSharpEntityNamespace(
		defaultProps.rootNamespace,
		namespace,
	);
	const pathName = getCSharpEntityPath(namespace);
	const className = `${pascalCase(namespace.name)}Operations`;
	const file = new CSharpFile(namespaceName);
	file.addUsing(
		"System.Threading",
		"System.Threading.Tasks",
		"EInnsyn.Sdk",
		"EInnsyn.Sdk.Net",
	);

	const operationsClass = new CSharpClass(file, className);
	if (isEInnsynEntityNamespace(namespace)) {
		const entityType = `global::${namespaceName}.Models.${pascalCase(namespace.name)}`;
		const requestType = `global::${namespaceName}.Models.${pascalCase(namespace.name)}Request`;
		operationsClass.addBaseType(
			`global::EInnsyn.Sdk.Common.ApiOperations.ApiEntityOperations<${entityType}, ${requestType}>`,
		);
	} else {
		operationsClass.addBaseType(
			"global::EInnsyn.Sdk.Common.ApiOperations.ApiOperations",
		);
	}

	const constructorMethod = new CSharpMethod(operationsClass, className);
	constructorMethod.setConstructor(true);
	constructorMethod.setConstructorInitializer("base(requester)");
	constructorMethod.addParameter("ApiRequester requester");
	operationsClass.addMethod(constructorMethod.toString());

	const addedModels = new Set<string>();

	for (const operation of operations) {
		const operationName = pascalCase(operation.operation.name);
		const methodName = `${operationName}Async`;

		const pathParameters = operation.parameters.parameters.filter(
			(parameter) => parameter.type === "path",
		);
		const queryParameters = operation.parameters.parameters.filter(
			(parameter) => parameter.type === "query",
		);

		const bodyType = operation.parameters.body?.type;
		let bodyTypeName: string | undefined;
		let bodyImports: string[] = [];

		const operationModels: string[] = [];

		if (bodyType?.kind === "Model" && !bodyType.name) {
			const inlineBodyClass = `${operationName}Request`;
			if (!addedModels.has(inlineBodyClass)) {
				addedModels.add(inlineBodyClass);
				const inlineClass = buildModelClass({
					...defaultProps,
					parent: file,
					model: bodyType,
					className: inlineBodyClass,
					requestModel: true,
					skipReadOnlyProperties: false,
					skipWriteOnlyProperties: false,
					appendDerivedTypesForBase: false,
				});
				operationModels.push(inlineClass.toString());
			}
			bodyTypeName = inlineBodyClass;
		} else if (bodyType) {
			[bodyTypeName, bodyImports] = getCSharpType({
				...defaultProps,
				type: bodyType,
				propertyName: operation.operation.name,
				entitySuffix: "Request",
				stringEnums: false,
			});
		}

		let responseTypeName = "object";
		let responseImports: string[] = [];
		const responseBodyModel = resolveResponseBodyModel(
			operation.responses[0]?.type,
		);
		if (responseBodyModel?.kind === "Model" && !responseBodyModel.name) {
			const inlineResponseClass = `${operationName}Response`;
			if (!addedModels.has(inlineResponseClass)) {
				addedModels.add(inlineResponseClass);
				const inlineClass = buildModelClass({
					...defaultProps,
					parent: file,
					model: responseBodyModel,
					className: inlineResponseClass,
					requestModel: false,
					skipReadOnlyProperties: false,
					skipWriteOnlyProperties: false,
					appendDerivedTypesForBase: false,
				});
				operationModels.push(inlineClass.toString());
			}
			responseTypeName = inlineResponseClass;
		} else if (responseBodyModel) {
			[responseTypeName, responseImports] = getCSharpType({
				...defaultProps,
				type: responseBodyModel,
				propertyName: operation.operation.name,
				stringEnums: false,
			});
		}

		file.addUsing(...bodyImports, ...responseImports);

		let queryTypeName: string | undefined;
		if (queryParameters.length > 0) {
			const [extendQueryModel, remainingParameters] = getExtendedParameterModel(
				{
					parameters: queryParameters,
				},
			);
			if (remainingParameters.length > 0) {
				const customModelName = `${operationName}QueryParameters`;
				if (!addedModels.has(customModelName)) {
					addedModels.add(customModelName);
					const customModel = createParameterModel({
						name: customModelName,
						parameters: remainingParameters,
						baseModel: extendQueryModel,
					});
					const customModelClass = buildModelClass({
						...defaultProps,
						parent: file,
						model: customModel,
						className: customModelName,
						requestModel: true,
						skipReadOnlyProperties: false,
						skipWriteOnlyProperties: false,
						appendDerivedTypesForBase: false,
					});
					operationModels.push(customModelClass.toString());
				}
				queryTypeName = customModelName;
			} else if (extendQueryModel) {
				const [queryType, queryImports] = getCSharpType({
					...defaultProps,
					type: extendQueryModel,
					stringEnums: false,
				});
				file.addUsing(...queryImports);
				queryTypeName = queryType;
			}
		}

		const methodParameters: string[] = [];
		for (const pathParameter of pathParameters) {
			const [parameterType, parameterImports] = getCSharpType({
				...defaultProps,
				type: pathParameter.param.type,
				propertyName: pathParameter.name,
				stringEnums: true,
			});
			file.addUsing(...parameterImports);
			const parameterName = toCSharpParameterName(pathParameter.name);
			methodParameters.push(`${parameterType} ${parameterName}`);
		}

		let pathExpression = operation.path;
		for (const pathParameter of pathParameters) {
			const parameterName = toCSharpParameterName(pathParameter.name);
			pathExpression = pathExpression.replace(
				new RegExp(`\\{${pathParameter.name}\\}`, "g"),
				`{${parameterName}}`,
			);
		}

		if (bodyTypeName) {
			methodParameters.push(`${bodyTypeName} body`);
		}

		if (queryTypeName) {
			methodParameters.push(`${queryTypeName}? query = null`);
		}

		methodParameters.push("EInnsynOptions? options = null");
		methodParameters.push("CancellationToken cancellationToken = default");

		operationsClass.addMethod(
			buildOperationMethod({
				parent: operationsClass,
				methodName,
				returnType: responseTypeName,
				methodParameters,
				verb: operation.verb,
				pathExpression,
				hasQuery: !!queryTypeName,
				hasBody: !!bodyTypeName,
			}).toString(),
		);

		for (const generatedModel of operationModels) {
			operationsClass.addNested(generatedModel);
		}
	}

	file.addMember(operationsClass.toString());

	emitFile(context.program, {
		path: resolvePath(
			context.emitterOutputDir,
			`${OUTPUT_ROOT}/${pathName}/${className}.g.cs`,
		),
		content: file.toString(),
	});
}

function resolveResponseBodyModel(type?: Type) {
	if (type?.kind !== "Model") {
		return type;
	}
	const bodyModel = getBodyPropertyModel(type);
	if (bodyModel) {
		return bodyModel;
	}
	return type;
}

function buildOperationMethod(props: {
	parent: CSharpClass;
	methodName: string;
	returnType: string;
	methodParameters: string[];
	verb: string;
	pathExpression: string;
	hasQuery: boolean;
	hasBody: boolean;
}) {
	const {
		parent,
		methodName,
		returnType,
		methodParameters,
		verb,
		pathExpression,
		hasQuery,
		hasBody,
	} = props;

	const method = new CSharpMethod(parent, methodName, `Task<${returnType}>`);
	method.setAsync(true);
	method.addParameter(...methodParameters);
	method.addBody(
		`var path = ${renderPathTemplate(pathExpression)};`,
		`return await Requester.RequestAsync<${returnType}>(`,
		`    ApiRequestMethod.${toApiRequestMethodMember(verb)},`,
		"    path,",
		hasQuery ? "    query," : "    null,",
		hasBody ? "    body," : "    null,",
		"    options,",
		"    cancellationToken);",
	);
	return method;
}

function toApiRequestMethodMember(verb: string) {
	switch (verb.toLowerCase()) {
		case "get":
			return "Get";
		case "post":
			return "Post";
		case "patch":
			return "Patch";
		case "delete":
			return "Delete";
		default:
			throw new Error(`Unsupported HTTP verb for C# emitter: ${verb}`);
	}
}
