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
  getResourceIds,
  getResources,
  getResponseBody,
  setSpec,
} from '../../utils/helpers';
import { getRenderer } from '../../utils/renderer';
import { addJavaServerHandlebarsHelpers } from './javaServerHandlebarsHelpers';
import { Schema } from 'js-yaml';

export const JAVA_SERVER_PACKAGE = 'no.einnsyn.apiv3';
const JAVA_SERVER_TEMPLATE_PATH = './src/targets/java-server/templates';
const JAVA_SERVER_OUT_PATH = './out/java-server/src/main/java/no/einnsyn/apiv3';

export const generate = async (
  spec: OpenAPIObject,
  handlebars: typeof Handlebars,
) => {
  // Create a new handlebar instance and add TS-specific helpers
  const hb = handlebars.create();
  addHandlebarsHelpers(hb);
  addJavaServerHandlebarsHelpers(hb);
  setSpec(spec);
  const render = getRenderer(
    hb,
    JAVA_SERVER_OUT_PATH,
    JAVA_SERVER_TEMPLATE_PATH,
  );

  // Register partials
  const modelPartialTemplate = await fs.promises.readFile(
    JAVA_SERVER_TEMPLATE_PATH + '/ModelPartial.java.hbs',
    'utf8',
  );
  hb.registerPartial('modelPartial', modelPartialTemplate);

  // Iterate all entities
  for (const entityMetadata of getEntities(spec)) {
    const entityName = entityMetadata.entityName;
    if (entityName === 'ResultList') {
      continue;
    }
    const entitySchema = entityMetadata.schema;
    const capEntityName = capitalize(entityName);
    const lcEntityName = lc(entityName);
    const entityPathName = `entities/${lcEntityName}`;
    const modelPathName = `${entityPathName}/models`;
    const entityOperationList = getEntityOperationList(entityName);

    // Render JSON model
    if (entitySchema?.['x-resourceId']) {
      await render(
        'Model.java.hbs',
        `${modelPathName}/${capEntityName}DTO.java`,
        {
          ...entityMetadata,
          className: entityName,
        },
      );

      // Render enums
      const enumProperties = getPropertyList(entitySchema).filter(
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

      // Render Uninon wrappers for ExpandableFields that can take multiple types
      for (const propertyMetadata of getPropertyList(entitySchema)) {
        const propertySchema = propertyMetadata.propertySchema;
        const propertyName = propertyMetadata.propertyName;
        const resources = getResources(propertySchema);
        const className =
          capitalize(entityName) + capitalize(propertyName) + 'DTO';

        if (resources.length < 2) {
          continue;
        }

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
          'ModelUnionResourceTypeAdapter.java.hbs',
          `${modelPathName}/${className}TypeAdapter.java`,
          renderContext,
        );
      }
    } // End if (entitySchema)

    // UnionResource properties for responses
    for (const operationMetadata of entityOperationList) {
      const operation = operationMetadata.operation;
      const responseBody = getResponseBody(operation);
      if (getResourceIds(responseBody).join() !== 'ResultList') {
        continue;
      }

      const resultListSchema = responseBody.properties?.data as SchemaObject;
      const resources = getResources(resultListSchema);

      if (resources.length < 2) {
        continue;
      }

      const propertyName = operation.operationId;
      const className =
        capitalize(entityName) + capitalize(propertyName) + 'ResponseDTO';
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
        'ModelUnionResourceTypeAdapter.java.hbs',
        `${modelPathName}/${className}TypeAdapter.java`,
        renderContext,
      );
    }

    if (entityOperationList.length > 0) {
      await render(
        'Controller.java.hbs',
        `${entityPathName}/${capEntityName}Controller.java`,
        entityMetadata,
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
      const hasCustomProps = operation['x-has-custom-props'];
      if (!hasCustomProps) {
        continue;
      }
      const renderContext = {
        schema: {
          properties: operation['x-custom-props'],
          'x-extends': operation['x-extend-name'],
          'x-extends-entity': operation['x-extend-entity'],
        },
        entityName,
        className,
        inlineEnums: true,
      };
      await render(
        'QueryParameters.java.hbs',
        `${modelPathName}/${className}DTO.java`,
        renderContext,
      );
    }
  }
};
