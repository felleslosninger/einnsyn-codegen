import { OpenAPIObject, OpenApiBuilder, SchemaObject } from 'openapi3-ts/oas30';
import yaml from 'js-yaml';
import fs from 'fs';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { JSONObject, deepMergeAllOf } from './utils/deepMergeAllOf';
import { ParsedArgs } from 'minimist';
import handlebars from 'handlebars';

import * as java from './targets/java-client/javaGenerator';
import * as ts from './targets/ts-client/tsGenerator';
import { addHandlebarsHelpers } from './utils/handlebarsHelpers';

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

  if (args.ts || args.all) {
    ts.generate(spec, handlebars);
  }

  // if (args.java || args.all) {
  //   java.generate(spec);
  // }
};

export default run;
