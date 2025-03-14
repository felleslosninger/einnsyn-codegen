import {
	type EmitContext,
	type Model,
	type Namespace,
	type Type,
	emitFile,
	resolvePath,
} from "@typespec/compiler";
import {
	type GetTSTypeNameProps,
	getTSTypeName,
} from "../../languages/typescript/helpers/getTSTypeName.js";
import { getTypeDefinition } from "../../languages/typescript/helpers/getTypeDefinition.js";
import {
	getTSEntityPathName,
	getTSModelClassName,
} from "../../languages/typescript/helpers/tsHelpers.js";
import TSClass from "../../languages/typescript/primitives/tsClass.js";
import { TSFile } from "../../languages/typescript/primitives/tsFile.js";
import TSFunction from "../../languages/typescript/primitives/tsFunction.js";
import { TSFunctionParameter } from "../../languages/typescript/primitives/tsFunctionParameter.js";
import TSInterface from "../../languages/typescript/primitives/tsInterface.js";
import type {
	TSImportType,
	TSProps,
} from "../../languages/typescript/types.js";
import {
	getBodyPropertyModel,
	getOperationsByNamespace,
} from "../../utils/getters.js";
import {
	createParameterModel,
	getExtendedParameterModel,
} from "../../utils/operationsUtils.js";
import { pascalCase } from "../../utils/stringUtils.js";
import {
	isEInnsynEntity,
	isExpandableField,
} from "../../utils/typecheckers.js";

