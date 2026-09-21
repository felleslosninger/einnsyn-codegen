import {
	getDeprecated,
	getDoc,
	getErrorsDoc,
	getReturnsDoc,
	getSummary,
	type Operation,
	type Program,
	type Type,
} from "@typespec/compiler";

/**
 * Get the documentation written in the API specification for a type, model
 * property, operation or namespace.
 */
export function getDocumentation(
	program: Program,
	type?: Type,
): string | undefined {
	if (type === undefined) {
		return undefined;
	}
	const doc = getDoc(program, type) ?? getSummary(program, type);
	return doc?.trim() || undefined;
}

/**
 * Join several documentation paragraphs into one description.
 */
export function joinDocumentation(...parts: (string | undefined)[]) {
	const paragraphs = parts
		.map((part) => part?.trim())
		.filter((part): part is string => !!part);
	return paragraphs.length > 0 ? paragraphs.join("\n\n") : undefined;
}

/**
 * "@param <name> <doc>". Returns undefined for undocumented parameters, so we
 * never emit a bare "@param foo" that carries no information.
 */
export function getParamTag(name: string, doc?: string) {
	return doc ? `@param ${name} ${singleParagraph(doc)}` : undefined;
}

/**
 * "@returns <doc>", from the "@returns" doc comment on an operation.
 */
export function getReturnsTag(program: Program, operation: Operation) {
	const doc = getReturnsDoc(program, operation);
	return doc ? `@returns ${singleParagraph(doc)}` : undefined;
}

/**
 * "@throws <doc>", from the "@errors" doc comment on an operation.
 */
export function getThrowsTag(program: Program, operation: Operation) {
	const doc = getErrorsDoc(program, operation);
	return doc ? `@throws ${singleParagraph(doc)}` : undefined;
}

/**
 * "@deprecated <reason>" for types marked "#deprecated" in the specification.
 */
export function getDeprecatedTag(program: Program, type?: Type) {
	if (type === undefined) {
		return undefined;
	}
	const reason = getDeprecated(program, type);
	if (reason === undefined) {
		return undefined;
	}
	return `@deprecated ${singleParagraph(reason)}`.trim();
}

/**
 * Tag values must stay on a single line to keep the tag block parseable.
 */
function singleParagraph(doc: string) {
	return doc.replace(/\s*\n\s*/g, " ").trim();
}
