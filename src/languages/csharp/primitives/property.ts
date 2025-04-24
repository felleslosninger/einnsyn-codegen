import type { AccessModifier } from "../types.js";
import CSharpPrimitive from "./csharpprimitive.js";

export default class CSharpProperty extends CSharpPrimitive {
	private accessModifier: AccessModifier = "public";
	private isStatic = false;
	private isAbstract = false;
	private isVirtual = false;
	private isOverride = false;
	private type: string;
	private name: string;
	private getter: boolean | { modifier?: AccessModifier; body?: string[] } =
		true; // true for auto-getter
	private setter: boolean | { modifier?: AccessModifier; body?: string[] } =
		true; // true for auto-setter
	private initializer?: string; // For auto-properties with initializers

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
		return this;
	}

	setAbstract(isAbstract: boolean): this {
		this.isAbstract = isAbstract;
		if (isAbstract) {
			// Abstract properties cannot have bodies or initializers
			this.getter = true;
			this.setter = true;
			this.initializer = undefined;
		}
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

	/** Configures the getter. Pass true for auto-property, or an object for custom access/body */
	setGetter(
		config: boolean | { modifier?: AccessModifier; body?: string[] },
	): this {
		if (this.isAbstract && typeof config !== "boolean")
			throw new Error("Abstract property cannot have a getter body.");
		this.getter = config;
		return this;
	}

	/** Configures the setter. Pass true for auto-property, false for none, or an object for custom access/body */
	setSetter(
		config: boolean | { modifier?: AccessModifier; body?: string[] },
	): this {
		if (this.isAbstract && typeof config !== "boolean")
			throw new Error("Abstract property cannot have a setter body.");
		this.setter = config;
		return this;
	}

	/** Sets an initializer for an auto-property. Value is used directly. */
	setInitializer(value: string | number | boolean | null): this {
		if (this.isAbstract)
			throw new Error("Abstract property cannot have an initializer.");

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
			this.initializer = String(value);
		}
		return this;
	}

	/** Sets a raw initializer string, useful for `new(...)` or complex expressions */
	setRawInitializer(rawInitializer: string): this {
		if (this.isAbstract)
			throw new Error("Abstract property cannot have an initializer.");
		this.initializer = rawInitializer;
		return this;
	}

	private printAccessor(
		accessor: "get" | "set",
		config: boolean | { modifier?: AccessModifier; body?: string[] },
		indent: string,
	): string | null {
		if (config === false) return null; // No accessor
		if (config === true) return `${accessor};`; // Auto-accessor

		// Custom accessor
		const modifier = config.modifier ? `${config.modifier} ` : "";
		if (config.body && config.body.length > 0) {
			const bodyIndent = indent + this.indent(1);
			const bodyContent = config.body
				.map((line) => `${bodyIndent}${line}`)
				.join("\n");
			return `${modifier}${accessor} {\n${bodyContent}\n${indent}}`;
		}
		// Custom modifier but no body (usually just for setting visibility like 'private set;')
		return `${modifier}${accessor};`;
	}

	toString(indentationLevel = 0): string {
		const indent = this.indent(indentationLevel);
		const modifier = this.accessModifier;
		const stat = this.isStatic ? " static" : "";
		const virt = this.isAbstract
			? " abstract"
			: this.isVirtual
				? " virtual"
				: this.isOverride
					? " override"
					: "";
		const init =
			this.initializer !== undefined ? ` = ${this.initializer};` : ""; // Initializer goes after {} for auto-props

		// Determine if it's an auto-property (or abstract)
		const isAuto =
			typeof this.getter !== "object" && typeof this.setter !== "object";

		let propBody = "";
		if (this.isAbstract) {
			const g = this.getter ? " get;" : "";
			const s = this.setter ? " set;" : "";
			propBody = `{${g}${s} }`;
		} else if (isAuto) {
			const g = this.getter
				? this.printAccessor("get", this.getter, indent + this.indent(1))
				: null;
			const s = this.setter
				? this.printAccessor("set", this.setter, indent + this.indent(1))
				: null;
			propBody = `{ ${g ? `${g} ` : ""}${s ? `${s} ` : ""}}${init}`; // Combine accessors, add initializer if any
		} else {
			// Property with custom body
			const bodyIndent = indent + this.indent(1);
			const g = this.printAccessor("get", this.getter, bodyIndent);
			const s = this.printAccessor("set", this.setter, bodyIndent);
			propBody = `\n${indent}{\n${g ? `${bodyIndent + g}\n` : ""}${s ? `${bodyIndent + s}\n` : ""}${indent}}`;
		}

		return [
			this.printDocumentation(indent),
			this.printAttributes(indent),
			`${indent}${modifier}${stat}${virt} ${this.type} ${this.name} ${propBody}`,
		]
			.filter(Boolean)
			.join("");
	}
}
