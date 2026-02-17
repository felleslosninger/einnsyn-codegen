import {
	type EmitContext,
	emitFile,
	isErrorModel,
	type Model,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import {
	csharpStringLiteral,
	jsonPropertyName,
} from "../../languages/csharp/helpers/csharpAttributes.js";
import {
	ensureNullable,
	getCSharpInlineModelClassName,
	getCSharpType,
	toCSharpParameterName,
	toCSharpPropertyName,
} from "../../languages/csharp/helpers/csharpHelpers.js";
import { buildModelClass } from "../../languages/csharp/helpers/modelBuilder.js";
import { CSharpClass } from "../../languages/csharp/primitives/csharpClass.js";
import { CSharpFile } from "../../languages/csharp/primitives/csharpFile.js";
import { CSharpMethod } from "../../languages/csharp/primitives/csharpMethod.js";
import { CSharpProperty } from "../../languages/csharp/primitives/csharpProperty.js";
import type { CSharpBaseProps } from "../../languages/csharp/types.js";
import {
	getFixedValue,
	getListType,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { OUTPUT_ROOT } from "./variables.js";

/**
 * Emits generated exception model classes and the resolver that maps error
 * payloads to typed exceptions.
 */
export function emitExceptionModels(
	context: EmitContext,
	defaultProps: CSharpBaseProps,
	eInnsynNamespace: Namespace,
) {
	const models = recursivelyGetModels(eInnsynNamespace)
		.filter((model) => isErrorModel(context.program, model))
		.sort((a, b) => {
			if (!a.baseModel) {
				return -1;
			}
			if (!b.baseModel) {
				return 1;
			}
			return a.name.localeCompare(b.name);
		});

	if (!models.length) {
		return;
	}

	const file = new CSharpFile(
		`${defaultProps.rootNamespace}.Common.Exceptions.Models`,
	);
	file.addUsing(
		"System",
		"System.Collections.Generic",
		"System.Text.Json",
		"System.Text.Json.Serialization",
	);
	file.addMember(renderBaseExceptionClass(file));

	const inlineModelMap = new Map<string, Model>();

	for (const model of models) {
		if (model.name === "EInnsynException") {
			continue;
		}
		file.addMember(
			renderExceptionClass(model, defaultProps, inlineModelMap, file),
		);
	}

	for (const [className, inlineModel] of inlineModelMap.entries()) {
		const inlineClass = buildModelClass({
			...defaultProps,
			parent: file,
			model: inlineModel,
			className,
			requestModel: false,
			skipReadOnlyProperties: false,
			skipWriteOnlyProperties: false,
			appendDerivedTypesForBase: false,
		});
		file.addMember(inlineClass.toString());
	}

	file.addMember(renderResolver(models, defaultProps));

	emitFile(context.program, {
		path: resolvePath(
			context.emitterOutputDir,
			`${OUTPUT_ROOT}/Common/Exceptions/Models/EInnsynException.g.cs`,
		),
		content: file.toString(),
	});
}

/**
 * Builds the common base exception model used by all generated error types.
 */
function renderBaseExceptionClass(parent: CSharpFile) {
	const exceptionClass = new CSharpClass(parent, "EInnsynException");
	exceptionClass.addBaseType("Exception");

	const typeProperty = new CSharpProperty(exceptionClass, "string", "Type");
	typeProperty.setHasSetter(false);
	typeProperty.addAttribute(jsonPropertyName("type"));
	exceptionClass.addProperty(typeProperty.toString());

	const constructorMethod = new CSharpMethod(
		exceptionClass,
		"EInnsynException",
	);
	constructorMethod.setConstructor(true);
	constructorMethod.addParameter(
		"string message",
		"string type",
		"Exception? innerException = null",
	);
	constructorMethod.setConstructorInitializer("base(message, innerException)");
	constructorMethod.addBody("Type = type;");
	exceptionClass.addMethod(constructorMethod.toString());

	return exceptionClass.toString();
}

/**
 * Builds a single typed exception class from a TypeSpec error model.
 */
function renderExceptionClass(
	model: Model,
	defaultProps: CSharpBaseProps,
	inlineModelMap: Map<string, Model>,
	parent: CSharpFile,
) {
	const typeProperty = getPropertyFromModelHierarchy(model, "type");
	const typeValue =
		(typeProperty ? getFixedValue(typeProperty)?.toString() : undefined) ??
		model.name;
	const baseName = model.baseModel?.name || "EInnsynException";

	const extraProperties = [...model.properties.values()].filter((property) => {
		if (property.name === "type" || property.name === "message") {
			return false;
		}
		return true;
	});

	const exceptionClass = new CSharpClass(parent, model.name);
	exceptionClass.addBaseType(baseName);

	const constructorParameters: string[] = ["string message"];
	const assignments: string[] = [];

	for (const property of extraProperties) {
		const [propertyTypeRaw] = getCSharpType({
			...defaultProps,
			type: property,
			propertyName: property.name,
			stringEnums: true,
		});
		const propertyType = ensureNullable(propertyTypeRaw);
		const propertyName = toCSharpPropertyName(property.name);
		const parameterName = toCSharpParameterName(property.name);

		const exceptionProperty = new CSharpProperty(
			exceptionClass,
			propertyType,
			propertyName,
		);
		exceptionProperty.setHasSetter(false);
		exceptionProperty.addAttribute(jsonPropertyName(property.name));
		exceptionClass.addProperty(exceptionProperty.toString());

		constructorParameters.push(`${propertyType} ${parameterName} = default`);
		assignments.push(`${propertyName} = ${parameterName};`);

		const listType = getListType(property.type);
		const inlineModel = listType ?? property.type;
		if (inlineModel.kind === "Model" && !inlineModel.name) {
			inlineModelMap.set(
				getCSharpInlineModelClassName(property.name),
				inlineModel,
			);
		}
	}

	const constructorMethod = new CSharpMethod(exceptionClass, model.name);
	constructorMethod.setConstructor(true);
	constructorMethod.addParameter(...constructorParameters);
	constructorMethod.setConstructorInitializer(
		`base(message, ${csharpStringLiteral(typeValue)})`,
	);
	constructorMethod.addBody(...assignments);
	exceptionClass.addMethod(constructorMethod.toString());

	return exceptionClass.toString();
}

/**
 * Renders runtime error-type dispatch for deserializing API error responses.
 */
function renderResolver(models: Model[], defaultProps: CSharpBaseProps) {
	const cases: string[] = [];

	for (const model of models) {
		if (model.name === "EInnsynException") {
			continue;
		}
		const typeProperty = getPropertyFromModelHierarchy(model, "type");
		const typeValue = typeProperty
			? getFixedValue(typeProperty)?.toString()
			: undefined;
		if (!typeValue) {
			continue;
		}

		const extraProperties = [...model.properties.values()].filter(
			(property) => {
				if (property.name === "type" || property.name === "message") {
					return false;
				}
				return true;
			},
		);

		const constructorArgs: string[] = ["message"];
		for (const property of extraProperties) {
			const [propertyTypeRaw] = getCSharpType({
				...defaultProps,
				type: property,
				propertyName: property.name,
				stringEnums: true,
			});
			const propertyType = ensureNullable(propertyTypeRaw);
			constructorArgs.push(
				`DeserializeProperty<${propertyType}>(root, ${csharpStringLiteral(property.name)}, options)`,
			);
		}

		cases.push(
			`            ${csharpStringLiteral(typeValue)} => new ${model.name}(${constructorArgs.join(", ")}),`,
		);
	}

	return [
		"public static class EInnsynExceptionResolver",
		"{",
		"    public static EInnsynException Resolve(string? responseBody, JsonSerializerOptions options)",
		"    {",
		"        if (string.IsNullOrWhiteSpace(responseBody))",
		"        {",
		'            return new EInnsynException("An unknown error occurred", "eInnsynException");',
		"        }",
		"",
		"        try",
		"        {",
		"            using var document = JsonDocument.Parse(responseBody);",
		"            var root = document.RootElement;",
		'            var type = root.TryGetProperty("type", out var typeProperty)',
		"                ? typeProperty.GetString()",
		'                : "eInnsynException";',
		'            var message = root.TryGetProperty("message", out var messageProperty)',
		'                ? messageProperty.GetString() ?? "An unknown error occurred"',
		'                : "An unknown error occurred";',
		"",
		"            return type switch",
		"            {",
		...cases,
		'                _ => new EInnsynException(message, type ?? "eInnsynException"),',
		"            };",
		"        }",
		"        catch (Exception ex)",
		"        {",
		'            return new EInnsynException("Failed to parse error response", "eInnsynException", ex);',
		"        }",
		"    }",
		"",
		"    private static T? DeserializeProperty<T>(JsonElement root, string propertyName, JsonSerializerOptions options)",
		"    {",
		"        if (!root.TryGetProperty(propertyName, out var property))",
		"        {",
		"            return default;",
		"        }",
		"",
		"        try",
		"        {",
		"            return JsonSerializer.Deserialize<T>(property.GetRawText(), options);",
		"        }",
		"        catch",
		"        {",
		"            return default;",
		"        }",
		"    }",
		"}",
	].join("\n");
}

/**
 * Walks up model inheritance and returns the first property match.
 */
function getPropertyFromModelHierarchy(model: Model, propertyName: string) {
	let current: Model | undefined = model;
	while (current) {
		const property = current.properties.get(propertyName);
		if (property) {
			return property;
		}
		current = current.baseModel;
	}
	return undefined;
}
