import {
	type EmitContext,
	type Namespace,
	emitFile,
	getDoc,
	resolvePath,
} from "@typespec/compiler";
import { getImports } from "../../languages/java/helpers/getImports.js";
import {
	getJavaEntityPackageName,
	getJavaEntityPathName,
	getJavaType,
} from "../../languages/java/helpers/javaHelpers.js";
import { buildGeneralModel } from "../../languages/java/helpers/modelBuilder.js";
import Class from "../../languages/java/primitives/class.js";
import Field from "../../languages/java/primitives/field.js";
import { JavaFile } from "../../languages/java/primitives/javafile.js";
import Method from "../../languages/java/primitives/method.js";
import Parameter from "../../languages/java/primitives/parameter.js";
import type { JavaBaseProps } from "../../languages/java/types.js";
import {
	getBodyPropertyModel,
	getEntityURI,
	getExpandableEntity,
	getOperationsByNamespace,
	getQueryParameters,
} from "../../utils/getters.js";
import {
	getHttpResponseStatusCode,
	hasHttpResponseBody,
} from "../../utils/httpResponseUtils.js";
import {
	createParameterModel,
	getExtendedParameterModel,
} from "../../utils/operationsUtils.js";
import { camelCase, pascalCase } from "../../utils/stringUtils.js";
import {
	isEInnsynEntity,
	isEInnsynId,
	isExpandableField,
} from "../../utils/typecheckers.js";
import { PACKAGE_NAME } from "./variables.js";

const requestMappingMap = {
	get: "GetMapping",
	put: "PutMapping",
	post: "PostMapping",
	patch: "PatchMapping",
	delete: "DeleteMapping",
	head: "HeadMapping",
};

