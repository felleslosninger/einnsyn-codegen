import {
	type EmitContext,
	emitFile,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import {
	getJavaEntityPackageName,
	getJavaEntityPathName,
	getJavaType,
} from "../../languages/java/helpers/javaHelpers.js";
import { buildGeneralModel } from "../../languages/java/helpers/modelBuilder.js";
import Class from "../../languages/java/primitives/class.js";
import { JavaFile } from "../../languages/java/primitives/javafile.js";
import Method from "../../languages/java/primitives/method.js";
import Parameter from "../../languages/java/primitives/parameter.js";
import type { JavaBaseProps } from "../../languages/java/types.js";
import { getOperationsByNamespace } from "../../utils/getters.js";
import { hasHttpResponseBody } from "../../utils/httpResponseUtils.js";
import {
	createParameterModel,
	getExtendedParameterModel,
} from "../../utils/operationsUtils.js";
import { pascalCase } from "../../utils/stringUtils.js";
import {
	isEInnsynEntityNamespace,
	isExpandableField,
} from "../../utils/typecheckers.js";

const defaultImports = [
	"no.einnsyn.sdk.common.expandablefield.ExpandableField",
	"java.util.List",
	"java.util.ArrayList",
];

export function emitOperations(
	context: EmitContext,
	defaultProps: JavaBaseProps,
	eInnsynNamespace: Namespace,
) {
	const operationsByNamespace = getOperationsByNamespace(
		context.program,
		eInnsynNamespace,
	);
	for (const [namespace, httpOperationList] of operationsByNamespace) {
		const packageName = getJavaEntityPackageName(
			defaultProps.packageName,
			namespace,
		);
		const pathName = getJavaEntityPathName(defaultProps.packageName, namespace);
		const operationsFile = new JavaFile(packageName);
		operationsFile.addImport(...defaultImports);
		const addedSubclasses: { [name: string]: boolean } = {};

		const operationsClass = new Class(
			operationsFile,
			`${namespace.name}Operations`,
		);
		if (isEInnsynEntityNamespace(namespace)) {
			operationsClass.setExtends(
				`ApiEntityOperations<${namespace.name}, ${namespace.name}Request>`,
			);
			operationsClass.addImport(
				"no.einnsyn.sdk.common.apioperations.ApiEntityOperations",
			);
		} else {
			operationsClass.setExtends("ApiOperations");
			operationsClass.addImport(
				"no.einnsyn.sdk.common.apioperations.ApiOperations",
			);
		}
		operationsFile.addClass(operationsClass);

		// Add constructor
		const constructorMethod = new Method(
			operationsClass,
			`${namespace.name}Operations`,
		);
		constructorMethod.addParameter(
			new Parameter(constructorMethod, "requester", "ApiRequester"),
		);
		constructorMethod.addImport("no.einnsyn.sdk.net.ApiRequester");
		constructorMethod.addBody("super(requester);");
		operationsClass.addMethod(constructorMethod);

		// Add operations
		for (const httpOperation of httpOperationList) {
			const operationName = httpOperation.operation.name;
			const verb = httpOperation.verb;
			const requestType = httpOperation.parameters.body?.type;
			const response = httpOperation.responses[0];
			const responseType = response?.type;
			const hasResponseBody = hasHttpResponseBody(response);
			const pathParameters = httpOperation.parameters.parameters.filter(
				(p) => p.type === "path",
			);
			const queryParameters = httpOperation.parameters.parameters.filter(
				(f) => f.type === "query",
			);
			const pathTemplate = httpOperation.path;
			const [responseJavaType, responseJavaTypeImports] = hasResponseBody
				? getJavaType({
						...defaultProps,
						type: responseType,
					})
				: ["Void", []];

			const addedSignatures: { [signature: string]: boolean } = {};

			// Add all combinations of route methods
			addRouteMethod(false, false, false, false);
			addRouteMethod(false, false, false, true);
			addRouteMethod(false, false, true, false);
			addRouteMethod(false, false, true, true);
			addRouteMethod(false, true, false, false);
			addRouteMethod(false, true, false, true);
			//addRouteMethod(false, true, true); // Causes duplicate method signature
			addRouteMethod(true, false, false, false);
			addRouteMethod(true, false, false, true);
			addRouteMethod(true, false, true, false);
			addRouteMethod(true, false, true, true);
			addRouteMethod(true, true, false, false);
			addRouteMethod(true, true, false, true);
			addRouteMethod(true, true, true, false);
			addRouteMethod(true, true, true, true);

			function addRouteMethod(
				withQueryParameters: boolean,
				withOptions: boolean,
				withFunctions: boolean,
				withBodyId: boolean,
			) {
				let renderedQueryParameters = false;
				let renderedOptions = false;
				let renderedFunctions = false;
				let renderedBodyId = false;
				const routeMethod = new Method(
					operationsClass,
					responseJavaType,
					operationName,
				);
				operationsClass.addImport(...responseJavaTypeImports);

				// Add path parameters
				for (const pathParameter of pathParameters) {
					const parameterType = pathParameter.param.type;
					const [parameterJavaType, parameterJavaTypeImports] = getJavaType({
						...defaultProps,
						type: parameterType,
					});
					routeMethod.addParameter(
						new Parameter(routeMethod, pathParameter.name, parameterJavaType),
					);
					routeMethod.addImport(...parameterJavaTypeImports);
				}

				// Add query parameters
				let queryParameterVariable = "null";
				if (withQueryParameters) {
					let queryParameterJavaType = `${pascalCase(operationName)}QueryParameters`;
					const [queryExtendModel, queryCustomParams] =
						getExtendedParameterModel({
							...defaultProps,
							parameters: queryParameters,
						});
					const [queryExtendModelJavaType, queryExtendModelImports] =
						getJavaType({ ...defaultProps, type: queryExtendModel });
					routeMethod.addImport(...queryExtendModelImports);

					// If there are custom parameters, we need to create a model class
					if (
						queryCustomParams.length &&
						!addedSubclasses[queryParameterJavaType]
					) {
						addedSubclasses[queryParameterJavaType] = true;
						const customModel = createParameterModel({
							name: queryParameterJavaType,
							parameters: queryCustomParams,
							baseModel: queryExtendModel,
						});
						const customModelClass = buildGeneralModel({
							...defaultProps,
							parent: operationsClass,
							model: customModel,
							className: queryParameterJavaType,
							addBuilder: true,
							addSubModels: true,
						});
						customModelClass.setStatic(true);
						operationsClass.addClass(customModelClass);
					}

					// No custom parameters, use the extended model directly
					else if (queryExtendModel) {
						queryParameterJavaType = queryExtendModelJavaType;
					}

					if (queryCustomParams.length > 0 || queryExtendModel) {
						renderedQueryParameters = true;
						if (withFunctions) {
							renderedFunctions = true;
							queryParameterVariable = `queryParametersBuilderFunction.apply(new ${queryParameterJavaType}.Builder()).build()`;
							routeMethod.addImport("java.util.function.Function");
							routeMethod.addParameter(
								new Parameter(
									routeMethod,
									"queryParametersBuilderFunction",
									`Function<${queryParameterJavaType}.Builder, ${queryParameterJavaType}.Builder>`,
								),
							);
						} else {
							queryParameterVariable = "queryParameters";
							routeMethod.addParameter(
								new Parameter(
									routeMethod,
									"queryParameters",
									queryParameterJavaType,
								),
							);
						}
					}
				}

				// Add request body
				let bodyVariable = "null";
				if (requestType) {
					const [requestJavaType, requestJavaTypeImports] = getJavaType({
						...defaultProps,
						propertyName: operationName,
						type: requestType,
						wrapExpandableFields: false,
						entitySuffix: "Request",
					});
					// Accept ID instead of body when adding items to an object
					if (withBodyId && isExpandableField(requestType)) {
						renderedBodyId = true;
						routeMethod.addParameter(
							new Parameter(routeMethod, "bodyId", "String"),
						);
						bodyVariable = "bodyId";
					}
					// Accept an object builder instead of the built object
					else if (withFunctions) {
						renderedFunctions = true;
						routeMethod.addImport("java.util.function.Function");
						routeMethod.addParameter(
							new Parameter(
								routeMethod,
								"bodyBuilderFunction",
								`Function<${requestJavaType}.Builder, ${requestJavaType}.Builder>`,
							),
						);
						bodyVariable = `bodyBuilderFunction.apply(new ${requestJavaType}.Builder()).build()`;
					}
					// Accept the built object
					else {
						routeMethod.addParameter(
							new Parameter(routeMethod, "body", requestJavaType),
						);
						routeMethod.addImport(...requestJavaTypeImports);
						bodyVariable = "body";
					}
				}

				// Add options
				let optionsVariable = "null";
				if (withOptions) {
					renderedOptions = true;
					if (withFunctions) {
						renderedFunctions = true;
						routeMethod.addImport("java.util.function.Function");
						routeMethod.addParameter(
							new Parameter(
								routeMethod,
								"optionsBuilderFunction",
								"Function<EInnsynOptions.Builder, EInnsynOptions.Builder>",
							),
						);
						optionsVariable =
							"optionsBuilderFunction.apply(new EInnsynOptions.Builder()).build()";
					} else {
						routeMethod.addParameter(
							new Parameter(routeMethod, "options", "EInnsynOptions"),
						);
						optionsVariable = "options";
					}
					routeMethod.addImport("no.einnsyn.sdk.EInnsynOptions");
				}

				// Skip if signature already added
				const signature = `${renderedQueryParameters}-${renderedOptions}-${renderedFunctions}-${renderedBodyId}`;
				if (addedSignatures[signature]) {
					return;
				}
				addedSignatures[signature] = true;

				// Generate URL path
				const path = pathTemplate
					.replace(/(.*)/, '"$1"') // Add quotes
					.replace(/{([^}]+)}/g, '" + $1 + "') // Replace path parameters
					.replace(/^"" \+ /, "") // Remove empty leading string
					.replace(/ \+ ""$/, ""); // Remove empty trailing string

				// Build request arguments
				const requestArguments = [
					"method",
					"url",
					queryParameterVariable,
					bodyVariable,
					optionsVariable,
					"type",
				];

				// Build body
				routeMethod.addBody(`String url = ${path};`);
				routeMethod.addBody(
					`ApiRequestMethod method = ApiRequestMethod.${verb.toUpperCase()};`,
				);
				routeMethod.addBody(
					`Type type = new TypeToken<${responseJavaType}>() {}.getType();`,
					`return requester.request(${requestArguments.join(", ")});`,
				);
				routeMethod.addImport(
					"no.einnsyn.sdk.net.ApiRequestMethod",
					"java.lang.reflect.Type",
					"com.google.gson.reflect.TypeToken",
				);

				// Throws
				routeMethod.addThrows(
					"no.einnsyn.sdk.common.exceptions.models.EInnsynException",
				);

				// Add method
				operationsClass.addMethod(routeMethod);
			}

			// Add request body models if needed
			const bodyModel = httpOperation.parameters.body?.type;
			if (bodyModel?.kind === "Model" && !bodyModel.name) {
				const requestBodyClass = buildGeneralModel({
					...defaultProps,
					model: bodyModel,
					className: pascalCase(operationName),
					addBuilder: true,
					addSubModels: true,
				});
				requestBodyClass.setStatic(true);
				operationsClass.addClass(requestBodyClass);
			}

			// Add response models if needed
			const responseModel = responseType;
			if (responseModel?.kind === "Model" && !responseModel.name) {
				const responseBodyClass = buildGeneralModel({
					...defaultProps,
					model: responseModel,
					className: `${pascalCase(operationName)}Response`,
					addBuilder: true,
					addSubModels: true,
				});
				responseBodyClass.setStatic(true);
				operationsClass.addClass(responseBodyClass);
			}
		}

		emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`${pathName}/${namespace.name}Operations.java`,
			),
			content: operationsFile.toString(),
		});
	}
}
