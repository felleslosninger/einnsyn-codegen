import TSPrimitive from "./tsPrimitive.js";

export class TSTypeProperty extends TSPrimitive {
	name: string;
	value: string;
	optional = false;
	readonly = false;

	constructor(parent: TSPrimitive | undefined, name: string, value: string) {
		super(parent);
		this.name = name;
		this.value = value;
	}

	toString(): string {
		return `${this.readonly ? "readonly " : ""}${this.name}${this.optional ? "?" : ""}: ${this.value.toString()};`;
	}
}
