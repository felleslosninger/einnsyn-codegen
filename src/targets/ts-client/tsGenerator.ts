import { OpenAPIObject } from 'openapi3-ts/oas30';
import { generateResources } from './tsResourceGenerator';

export async function generate(spec: OpenAPIObject) {
  await generateResources(spec);
}
