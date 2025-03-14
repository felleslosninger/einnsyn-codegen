import type { Visibility } from "../../../types.js";
import type Enum from "./enum.js";
import type Field from "./field.js";
import JavaPrimitive from "./javaprimitive.js";
import type Method from "./method.js";

export default class Class extends JavaPrimitive {
	private isAbstract = false;
	private isStatic = false;
	private visibility: Visibility = "public";
	private name: string;
	private extends?: string;
	private implements: string[] = [];
	private fields: Field[] = [];
	private methods: Method[] = [];
	private classes: Class[] = [];
	private enums: Enum[] = [];
	private generics: string[] = [];

	constructor(parent: JavaPrimitive | undefined, name: string) {
		super(parent);
		this.name = name;
	}

	setExtends(className: string) {
		this.extends = className;
	}

	setAbstract(isAbstract: boolean) {
		this.isAbstract = isAbstract;
	}

	setStatic(isStatic: boolean) {
		this.isStatic = isStatic;
	}

	/**
	 * Add "implements" to the class. Generics are stripped and must be imported manually. If the class name starts with `@`, it is not imported.
	 *
	 * @param i
	 */
	addImplements(...is: string[]) {
		for (const i of is) {
			if (!i.startsWith("@")) {
				const withoutGenerics = i.split("<")[0];
				this.addImport(withoutGenerics);
			}

			const className = i.split(".").slice(-1)[0];
			this.implements.push(className);
		}
		return this;
	}

	addField(...fields: Field[]) {
		for (const field of fields) {
			this.fields.push(field);
		}
		return this;
	}

	addEnum(...enums: Enum[]) {
		for (const e of enums) {
			this.enums.push(e);
		}
		return this;
	}

	addMethod(...methods: Method[]) {
		for (const m of methods) {
			this.methods.push(m);
		}
		return this;
	}

	addClass(...clazz: Class[]) {
		for (const c of clazz) {
			this.classes.push(c);
		}
		return this;
	}

	addGeneric(...generics: string[]) {
		for (const g of generics) {
			this.generics.push(g);
		}
		return this;
	}

	toString(): string {
		return [
			this.printDocumentation(),
			this.printAnnotations(),

			// Write class + extends + implements
			`${this.visibility}${this.isAbstract ? " abstract" : ""}${this.isStatic ? " static" : ""} class ${this.name}${
				this.generics.length > 0 ? `<${this.generics.join(", ")}>` : ""
			}${this.extends ? ` extends ${this.extends}` : ""}${
				this.implements.length
					? ` implements ${this.implements.join(", ")}`
					: ""
			} {`,

			// Write fields
			this.fields
				.map((field) => field.toString())
				.join("\n"),

			// Write methods
			this.methods
				.map((m) => ` ${m}`)
				.join("\n"),

			// Write classes
			this.classes.join("\n"),

			// Write enums
			this.enums
				.map((e) => e.toString())
				.join("\n"),

			"}",
		].join("\n");
	}
}
