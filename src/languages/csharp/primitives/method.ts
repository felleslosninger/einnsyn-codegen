import type { AccessModifier } from "../types.js";
import CSharpPrimitive from "./csharpprimitive.js";
import type CSharpParameter from "./parameter.js";

export default class CSharpMethod extends CSharpPrimitive {
	private accessModifier: AccessModifier = "public";
	private isStatic = false;
	private isAbstract = false;
	private isVirtual = false;
	private isOverride = false;
	private isAsync = false;
	private returnType: string; // Use "void" for no return
	private name: string;
	private parameters: CSharpParameter[] = [];
	private body: string[] = []; // Lines of code for the method body
	private generics: string[] = []; // e.g., ["T", "K"]

	constructor(
		parent: CSharpPrimitive | undefined,
		returnType: string,
		name: string,
	) {
		super(parent);
		this.returnType = returnType;
		this.name = name;
	}

	setAccessModifier(modifier: AccessModifier): this {
		this.accessModifier = modifier;
		return this;
	}

	setStatic(isStatic: boolean): this {
		this.isStatic = isStatic;
		return this;
	}

	setAbstract(isAbstract: boolean): this {
		this.isAbstract = isAbstract;
		if (isAbstract) this.body = []; // Abstract methods have no body
		return this;
	}

	setVirtual(isVirtual: boolean): this {
		this.isVirtual = isVirtual;
		return this;
	}

	setOverride(isOverride: boolean): this {
		this.isOverride = isOverride;
		return this;
	}

	setAsync(isAsync: boolean): this {
		this.isAsync = isAsync;
		// Consider adding using System.Threading.Tasks automatically if async?
		// Or rely on user to add it. Let's rely on user for now.
		return this;
	}

	addParameter(...parameters: CSharpParameter[]): this {
		for (const p of parameters) {
			this.parameters.push(p);
			p.parent = this; // Set parent relationship
		}
		return this;
	}

	addGeneric(...generics: string[]): this {
		for (const g of generics) {
			this.generics.push(g);
		}
		return this;
	}

	addBody(...lines: string[]): this {
		if (this.isAbstract)
			throw new Error("Cannot add body to an abstract method.");
		this.body.push(...lines);
		return this;
	}

	toString(indentationLevel = 0): string {
		const indent = this.indent(indentationLevel);
		const bodyIndent = this.indent(indentationLevel + 1);
		const modifier = this.accessModifier;
		const stat = this.isStatic ? " static" : "";
		const abs = this.isAbstract ? " abstract" : "";
		const virt = !abs && this.isVirtual ? " virtual" : ""; // Not both abstract and virtual
		const over = !abs && this.isOverride ? " override" : ""; // Not both abstract and override
		const asy = this.isAsync ? " async" : "";
		const gen = this.generics.length > 0 ? `<${this.generics.join(", ")}>` : "";
		const params = this.parameters.map((p) => p.toString()).join(", "); // Parameter handles its own formatting

		let bodyContent: string;
		if (this.isAbstract) {
			bodyContent = ";";
		} else {
			const lines =
				this.body.length > 0
					? `${this.body.map((line) => `${bodyIndent}${line}`).join("\n")}\n`
					: "";
			bodyContent = `\n${indent}{\n${lines}${indent}}`;
		}

		return [
			this.printDocumentation(indent),
			this.printAttributes(indent),
			`${indent}${modifier}${stat}${abs}${virt}${over}${asy} ${this.returnType} ${this.name}${gen}(${params})${bodyContent}`,
		]
			.filter(Boolean)
			.join("");
	}
}
