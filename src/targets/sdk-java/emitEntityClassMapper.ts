import {
	type EmitContext,
	type Namespace,
	emitFile,
	resolvePath,
} from "@typespec/compiler";
import { getImports } from "../../languages/java/helpers/getImports.js";
import Class from "../../languages/java/primitives/class.js";
import { JavaFile } from "../../languages/java/primitives/javafile.js";
import Method from "../../languages/java/primitives/method.js";
import Parameter from "../../languages/java/primitives/parameter.js";
import type { JavaBaseProps } from "../../languages/java/types.js";
import { recursivelyGetModels } from "../../utils/getters.js";
import { isEInnsynEntity } from "../../utils/typecheckers.js";

export function emitEntityClassMapper(
	context: EmitContext,
	defaultProps: JavaBaseProps,
	eInnsynNamespace: Namespace,
) {
	const eInnsynEntities = recursivelyGetModels(eInnsynNamespace)
		.filter((model) => isEInnsynEntity(model))
		.filter((model) => model.derivedModels.length === 0);

	const packageName = `${defaultProps.packageName}.net.parsing`;
	const pathName = packageName.split(".").join("/").toLowerCase();
	const file = new JavaFile(packageName);

	const clientBaseClass = new Class(file, "EntityClassMapper");

	const getClassFromEntityMethod = new Method(
		clientBaseClass,
		"Class<? extends Base>",
		"getClassFromEntity",
	);
	getClassFromEntityMethod.addImport(
		"no.einnsyn.sdk.entities.base.models.Base",
	);
	getClassFromEntityMethod.setStatic(true);
	getClassFromEntityMethod.addParameter(
		new Parameter(getClassFromEntityMethod, "entity", "String"),
	);
	getClassFromEntityMethod.addBody("switch (entity) {");
	for (const entity of eInnsynEntities) {
		getClassFromEntityMethod.addBody(
			`case "${entity.name}": return ${entity.name}.class;`,
		);
		const imports = getImports({ ...defaultProps, model: entity });
		file.addImport(...imports);
	}
	getClassFromEntityMethod.addBody("default: return null;");
	getClassFromEntityMethod.addBody("}");
	clientBaseClass.addMethod(getClassFromEntityMethod);
	file.addClass(clientBaseClass);

	// Emit file
	emitFile(context.program, {
		path: resolvePath(
			context.emitterOutputDir,
			`${pathName}/EntityClassMapper.java`,
		),
		content: file.toString(),
	});
}
