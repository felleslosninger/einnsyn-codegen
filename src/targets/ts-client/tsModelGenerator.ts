import fs from 'fs';
import handlebars from 'handlebars';
import { OpenAPIObject, SchemaObject } from 'openapi3-ts/oas30';
import { TS_OUT_PATH, TS_TEMPLATE_PATH } from './tsConfig';
import * as prettier from 'prettier';

const MODEL_PATH = TS_OUT_PATH + '/model';

// Load handlebars templates
const modelTemplateSource = fs.readFileSync(
  `${TS_TEMPLATE_PATH}/Model.ts.hbs`,
  'utf8',
);
const modelTemplate = handlebars.compile(modelTemplateSource);

// Add lowercase "lc" helper
handlebars.registerHelper('lc', function (str: string) {
  return str?.toLowerCase();
});

// Add equality "eq" helper
handlebars.registerHelper(
  'eq',
  function (this: any, a: string, b: string, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  },
);

// Add equality "ne" helper
handlebars.registerHelper(
  'ne',
  function (this: any, a: string, b: string, options) {
    return a !== b ? options.fn(this) : options.inverse(this);
  },
);

export const generateModel = async (spec: OpenAPIObject) => {
  // Iterate all schemas
  const schemas = spec.components?.schemas ?? {};
  for (const name in schemas) {
    const schema = schemas[name] as SchemaObject;
    const properties = { ...schema.properties };
    const imports: Record<string, boolean> = {};

    if (schema['x-resourceId'] === undefined) {
      continue;
    }

    // Modify properties, add extra values
    for (const propertyName in properties) {
      const property = properties[propertyName] as SchemaObject;
      const resources: Record<string, boolean> = {};

      switch (property.type) {
        case 'string':
          if (property.format === 'date' || property.format === 'date-time') {
            property['x-tsdatatype'] = 'Date';
          } else {
            property['x-tsdatatype'] = 'string';
          }
          break;
        case 'number':
        case 'integer':
          property['x-tsdatatype'] = 'number';
          break;
        case 'boolean':
          property['x-tsdatatype'] = 'boolean';
          break;
        default:
          break;
      }

      // Handle expandableFields that has multiple types
      if (property['x-expandableField'] !== undefined) {
        const anyOf = property.anyOf ?? (property.items as SchemaObject)?.anyOf;
        anyOf?.forEach((anyOfPropertyUntyped) => {
          const anyOfProperty = anyOfPropertyUntyped as SchemaObject;
          const resourceId = anyOfProperty['x-resourceId'];
          if (resourceId !== undefined) {
            resources[resourceId] = true;
            imports[resourceId] = true;
          }
        });

        // Wrap arrays in List
        const resourceList = Object.keys(resources);
        const datatype =
          resourceList.length > 1
            ? `(${resourceList.join(' | ')})`
            : resourceList.join();

        property['x-tsdatatype'] = datatype;
        property['x-resources'] = resourceList;
      }
    }

    // Generate model
    let output = modelTemplate({
      name,
      properties,
      imports: Object.keys(imports).sort(),
    });

    try {
      output = await prettier.format(output, {
        parser: 'typescript',
        singleQuote: true,
      });
    } catch (e) {
      console.log('Failed to format: ' + name);
    }
    await fs.promises.mkdir(MODEL_PATH, { recursive: true });
    await fs.promises.writeFile(`${MODEL_PATH}/${name}.ts`, output);
  }
};
