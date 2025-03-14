import type TSFunction from "./tsFunction.js";
import TSPrimitive from "./tsPrimitive.js";
import type { TSTypeProperty } from "./tsTypeProperty.js";

export class TSType extends TSPrimitive {
	properties: TSTypeProperty[] = [];
	methods: TSFunction[] = [];

	constructor(parent: TSPrimitive | undefined, properties?: TSTypeProperty[]) {
		super(parent);
		if (properties) {
			this.properties.push(...properties);
		}
	}

	addProperty(...properties: TSTypeProperty[]) {
		this.properties.push(...properties);
		return this;
	}

	addMethod(...methods: TSFunction[]) {
		this.methods.push(...methods);
		return this;
	}

	toString(): string {
		return [
			"{",
			Object.values(this.properties)
				.map((property) => property.toString())
				.join("\n"),

			Object.values(this.methods)
				.map((method) => method.toString())
				.join("\n"),
			"}",
		]
			.filter((s) => s !== undefined)
			.join("\n");
	}
}
