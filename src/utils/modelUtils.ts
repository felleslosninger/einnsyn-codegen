import type { Model, ModelProperty } from "@typespec/compiler";
import { createRekeyableMap } from "@typespec/compiler/utils";

export function getFlattenedModel(model: Model): Model {
	const ancestors: Model[] = [];

	let baseModel: Model | undefined = model;
	while (baseModel) {
		ancestors.push(baseModel);
		baseModel = baseModel.baseModel;
	}

	// Iterate bottom-up
	const modelProperties: ModelProperty[] = [];
	for (const ancestor of ancestors.reverse()) {
		modelProperties.push(...ancestor.properties.values());
	}

	const flattenedModel: Model = {
		kind: "Model",
		entityKind: "Type",
		name: model.name,
		derivedModels: [],
		sourceModels: [],
		decorators: model.decorators ?? [],
		isFinished: true,
		namespace: model.namespace,
		properties: createRekeyableMap(modelProperties.map((p) => [p.name, p])),
	};

	return flattenedModel;
}

export function cloneModel(model: Model) {
	return {
		...model,
		properties: createRekeyableMap(
			Array.from(model.properties.values()).map((p) => [
				p.name,
				{ ...p, decorators: [...p.decorators] },
			]),
		),
	};
}
