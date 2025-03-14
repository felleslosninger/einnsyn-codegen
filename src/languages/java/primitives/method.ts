import type { Visibility } from "../../../types.js";
import JavaPrimitive from "./javaprimitive.js";
import type Parameter from "./parameter.js";

export default class Method extends JavaPrimitive {
	private name?: string;
	private visibility: Visibility = "public";
	private static = false;
	private parameters: Parameter[];
	private returnType: string;
	private body: string[] = [];
	private throws: string[] = [];

	constructor(
		parent: JavaPrimitive | undefined,
		returnType: string,
		name?: string,
	) {
		super(parent);
		this.name = name;
		this.parameters = [];
		this.returnType = returnType;
	}

	setVisibility(visibility: Visibility) {
		this.visibility = visibility;
	}

	setStatic(isStatic: boolean) {
		this.static = isStatic;
	}

	addParameter(...parameters: Parameter[]) {
		for (const parameter of parameters) {
			this.parameters.push(parameter);
		}
		return this;
	}

	addThrows(...exceptions: string[]) {
		for (const exception of exceptions) {
			this.addImport(exception);
			this.throws.push(exception.split(".").slice(-1)[0]);
		}
	}

	printThrows() {
		return this.throws.length > 0 ? ` throws ${this.throws.join(", ")}` : "";
	}

	addBody(...bodyLines: string[]) {
		for (const body of bodyLines) {
			this.body.push(body);
		}
		return this;
	}

	toString(): string {
		return [
			this.printDocumentation(),
			this.printAnnotations(),
			`${this.visibility ? `${this.visibility} ` : ""}${this.static ? "static " : ""}${this.returnType} ${this.name || ""}(${this.parameters
				.map((p) => `${p.toString()}`)
				.join(", ")})${this.printThrows()} {`,
			` ${this.body.join("\n")}`,
			"}",
		]
			.filter((s) => s !== undefined)
			.join("\n");
	}
}
