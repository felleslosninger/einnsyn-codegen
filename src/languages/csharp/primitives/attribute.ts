import type CSharpPrimitive from "./csharpprimitive.js";

export default class CSharpAttribute {
	private name: string;
	private namespace?: string; // Namespace of the attribute itself
	private argumentsString: string; // Simplified: store arguments as a pre-formatted string

	/**
	 * Creates a C# Attribute representation.
	 * @param name The name of the attribute (e.g., "Serializable", "JsonProperty").
	 * @param namespace Optional namespace of the attribute for adding 'using' directives (e.g., "System", "Newtonsoft.Json").
	 * @param args Pre-formatted string for arguments within parentheses, e.g., `"\"myValue\"", Name = 123`. Omit parentheses.
	 */
	constructor(name: string, namespace?: string, args = "") {
		this.name = name;
		this.namespace = namespace;
		this.argumentsString = args;
	}

	/** Adds the attribute's namespace to the necessary 'using' directives */
	addRequiredUsings(primitive: CSharpPrimitive) {
		if (this.namespace) {
			primitive.addUsing(this.namespace);
		}
	}

	toString(): string {
		// Remove "Attribute" suffix if present for convention
		const attributeName = this.name.endsWith("Attribute")
			? this.name.substring(0, this.name.length - 9)
			: this.name;

		const args = this.argumentsString ? `(${this.argumentsString})` : "";
		return `[${attributeName}${args}]`;
	}
}
