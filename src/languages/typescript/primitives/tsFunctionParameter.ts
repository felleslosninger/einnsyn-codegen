import TSPrimitive from "./tsPrimitive.js";

export class TSFunctionParameter extends TSPrimitive {
	name: string;
	type: string;
	defaultValue?: string;
	optional?: boolean;

	constructor(
		parent: TSPrimitive | undefined,
		name: string,
		type: string,
		defaultValue?: string,
		optional?: boolean,
	) {
		super(parent);
		this.name = name;
		this.type = type;
		this.defaultValue = defaultValue;
		this.optional = optional;
	}

	toString(): string {
		return `${this.name}${this.optional ? "?" : ""}: ${this.type}${
			this.defaultValue ? ` = ${this.defaultValue}` : ""
		}`;
	}
}
