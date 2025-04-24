import type { AccessModifier } from "../types.js";
import CSharpPrimitive from "./csharpprimitive.js";
import type CSharpParameter from "./parameter.js";
import CSharpClass from "./class.js";

export default class CSharpConstructor extends CSharpPrimitive {
	private accessModifier: AccessModifier = "public";
	private isStatic = false; // For static constructors
	private parameters: CSharpParameter[] = [];
	private body: string[] = [];
	private baseCall?: string; // e.g., "base(arg1, arg2)" or "this(arg)"

	setAccessModifier(modifier: AccessModifier): this {
		this.accessModifier = modifier;
		return this;
	}

	setStatic(isStatic: boolean): this {
		this.isStatic = isStatic;
		if (isStatic) {
			this.accessModifier = "private"; // Static constructors are implicitly private
			this.parameters = []; // Static constructors have no parameters
			this.baseCall = undefined; // Static constructors cannot call base/this
		}
		return this;
	}

	addParameter(...parameters: CSharpParameter[]): this {
		if (this.isStatic)
			throw new Error("Static constructors cannot have parameters.");
		for (const p of parameters) {
			this.parameters.push(p);
			p.parent = this;
		}
		return this;
	}

	/** Sets the base or this constructor call, e.g., "base(value)" or "this(true)" */
	setBaseCall(call: string): this {
		if (this.isStatic)
			throw new Error("Static constructors cannot have base/this calls.");
		if (!call.startsWith("base(") && !call.startsWith("this(")) {
			console.warn(
				`Base call "${call}" might be invalid. Ensure it starts with 'base(' or 'this('.`,
			);
		}
		this.baseCall = call;
		return this;
	}

	addBody(...lines: string[]): this {
		this.body.push(...lines);
		return this;
	}

	toString(indentationLevel = 0): string {
		if (!this.parent || !(this.parent instanceof CSharpClass)) {
			throw new Error("CSharpConstructor must have a CSharpClass parent.");
		}
		const className = (this.parent as CSharpClass).getName();

		const indent = this.indent(indentationLevel);
		const bodyIndent = this.indent(indentationLevel + 1);
		const modifier = this.isStatic ? "static" : this.accessModifier;
		const name = this.isStatic ? "" : className; // Static constructors have no name in signature part
		const params = this.parameters.map((p) => p.toString()).join(", ");
		const base = this.baseCall ? `\n${indent}    : ${this.baseCall}` : ""; // Indent base call

		const lines =
			this.body.length > 0
				? `${this.body.map((line) => `${bodyIndent}${line}`).join("\n")}\n`
				: "";
		const bodyContent = `\n${indent}{\n${lines}${indent}}`;

		return [
			this.printDocumentation(indent),
			this.printAttributes(indent),
			`${indent}${modifier} ${name}(${params})${base}${bodyContent}`,
		]
			.filter(Boolean)
			.join("");
	}
}
