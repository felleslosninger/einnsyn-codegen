import type { AccessModifier } from "../types.js";
import CSharpPrimitive from "./csharpprimitive.js";

export default class CSharpField extends CSharpPrimitive {
	private accessModifier: AccessModifier = "private";
	private isStatic = false;
	private isReadOnly = false;
	private isConst = false; // Note: const implies static in C#
	private type: string;
	private name: string;
	private initializer?: string; // Store initializer as a raw string

	constructor(parent: CSharpPrimitive | undefined, type: string, name: string) {
		super(parent);
		this.type = type;
		this.name = name;
	}

	setAccessModifier(modifier: AccessModifier): this {
		this.accessModifier = modifier;
		return this;
	}

	setStatic(isStatic: boolean): this {
		this.isStatic = isStatic;
		if (isStatic && this.isConst) this.isConst = false; // Cannot be static and const explicitly
		return this;
	}

	setReadOnly(isReadOnly: boolean): this {
		this.isReadOnly = isReadOnly;
		if (isReadOnly && this.isConst) this.isConst = false; // Cannot be readonly and const
		return this;
	}

	setConst(isConst: boolean): this {
		this.isConst = isConst;
		if (isConst) {
			this.isReadOnly = false; // Cannot be const and readonly
			this.isStatic = false; // Cannot be const and explicitly static
			// Const fields require an initializer
			if (this.initializer === undefined) {
				console.warn(
					`Const field '${this.name}' requires an initializer. Set one using setInitializer().`,
				);
			}
		}
		return this;
	}

	/** Sets the initializer value. Provide the raw C# code for the right side of = */
	setInitializer(value: string | number | boolean | null): this {
		if (value === null) {
			this.initializer = "null";
		} else if (typeof value === "string") {
			// Check if it's already quoted or seems like code
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				value.includes("(") ||
				value.includes(".")
			) {
				this.initializer = value;
			} else {
				this.initializer = `"${value.replace(/"/g, '\\"')}"`; // Auto-quote simple strings
			}
		} else {
			this.initializer = String(value); // Numbers, booleans
		}
		return this;
	}

	/** Sets a raw initializer string, useful for `new(...)` or complex expressions */
	setRawInitializer(rawInitializer: string): this {
		this.initializer = rawInitializer;
		return this;
	}

	toString(indentationLevel = 0): string {
		const indent = this.indent(indentationLevel);
		const modifier = this.accessModifier;
		const stat = this.isConst ? "" : this.isStatic ? " static" : ""; // const implies static
		const read = this.isConst ? " const" : this.isReadOnly ? " readonly" : "";
		const init = this.initializer !== undefined ? ` = ${this.initializer}` : "";

		if (this.isConst && this.initializer === undefined) {
			console.error(
				`Const field '${this.name}' is missing an initializer! Output may be invalid.`,
			);
		}

		return [
			this.printDocumentation(indent),
			this.printAttributes(indent),
			`${indent}${modifier}${stat}${read} ${this.type} ${this.name}${init};`,
		]
			.filter(Boolean) // Remove empty lines
			.join(""); // Already includes newlines from printDocumentation/printAttributes
	}
}
