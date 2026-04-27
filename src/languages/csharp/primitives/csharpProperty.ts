import CSharpPrimitive from "./csharpPrimitive.js";

type CSharpVisibility = "public" | "protected" | "internal" | "private";

export class CSharpProperty extends CSharpPrimitive {
	private readonly documentation: string[] = [];
	private readonly attributes: string[] = [];
	private initializer?: string;
	private accessorOverride?: string;
	private visibility: CSharpVisibility = "public";
	private hasGetter = true;
	private hasSetter = true;
	private getterVisibility?: CSharpVisibility;
	private setterVisibility?: CSharpVisibility;
	private setterKeyword: "set" | "init" = "set";

	constructor(
		parent: CSharpPrimitive | undefined,
		private readonly typeName: string,
		private readonly name: string,
	) {
		super(parent);
	}

	addAttribute(...attributes: string[]) {
		this.attributes.push(...attributes);
	}

	addDocumentation(...documentation: string[]) {
		this.documentation.push(...documentation);
	}

	setVisibility(visibility: CSharpVisibility) {
		this.visibility = visibility;
	}

	setInitializer(initializer: string | undefined) {
		this.initializer = initializer;
	}

	setAccessor(accessor: string) {
		this.accessorOverride = accessor;
	}

	setHasGetter(hasGetter: boolean) {
		this.hasGetter = hasGetter;
	}

	setHasSetter(hasSetter: boolean) {
		this.hasSetter = hasSetter;
	}

	setGetterVisibility(visibility: CSharpVisibility | undefined) {
		this.getterVisibility = visibility;
	}

	setSetterVisibility(visibility: CSharpVisibility | undefined) {
		this.setterVisibility = visibility;
	}

	setInitOnlySetter(value: boolean) {
		this.setterKeyword = value ? "init" : "set";
	}

	toString() {
		return [
			...this.documentation.map((docLine) => `    ${docLine}`),
			...this.attributes.map((attribute) => `    ${attribute}`),
			`    ${this.visibility} ${this.typeName} ${this.name} ${this.buildAccessor()}${
				this.initializer ? ` = ${this.initializer};` : ""
			}`,
		].join("\n");
	}

	private buildAccessor() {
		if (this.accessorOverride) {
			return this.accessorOverride;
		}

		const accessors: string[] = [];
		if (this.hasGetter) {
			accessors.push(`${this.accessorPrefix(this.getterVisibility)}get;`);
		}
		if (this.hasSetter) {
			accessors.push(
				`${this.accessorPrefix(this.setterVisibility)}${this.setterKeyword};`,
			);
		}

		if (accessors.length === 0) {
			accessors.push("get;");
		}

		return `{ ${accessors.join(" ")} }`;
	}

	private accessorPrefix(visibility: CSharpVisibility | undefined) {
		return visibility ? `${visibility} ` : "";
	}
}
