import type { TSFunctionParameter } from "./tsFunctionParameter.js";
import TSPrimitive from "./tsPrimitive.js";

export default class TSFunction extends TSPrimitive {
	private name?: string;
	private parameters: TSFunctionParameter[];
	private body: string[] = [];
	isConstructor = false;
	isAsync = false;
	returnType?: string;

	constructor(parent: TSPrimitive | undefined, name?: string) {
		super(parent);
		this.name = name;
		this.parameters = [];
	}

	addParameter(...parameters: TSFunctionParameter[]) {
		for (const parameter of parameters) {
			this.parameters.push(parameter);
		}
		return this;
	}

	addBody(...bodyLines: (string | undefined)[]) {
		for (const body of bodyLines) {
			if (body !== undefined) {
				this.body.push(body);
			}
		}
		return this;
	}

	toString(): string {
		return [
			this.printDocumentation(),
			[
				this.isAsync ? "async " : "",
				this.isConstructor ? "constructor " : `${this.name || ""} `,
			].join(""),
			"(",
			this.parameters.map((p) => `${p.toString()}`).join(", "),
			")",
			this.returnType ? `: ${this.returnType}` : "",
			" {",
			this.body.join("\n"),
			"}",
		]
			.filter((s) => s !== undefined)
			.join("\n");
	}
}
