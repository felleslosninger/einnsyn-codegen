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
  getRequestBodyType,
  lc,
} from '../../utils/handlebarsHelpers';
import {
  getRequestBody,
  getResourceIds,
  getResponseBody,
} from '../../utils/helpers';
import {
  addJavaClientHandlebarsHelpers,
  getExtendedProperties,
  setSpec,
} from './javaClientHandlebarsHelpers';

export const JAVA_CLIENT_PACKAGE = 'no.einnsyn.apiclient';
const JAVA_CLIENT_TEMPLATE_PATH = './src/targets/java-client/templates';
const JAVA_CLIENT_OUT_PATH =
  './out/java-client/src/main/java/no/einnsyn/apiclient';

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
  addJavaClientHandlebarsHelpers(hb);
  setSpec(spec);

  // Register partials
  const modelPartialTemplate = await fs.promises.readFile(
    JAVA_CLIENT_TEMPLATE_PATH + '/ModelPartial.java.hbs',
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
    const modelPathName = `${entityPathName}`;

    if (entity.schema?.['x-isExtended']) {
      continue;
    }

    // Render JSON model
    if (entity.schema) {
      await render(
        hb,
        'Model.java.hbs',
        `${modelPathName}/${capName}.java`,
        entity,
      );
    }

    // Render body for POST/PUT operations with non-entity bodies
    for (const operation of entity.operationList) {
      const requestBody = getRequestBody(operation.operation);
      if (requestBody && !requestBody['x-resourceId']) {
        const requestBodyType = getRequestBodyType(operation.operation);
        await render(
          hb,
          'Model.java.hbs',
          `${modelPathName}/${capitalize(requestBodyType)}.java`,
          {
            entityName: name,
            name: capitalize(requestBodyType),
            schema: requestBody,
            inlineEnums: true,
          },
        );
      }
    }

    // Render Services
    await render(
      hb,
      'Service.java.hbs',
      `${entityPathName}/${capName}Service.java`,
      entity,
    );

    // Render query parameters for operations that aren't bound to an entity (search)
    for (const operationWrapper of entity.operationList) {
      const operation = operationWrapper.operation;
      const xRequestQuery = operation['x-request-query'] ?? {};
      if (xRequestQuery['x-no-entity']) {
        await renderQueryParameters(xRequestQuery);
      }
    }

    // Combine properties from superclasses
    const properties = getExtendedProperties(entity.schema ?? {}) ?? {};

    // Render enums
    for (const propertyName in properties) {
      const property = properties[propertyName] as SchemaObject;
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
    for (const propertyName in properties) {
      const property = properties[propertyName];
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

    const xRequestQuery = entity.schema?.['x-request-query'] ?? {};
    for (const method in xRequestQuery) {
      const props = xRequestQuery[method];
      await renderQueryParameters(props);
    }

    async function renderQueryParameters(props: any) {
      const className = props['x-custom-name'];
      const allProps = props['x-all-props'];
      if (Object.keys(allProps ?? {}).length) {
        const context = {
          schema: {
            properties: props['x-all-props'],
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
          `${modelPathName}/${className}.java`,
          context,
        );
      }
    }
  }

  // Render EInnsynClientBase
  await render(hb, 'EInnsynClientBase.java.hbs', `EInnsynClientBase.java`, {
    entityList,
  });
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
  const outputPath = JAVA_CLIENT_OUT_PATH + '/' + outputFile;
  const templateSource = await fs.promises.readFile(
    JAVA_CLIENT_TEMPLATE_PATH + '/' + templateFile,
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