export function emitControllers(
	context: EmitContext,
	defaultProps: JavaBaseProps,
	eInnsynNamespace: Namespace,
) {
	const defaultImports = [
		"no.einnsyn.backend.common.expandablefield.ExpandableField",
		"java.util.List",
		"java.util.ArrayList",
	];

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
		const entityName = namespace.name;
		const controllerFile = new JavaFile(packageName);
		controllerFile.addImport(...defaultImports);

		const className = `${entityName}Controller`;
		const controllerClass = new Class(controllerFile, className);
		controllerClass.addAnnotation(
			"org.springframework.web.bind.annotation.RestController",
		);

		// Add service field variable
		const serviceField = new Field(
			controllerClass,
			"service",
			`${entityName}Service`,
		);
		serviceField.setFinal(true);
		serviceField.setVisibility("private");
		controllerClass.addField(serviceField);

		// Add constructor
		const constructorMethod = new Method(controllerClass, className);
		constructorMethod.addParameter(
			new Parameter(controllerClass, "service", `${entityName}Service`),
		);
		constructorMethod.addBody("this.service = service;");
		controllerClass.addMethod(constructorMethod);

		for (const httpOperation of httpOperationList) {
			const { verb, path } = httpOperation;
			const { name: operationName } = httpOperation.operation;
			const methodName = camelCase(operationName);
			const response = httpOperation.responses[0];
			const hasResponseBody = hasHttpResponseBody(response);
			const responseStatusCode = getHttpResponseStatusCode(response);
			const isInsert = verb === "post";
			const isUpdate = verb === "patch";

			// Create method
			const [returnType, returnTypeImports] = hasResponseBody
				? getJavaType({
						...defaultProps,
						type: response?.type,
						propertyName: `${methodName}Response`,
						parentName: entityName,
					})
				: ["Void", []];
			const method = new Method(
				controllerClass,
				`ResponseEntity<${returnType}>`,
				methodName,
			);
			method.addImport(...returnTypeImports);
			method.addImport("org.springframework.http.ResponseEntity");
			method.addThrows(
				"no.einnsyn.backend.common.exceptions.models.EInnsynException",
			);
			if (hasResponseBody && response?.type.kind === "Model") {
				const bodyPropertyModel = getBodyPropertyModel(response.type);
				const importModel = bodyPropertyModel?.name
					? bodyPropertyModel
					: response.type;

				const imports = getImports({
					...defaultProps,
					model: importModel,
				});
				method.addImport(...imports);
			}
			method.setDocumentation(getDoc(context.program, httpOperation.operation));
			controllerClass.addMethod(method);

			// Add request mapping
			method.addAnnotation(
				`org.springframework.web.bind.annotation.${requestMappingMap[verb]}`,
				`"${path}"`,
			);

			// Add path parameters
			const pathParameters = httpOperation.parameters.parameters.filter(
				(p) => p.type === "path",
			);
			for (const parameterModel of pathParameters) {
				const parameterModelProperty = parameterModel.param;
				const type = parameterModelProperty.type;
				const [javaType, javaTypeImports] = getJavaType({
					...defaultProps,
					type: type,
					propertyName: parameterModel.name,
					parentName: entityName,
				});

				const parameter = new Parameter(method, parameterModel.name, javaType);
				parameter.addAnnotation("jakarta.validation.Valid");
				parameter.addAnnotation(
					"org.springframework.web.bind.annotation.PathVariable",
				);
				parameter.addAnnotation("jakarta.validation.constraints.NotNull");
				parameter.addImport(...javaTypeImports);
				if (isEInnsynId(type)) {
					const generic = type.templateMapper?.args[0];
					const entityModel =
						generic?.entityKind === "Type" &&
						generic.kind === "Model" &&
						generic;
					if (entityModel) {
						const [entityModelType, entityModelTypeImports] = getJavaType({
							...defaultProps,
							type: entityModel,
							propertyName: parameterModel.name,
							parentName: entityName,
						});
						// Wrap IDs in ExpandableFields, so that ExpandableField can resolve custom identifiers (email, orgno. etc.) to eInnsyn IDs
						parameter.type = `ExpandableField<${entityModelType}>`;
						parameter.addImport(...entityModelTypeImports);

						const serviceName = `${pascalCase(entityModel.name)}Service`;
						const servicePackageName = `${getJavaEntityPackageName(PACKAGE_NAME, entityModel)}.${serviceName}`;
						parameter.addImport(servicePackageName);
						parameter.addAnnotation(
							"no.einnsyn.backend.validation.expandableobject.ExpandableObject",
							`service = ${serviceName}.class, mustExist = true`,
						);
					}
				}
				method.addParameter(parameter);
			}

			// Add query parameter object if there are any
			const queryParameters = getQueryParameters(httpOperation);
			let queryParameterJavaType = `${pascalCase(operationName)}QueryParameters`;
			const [queryExtendModel, queryCustomParams] = getExtendedParameterModel({
				...defaultProps,
				parameters: queryParameters,
			});
			const [queryExtendModelJavaType, queryExtendModelImports] = getJavaType({
				...defaultProps,
				type: queryExtendModel,
			});
			const hasQuery = queryCustomParams.length > 0 || queryExtendModel;

			// If there are custom parameters, we need to create the model class
			if (queryCustomParams.length) {
				const customModel = createParameterModel({
					name: queryParameterJavaType,
					parameters: queryCustomParams,
					baseModel: queryExtendModel,
				});
				const customModelClass = buildGeneralModel({
					...defaultProps,
					parent: controllerClass,
					model: customModel,
					className: queryParameterJavaType,
					addBuilder: false,
					addSubModels: true,
					validate: true,
				});
				customModelClass.setStatic(true);
				controllerClass.addClass(customModelClass);
			}

			// There are no custom parameters, just add the query parameter model
			else if (queryExtendModel) {
				queryParameterJavaType = queryExtendModelJavaType;
			}

			// Add the parameter
			if (hasQuery) {
				const parameter = new Parameter(
					method,
					"query",
					queryParameterJavaType,
				);
				parameter.addAnnotation("jakarta.validation.Valid");
				parameter.addImport(...queryExtendModelImports);
				method.addParameter(parameter);
			}

			// Add request body object if it's not an existing entity
			const requestBody = httpOperation.parameters.body;
			if (
				(requestBody && isExpandableField(requestBody.type)) ||
				(requestBody?.type.kind === "Model" &&
					requestBody.bodyKind !== "multipart")
			) {
				const [requestBodyType, requestBodyImports] = getJavaType({
					...defaultProps,
					propertyName: operationName,
					type: requestBody.type,
				});
				const parameter = new Parameter(
					controllerClass,
					"body",
					requestBodyType,
				);
				parameter.addAnnotation(
					"org.springframework.web.bind.annotation.RequestBody",
				);
				parameter.addImport(...requestBodyImports);

				// Add ExpandableObject validation if needed
				if (
					(isEInnsynEntity(requestBody.type) ||
						isExpandableField(requestBody.type)) &&
					requestBody.type.kind === "Model"
				) {
					const entityName = requestBody.type.name;
					const serviceName = `${pascalCase(entityName)}Service`;
					parameter.addImport(
						`${getJavaEntityPackageName(PACKAGE_NAME, requestBody.type)}.${serviceName}`,
					);

					if (isInsert) {
						parameter.addImport(
							"no.einnsyn.backend.validation.validationgroups.Insert",
						);
						parameter.addAnnotation(
							"org.springframework.validation.annotation.Validated",
							"Insert.class",
						);
					}
					if (isUpdate) {
						parameter.addImport(
							"no.einnsyn.backend.validation.validationgroups.Update",
						);
						parameter.addAnnotation(
							"org.springframework.validation.annotation.Validated",
							"Update.class",
						);
					}

					const expandableParameters = [`service = ${serviceName}.class`];
					if (isInsert) {
						expandableParameters.push("mustNotExist = true");
					}
					parameter.addAnnotation(
						"no.einnsyn.backend.validation.expandableobject.ExpandableObject",
						expandableParameters.join(", "),
					);
				} else {
					parameter.addAnnotation("jakarta.validation.Valid");
				}

				parameter.addAnnotation("jakarta.validation.constraints.NotNull");
				method.addParameter(parameter);

				// If the request body is an unknown object (not an entity), create an inline model
				if (requestBody.type.kind === "Model" && !requestBody.type.name) {
					const requestBodyClass = buildGeneralModel({
						...defaultProps,
						parent: controllerClass,
						model: requestBody.type,
						className: requestBodyType,
						validate: true,
						addLombokGetters: true,
						addLombokSetters: true,
						addGetters: false,
						addSetters: false,
					});
					requestBodyClass.setStatic(true);
					controllerClass.addClass(requestBodyClass);
				}
			}

			// Add response body if it's not an existing entity
			if (
				hasResponseBody &&
				response?.type.kind === "Model" &&
				response.type.name === ""
			) {
				const responseBodyClass = buildGeneralModel({
					...defaultProps,
					parent: controllerClass,
					model: response.type,
					className: returnType,
				});
				responseBodyClass.setStatic(true);
				controllerClass.addClass(responseBodyClass);
			}

			// Add method body
			const serviceParameters = pathParameters.map((p) => {
				// Call .getId() if this is an id field
				const type = p.param.type;
				if (isEInnsynId(type)) {
					const generic = type.templateMapper?.args[0];
					const entityModel =
						generic?.entityKind === "Type" &&
						generic.kind === "Model" &&
						generic;
					if (entityModel) {
						return `${p.name}.getId()`;
					}
				}
				return p.name;
			});
			if (hasQuery) {
				serviceParameters.push("query");
			}
			if (requestBody) {
				serviceParameters.push("body");
			}

			if (!hasResponseBody) {
				method.addBody(
					`service.${methodName}(${serviceParameters.join(", ")});`,
				);
				if (responseStatusCode !== undefined) {
					method.addBody(
						`return ResponseEntity.status(${responseStatusCode}).build();`,
					);
				} else if (verb === "delete") {
					method.addBody("return ResponseEntity.noContent().build();");
				} else if (verb === "post") {
					method.addBody("return ResponseEntity.status(201).build();");
				} else {
					method.addBody("return ResponseEntity.ok().build();");
				}
				continue;
			}

			method.addBody(
				`var responseBody = service.${methodName}(${serviceParameters.join(", ")});`,
			);

			const expandableRequestEntity = getExpandableEntity(requestBody?.type);

			// If we allow adding existing objects (the request body is an expandable field that also allows IDs), we need to check if we return 200 or 201
			if (isInsert && expandableRequestEntity) {
				method.addImport("java.net.URI");
				const entityUri = getEntityURI(expandableRequestEntity);
				method.addBody(
					"if (body.getId() == null) {",
					` var location = URI.create("${entityUri}/" + responseBody.getId());`,
					" return ResponseEntity.created(location).body(responseBody);",
					"} else {",
					" return ResponseEntity.ok().body(responseBody);",
					"}",
				);
			}

			// If this is an insert and we don't allow existing objects, return 201
			else if (isInsert && requestBody?.type.kind === "Model") {
				method.addImport("java.net.URI");
				const entityUri = getEntityURI(requestBody.type);
				method.addBody(
					`var location = URI.create("${entityUri}/" + responseBody.getId());`,
					"return ResponseEntity.created(location).body(responseBody);",
				);
			}

			// If we don't return a created entity, return the response body
			else {
				method.addBody("return ResponseEntity.ok().body(responseBody);");
			}
		}

		controllerFile.addClass(controllerClass);

		emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`${pathName}/${namespace.name}Controller.java`,
			),
			content: controllerFile.toString(),
		});
	}
}
