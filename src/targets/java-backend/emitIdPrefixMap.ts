import {
	type EmitContext,
	emitFile,
	type Namespace,
	resolvePath,
} from "@typespec/compiler";
import { getExtensions } from "@typespec/openapi";
import Class from "../../languages/java/primitives/class.js";
import Field from "../../languages/java/primitives/field.js";
import { JavaFile } from "../../languages/java/primitives/javafile.js";
import type { JavaBaseProps } from "../../languages/java/types.js";
import { recursivelyGetModels } from "../../utils/getters.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";

export function emitIdPrefixMap(
	context: EmitContext,
	defaultProps: JavaBaseProps,
	eInnsynNamespace: Namespace,
) {
	const packageName = "no.einnsyn.backend.utils.idgenerator";
	const basePath = defaultProps.packageName.split(".").join("/");
	const pathName = `${basePath}/utils/idgenerator`;
	const file = new JavaFile(packageName);
	const modelClass = new Class(file, "IdPrefix");
	modelClass.addImport("java.util.Map");
	file.addClass(modelClass);

	const field = new Field(modelClass, "map", "Map<String, String>");
	field.setFinal(true);
	field.setVisibility("public");
	field.setStatic(true);
	modelClass.addField(field);

	const mapEntries: string[] = [];
	const models = recursivelyGetModels(eInnsynNamespace).filter((model) =>
		isEInnsynEntity(model),
	);
	for (const model of models) {
		const modelName = model.name;
		const extensions = getExtensions(context.program, model);
		const idPrefix = extensions.get("x-idPrefix");
		if (modelName && idPrefix) {
			mapEntries.push(`Map.entry("${modelName}", "${idPrefix}")`);
		}
	}
	field.setRawValue(`Map.ofEntries(${mapEntries.join(", ")})`);

	emitFile(context.program, {
		path: resolvePath(context.emitterOutputDir, `${pathName}/IdPrefix.java`),
		content: file.toString(),
	});
}
