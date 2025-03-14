import type TSFunction from "./tsFunction.js";
import TSPrimitive from "./tsPrimitive.js";
import type { TSType } from "./tsType.js";
import type { TSTypeProperty } from "./tsTypeProperty.js";

export default class TSClass extends TSPrimitive {
	name: string;
	private implements: string[] = [];
	private extends: string[] = [];
	private generics: string[] = [];

	private properties: TSTypeProperty[] = [];
	private methods: TSFunction[] = [];

	constructor(parent: TSPrimitive | undefined, name: string) {
		super(parent);
		this.name = name;
	}

	addExtends(...extendsList: string[]) {
		for (const extend of extendsList) {
			if (!this.extends.includes(extend)) {
				this.extends.push(extend);
			}
		}
		return this;
	}

	addImplements(...implementssList: string[]) {
		for (const implement of implementssList) {
			if (!this.implements.includes(implement)) {
				this.implements.push(implement);
			}
		}
		return this;
	}

	addGeneric(...generics: string[]) {
		for (const g of generics) {
			this.generics.push(g);
		}
		return this;
	}

	addProperty(...properties: TSTypeProperty[]) {
		this.properties.push(...properties);
		return this;
	}

	addMethod(...methods: TSFunction[]) {
		this.methods.push(...methods);
		return this;
	}

	toString() {
		return [
			`class ${this.name} `,

			this.extends.length > 0
				? `extends ${this.extends.join(", ")}`
				: undefined,

			this.implements.length > 0
				? `implements ${this.implements.join(", ")}`
				: undefined,

			"{",
			Object.values(this.properties)
				.map((property) => property.toString())
				.join("\n"),
			"",

			Object.values(this.methods)
				.map((method) => method.toString())
				.join("\n\n"),
			"}",
		]
			.filter((s) => s !== undefined)
			.join("\n");
	}
}
