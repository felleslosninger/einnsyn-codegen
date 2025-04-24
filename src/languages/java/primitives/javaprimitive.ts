import type { Primitive } from "../../common/primitive.js";
export default abstract class JavaPrimitive implements Primitive {
	parent?: JavaPrimitive;
	annotations: { [key: string]: string } = {};
	imports: { [key: string]: boolean } = {};
	documentation: string | undefined;

	constructor(parent: JavaPrimitive | undefined) {
		this.parent = parent;
	}

	addImport(...imports: string[]): void {
		if (this.parent === undefined) {
			for (const imp of imports) {
				this.imports[imp] = true;
			}
		} else {
			this.parent.addImport(...imports);
		}
	}

	setDocumentation(documentation?: string) {
		this.documentation = documentation;
	}

	printDocumentation(append?: string) {
		const strings = [];
		if (this.documentation) {
			strings.push(this.documentation);
		}
		if (append) {
			strings.push(append.split("\n"));
		}
		if (strings.length === 0) {
			return undefined;
		}
		return `/**\n * ${strings.join("\n * ")}\n */`;
	}

	addAnnotation(path: string, args = "") {
		if (!path.startsWith("@")) {
			this.addImport(path);
		} else {
			// biome-ignore lint/style/noParameterAssign:
			path = path.slice(1);
		}
		const annotation = path.split(".").slice(-1)[0];
		this.annotations[annotation] = args || "";
	}

	printAnnotations() {
		return Object.entries(this.annotations)
			.map(([annotation, args]) => `@${annotation}${args ? `(${args})` : ""}`)
			.join("\n");
	}
}
