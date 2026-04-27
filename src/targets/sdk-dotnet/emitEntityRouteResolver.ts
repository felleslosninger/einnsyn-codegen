import {
	type EmitContext,
	emitFile,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import {
	getCSharpModelClassName,
	getCSharpModelNamespace,
} from "../../languages/csharp/helpers/csharpHelpers.js";
import { CSharpFile } from "../../languages/csharp/primitives/csharpFile.js";
import type { CSharpBaseProps } from "../../languages/csharp/types.js";
import {
	getOperationsByNamespace,
	recursivelyGetModels,
} from "../../utils/getters.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";
import { OUTPUT_ROOT } from "./variables.js";

export function emitEntityRouteResolver(
	context: EmitContext,
	defaultProps: CSharpBaseProps,
	eInnsynNamespace: Namespace,
) {
	const operationsByNamespace = getOperationsByNamespace(
		context.program,
		eInnsynNamespace,
	);

	const namespaceRouteMap = new Map<string, string>();
	for (const [namespace, operations] of operationsByNamespace) {
		const getOperation = operations.find(
			(operation) =>
				operation.verb.toLowerCase() === "get" &&
				/\/\{[^/]+\}$/.test(operation.path),
		);
		if (!getOperation) {
			continue;
		}
		const basePath = getOperation.path.replace(/\/\{[^/]+\}$/, "");
		namespaceRouteMap.set(namespace.name, basePath);
	}

	const resolvedModels = recursivelyGetModels(eInnsynNamespace)
		.filter((model) => isEInnsynEntity(model))
		.filter((model) => model.derivedModels.length === 0)
		.flatMap((model) => {
			const namespaceName = model.namespace?.name;
			if (!namespaceName) {
				return [];
			}

			const route = namespaceRouteMap.get(namespaceName);
			if (!route) {
				return [];
			}

			return [{ model, route }];
		});

	const file = new CSharpFile(
		`${defaultProps.rootNamespace}.Net.Serialization`,
	);
	file.addUsing("System", "System.Collections.Generic");

	for (const { model } of resolvedModels) {
		file.addUsing(getCSharpModelNamespace(defaultProps.rootNamespace, model));
	}

	const mapEntries = resolvedModels.map(({ model, route }) => {
		const className = getCSharpModelClassName({ ...defaultProps, model });
		return `        { typeof(${className}), "${route}" }`;
	});

	file.addMember(
		[
			"public static class EntityRouteResolver",
			"{",
			"    private static readonly Dictionary<Type, string> TypeMap = new()",
			"    {",
			mapEntries.join(",\n"),
			"    };",
			"",
			"    public static string? GetEntityPath(Type type)",
			"    {",
			"        return TypeMap.TryGetValue(type, out var path) ? path : null;",
			"    }",
			"}",
		].join("\n"),
	);

	emitFile(context.program, {
		path: resolvePath(
			context.emitterOutputDir,
			`${OUTPUT_ROOT}/Net/Serialization/EntityRouteResolver.g.cs`,
		),
		content: file.toString(),
	});
}
