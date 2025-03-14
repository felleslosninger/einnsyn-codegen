import type { Model } from "@typespec/compiler";
import type { Props } from "../../types.js";
import type TSPrimitive from "./primitives/tsPrimitive.js";

export type TSImportType = {
	modulePath: string;
	importList: string[];
	isType?: boolean;
};

export type TSProps = Props & {
	parent?: TSPrimitive;
	className?: string;
	entitySuffix?: string;
	model?: Model;
};

export type TSPropsWithModel = TSProps & { model: Model };
