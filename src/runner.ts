import $RefParser from '@apidevtools/json-schema-ref-parser';
import fs from 'fs';
import handlebars from 'handlebars';
import yaml from 'js-yaml';
import { ParsedArgs } from 'minimist';
import {
  OpenAPIObject,
  OpenApiBuilder,
  OperationObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import { JSONObject, deepMergeAllOf } from './utils/deepMergeAllOf';

import * as ts from './targets/ts-client/tsGenerator';

const run = async (args: ParsedArgs) => {
  // Parse spec
  const file = await fs.promises.readFile(args.spec as string, 'utf8');
  const document = yaml.load(file) as OpenAPIObject;
  const dereferencedDocument = (await $RefParser.dereference(
    document,
  )) as OpenAPIObject;
  const root = OpenApiBuilder.create(dereferencedDocument);
  let spec = root.getSpec();

  // Merge all allOf objects in spec
  spec = deepMergeAllOf({}, [
    spec as unknown as JSONObject,
  ]) as unknown as OpenAPIObject;

  // Prepare additional helper properties in schemas
  const schemas = spec.components?.schemas ?? {};
  for (const schemaName in schemas) {
    let schema = schemas[schemaName] as SchemaObject;

    // Mark properties as required
    schema.required?.forEach(async (required) => {
      let property = schema.properties?.[required] as SchemaObject;
      if (property) {
        property['x-required'] = true;
      }
    });

    // Mark expandableField properties
    schema['x-expandableFields']?.forEach(async (expandableField: string) => {
      let property = schema.properties?.[expandableField] as SchemaObject;
      if (property) {
        property['x-expandableField'] = expandableField;
      }
    });
  }

  // Create resource-ids for inline request/response bodies
  const paths = spec.paths ?? {};
  for (const path in paths) {
    const pathItem = paths[path];

    for (const methodUntyped in pathItem) {
      const method = methodUntyped as keyof typeof pathItem;
      const operation = pathItem[method] as OperationObject;
      const requestBody = operation.requestBody as RequestBodyObject;
      const responses = operation.responses;
      const operationId = operation.operationId;

      if (requestBody && operationId) {
        const requestBodyContent = requestBody.content;
        const content = requestBodyContent['application/json'];
        const schema = content?.schema as SchemaObject;
        if (schema && !schema['x-resourceId']) {
          const resourceId = `${operationId}RequestBody`;
          schema['x-resourceId'] = resourceId;
          schemas[resourceId] = schema;
        }
      }

      if (responses && operationId) {
        for (const statusCode in responses) {
          const response = responses[statusCode] as ResponseObject;
          const responseContent = response.content;
          const content = responseContent?.['application/json'];
          const schema = content?.schema as SchemaObject;
          if (schema && !schema['x-resourceId']) {
            const resourceId = `${operationId}ResponseBody`;
            schema['x-resourceId'] = resourceId;
            schemas[resourceId] = schema;
          }
        }
      }
    }
  }

  if (args.ts || args.all) {
    ts.generate(spec, handlebars);
  }

  // if (args.java || args.all) {
  //   java.generate(spec);
  // }
};

export default run;
