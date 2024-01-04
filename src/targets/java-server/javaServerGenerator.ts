import fs from 'fs';
import Handlebars from 'handlebars';
import {
  OpenAPIObject,
  OperationObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import * as prettier from 'prettier';
import {
  addHandlebarsHelpers,
  capitalize,
  deCapitalize,
  lc,
} from '../../utils/handlebarsHelpers';
import { addJavaServerHandlebarsHelpers } from './javaServerHandlebarsHelpers';

export const JAVA_PACKAGE = 'no.einnsyn.apiv3';
const JAVA_SERVER_TEMPLATE_PATH = './src/targets/java-server/templates';
const JAVA_SERVER_OUT_PATH = './out/java-server/src/main/java/no/einnsyn/apiv3';

export type Entity = {
  name: string;
  schema?: SchemaObject;
  operationList: EntityOperation[];
};

export type EntityOperation = {
  path: string;
  method: string;
  operation: OperationObject;
};

export const generate = async (
  spec: OpenAPIObject,
  handlebars: typeof Handlebars,
) => {
  // Create a new handlebar instance and add TS-specific helpers
  const hb = handlebars.create();
  addHandlebarsHelpers(hb);
  addJavaServerHandlebarsHelpers(hb);

  const entityList: {
    [key: string]: Entity;
  } = {};

  // Add all schemas
  const schemas = spec.components?.schemas ?? {};
  for (const name in schemas) {
    const schema = schemas[name] as SchemaObject;

    // Add an exception for ResultList, this is implemented manually
    if (schema['x-resourceId'] === undefined || name === 'ResultList') {
      continue;
    }

    entityList[name] = {
      name,
      schema,
      operationList: [],
    };
  }

  // Iterate all paths, group them by matching root entity
  for (const path in spec.paths) {
    // Look up entity name from path
    const entityName = capitalize(path.split('/')[1] ?? '');
    let entity = entityList[entityName];

    // Entity not found
    if (!entity) {
      entity = {
        name: entityName,
        operationList: [],
      };
      entityList[entityName] = entity;
    }

    // Add operations to entity
    const pathItem = spec.paths[path];
    for (const methodUntyped in pathItem) {
      const method = methodUntyped as keyof typeof pathItem;
      const operation = pathItem[method] as OperationObject;
      const operationId = operation.operationId;
      if (!operationId) {
        continue;
      }

      entity.operationList.push({
        path,
        method,
        operation,
      });
    }
  }

  // Iterate all entities
  for (const name in entityList) {
    const entity = entityList[name];
    const deCapName = deCapitalize(name);
    const capName = capitalize(name);
    const lcName = lc(name);

    // Render JSON model
    await render(
      hb,
      'ModelJSON.java.hbs',
      `entities/${lcName}/models/${capName}JSON.java`,
      entity,
    );

    // Render ExpandableWrapper for ExpandableFields that can take multiple types
    for (const propertyName in entity.schema?.properties ?? {}) {
      const property = entity.schema?.properties?.[
        propertyName
      ] as SchemaObject;
      const resources =
        property.anyOf
          ?.map((anyOfProperty) => {
            return (anyOfProperty as SchemaObject)['x-resourceId'];
          })
          .filter((resourceId) => resourceId !== undefined) ?? [];

      if (resources.length < 2) {
        continue;
      }

      // Render ExpandableWrapper file
      const capPropName = capitalize(propertyName);
      await render(
        hb,
        'ModelExpandableUnion.java.hbs',
        `entities/${lcName}/models/${capName}${capPropName}.java`,
        {
          entityName: name,
          propertyName,
          resources,
        },
      );

      // Render ExpandableWrapper type adapter
      await render(
        hb,
        'ModelExpandableUnionTypeAdapter.java.hbs',
        `entities/${lcName}/models/${capName}${capPropName}TypeAdapter.java`,
        {
          entityName: name,
          propertyName,
          resources,
        },
      );
    }

    if (entity.schema) {
      console.log('Generate controller for ' + name);
      await render(
        hb,
        'Controller.java.hbs',
        `entities/${lcName}/${capName}Controller.java`,
        entity,
      );
    }
  }
};

/**
 *
 * @param templateFile
 * @param outputPath
 * @param context
 */
const render = async (
  handlebars: typeof Handlebars,
  templateFile: string,
  outputFile: string,
  context: Record<string, unknown>,
) => {
  const outputPath = JAVA_SERVER_OUT_PATH + '/' + outputFile;
  const templateSource = fs.readFileSync(
    JAVA_SERVER_TEMPLATE_PATH + '/' + templateFile,
    'utf8',
  );
  const template = handlebars.compile(templateSource);
  let output = template(context);
  try {
    output = await prettier.format(template(context), {
      plugins: [require('prettier-plugin-java')],
      parser: 'java',
      proseWrap: 'always',
      singleQuote: true,
    });
  } catch (e) {
    console.error('Error formatting ' + outputPath);
  }
  await fs.promises.mkdir(outputPath.replace(/\/[^/]+$/, ''), {
    recursive: true,
  });
  await fs.promises.writeFile(outputPath, output);
};
