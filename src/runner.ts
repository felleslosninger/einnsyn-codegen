import $RefParser from '@apidevtools/json-schema-ref-parser';
import fs from 'fs';
import handlebars from 'handlebars';
import yaml from 'js-yaml';
import { ParsedArgs } from 'minimist';
import { OpenAPIObject, SchemaObject } from 'openapi3-ts/oas30';
import { JSONObject, deepMergeAllOf } from './utils/deepMergeAllOf';

import * as javaClient from './targets/java-client/javaClientGenerator';
import * as javaServer from './targets/java-server/javaServerGenerator';
import * as ts from './targets/ts-client/tsGenerator';
import { addOperationQueryProperties } from './utils/addOperationQueryProperties';

const run = async (args: ParsedArgs) => {
  // Parse spec
  const file = await fs.promises.readFile(args.spec as string, 'utf8');
  let spec = yaml.load(file) as OpenAPIObject;

  // Dereference spec
  spec = (await $RefParser.dereference(spec)) as OpenAPIObject;

  // Add x-extends, and remove extended properties for schemas that extend other schemas
  // (subclassing)
  let schemas = spec.components?.schemas ?? {};
  for (const schemaName in schemas) {
    const schema = schemas[schemaName] as SchemaObject;
    const allOf = schema.allOf ?? [];
    // The first allOf object should be the schema that is extended
    const maybeSuper = allOf[0] as SchemaObject;
    if (maybeSuper?.['x-resourceId']) {
      schema['x-extends'] = maybeSuper['x-resourceId'];
      maybeSuper['x-isExtended'] = true;
      allOf.shift();
    }
  }

  // Merge all allOf objects in spec
  spec = deepMergeAllOf({}, [
    spec as unknown as JSONObject,
  ]) as unknown as OpenAPIObject;
  schemas = spec.components?.schemas ?? {};

  // Prepare additional helper properties in schemas
  for (const schemaName in schemas) {
    let schema = schemas[schemaName] as SchemaObject;

    // Set "default" for properties with one enum value
    for (const propertyName in schema.properties ?? {}) {
      const property = schema.properties?.[propertyName] as SchemaObject;
      if (property.default === undefined && property.enum?.length === 1) {
        property.default = property.enum[0];
      }
    }

    // Mark properties as required
    schema.required?.forEach((required) => {
      let property = schema.properties?.[required] as SchemaObject;
      if (property) {
        property['x-required'] = true;
      }
    });

    // Find all properties that are expandable fields
    for (const propertyName in schema.properties ?? {}) {
      const property = schema.properties?.[propertyName] as SchemaObject;
      const anyOf =
        property.anyOf ?? (property.items as SchemaObject)?.anyOf ?? [];
      if (
        anyOf.length === 2 &&
        (anyOf[0] as SchemaObject).type === 'string' &&
        (anyOf[1] as SchemaObject).type === 'object'
      ) {
        const resourceId = (anyOf[1] as SchemaObject)['x-resourceId'];
        if (resourceId) {
          property['x-resourceId'] = resourceId;
        }
      }
    }
  }

  // Add query properties
  addOperationQueryProperties(spec);

  if (args.ts || args.all) {
    ts.generate(spec, handlebars);
  }

  if (args['java-server'] || args.all) {
    javaServer.generate(spec, handlebars);
  }

  if (args['java-client'] || args.all) {
    javaClient.generate(spec, handlebars);
  }
};

export default run;
