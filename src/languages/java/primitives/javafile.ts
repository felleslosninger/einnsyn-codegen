import type Class from "./class.js";
import type Enum from "./enum.js";
import JavaPrimitive from "./javaprimitive.js";

export class JavaFile extends JavaPrimitive {
	private header = `
// Auto-generated from our API specification
// https://github.com/felleslosninger/einnsyn-api-spec
  `.trim();

	private packageName: string;
	private classes: Class[] = [];
	private enums: Enum[] = [];

	constructor(packageName: string) {
		super(undefined);
		this.packageName = packageName;
	}

	addClass(clazz: Class) {
		this.classes.push(clazz);
		return this;
	}

	addEnum(e: Enum) {
		this.enums.push(e);
		return this;
	}

	toString(): string {
		return [
			this.header,
			"\n",
			`package ${this.packageName};\n`,
			Object.keys(this.imports)
				.map((i) => `import ${i};`)
				.join("\n"),
			"\n",
			this.classes.map((c) => c.toString()).join("\n"),
			this.enums.map((e) => e.toString()).join("\n"),
			"\n",
		].join("\n");
	}
}
