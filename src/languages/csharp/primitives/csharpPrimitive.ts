import type { Primitive } from "../../common/primitive.js";

export default abstract class CSharpPrimitive implements Primitive {
	parent?: CSharpPrimitive;
	private readonly usings: Set<string> = new Set<string>();

	constructor(parent: CSharpPrimitive | undefined) {
		this.parent = parent;
	}

	addUsing(...newUsings: string[]) {
		for (const u of newUsings) {
			if (!u) {
				continue;
			}
			if (this.parent) {
				this.parent.addUsing(u);
				continue;
			}
			this.usings.add(u);
		}
	}

	getUsings(): string[] {
		if (this.parent) {
			return this.parent.getUsings();
		}
		return [...this.usings].sort((a, b) => a.localeCompare(b));
	}
}
