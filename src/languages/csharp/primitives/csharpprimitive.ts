import { CSharpFile } from "./csharpfile.js";
import type CSharpAttribute from "./attribute.js";

export default abstract class CSharpPrimitive {
	parent?: CSharpPrimitive;
	attributes: CSharpAttribute[] = [];
	documentation?: string;

	constructor(parent: CSharpPrimitive | undefined) {
		this.parent = parent;
	}

	addUsing(...usings: string[]) {
		if (this.parent !== undefined) {
			this.parent.addUsing(...usings);
		}
		return this;
	}

	setDocumentation(documentation?: string) {
		this.documentation = documentation;
		return this;
	}

	addAttribute(...attributes: CSharpAttribute[]) {
		for (const attr of attributes) {
			this.attributes.push(attr);
			attr.addRequiredUsings(this); // Add attribute's namespace using
		}
		return this;
	}

	protected printDocumentation(indent = "") {
		if (!this.documentation) {
			return "";
		}
		const lines = this.documentation.split("\n");
		return `${lines
			.map((line) => `${indent}/// <summary>${line}</summary>`)
			.join("\n")}\n`;
	}

	protected printAttributes(indent = "") {
		if (this.attributes.length === 0) {
			return "";
		}
		return `${this.attributes.map((attr) => `${indent}${attr.toString()}`).join("\n")}\n`;
	}

	// Helper for indentation
	protected indent(level: number) {
		return " ".repeat(level * 4); // Using 4 spaces for indentation
	}

	abstract toString(indentationLevel?: number): string;
}
