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
} from '../../utils/handlebarsHelpers';
import { addTSHandlebarsHelpers } from './tsHandlebarsHelpers';

const TS_TEMPLATE_PATH = './src/targets/ts-client/templates';
const TS_OUT_PATH = './out/ts-client/src/';
const MODEL_PATH = TS_OUT_PATH + '/model';
const RESOURCE_PATH = TS_OUT_PATH + '/resource';

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
  addTSHandlebarsHelpers(hb);

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

    console.log('Generate resource for ' + name);
    await render(
      hb,
      `${TS_TEMPLATE_PATH}/Resource.ts.hbs`,
      `${RESOURCE_PATH}/${name}Resource.ts`,
      entity,
    );

    if (entity.schema) {
      console.log('Generate model for ' + name);
      await render(
        hb,
        `${TS_TEMPLATE_PATH}/Model.ts.hbs`,
        `${MODEL_PATH}/${name}.ts`,
        entity,
      );
    }
  }

  // Generate indexes
  console.log('Generate model index');
  await render(
    hb,
    `${TS_TEMPLATE_PATH}/ModelIndex.ts.hbs`,
    `${MODEL_PATH}/index.ts`,
    {
      entityList,
    },
  );

  console.log('Generate resource index');
  await render(
    hb,
    `${TS_TEMPLATE_PATH}/ResourceIndex.ts.hbs`,
    `${RESOURCE_PATH}/index.ts`,
    {
      entityList,
    },
  );

  // Generate client
  console.log('Generate client');
  await render(
    hb,
    `${TS_TEMPLATE_PATH}/ApiClient.ts.hbs`,
    `${TS_OUT_PATH}/ApiClient.ts`,
    {
      entityList,
    },
  );
};

/**
 *
 * @param templatePath
 * @param outputPath
 * @param context
 */
const render = async (
  handlebars: typeof Handlebars,
  templatePath: string,
  outputPath: string,
  context: Record<string, unknown>,
) => {
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const template = handlebars.compile(templateSource);
  let output = template(context);
  try {
    output = await prettier.format(template(context), {
      parser: 'typescript',
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
