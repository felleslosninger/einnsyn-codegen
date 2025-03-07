import type { Visibility } from "../../../types.js";
import JavaPrimitive from "./javaprimitive.js";

export default class Field extends JavaPrimitive {
	private visibility: Visibility = "";
	private isFinal = false;
	private isStatic = false;
	private value?: string | boolean | number;
	private rawValue?: string;

	constructor(
		parent: JavaPrimitive | undefined,
		private fieldName: string,
		private javaType: string,
	) {
		super(parent);
	}

	setVisibility(visibility: Visibility) {
		this.visibility = visibility;
		return this;
	}

	setFinal(isFinal: boolean) {
		this.isFinal = isFinal;
		return this;
	}

	setStatic(isStatic: boolean) {
		this.isStatic = isStatic;
		return this;
	}

	setValue(value: string | boolean | number | undefined) {
		this.value = value;
		return this;
	}

	setRawValue(rawValue: string) {
		this.rawValue = rawValue;
		return this;
	}

	printValue(): string {
		if (this.rawValue) {
			return ` = ${this.rawValue}`;
		}

		if (typeof this.value === "string") {
			return ` = "${this.value}"`;
		}

		// Numbers and boolean values are printed without quotes
		if (this.value !== undefined) {
			return ` = ${this.value}`;
		}

		return "";
	}

	toString(): string {
		return [
			this.printDocumentation(),
			this.printAnnotations() || undefined,
			`${this.visibility ? `${this.visibility} ` : ""}${
				this.isStatic ? "static " : ""
			}${
				this.isFinal ? "final " : ""
			}${this.javaType} ${this.fieldName}${this.printValue()};`,
			"",
		]
			.filter((v) => v !== undefined)
			.join("\n");
	}
}
