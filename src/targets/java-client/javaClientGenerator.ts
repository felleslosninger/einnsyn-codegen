import fs from 'fs';
import Handlebars from 'handlebars';
import { OpenAPIObject, SchemaObject } from 'openapi3-ts/oas30';
import {
  addHandlebarsHelpers,
  capitalize,
  lc,
} from '../../utils/handlebarsHelpers';
import {
  getEntities,
  getEntityOperationList,
  getPropertyList,
  getRequestBodyResource,
  getRequestBodyResourceId,
  getResourceIds,
  getResources,
  getResponseBody,
  setSpec,
} from '../../utils/helpers';
import { getRenderer } from '../../utils/renderer';
import { addJavaClientHandlebarsHelpers } from './javaClientHandlebarsHelpers';

export const JAVA_CLIENT_PACKAGE = 'no.einnsyn.apiclient';
const JAVA_CLIENT_TEMPLATE_PATH = './src/targets/java-client/templates';
const JAVA_CLIENT_OUT_PATH =
  './out/java-client/src/main/java/no/einnsyn/apiclient';

export const generate = async (
  spec: OpenAPIObject,
  handlebars: typeof Handlebars,
) => {
  // Create a new handlebar instance and add TS-specific helpers
  const hb = handlebars.create();
  addHandlebarsHelpers(hb);
  addJavaClientHandlebarsHelpers(hb);
  setSpec(spec);
  const render = getRenderer(
    hb,
    JAVA_CLIENT_OUT_PATH,
    JAVA_CLIENT_TEMPLATE_PATH,
  );

  // Register partials
  const modelPartialTemplate = await fs.promises.readFile(
    JAVA_CLIENT_TEMPLATE_PATH + '/ModelPartial.java.hbs',
    'utf8',
  );
  hb.registerPartial('modelPartial', modelPartialTemplate);

  const entityMetadataList = getEntities(spec);

  // Render TypeAdapterFactoryProvider
  await render(
    'TypeAdapterFactoryProvider.java.hbs',
    `net/TypeAdapterFactoryProvider.java`,
    { entityMetadataList },
  );

  // Iterate all entities
  for (const entityMetadata of entityMetadataList) {
    const entityName = entityMetadata.entityName;
    if (entityName === 'ResultList') {
      continue;
    }
    const entitySchema = entityMetadata.schema;
    if (entitySchema?.['x-isExtended']) {
      continue;
    }
    const capEntityName = capitalize(entityName);
    const lcEntityName = lc(entityName);
    const entityPathName = `entities/${lcEntityName}`;
    const modelPathName = `${entityPathName}`;
    const entityOperationList = getEntityOperationList(entityName);

    if (entitySchema?.['x-resourceId']) {
      // Render JSON model
      await render('Model.java.hbs', `${modelPathName}/${capEntityName}.java`, {
        ...entityMetadata,
        className: entityName,
      });

      // Render enums
      const enumProperties = getPropertyList(entitySchema, true).filter(
        (prop) =>
          prop.propertySchema.enum && prop.propertySchema.enum.length > 1,
      );
      for (const propertyMetadata of enumProperties) {
        const propertySchema = propertyMetadata.propertySchema;
        const propertyName = propertyMetadata.propertyName;
        const enumValues = propertySchema.enum;
        await render(
          'Enum.java.hbs',
          `${modelPathName}/${capitalize(propertyName)}Enum.java`,
          {
            entityName,
            name: capitalize(propertyName) + 'Enum',
            values: enumValues,
          },
        );
      }
    }

    // Render body for POST/PATCH operations with non-entity bodies
    for (const operation of entityOperationList) {
      const requestBody = getRequestBodyResource(operation.operation);
      if (requestBody && !requestBody['x-resourceId']) {
        const requestBodyResourceId = getRequestBodyResourceId(
          operation.operation,
        );
        await render(
          'Model.java.hbs',
          `${modelPathName}/${capitalize(requestBodyResourceId)}.java`,
          {
            entityName,
            className: capitalize(requestBodyResourceId),
            schema: requestBody,
            inlineEnums: true,
          },
        );
      }
    }

    // Render Services
    if (entityOperationList.length > 0) {
      await render(
        'Service.java.hbs',
        `${entityPathName}/${capEntityName}Service.java`,
        {
          ...entityMetadata,
          className: entityName,
        },
      );
    }

    // Render Uninon wrappers for ExpandableFields that can take multiple types
    for (const propertyMetadata of getPropertyList(entitySchema, true)) {
      const propertySchema = propertyMetadata.propertySchema;
      const propertyName = propertyMetadata.propertyName;
      const resources = getResources(propertySchema);
      const className = capitalize(entityName) + capitalize(propertyName);

      if (resources.length < 2) {
        continue;
      }

      const renderContext = {
        entityName,
        propertyName,
        className,
        resources,
      };

      // Render ModelUnionResource file
      const capPropName = capitalize(propertyName);
      await render(
        'ModelUnionResource.java.hbs',
        `${modelPathName}/${className}.java`,
        renderContext,
      );

      // Render ModelUnionResource type adapter
      await render(
        'ModelUnionResourceTypeAdapterFactory.java.hbs',
        `${modelPathName}/${className}TypeAdapterFactory.java`,
        renderContext,
      );
    }

    // UnionResource properties for responses
    for (const operationMetadata of entityOperationList) {
      const operation = operationMetadata.operation;
      const responseBody = getResponseBody(operation);
      let resourceSchema: SchemaObject = responseBody;

      // If this is a list, get schema from data property
      if (getResourceIds(responseBody).join() === 'ResultList') {
        resourceSchema = responseBody.properties?.data as SchemaObject;
      }

      const resources = getResources(resourceSchema);

      if (resources.length < 2) {
        continue;
      }

      const propertyName = operation.operationId;
      const className =
        capitalize(entityName) + capitalize(propertyName) + 'Response';
      const renderContext = {
        entityName,
        propertyName,
        className,
        resources,
      };

      await render(
        'ModelUnionResource.java.hbs',
        `${modelPathName}/${className}.java`,
        renderContext,
      );

      await render(
        'ModelUnionResourceTypeAdapterFactory.java.hbs',
        `${modelPathName}/${className}TypeAdapterFactory.java`,
        renderContext,
      );
    }

    let relatedOperations: SchemaObject[] = [];
    // For normal entities, query parameters metadata is stored in x-request-query
    if (entitySchema) {
      const xRequestQuery: Record<string, SchemaObject> =
        entitySchema['x-request-query'] ?? {};
      const methods = Object.keys(xRequestQuery);
      relatedOperations = methods
        .map(
          (method) =>
            xRequestQuery[method as keyof typeof xRequestQuery] as SchemaObject,
        )
        .filter((x) => x !== undefined);
    }
    // For entities without a schema (/search), query parameters are stored in the operation
    else {
      relatedOperations = entityOperationList
        .map(
          (operationMetadata) => operationMetadata.operation['x-request-query'],
        )
        .filter((x) => x !== undefined);
    }

    // Render query parameters for all operations
    for (const operation of relatedOperations) {
      const className = operation['x-custom-name'];
      const hasProps = operation['x-has-props'];
      if (!hasProps) {
        continue;
      }
      const renderContext = {
        schema: {
          properties: operation['x-all-props'],
        },
        entityName,
        className,
        inlineEnums: true,
      };
      await render(
        'QueryParameters.java.hbs',
        `${modelPathName}/${className}.java`,
        renderContext,
      );
    }
  }

  // Render EInnsynClientBase
  await render('EInnsynClientBase.java.hbs', `EInnsynClientBase.java`, {
    entityMetadataList,
  });
};
