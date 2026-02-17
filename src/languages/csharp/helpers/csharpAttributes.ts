const JSON_SERIALIZATION_USING = "System.Text.Json.Serialization";

/**
 * Returns the System.Text.Json.Serialization using required by generated
 * JSON attributes.
 */
export function getJsonSerializationUsing() {
	return JSON_SERIALIZATION_USING;
}

/**
 * Escapes a raw value as a C# string literal, including quotes.
 */
export function csharpStringLiteral(value: string) {
	return JSON.stringify(value)
		.replaceAll("\u2028", "\\u2028") // Keep line-separator as an explicit Unicode escape for C# literal safety.
		.replaceAll("\u2029", "\\u2029"); // Keep paragraph-separator as an explicit Unicode escape for C# literal safety.
}

/** Builds `[JsonPropertyName("...")]`. */
export function jsonPropertyName(name: string) {
	return `[JsonPropertyName(${csharpStringLiteral(name)})]`;
}

/** Builds `[JsonIgnore]` or `[JsonIgnore(Condition = ...)]`. */
export function jsonIgnore(condition?: string) {
	if (!condition) {
		return "[JsonIgnore]";
	}
	return `[JsonIgnore(Condition = JsonIgnoreCondition.${condition})]`;
}

/** Builds `[JsonPolymorphic(TypeDiscriminatorPropertyName = "...")]`. */
export function jsonPolymorphic(discriminatorPropertyName: string) {
	return `[JsonPolymorphic(TypeDiscriminatorPropertyName = ${csharpStringLiteral(discriminatorPropertyName)})]`;
}

/** Builds `[JsonDerivedType(typeof(...), typeDiscriminator: "...")]`. */
export function jsonDerivedType(typeName: string, typeDiscriminator: string) {
	return `[JsonDerivedType(typeof(${typeName}), typeDiscriminator: ${csharpStringLiteral(typeDiscriminator)})]`;
}

/** Builds `[JsonConverter(typeof(...))]`. */
export function jsonConverter(typeName: string) {
	return `[JsonConverter(typeof(${typeName}))]`;
}

/** Builds `[JsonStringEnumMemberName("...")]`. */
export function jsonStringEnumMemberName(serializedValue: string) {
	return `[JsonStringEnumMemberName(${csharpStringLiteral(serializedValue)})]`;
}
