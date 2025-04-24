import type { AccessModifier } from "../types.js";
import CSharpPrimitive from "./csharpprimitive.js";

export default class CSharpEnum extends CSharpPrimitive {
	private accessModifier: AccessModifier = "public";
	private name: string;
	private values: string[] = []; // Simple list of value names for now

	constructor(parent: CSharpPrimitive | undefined, name: string) {
		super(parent);
		this.name = name;
	}

	getName(): string {
		return this.name;
	}

	setAccessModifier(modifier: AccessModifier): this {
		this.accessModifier = modifier;
		return this;
	}

	addValue(...values: string[]): this {
		this.values.push(...values);
		return this;
	}

	toString(indentationLevel = 0): string {
		const indent = this.indent(indentationLevel);
		const valueIndent = this.indent(indentationLevel + 1);

		const valueString =
			this.values.length > 0
				? `${this.values.map((v) => `${valueIndent}${v}`).join(",\n")}\n`
				: "";

		return [
			this.printDocumentation(indent),
			this.printAttributes(indent),
			`${indent}${this.accessModifier} enum ${this.name}\n${indent}{\n${valueString}${indent}}`,
		]
			.filter(Boolean)
			.join("");
	}
}
