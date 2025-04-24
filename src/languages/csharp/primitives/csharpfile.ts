import CSharpPrimitive from "./csharpprimitive.js";
import type CSharpClass from "./class.js";
import type CSharpEnum from "./enum.js";

export class CSharpFile extends CSharpPrimitive {
	private header = `
// Auto-generated from our API specification
// https://github.com/felleslosninger/einnsyn-api-spec
`.trim();

	private namespaceName: string;
	private usings: Set<string> = new Set();
	private classes: CSharpClass[] = [];
	private enums: CSharpEnum[] = [];

	constructor(namespaceName: string) {
		super(undefined);
		this.namespaceName = namespaceName;
	}

	addUsing(...usings: string[]) {
		for (const u of usings) {
			this.usings.add(u);
		}
		return this;
	}

	addClass(...classes: CSharpClass[]): this {
		for (const clazz of classes) {
			this.classes.push(clazz);
		}
		return this;
	}

	addEnum(...enums: CSharpEnum[]): this {
		for (const e of enums) {
			this.enums.push(e);
		}
		return this;
	}

	toString(): string {
		const usingDirectives = Array.from(this.usings)
			.sort() // Sort for consistency
			.map((u) => `using ${u};`)
			.join("\n");

		const classesStr = this.classes.map((c) => c.toString()).join("\n\n");
		const enumsStr = this.enums.map((e) => e.toString()).join("\n\n");

		const namespaceMembers = [classesStr, enumsStr]
			.filter(Boolean)
			.join("\n\n");

		return [
			this.header ? `${this.header}\n` : "",
			usingDirectives ? `${usingDirectives}\n` : "",
			`namespace ${this.namespaceName}`,
			"{",
			namespaceMembers ? `\n${namespaceMembers}\n` : "",
			"}",
		].join("\n");
	}
}
