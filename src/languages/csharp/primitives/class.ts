import type { AccessModifier } from "../types.js";
import CSharpPrimitive from "./csharpprimitive.js";
import type CSharpEnum from "./enum.js";
import type CSharpField from "./field.js";
import type CSharpMethod from "./method.js";
import type CSharpProperty from "./property.js";
import type CSharpConstructor from "./constructor.js";

export default class CSharpClass extends CSharpPrimitive {
	private accessModifier: AccessModifier = "public";
	private isAbstract = false;
	private isStatic = false;
	private isPartial = false;
	private isSealed = false;
	private name: string;
	private baseClass?: string;
	private interfaces: string[] = [];
	private fields: CSharpField[] = [];
	private properties: CSharpProperty[] = [];
	private constructors: CSharpConstructor[] = [];
	private methods: CSharpMethod[] = [];
	private nestedClasses: CSharpClass[] = [];
	private nestedEnums: CSharpEnum[] = [];
	private generics: string[] = [];

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

	setBaseClass(className: string): this {
		this.baseClass = className;
		return this;
	}

	setAbstract(isAbstract: boolean): this {
		this.isAbstract = isAbstract;
		if (isAbstract && this.isStatic)
			throw new Error(`Class ${this.name} cannot be both static and abstract.`);
		if (isAbstract && this.isSealed)
			throw new Error(`Class ${this.name} cannot be both sealed and abstract.`);
		return this;
	}

	setStatic(isStatic: boolean): this {
		this.isStatic = isStatic;
		if (isStatic && this.isAbstract)
			throw new Error(`Class ${this.name} cannot be both static and abstract.`);
		if (isStatic && this.isSealed)
			throw new Error(`Class ${this.name} cannot be both static and sealed.`);
		return this;
	}

	setPartial(isPartial: boolean): this {
		this.isPartial = isPartial;
		return this;
	}

	setSealed(isSealed: boolean): this {
		this.isSealed = isSealed;
		if (isSealed && this.isAbstract)
			throw new Error(`Class ${this.name} cannot be both sealed and abstract.`);
		if (isSealed && this.isStatic)
			throw new Error(`Class ${this.name} cannot be both static and sealed.`);
		return this;
	}

	/** Add interface names to implement */
	addInterface(...interfaces: string[]): this {
		for (const i of interfaces) {
			// Optional: Add using for interface namespace if needed? Assumes simple name for now.
			this.interfaces.push(i);
		}
		return this;
	}

	addField(...fields: CSharpField[]): this {
		for (const field of fields) {
			this.fields.push(field);
			field.parent = this;
		}
		return this;
	}

	addProperty(...properties: CSharpProperty[]): this {
		for (const prop of properties) {
			this.properties.push(prop);
			prop.parent = this;
		}
		return this;
	}

	addConstructor(...constructors: CSharpConstructor[]): this {
		for (const ctor of constructors) {
			if (ctor.parent !== this)
				throw new Error("Constructor parent must be this Class.");
			this.constructors.push(ctor);
			// Parent already set in constructor
		}
		return this;
	}

	addMethod(...methods: CSharpMethod[]): this {
		for (const m of methods) {
			this.methods.push(m);
			m.parent = this;
		}
		return this;
	}

	addNestedClass(...clazz: CSharpClass[]): this {
		for (const c of clazz) {
			this.nestedClasses.push(c);
			c.parent = this;
		}
		return this;
	}

	addNestedEnum(...enums: CSharpEnum[]): this {
		for (const e of enums) {
			this.nestedEnums.push(e);
			e.parent = this;
		}
		return this;
	}

	addGeneric(...generics: string[]): this {
		for (const g of generics) {
			this.generics.push(g);
		}
		return this;
	}

	toString(indentationLevel = 0): string {
		const indent = this.indent(indentationLevel);
		const memberIndentLevel = indentationLevel + 1;

		const modifier = this.accessModifier;
		const stat = this.isStatic ? " static" : "";
		const abs = !this.isStatic && this.isAbstract ? " abstract" : ""; // static implies sealed, cannot be abstract
		const seal =
			!this.isStatic && !this.isAbstract && this.isSealed ? " sealed" : ""; // cannot be sealed if static or abstract
		const part = this.isPartial ? " partial" : "";
		const gen = this.generics.length > 0 ? `<${this.generics.join(", ")}>` : "";

		const inheritance: string[] = [];
		if (this.baseClass) {
			inheritance.push(this.baseClass);
		}
		if (this.interfaces.length > 0) {
			inheritance.push(...this.interfaces);
		}
		const inhertianceString =
			inheritance.length > 0 ? ` : ${inheritance.join(", ")}` : "";

		const fieldsStr = this.fields
			.map((f) => f.toString(memberIndentLevel))
			.join("\n");
		const propsStr = this.properties
			.map((p) => p.toString(memberIndentLevel))
			.join("\n");
		const ctorsStr = this.constructors
			.map((c) => c.toString(memberIndentLevel))
			.join("\n");
		const methodsStr = this.methods
			.map((m) => m.toString(memberIndentLevel))
			.join("\n");
		const classesStr = this.nestedClasses
			.map((c) => c.toString(memberIndentLevel))
			.join("\n");
		const enumsStr = this.nestedEnums
			.map((e) => e.toString(memberIndentLevel))
			.join("\n");

		// Combine members, adding blank lines between different kinds for readability
		const members = [
			fieldsStr,
			propsStr,
			ctorsStr,
			methodsStr,
			classesStr,
			enumsStr,
		]
			.filter(Boolean) // Remove empty sections
			.join("\n\n"); // Add blank line between sections

		return [
			this.printDocumentation(indent),
			this.printAttributes(indent),
			`${indent}${modifier}${stat}${abs}${seal}${part} class ${this.name}${gen}${inhertianceString}`,
			`${indent}{`,
			members ? `\n${members}\n` : "", // Add extra newline if there are members
			`${indent}}`,
		]
			.filter((s) => s !== undefined && s !== "") // Filter out empty strings/undefined
			.join("");
	}
}
