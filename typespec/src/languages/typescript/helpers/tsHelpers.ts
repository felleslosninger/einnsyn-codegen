import type { Model, Namespace } from "@typespec/compiler";
import {
	getDependentModels,
	getModelPath,
	getNamespacePath,
} from "../../../utils/getters.js";
import {
	isEInnsynEntity,
	isEInnsynEntityNamespace,
	isList,
} from "../../../utils/typecheckers.js";
import type { TSImportType, TSProps } from "../types.js";

export function getTSEntityPathName(obj: Model | Namespace): string {
	return getTSEntityPathArray(obj).join("/").toLowerCase();
}

export function getTSEntityPathArray(obj: Model | Namespace): string[] {
	const path: string[] = [];
	const namespace = obj.kind === "Model" ? obj.namespace : obj;

	if (isEInnsynEntityNamespace(namespace)) {
		path.push("entities");
	} else {
		path.push("common");
	}

	if (obj.kind === "Model") {
		path.push(...getModelPath(obj));
	} else {
		path.push(...getNamespacePath(obj));
	}

	return path;
}

export function getTSModelClassName(props: TSProps) {
	const { model, entitySuffix = "" } = props;
	const modelName = (model?.name ?? "unnamed")
		.replace(/Exception$/, "Error")
		.replace(/ErrorError$/, "Error");
	return isEInnsynEntity(model) ? modelName + entitySuffix : modelName;
}

export function getTSImports(
	props: TSProps & {
		tsTypeImport?: boolean;
		withValidator?: boolean;
	},
): TSImportType[] {
	if (!props.model) {
		return [];
	}
	const models = getDependentModels(props.model);
	return models
		.filter((model) => !!model.name)
		.map((model) => {
			const className = getTSModelClassName({
				...props,
				model,
			});
			const classNameWithoutSuffix = getTSModelClassName({
				...props,
				model,
				entitySuffix: "",
			});
			const importList = [className];
			if (props.withValidator) {
				if (isList(model)) {
					importList.push(`is${className}List`);
				} else {
					importList.push(`is${className}`);
				}
			}
			return {
				modulePath: `${getTSEntityPathName(model)}/${classNameWithoutSuffix}`,
				importList: [className],
				isType: !!props.tsTypeImport,
			};
		});
}
