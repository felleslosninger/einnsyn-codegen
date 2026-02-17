import type { Model } from "@typespec/compiler";
import type { Props } from "../../types.js";
import type CSharpPrimitive from "./primitives/csharpPrimitive.js";

export type CSharpBaseProps = Props & {
	rootNamespace: string;
};

export type CSharpProps = CSharpBaseProps & {
	parent?: CSharpPrimitive;
	model?: Model;
	className?: string;
	entitySuffix?: string;
	stringEnums?: boolean;
	wrapExpandableFields?: boolean;
};

export type CSharpPropsWithModel = CSharpProps & {
	model: Model;
};
