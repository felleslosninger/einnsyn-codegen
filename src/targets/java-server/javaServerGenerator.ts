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
  lc,
} from '../../utils/handlebarsHelpers';
import { getResourceIds, getResponseBody } from '../../utils/helpers';
import { addJavaServerHandlebarsHelpers } from './javaServerHandlebarsHelpers';

export const JAVA_SERVER_PACKAGE = 'no.einnsyn.apiv3';
const JAVA_SERVER_TEMPLATE_PATH = './src/targets/java-server/templates';
const JAVA_SERVER_OUT_PATH = './out/java-server/src/main/java/no/einnsyn/apiv3';

export type Entity = {
  name: string;
  schema?: SchemaObject;
  operationList: EntityOperation[];
};

export type EntityOperation = {
  entity: Entity;
  entityName: string;
  path: string;
  pathParts: string[];
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

  // Register partials
  const modelPartialTemplate = await fs.promises.readFile(
    JAVA_SERVER_TEMPLATE_PATH + '/ModelPartial.java.hbs',
    'utf8',
  );
  hb.registerPartial('modelPartial', modelPartialTemplate);

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

      // Trim path, split on / and remove empty strings
      const trimmedPath = path.replace(/(^\/|\/$)/g, '');
      const pathParts = trimmedPath.split('/').filter((s) => s.length > 0);

      entity.operationList.push({
        entity,
        entityName,
        path,
        pathParts,
        method,
        operation,
      });
    }
  }

  // Iterate all entities
  for (const name in entityList) {
    const entity = entityList[name];
    const capName = capitalize(name);
    const lcName = lc(name);
    const entityPathName = `entities/${lcName}`;
    const modelPathName = `${entityPathName}/models`;

    // Render JSON model
    if (entity.schema) {
      await render(
        hb,
        'Model.java.hbs',
        `${modelPathName}/${capName}DTO.java`,
        entity,
      );
    }

    // Render enums
    for (const propertyName in entity.schema?.properties ?? {}) {
      const property = entity.schema?.properties?.[
        propertyName
      ] as SchemaObject;
      const enumValues = property.enum;
      if (enumValues === undefined || enumValues.length <= 1) {
        continue;
      }
      await render(
        hb,
        'Enum.java.hbs',
        `${modelPathName}/${capitalize(propertyName)}Enum.java`,
        {
          entityName: name,
          name: capitalize(propertyName) + 'Enum',
          values: enumValues,
        },
      );
    }

    // Render Uninon wrappers for ExpandableFields that can take multiple types
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

      // Render ModelUnionResource file
      const capPropName = capitalize(propertyName);
      await render(
        hb,
        'ModelUnionResource.java.hbs',
        `${modelPathName}/UnionResource${capPropName}.java`,
        {
          entityName: name,
          propertyName,
          resources,
        },
      );

      // Render ModelUnionResource type adapter
      await render(
        hb,
        'ModelUnionResourceTypeAdapter.java.hbs',
        `${modelPathName}/UnionResource${capPropName}TypeAdapter.java`,
        {
          entityName: name,
          propertyName,
          resources,
        },
      );
    }

    // UnionResource properties for responses
    for (const operation of entity.operationList) {
      const responseBody = getResponseBody(operation.operation);
      const resourceIds = getResourceIds(responseBody);
      if (resourceIds.join() === 'ResultList') {
        resourceIds.shift();
        resourceIds.push(
          ...getResourceIds(
            ((responseBody.properties?.data as SchemaObject)
              ?.items as SchemaObject) ?? {},
          ),
        );
      }
      if (resourceIds.length < 2) {
        continue;
      }
      await render(
        hb,
        'ModelUnionResource.java.hbs',
        `${modelPathName}/UnionResource${operation.operation.operationId}.java`,
        {
          entityName: name,
          propertyName: operation.operation.operationId,
          resources: resourceIds,
        },
      );
      // Render ModelUnionResource type adapter
      await render(
        hb,
        'ModelUnionResourceTypeAdapter.java.hbs',
        `${modelPathName}/UnionResource${operation.operation.operationId}TypeAdapter.java`,
        {
          entityName: name,
          propertyName: operation.operation.operationId,
          resources: resourceIds,
        },
      );
    }

    console.log('Generate controller for ' + name);
    if (entity.operationList.length > 0) {
      // Render controller
      await render(
        hb,
        'Controller.java.hbs',
        `${entityPathName}/${capName}Controller.java`,
        entity,
      );

      // Render query parameters for operations that aren't bound to an entity
      for (const operationWrapper of entity.operationList) {
        const operation = operationWrapper.operation;
        const xRequestQuery = operation['x-request-query'] ?? {};
        if (xRequestQuery['x-no-entity']) {
          await renderQueryParameters(xRequestQuery);
        }
      }
    }

    const xRequestQuery = entity.schema?.['x-request-query'] ?? {};
    for (const method in xRequestQuery) {
      const props = xRequestQuery[method];
      await renderQueryParameters(props);
    }

    async function renderQueryParameters(props: any) {
      const className = props['x-custom-name'];
      if (!className) return;
      const context = {
        schema: {
          properties: props['x-custom-props'],
          'x-extends': props['x-extend-name'],
          'x-extends-entity': props['x-extend-entity'],
        },
        entityName: name,
        name: className,
        inlineEnums: true,
      };
      await render(
        hb,
        'QueryParameters.java.hbs',
        `${modelPathName}/${className}DTO.java`,
        context,
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
  const templateSource = await fs.promises.readFile(
    JAVA_SERVER_TEMPLATE_PATH + '/' + templateFile,
    'utf8',
  );
  const template = handlebars.compile(templateSource);
  let output = template(context);
  try {
    output = await prettier.format(output, {
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
