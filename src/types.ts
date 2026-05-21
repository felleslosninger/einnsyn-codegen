import type { EmitContext, Model } from "@typespec/compiler";
import type { HttpOperationParameter } from "@typespec/http";

export type Visibility = "" | "private" | "protected" | "public";

/**
 * Configuration options for the emitter
 */
export interface EmitterOptions {
	/** The package name for generated code */
	packageName: string;
	/** The target namespace to generate code for (defaults to 'EInnsyn') */
	targetNamespace?: string;
}

/**
 * Properties passed to emit functions
 */
export interface Props {
	/** The TypeSpec emit context */
	context: EmitContext;
	/** Optional model being processed */
	model?: Model;
	/** Optional HTTP operation parameters */
	httpOperationParameters?: HttpOperationParameter[];
}
