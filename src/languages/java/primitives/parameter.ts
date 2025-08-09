import JavaPrimitive from "./javaprimitive.js";

export default class Parameter extends JavaPrimitive {
	name: string;
	type: string;

	constructor(parent: JavaPrimitive | undefined, name: string, type: string) {
		super(parent);
		this.name = name;
		this.type = type;
	}

	toString(): string {
		return [this.printAnnotations(), `${this.type} ${this.name}`]
			.filter((s) => s !== undefined)
			.join("\n");
	}
}
