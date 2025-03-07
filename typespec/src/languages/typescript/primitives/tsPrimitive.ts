import type { Primitive } from "../../common/primitive.js";
import type { TSImportType } from "../types.js";

export default abstract class TSPrimitive implements Primitive {
	parent?: TSPrimitive;
	annotations: { [key: string]: string } = {};
	imports: TSImportType[] = [];
	documentation: string | undefined;
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
		this.documentation = documentation;
	}

	printDocumentation(append?: string) {
		const strings = [];
		if (this.documentation) {
			strings.push(this.documentation);
		}
		if (append) {
			strings.push(append.split("\n"));
		}
		if (strings.length === 0) {
			return undefined;
		}
		return `/**\n * ${strings.join("\n * ")}\n */`;
	}
}
