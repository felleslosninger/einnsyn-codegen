import { OpenAPIObject } from 'openapi3-ts/oas30';
import { generateModel } from './tsModelGenerator';

export async function generate(spec: OpenAPIObject) {
  await generateModel(spec);
}
