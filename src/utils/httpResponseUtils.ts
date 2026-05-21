import type { HttpOperationResponse } from "@typespec/http";

export function hasHttpResponseBody(
	response: HttpOperationResponse | undefined,
): boolean {
	return (
		response?.responses.some((content) => content.body !== undefined) ?? false
	);
}

export function getHttpResponseStatusCode(
	response: HttpOperationResponse | undefined,
): number | undefined {
	return typeof response?.statusCodes === "number"
		? response.statusCodes
		: undefined;
}