export function emitOperations(
	context: EmitContext,
	defaultProps: TSProps,
	eInnsynNamespace: Namespace,
) {
	const operationsByNamespace = getOperationsByNamespace(
		context.program,
		eInnsynNamespace,
	);
	for (const [namespace, httpOperationList] of operationsByNamespace) {
		// Create java file with class
		const className = `${namespace.name}Resource`;
		const modelPathName = `${getTSEntityPathName(namespace)}/${className}`;
		const resourceFile = new TSFile(modelPathName);
		const resourceClass = new TSClass(resourceFile, className);
		resourceClass.addImport({
			modulePath: "common/entity/Resource",
			importList: ["Resource"],
		});
		resourceClass.addExtends("Resource");

		// Keep a list of added models
		const addedModels: { [key: string]: boolean } = {};

		// Add operations
		for (const operation of httpOperationList) {
			const operationName = operation.operation.name;
			const operationMethod = new TSFunction(resourceFile, operationName);
			operationMethod.isAsync = true;
			const pathParameters = operation.parameters.parameters.filter(
				(p) => p.type === "path",
			);
			const queryParameters = operation.parameters.parameters.filter(
				(f) => f.type === "query",
			);
			const requestType = operation.parameters.body?.type;
			const responseType = operation.responses[0]?.type;
			const verb = operation.verb;
			const pathTemplate = operation.path;
			let queryVariable = undefined;
			let bodyVariable = undefined;

			// Add path parameters
			for (const pathParameter of pathParameters) {
				const parameterType = pathParameter.param.type;
				const [parameterTSType, parameterTSTypeImports] = getTSTypeName({
					...defaultProps,
					type: parameterType,
				});
				operationMethod.addParameter(
					new TSFunctionParameter(
						operationMethod,
						pathParameter.name,
						parameterTSType,
					),
				);
				operationMethod.addImport(...parameterTSTypeImports);
			}

			if (requestType) {
				bodyVariable = "body";
				const [requestJavaType, requestJavaTypeImports] = getTSTypeName({
					...defaultProps,
					propertyName: operationName,
					type: requestType,
					entitySuffix: "Request",
				});
				operationMethod.addImport(...requestJavaTypeImports);

				if (isExpandableField(requestType)) {
					operationMethod.addParameter(
						new TSFunctionParameter(
							operationMethod,
							bodyVariable,
							`${requestJavaType} | "string"`,
						),
					);
				} else {
					operationMethod.addParameter(
						new TSFunctionParameter(
							operationMethod,
							bodyVariable,
							requestJavaType,
						),
					);
				}
			}

			// Check if we need to add an interface for the query parameters
			let queryParameterTSType = `${pascalCase(operationName)}QueryParameters`;
			const [extendQueryModel, remainingQueryParams] =
				getExtendedParameterModel({
					...defaultProps,
					parameters: queryParameters,
				});
			const [queryExtendModelTSType, queryExtendModelImports] = getTSTypeName({
				...defaultProps,
				type: extendQueryModel,
			});
			operationMethod.addImport(...queryExtendModelImports);

			// If there are custom parameters, we need to create a model interface
			if (remainingQueryParams.length && !addedModels[queryParameterTSType]) {
				addedModels[queryParameterTSType] = true;
				const customModel = createParameterModel({
					name: queryParameterTSType,
					parameters: remainingQueryParams,
					baseModel: extendQueryModel,
				});
				const customModelInterface = new TSInterface(
					resourceFile,
					queryParameterTSType,
				);
				customModelInterface.typeDefinition = getTypeDefinition({
					...defaultProps,
					parent: customModelInterface,
					model: customModel,
				});
				resourceFile.addInterface({
					int: customModelInterface,
					isExported: true,
				});
			}
			// No custom parameters, use the extended model directly
			else if (extendQueryModel) {
				queryParameterTSType = queryExtendModelTSType;
			}

			if (queryParameters.length) {
				queryVariable = "query";
				// Add query parameters to the operation method
				const queryParameter = new TSFunctionParameter(
					operationMethod,
					queryVariable,
					queryParameterTSType,
				);
				queryParameter.optional = true;
				operationMethod.addParameter(queryParameter);
			}

			// Add request model if the model doesn't have a name
			const bodyModel = operation.parameters.body?.type;
			if (bodyModel?.kind === "Model" && !bodyModel.name) {
				const requestName = `${pascalCase(operationName)}Request`;
				const requestInterface = new TSInterface(resourceFile, requestName);
				requestInterface.typeDefinition = getTypeDefinition({
					...defaultProps,
					parent: requestInterface,
					model: bodyModel as Model,
				});
				resourceFile.addInterface({
					int: requestInterface,
					isExported: true,
				});
			}

			// Add response model if the model doesn't have a name
			const responseModel = responseType;
			if (responseModel?.kind === "Model" && !responseModel.name) {
				const responseName = `${pascalCase(operationName)}Response`;
				const responseInterface = new TSInterface(resourceFile, responseName);
				responseInterface.typeDefinition = getTypeDefinition({
					...defaultProps,
					parent: responseInterface,
					model: responseModel as Model,
				});
				resourceFile.addInterface({
					int: responseInterface,
					isExported: true,
				});
			}

			// Add response body interface if the model doesn't have a name
			let responseName: string;
			let responseValidator: string | undefined;
			let responseImports: TSImportType[] = [];
			if (responseType.kind === "Model" && !responseType.name) {
				responseName = `${pascalCase(operationName)}Response`;
				responseImports = [];
				const responseInterface = new TSInterface(
					resourceFile,
					`${pascalCase(operationName)}Response`,
				);
				responseInterface.typeDefinition = getTypeDefinition({
					...defaultProps,
					parent: responseInterface,
					model: responseType as Model,
				});
				resourceFile.addInterface({
					int: responseInterface,
					isExported: true,
				});
			} else {
				[responseName, responseValidator, responseImports] =
					getTypeWithValidator({
						...defaultProps,
						propertyName: operationName,
						type: responseType,
					});
			}

			operationMethod.addImport(...responseImports);
			operationMethod.returnType = `Promise<${responseName}>`;

			// Add method body
			const path = templatePathToTemplateString(pathTemplate);
			const quotedPath = path.includes("${") ? `\`${path}\`` : `"${path}"`;
			operationMethod.addBody(
				"const response = await this.requester.request({",
				`method: '${verb}',`,
				`path: ${quotedPath},`,
				queryVariable ? `query: ${queryVariable},` : undefined,
				bodyVariable ? `body: ${bodyVariable},` : undefined,
				"})",
			);
			// Inline models doesn't have a name, so return and cast
			if (!responseValidator) {
				operationMethod.addBody(`return response as ${responseName};`);
			} else {
				operationMethod.addBody(
					`if (${responseValidator}(response)) {`,
					"  return response;",
					"}",
					"throw new NetworkError('Unknown response type');",
				);
				operationMethod.addImport({
					modulePath: "common/error/EInnsynError",
					importList: ["NetworkError"],
				});
			}

			resourceClass.addMethod(operationMethod);
		}

		resourceFile.addClass({ clazz: resourceClass, isExported: true });

		// Emit file
		emitFile(context.program, {
			path: resolvePath(context.emitterOutputDir, `sdk-ts/${modelPathName}.ts`),
			content: resourceFile.toString(),
		});
	}
}

function templatePathToTemplateString(path: string) {
	return path.replace(/{([^}]+)}/g, "${$1}");
}

function getTypeWithValidator(
	props: GetTSTypeNameProps & { type: Type },
): [string, string | undefined, TSImportType[]] {
	const bodyModel = getBodyPropertyModel(props.type as Model);
	if (bodyModel === undefined) {
		return ["unknown", undefined, []];
	}

	const [typeName, imports] = getTSTypeName({
		...props,
		type: bodyModel,
	});

	if (bodyModel.name === "PaginatedList") {
		// PaginatedList is generic, so we need to get the list type
		const listType = bodyModel.templateMapper?.args[0] as Model;
		const listTypeClassName = getTSModelClassName({
			...props,
			model: listType,
		});
		const validator = `isPaginated${listTypeClassName}List`;
		imports.push({
			modulePath: `${getTSEntityPathName(listType as Model)}/${listTypeClassName}`,
			importList: [validator],
		});
		return [typeName, validator, imports];
	}

	// We only have type checking for eInnsyn entities
	if (!isEInnsynEntity(bodyModel)) {
		return [typeName, undefined, imports];
	}

	const className = getTSModelClassName({
		...props,
		model: bodyModel as Model,
	});

	const validator = `is${className}`;
	imports.push({
		modulePath: `${getTSEntityPathName(bodyModel as Model)}/${className}`,
		importList: [validator],
	});
	return [typeName, validator, imports];
}
