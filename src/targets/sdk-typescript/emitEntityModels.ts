import {
	type EmitContext,
	type Model,
	type Namespace,
	emitFile,
	resolvePath,
} from "@typespec/compiler";
import { isReadonlyProperty } from "@typespec/openapi";
import {
	getDeprecatedTag,
	getDocumentation,
	getParamTag,
	joinDocumentation,
} from "../../languages/typescript/helpers/getJSDoc.js";
import { getTSTypeName } from "../../languages/typescript/helpers/getTSTypeName.js";
import { getTypeDefinition } from "../../languages/typescript/helpers/getTypeDefinition.js";
import {
	getTSEntityPathName,
	getTSModelClassName,
} from "../../languages/typescript/helpers/tsHelpers.js";
import { TSFile } from "../../languages/typescript/primitives/tsFile.js";
import TSFunction from "../../languages/typescript/primitives/tsFunction.js";
import { TSFunctionParameter } from "../../languages/typescript/primitives/tsFunctionParameter.js";
import TSInterface from "../../languages/typescript/primitives/tsInterface.js";
import type { TSProps } from "../../languages/typescript/types.js";
import { recursivelyGetModels } from "../../utils/getters.js";
import {
	isEInnsynEntity,
	isWriteonlyProperty,
} from "../../utils/typecheckers.js";

export function emitEntityModels(
	context: EmitContext,
	defaultProps: TSProps,
	eInnsynNamespace: Namespace,
) {
	const models = recursivelyGetModels(eInnsynNamespace).filter((model) =>
		isEInnsynEntity(model),
	);

	for (const model of models) {
		// Create java file
		const className = getTSModelClassName({
			...defaultProps,
			model,
		});
		const modelPathName = `${getTSEntityPathName(model)}/${className}`;
		const modelFile = new TSFile(modelPathName);

		const modelDocumentation = getDocumentation(context.program, model);

		// Add entity interface
		const int = new TSInterface(modelFile, className);
		int.setDocumentation(modelDocumentation);
		int.addDocTag(getDeprecatedTag(context.program, model));
		int.typeDefinition = getTypeDefinition({
			...defaultProps,
			parent: int,
			model,
			readonly: true,
			propertyFilter: (p) => !isWriteonlyProperty(context.program, p),
		});

		if (model.baseModel) {
			const [baseType, baseImports] = getTSTypeName({
				...defaultProps,
				type: model.baseModel,
			});
			int.addImport(...baseImports);
			int.addExtends(baseType);
		}
		modelFile.addInterface({ int, isExported: true });

		// Add entity request interface
		const requestInterface = new TSInterface(modelFile, `${className}Request`);
		requestInterface.setDocumentation(
			joinDocumentation(
				modelDocumentation,
				`The writable variant of {@link ${className}}, used as the request body when creating or updating a ${className}.`,
			),
		);
		requestInterface.addDocTag(getDeprecatedTag(context.program, model));
		requestInterface.typeDefinition = getTypeDefinition({
			...defaultProps,
			parent: requestInterface,
			model,
			entitySuffix: "Request",
			propertyFilter: (p) => !isReadonlyProperty(context.program, p),
		});

		if (model.baseModel) {
			const [baseType, baseImports] = getTSTypeName({
				...defaultProps,
				type: model.baseModel,
				entitySuffix: "Request",
			});
			requestInterface.addImport(...baseImports);
			requestInterface.addExtends(baseType);
		}
		modelFile.addInterface({ int: requestInterface, isExported: true });

		// Add type checker for entities (not superclasses)
		if (isEInnsynEntity(model)) {
			// Recursively get all leaf-node subclasses
			const recurse = (model: Model): string[] => {
				const derivedModels = model.derivedModels;
				if (model.derivedModels.length === 0) {
					return [model.name];
				}
				const subclasses = derivedModels.map((m) => recurse(m));
				return subclasses.flat();
			};
			const subclasses = recurse(model);
			// Create function
			const isEntityFunction = new TSFunction(modelFile, `is${className}`);
			isEntityFunction.setDocumentation(
				`Type guard that narrows an unknown value to {@link ${className}}, by checking its \`entity\` discriminator.`,
			);
			isEntityFunction.addDocTag(
				getParamTag("obj", "The value to check."),
				`@returns \`true\` if \`obj\` is a ${className}.`,
			);
			isEntityFunction.addParameter(
				new TSFunctionParameter(isEntityFunction, "obj", "unknown"),
			);
			isEntityFunction.returnType = `obj is ${className}`;
			// Generate comparison
			const switchStatements = subclasses.map(
				(subclass) => `case '${subclass}':`,
			);
			if (switchStatements.length > 0) {
				switchStatements.push("return true;");
			}
			isEntityFunction.addBody(
				"switch ((obj as { entity: string })?.entity) {",
				switchStatements.join("\n"),
				"default: return false;",
				"}",
			);
			modelFile.addFunction(isEntityFunction, true);
		}

		// Add isPaginated<Entity>List function
		if (isEInnsynEntity(model)) {
			const isPaginatedListFunction = new TSFunction(
				modelFile,
				`isPaginated${className}List`,
			);
			isPaginatedListFunction.setDocumentation(
				`Type guard that narrows an unknown value to a paginated list of {@link ${className}}.`,
			);
			isPaginatedListFunction.addDocTag(
				getParamTag("obj", "The value to check."),
				`@returns \`true\` if \`obj\` is a \`PaginatedList\` where every item is a ${className}.`,
			);
			isPaginatedListFunction.addParameter(
				new TSFunctionParameter(isPaginatedListFunction, "obj", "unknown"),
			);
			isPaginatedListFunction.returnType = `obj is PaginatedList<${className}>`;
			isPaginatedListFunction.addBody(
				`return obj !== undefined && Array.isArray((obj as PaginatedList<${className}>)?.items) && (obj as PaginatedList<${className}>).items.every((i) => is${className}(i));`,
			);
			modelFile.addFunction(isPaginatedListFunction, true);
			modelFile.addImport({
				modulePath: "common/responses/PaginatedList",
				importList: ["PaginatedList"],
				isType: true,
			});
		}

		// Emit file
		emitFile(context.program, {
			path: resolvePath(
				context.emitterOutputDir,
				`sdk-typescript/${modelPathName}.ts`,
			),
			content: modelFile.toString(),
		});
	}
}
