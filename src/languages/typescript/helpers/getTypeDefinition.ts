import type { Model, ModelProperty } from "@typespec/compiler";
import { getBodyProperties } from "../../../utils/getters.js";
import { TSType } from "../primitives/tsType.js";
import { TSTypeProperty } from "../primitives/tsTypeProperty.js";
import type { TSProps, TSPropsWithModel } from "../types.js";
import { getTSTypeName } from "./getTSTypeName.js";
import { isReadonlyProperty } from "@typespec/openapi";

export function getTypeDefinition(
	props: TSPropsWithModel & {
		readonly?: boolean;
		propertyFilter?: (property: ModelProperty) => boolean;
	},
) {
	const { parent, model } = props;
	const typeDefinition = new TSType(parent);

	const properties = getBodyProperties(model).filter(
		props.propertyFilter ?? (() => true),
	);

	for (const property of properties) {
		const [tsType, tsTypeImports] = getTSTypeName({
			...props,
			type: property,
		});
		const typeProperty = new TSTypeProperty(parent, property.name, tsType);
		typeProperty.optional = property.optional;
		typeProperty.readonly =
			props.readonly || isReadonlyProperty(props.context.program, property);
		typeDefinition.addImport(...tsTypeImports);
		typeDefinition.addProperty(typeProperty);
	}

	return typeDefinition;
}
