import $RefParser from '@apidevtools/json-schema-ref-parser';
import fs from 'fs';
import handlebars from 'handlebars';
import yaml from 'js-yaml';
import { ParsedArgs } from 'minimist';
import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import { JSONObject, deepMergeAllOf } from './utils/deepMergeAllOf';

import * as ts from './targets/ts-client/tsGenerator';
import * as javaServer from './targets/java-server/javaServerGenerator';

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

    // Mark properties as expandable fields for quick lookup
    schema['x-expandableFields']?.forEach(async (expandableField: string) => {
      let property = schema.properties?.[expandableField] as SchemaObject;
      if (property) {
        property['x-expandableField'] = expandableField;
      }
    });
  }

  // Create query parameter objects for each operation. We want paths like
  // GET /bruker/innsynskrav
  // to inherit (or extend, if needed) query parameters from
  // GET /innsynskrav
  // so that the same object can be used and type checked throughout the codebase.
  for (const path in spec.paths) {
    const pathItem = spec.paths[path];

    // We're only interested in GET. The others will get generated custom objects.
    const get = pathItem.get as OperationObject;
    if (!get) continue;

    // Get the query parameters from the path
    const pathParameters = pathItem.parameters as ParameterObject[];
    const pathQueryParameters = pathParameters?.filter((p) => p.in === 'query');
    const queryProperties = pathQueryParameters?.reduce(
      (acc, p) => {
        acc[p.name] = p.schema as SchemaObject;
        return acc;
      },
      {} as { [key: string]: SchemaObject },
    );

    // Differ between List and Single.
    const response = get.responses?.['200'] as ResponseObject;
    const responseBody = response?.content?.['application/json']
      ?.schema as SchemaObject;
    const isList = responseBody?.['x-resourceId'] === 'ResultList';

    // Find the entity object
    const entity = isList
      ? ((responseBody?.properties?.data as SchemaObject)
          ?.items as SchemaObject as SchemaObject)
      : responseBody;
    const entityName = entity?.['x-resourceId'];

    // Find the root entity object
  }

  if (args.ts || args.all) {
    ts.generate(spec, handlebars);
  }

  if (args['java-server'] || args.all) {
    javaServer.generate(spec, handlebars);
  }
};

export default run;
