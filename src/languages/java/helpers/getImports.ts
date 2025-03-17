import { getDependentModels } from "../../../utils/getters.js";
import type { JavaProps } from "../types.js";
import { getJavaModelPackageName, getModelClassName } from "./javaHelpers.js";

export function getImports(props: JavaProps) {
	if (!props.model) {
		return [];
	}
	const models = getDependentModels(props.model);
	return models
		.filter((model) => !!model.name)
		.map((model) => {
			const className = getModelClassName({
				...props,
				model,
			});
			return `${getJavaModelPackageName(props.packageName, model)}.${className}`;
		});
}
