import CSharpPrimitive from "./csharpPrimitive.js";

export class CSharpClass extends CSharpPrimitive {
	private readonly properties: string[] = [];
	private readonly methods: string[] = [];
	private readonly nested: string[] = [];
	private readonly baseTypes: string[] = [];
	private readonly attributes: string[] = [];
	private visibility: "public" | "protected" | "internal" | "private" =
		"public";
	private isStatic = false;
	private isAbstract = false;
	private isPartial = false;
	private isSealed = false;

	constructor(
		parent: CSharpPrimitive | undefined,
		private readonly name: string,
	) {
		super(parent);
	}

	setVisibility(visibility: "public" | "protected" | "internal" | "private") {
		this.visibility = visibility;
	}

	setStatic(value: boolean) {
		this.isStatic = value;
	}

	setAbstract(value: boolean) {
		this.isAbstract = value;
	}

	setPartial(value: boolean) {
		this.isPartial = value;
	}

	setSealed(value: boolean) {
		this.isSealed = value;
	}

	addAttribute(...attributes: string[]) {
		this.attributes.push(...attributes);
	}

	addBaseType(...baseTypes: string[]) {
		this.baseTypes.push(...baseTypes.filter((t) => !!t));
	}

	addProperty(...properties: string[]) {
		this.properties.push(...properties);
	}

	addMethod(...methods: string[]) {
		this.methods.push(...methods);
	}

	addNested(...nested: string[]) {
		this.nested.push(...nested);
	}

	toString() {
		const modifiers = [
			this.visibility,
			this.isStatic ? "static" : undefined,
			this.isAbstract ? "abstract" : undefined,
			this.isSealed ? "sealed" : undefined,
			this.isPartial ? "partial" : undefined,
		]
			.filter((m) => m !== undefined)
			.join(" ");

		const inheritance = this.baseTypes.length
			? ` : ${this.baseTypes.join(", ")}`
			: "";

		const nestedMembers = this.nested.map((nested) =>
			indentBlock(nested, "    "),
		);
		const members = [...this.properties, ...this.methods, ...nestedMembers].join(
			"\n\n",
		);

		return [
			...this.attributes,
			`${modifiers} class ${this.name}${inheritance}`,
			"{",
			members,
			"}",
		]
			.filter((line) => line !== "")
			.join("\n");
	}
}

function indentBlock(text: string, indentation: string) {
	return text
		.split("\n")
		.map((line) => (line ? `${indentation}${line}` : ""))
		.join("\n");
}
