import type { Primitive } from "../../common/primitive.js";
import type { TSImportType } from "../types.js";

export default abstract class TSPrimitive implements Primitive {
	parent?: TSPrimitive;
	annotations: { [key: string]: string } = {};
	imports: TSImportType[] = [];
	documentation: string | undefined;
	docTags: string[] = [];
	children: TSPrimitive[] = [];

	constructor(parent: TSPrimitive | undefined) {
		this.parent = parent;
	}

	addImport(...imports: TSImportType[]) {
		if (this.parent !== undefined) {
			this.parent.addImport(...imports);
		}
		return this;
	}

	setDocumentation(documentation?: string) {
		this.documentation = documentation?.trim() || undefined;
		return this;
	}

	/**
	 * Add JSDoc tag lines ("@param foo ...", "@returns ...") to the doc block. Tags
	 * are printed after the description, separated by a blank line.
	 */
	addDocTag(...tags: (string | undefined)[]) {
		for (const tag of tags) {
			if (tag) {
				this.docTags.push(tag);
			}
		}
		return this;
	}

	printDocumentation(append?: string) {
		const blocks: string[] = [];
		if (this.documentation) {
			blocks.push(this.documentation);
		}
		if (this.docTags.length > 0) {
			blocks.push(this.docTags.join("\n"));
		}
		if (append) {
			blocks.push(append);
		}
		if (blocks.length === 0) {
			return undefined;
		}
		const lines = blocks
			.join("\n\n")
			// Documentation from the spec must never close the comment block
			.replace(/\*\//g, "*\\/")
			.split("\n");
		return ["/**", ...lines.map((line) => ` * ${line}`.trimEnd()), " */"].join(
			"\n",
		);
	}
}
