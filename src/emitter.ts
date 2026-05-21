import { type EmitContext, ignoreDiagnostics } from "@typespec/compiler";
import { getAllHttpServices } from "@typespec/http";
import { reportDiagnostic } from "./lib.js";
import javaBackendEmitter from "./targets/java-backend/emit.js";
import javaSDKEmitter from "./targets/sdk-java/emit.js";
import tsSDKEmitter from "./targets/sdk-typescript/emit.js";

/**
 * Main emit function for the EInnsyn code generator
 * Generates Java backend, Java SDK, TypeScript SDK, and C# SDK code
 */
export async function $onEmit(context: EmitContext) {
	if (context.program.compilerOptions.noEmit) {
		return;
	}

	const program = context.program;
	const options = context.options as { targetNamespace?: string };
	const targetNamespace = options.targetNamespace ?? "EInnsyn";

	const httpServices = ignoreDiagnostics(getAllHttpServices(program));
	const [httpService] = httpServices.filter(
		(s) => s.namespace.name === targetNamespace,
	);

	if (!httpService) {
		reportDiagnostic(program, {
			code: "missing-http-service",
			format: {
				targetNamespace,
				availableNamespaces:
					httpServices.map((s) => s.namespace.name).join(", ") || "none",
			},
			target: context.program.getGlobalNamespaceType(),
		});
		throw new Error(`No HTTP service found for namespace '${targetNamespace}'`);
	}

	const targetNamespaceObj = httpService.namespace;
	if (!targetNamespaceObj) {
		reportDiagnostic(program, {
			code: "invalid-target-namespace",
			format: { targetNamespace },
			target: context.program.getGlobalNamespaceType(),
		});
		throw new Error(`Invalid namespace object for '${targetNamespace}'`);
	}

	try {
		await javaBackendEmitter(context, targetNamespaceObj);
		await javaSDKEmitter(context, targetNamespaceObj);
		await tsSDKEmitter(context, targetNamespaceObj);
	} catch (error) {
		console.error(
			`Failed to emit code: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error;
	}
}
