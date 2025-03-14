import type { Model } from "@typespec/compiler";
import type { Props } from "../../types.js";
import type JavaPrimitive from "./primitives/javaprimitive.js";

export type JavaBaseProps = Props & {
	packageName: string;
	entitySuffix?: string;
};

export type JavaProps = JavaBaseProps & {
	parent?: JavaPrimitive;
	wrapExpandableFields?: boolean;
	validate?: boolean;
	className?: string;
	addFieldVariables?: boolean;
	addGetters?: boolean;
	addSetters?: boolean;
	addConstructors?: boolean;
	addBuilder?: boolean;
	addSubModels?: boolean;
	addLombokGetters?: boolean;
	addLombokSetters?: boolean;
	addInlineEnums?: boolean;
	isBuilder?: boolean;
	skipReadOnlyProperties?: boolean;
	setDefaultValues?: boolean;
	visibility?: "public" | "protected" | "private";
	stringEnums?: boolean;
};

export type JavaPropsWithModel = JavaProps & { model: Model };
