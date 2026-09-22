import TSPrimitive from "./tsPrimitive.js";
import type { TSType } from "./tsType.js";

export default class TSInterface extends TSPrimitive {
	name: string;
	isExported = false;
	private extends: string[] = [];
	typeDefinition?: TSType;

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

	toString() {
		const declaration =
			// biome-ignore lint/style/useTemplate: Looks better without template strings
			`${this.isExported ? "export " : ""}interface ${this.name} ` +
			(this.extends.length > 0 ? `extends ${this.extends.join(", ")}` : "") +
			(this.typeDefinition ? this.typeDefinition.toString() : "");

		return [this.printDocumentation(), declaration]
			.filter((s) => s !== undefined)
			.join("\n");
	}
}
