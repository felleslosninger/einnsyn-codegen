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
  getPropertyList,
  getResourceIds,
  getResources,
  getResponseBody,
} from '../../utils/helpers';
import { getRenderer } from '../../utils/renderer';
import { addJavaServerHandlebarsHelpers } from './javaServerHandlebarsHelpers';

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
    const entitySchema = entityMetadata.schema;
    const entityName = entityMetadata.entityName;
    const capEntityName = capitalize(entityName);
    const lcEntityName = lc(entityName);
    const entityPathName = `entities/${lcEntityName}`;
    const modelPathName = `${entityPathName}/models`;

    if (entityName === 'ResultList') {
      continue;
    }

    // Render JSON model
    if (entitySchema) {
      if (entitySchema['x-resourceId']) {
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
              entityName: entityName,
              name: capitalize(propertyName) + 'Enum',
              values: enumValues,
            },
          );
        }
      } // end if(x-resourceId)

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
    for (const operationMetadata of entityMetadata.entityOperationList) {
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

    if (entityMetadata.entityOperationList.length > 0) {
      await render(
        'Controller.java.hbs',
        `${entityPathName}/${capEntityName}Controller.java`,
        entityMetadata,
      );
    }

    // Render query parameters for all operations
    const xRequestQuery = entitySchema?.['x-request-query'] ?? {};
    for (const method in xRequestQuery) {
      const props = xRequestQuery[method];
      const className = props['x-custom-name'];
      const hasCustom = props['x-has-custom-props'];
      if (!hasCustom) {
        continue;
      }
      const context = {
        schema: {
          properties: props['x-custom-props'],
          'x-extends': props['x-extend-name'],
          'x-extends-entity': props['x-extend-entity'],
        },
        entityName,
        className,
        inlineEnums: true,
      };
      await render(
        'QueryParameters.java.hbs',
        `${modelPathName}/${className}DTO.java`,
        context,
      );
    }
  }
};
