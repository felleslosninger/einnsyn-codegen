import CSharpPrimitive from "./csharpPrimitive.js";

export class CSharpMethod extends CSharpPrimitive {
	private readonly parameters: string[] = [];
	private readonly body: string[] = [];
	private readonly attributes: string[] = [];
	private isStatic = false;
	private isAsync = false;
	private isVirtual = false;
	private isOverride = false;
	private isConstructor = false;
	private constructorInitializer?: string;
	private visibility: "public" | "protected" | "internal" | "private" =
		"public";

	constructor(
		parent: CSharpPrimitive | undefined,
		private readonly name: string,
		private readonly returnType = "void",
	) {
		super(parent);
	}

	setConstructor(value: boolean) {
		this.isConstructor = value;
	}

	setConstructorInitializer(initializer: string | undefined) {
		this.constructorInitializer = initializer;
	}

	setStatic(value: boolean) {
		this.isStatic = value;
	}

	setAsync(value: boolean) {
		this.isAsync = value;
	}

	setVirtual(value: boolean) {
		this.isVirtual = value;
	}

	setOverride(value: boolean) {
		this.isOverride = value;
	}

	setVisibility(visibility: "public" | "protected" | "internal" | "private") {
		this.visibility = visibility;
	}

	addAttribute(...attributes: string[]) {
		this.attributes.push(...attributes);
	}

	addParameter(...parameters: string[]) {
		this.parameters.push(...parameters);
	}

	addBody(...body: (string | undefined)[]) {
		for (const line of body) {
			if (line === undefined) {
				continue;
			}
			this.body.push(line);
		}
	}

	toString() {
		if (this.isConstructor) {
			return [
				...this.attributes.map((attribute) => `    ${attribute}`),
				`    ${this.visibility} ${this.name}(${this.parameters.join(", ")})${
					this.constructorInitializer ? ` : ${this.constructorInitializer}` : ""
				}`,
				"    {",
				...this.body.map((line) => `        ${line}`),
				"    }",
			].join("\n");
		}

		const modifiers = [
			this.visibility,
			this.isStatic ? "static" : undefined,
			this.isAsync ? "async" : undefined,
			this.isOverride ? "override" : undefined,
			this.isVirtual ? "virtual" : undefined,
		].filter((m) => m !== undefined);

		return [
			...this.attributes.map((attribute) => `    ${attribute}`),
			`    ${modifiers.join(" ")} ${this.returnType} ${this.name}(${this.parameters.join(", ")})`,
			"    {",
			...this.body.map((line) => `        ${line}`),
			"    }",
		].join("\n");
	}
}
