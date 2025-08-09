import type { EmitContext, Namespace } from "@typespec/compiler";
import { emitEntityModels } from "./emitEntityModels.js";
import type { TSProps } from "../../languages/typescript/types.js";
import { emitUnknownModels } from "./emitUnknownModels.js";
import { emitExceptionModels } from "./emitExceptionModels.js";
import { emitOperations } from "./emitOperations.js";
import { emitClientBase } from "./emitClientBase.js";
import { emitTypes } from "./emitTypes.js";

export default async function emit(
	context: EmitContext,
	eInnsynNamespace: Namespace,
) {
	const defaultProps: TSProps = {
		context,
	};

	// Emit eInnsyn entity models
	emitEntityModels(context, { ...defaultProps }, eInnsynNamespace);

	// // Emit non-eInnsyn models (query parameters etc.)
	emitUnknownModels(context, { ...defaultProps }, eInnsynNamespace);

	// // Emit exception models
	emitExceptionModels(context, { ...defaultProps }, eInnsynNamespace);

	// Emit operations
	emitOperations(context, { ...defaultProps }, eInnsynNamespace);

	// Emit EInnsynClientBase
	emitClientBase(context, { ...defaultProps }, eInnsynNamespace);

	// Emit types
	emitTypes(context, { ...defaultProps }, eInnsynNamespace);
}
