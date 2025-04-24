import CSharpPrimitive from "./csharpprimitive.js";
import type CSharpRecord from "./record.js";
import type CSharpAttribute from "./attribute.js";

// Represents a parameter in a record's primary constructor,
// which also implicitly defines a property.
export default class CSharpPrimaryParameter extends CSharpPrimitive {
	private type: string;
	private name: string;

	constructor(parent: CSharpRecord, type: string, name: string) {
		super(parent);
		this.type = type;
		this.name = name;
	}

	getType(): string {
		return this.type;
	}
	getName(): string {
		return this.name;
	}

	// Attributes here apply to the generated property/parameter
	addAttribute(...attributes: CSharpAttribute[]): this {
		super.addAttribute(...attributes);
		return this;
	}

	// We don't need a full toString() here, as the CSharpRecord will format it.
	// However, we need a way to get the parts for the CSharpRecord's toString.
	toStringForHeader(): string {
		const attribs =
			this.attributes.length > 0
				? `${this.printAttributes("").trimEnd()} ` // Add space after attributes
				: "";
		return `${attribs}${this.type} ${this.name}`;
	}

	// Override toString as it's abstract in parent, even if not used directly
	toString(indentationLevel?: number): string {
		return this.toStringForHeader(); // Basic implementation
	}
}
