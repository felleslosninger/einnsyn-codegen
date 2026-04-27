import CSharpPrimitive from "./csharpPrimitive.js";

export class CSharpFile extends CSharpPrimitive {
	private readonly header = `
// Auto-generated from our API specification
// https://github.com/felleslosninger/einnsyn-api-spec
#nullable enable
	`.trim();

	readonly namespaceName: string;
	private readonly members: string[] = [];

	constructor(namespaceName: string) {
		super(undefined);
		this.namespaceName = namespaceName;
	}

	addMember(...members: (string | undefined)[]) {
		for (const member of members) {
			if (!member) {
				continue;
			}
			this.members.push(member);
		}
	}

	toString() {
		const usings = this.getUsings()
			.map((u) => `using ${u};`)
			.join("\n");

		return [
			this.header,
			"",
			usings,
			usings ? "" : undefined,
			`namespace ${this.namespaceName};`,
			"",
			this.members.join("\n\n"),
			"",
		]
			.filter((line) => line !== undefined)
			.join("\n");
	}
}
