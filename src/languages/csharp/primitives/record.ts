import type { AccessModifier } from "../types.js";
import CSharpPrimitive from "./csharpprimitive.js";
import type CSharpEnum from "./enum.js";
import type CSharpMethod from "./method.js";
import type CSharpProperty from "./property.js";
import type CSharpConstructor from "./constructor.js";
import type CSharpClass from "./class.js";
import type CSharpPrimaryParameter from "./primaryparameter.js";

export default class CSharpRecord extends CSharpPrimitive {
	private accessModifier: AccessModifier = "public";
	private isAbstract = false;
	// Records cannot be static
	private isPartial = false;
	private isSealed = false; // Records are implicitly sealed unless abstract
	private isReadOnly = false; // For record struct later, maybe 'readonly record struct'
	private name: string;
	private baseRecord?: string; // Can inherit from another record (or object)
	private interfaces: string[] = [];
	private primaryParameters: CSharpPrimaryParameter[] = []; // For primary constructor
	private properties: CSharpProperty[] = []; // For properties defined in the body {}
	private constructors: CSharpConstructor[] = []; // Additional constructors in the body {}
	private methods: CSharpMethod[] = []; // Methods in the body {}
	private nestedClasses: CSharpClass[] = []; // Nested types
	private nestedEnums: CSharpEnum[] = [];
	private nestedRecords: CSharpRecord[] = [];
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

	/** Set the base record or interface implemented by this record */
	setBase(baseName: string): this {
		// Simple approach: Assume it's a base record or interface
		this.baseRecord = baseName;
		return this;
	}

	setAbstract(isAbstract: boolean): this {
		this.isAbstract = isAbstract;
		// Can't be sealed if abstract
		if (isAbstract) this.isSealed = false;
		return this;
	}

	setPartial(isPartial: boolean): this {
		this.isPartial = isPartial;
		return this;
	}

	setSealed(isSealed: boolean): this {
		// Only relevant if NOT abstract. Records are sealed by default.
		// Setting sealed=true explicitly is fine.
		// Setting sealed=false on a non-abstract record requires C# 10+ and 'abstract' or inheritance.
		// Let's assume setting false means "not explicitly sealed".
		this.isSealed = isSealed;
		if (this.isAbstract && isSealed)
			throw new Error(
				`Record ${this.name} cannot be both abstract and sealed.`,
			);
		return this;
	}

	setReadOnly(isReadOnly: boolean): this {
		// Primarily for 'readonly record struct', less common for 'record class'
		this.isReadOnly = isReadOnly;
		return this;
	}

	/** Add interface names implemented by this record */
	addInterface(...interfaces: string[]): this {
		for (const i of interfaces) {
			this.interfaces.push(i);
		}
		return this;
	}

	/** Adds a parameter to the primary constructor, implicitly defining a property. */
	addPrimaryParameter(parameter: CSharpPrimaryParameter): this {
		this.primaryParameters.push(parameter);
		parameter.parent = this; // Set parent relationship
		return this;
	}

	/** Adds a regular C# Property defined within the record's body `{}` */
	addProperty(...properties: CSharpProperty[]): this {
		for (const prop of properties) {
			this.properties.push(prop);
			prop.parent = this;
		}
		return this;
	}

	/** Adds an additional constructor defined within the record's body `{}` */
	addConstructor(...constructors: CSharpConstructor[]): this {
		for (const ctor of constructors) {
			if (ctor.parent !== this)
				throw new Error("Constructor parent must be this Record.");
			this.constructors.push(ctor);
		}
		return this;
	}

	/** Adds a method defined within the record's body `{}` */
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

	addNestedRecord(...records: CSharpRecord[]): this {
		for (const r of records) {
			this.nestedRecords.push(r);
			r.parent = this;
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
		// Note: C# records are implicitly sealed unless declared abstract.
		// We only add 'sealed' if explicitly set AND not abstract.
		const seal = !this.isAbstract && this.isSealed ? " sealed" : "";
		const abs = this.isAbstract ? " abstract" : "";
		const part = this.isPartial ? " partial" : "";
		const readOnly = this.isReadOnly ? " readonly" : ""; // Usually for record structs
		const gen = this.generics.length > 0 ? `<${this.generics.join(", ")}>` : "";

		// Combine base record and interfaces
		const inheritanceItems: string[] = [];
		if (this.baseRecord) {
			inheritanceItems.push(this.baseRecord);
		}
		inheritanceItems.push(...this.interfaces);
		const inheritanceString =
			inheritanceItems.length > 0 ? ` : ${inheritanceItems.join(", ")}` : "";

		// Primary Constructor Parameters
		const primaryParamsString =
			this.primaryParameters.length > 0
				? `(${this.primaryParameters.map((p) => p.toStringForHeader()).join(", ")})`
				: ""; // Records *can* omit () if no primary ctor and no body

		// Body Members
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
		const recordsStr = this.nestedRecords
			.map((r) => r.toString(memberIndentLevel))
			.join("\n");

		const bodyMembers = [
			propsStr,
			ctorsStr,
			methodsStr,
			classesStr,
			enumsStr,
			recordsStr,
		]
			.filter(Boolean) // Remove empty sections
			.join("\n\n"); // Add blank line between sections

		let recordString = "";

		// Construct the record signature line
		const signature = `${indent}${modifier}${seal}${abs}${part}${readOnly} record ${this.name}${gen}${primaryParamsString}${inheritanceString}`;

		if (bodyMembers) {
			recordString = [
				signature,
				`${indent}{`,
				`\n${bodyMembers}\n`,
				`${indent}}`,
			].join("\n");
		} else if (
			this.primaryParameters.length > 0 ||
			this.baseRecord ||
			this.interfaces.length > 0
		) {
			// If there's a primary constructor OR inheritance, but NO body, end with semicolon
			recordString = `${signature};`;
		} else {
			// Simplest case: `public record MyRecord;` (no primary ctor, no body, no inheritance)
			recordString = `${signature};`;
			// Or alternatively `public record MyRecord {}` - semicolon is more common for empty records
		}

		return [
			this.printDocumentation(indent),
			this.printAttributes(indent),
			recordString,
		]
			.filter(Boolean) // Remove empty lines from docs/attributes
			.join("");
	}
}
