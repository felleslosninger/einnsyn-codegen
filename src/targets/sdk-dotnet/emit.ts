import type { EmitContext, Namespace } from "@typespec/compiler";
import type { CSharpBaseProps } from "../../languages/csharp/types.js";
import { emitClientBase } from "./emitClientBase.js";
import { emitEntityModels } from "./emitEntityModels.js";
import { emitEntityRouteResolver } from "./emitEntityRouteResolver.js";
import { emitExceptionModels } from "./emitExceptionModels.js";
import { emitOperations } from "./emitOperations.js";
import { emitUnknownModels } from "./emitUnknownModels.js";
import { ROOT_NAMESPACE } from "./variables.js";

export default async function emit(
	context: EmitContext,
	eInnsynNamespace: Namespace,
) {
	const defaultProps: CSharpBaseProps = {
		context,
		rootNamespace: ROOT_NAMESPACE,
	};

	emitEntityModels(context, { ...defaultProps }, eInnsynNamespace);
	emitUnknownModels(context, { ...defaultProps }, eInnsynNamespace);
	emitExceptionModels(context, { ...defaultProps }, eInnsynNamespace);
	emitOperations(context, { ...defaultProps }, eInnsynNamespace);
	emitClientBase(context, { ...defaultProps }, eInnsynNamespace);
	emitEntityRouteResolver(context, { ...defaultProps }, eInnsynNamespace);
}
