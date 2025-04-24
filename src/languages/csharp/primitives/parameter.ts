import type { AccessModifier } from "../types.js";
import CSharpPrimitive from "./csharpprimitive.js";
import type CSharpAttribute from "./attribute.js";

export default class CSharpParameter extends CSharpPrimitive {
	private name: string;
	private type: string;
	private modifier?: "ref" | "out" | "params" | "this"; // 'this' for extension methods
	private defaultValue?: string;

	constructor(parent: CSharpPrimitive | undefined, type: string, name: string) {
		super(parent);
		this.name = name;
		this.type = type;
	}

	setModifier(modifier?: "ref" | "out" | "params" | "this"): this {
		this.modifier = modifier;
		return this;
	}

	setDefaultValue(value: string | number | boolean | null): this {
		if (value === null) {
			this.defaultValue = "null";
		} else if (typeof value === "string") {
			this.defaultValue = `"${value.replace(/"/g, '\\"')}"`; // Escape quotes
		} else {
			this.defaultValue = String(value);
		}
		return this;
	}

	// Override addAttribute to handle parameter-specific attributes if needed,
	// though CSharpPrimitive's implementation might suffice.

	toString(): string {
		// IndentationLevel not needed, handled by caller (Method/Constructor)
		const attribs =
			this.attributes.length > 0
				? `${this.attributes.map((a) => a.toString()).join(" ")} `
				: "";
		const mod = this.modifier ? `${this.modifier} ` : "";
		const defVal = this.defaultValue ? ` = ${this.defaultValue}` : "";
		return `${attribs}${mod}${this.type} ${this.name}${defVal}`;
	}
}
