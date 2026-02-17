import CSharpPrimitive from "./csharpPrimitive.js";

export type CSharpEnumValue = {
	name: string;
	attributes?: string[];
};

export class CSharpEnum extends CSharpPrimitive {
	private readonly attributes: string[] = [];
	private readonly values: CSharpEnumValue[] = [];

	constructor(
		parent: CSharpPrimitive | undefined,
		private readonly name: string,
	) {
		super(parent);
	}

	addAttribute(...attributes: string[]) {
		this.attributes.push(...attributes);
	}

	addValue(...values: CSharpEnumValue[]) {
		this.values.push(...values);
	}

	toString() {
		const values = this.values.map((value, index) => {
			const comma = index === this.values.length - 1 ? "" : ",";
			const attributeLines = (value.attributes ?? []).map(
				(attribute) => `    ${attribute}`,
			);

			return [...attributeLines, `    ${value.name}${comma}`].join("\n");
		});

		return [
			...this.attributes,
			`public enum ${this.name}`,
			"{",
			values.join("\n"),
			"}",
		].join("\n");
	}
}
