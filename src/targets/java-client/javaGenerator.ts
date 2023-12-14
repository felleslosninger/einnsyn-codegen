import fs from "fs";
import handlebars from "handlebars";
import { ReferenceObject, SchemaObject } from "openapi3-ts/oas30";

const TEMPLATE_PATH = "./src/java/templates";
const MODEL_PATH = "./src/java/out/src/main/java/no/einnsyn/model";
const PARAM_PATH = "./src/java/out/src/main/java/no/einnsyn/param";

type ModelProperties = {
  schemaName: string;
  properties: Record<string, SchemaObject>;
};

// Load handlebars templates
const modelTemplateSource = fs.readFileSync(
  `${TEMPLATE_PATH}/Model.java.hbs`,
  "utf8"
);
const modelTemplate = handlebars.compile(modelTemplateSource);

const updateParamsTemplateSource = fs.readFileSync(
  `${TEMPLATE_PATH}/UpdateParams.java.hbs`,
  "utf8"
);
const updateParamsTemplate = handlebars.compile(updateParamsTemplateSource);

const insertParamsTemplateSource = fs.readFileSync(
  `${TEMPLATE_PATH}/InsertParams.java.hbs`,
  "utf8"
);
const insertParamsTemplate = handlebars.compile(insertParamsTemplateSource);

const requestTemplateSource = fs.readFileSync(
  `${TEMPLATE_PATH}/Request.java.hbs`,
  "utf8"
);
const requestTemplate = handlebars.compile(requestTemplateSource);

const clientTemplateSource = fs.readFileSync(
  `${TEMPLATE_PATH}/Client.java.hbs`,
  "utf8"
);
const clientTemplate = handlebars.compile(clientTemplateSource);

const isRef = (schema: unknown): schema is ReferenceObject => {
  return typeof schema === "object" && schema !== null && "$ref" in schema;
};

export const generateModel = async (modelProperties: ModelProperties) => {
  const imports: Record<string, boolean> = {};

  // Update data type
  for (const propertyName in modelProperties.properties) {
    const property = modelProperties.properties[propertyName];
    console.log("Property: ", propertyName, property);
    switch (property.type) {
      case "string":
        if (property.format === "date" || property.format === "date-time") {
          property["x-javadatatype"] = "ZonedDateTime";
          imports["java.time.ZonedDateTime"] = true;
        } else {
          property["x-javadatatype"] = "String";
        }
        if (property.enum !== undefined) {
          if (Array.isArray(property.enum) && property.enum.length == 1) {
            property["x-javavalue"] = property.enum[0];
            //property["x-javafinal"] = true;
          }
        }
        break;
      case "number":
        if (property.format === "float") {
          property["x-javadatatype"] = "float";
        } else {
          property["x-javadatatype"] = "double";
        }
        break;
      case "integer":
        if (property.format === "int32") {
          property["x-javadatatype"] = "int";
        } else {
          property["x-javadatatype"] = "long";
        }
        break;
      case "boolean":
        property["x-javadatatype"] = "Boolean";
        break;
      default:
        break;
    }

    if (property.minimum) {
      imports["jakarta.validation.constraints.Min"] = true;
    }

    if (property.maximum) {
      imports["jakarta.validation.constraints.Max"] = true;
    }

    if (property.minLength || property.maxLength) {
      imports["jakarta.validation.constraints.Size"] = true;
    }

    if (property.pattern) {
      imports["jakarta.validation.constraints.Pattern"] = true;
    }

    if (property["x-required"]) {
      imports["jakarta.validation.constraints.NotNull"] = true;
    }

    if (property["x-expandableField"] !== undefined) {
      const resources: string[] = [];

      const anyOf = property.anyOf ?? (property.items as SchemaObject)?.anyOf;

      // Loop anyOf properties. One is ID, the rest are expandable fields.
      // Look up each expandable field model, and add it to the imports.
      anyOf?.forEach((anyOfProperty) => {
        if (!isRef(anyOfProperty)) {
          const resourceId = anyOfProperty["x-resourceId"];
          if (resourceId !== undefined) {
            const modelName =
              resourceId.charAt(0).toUpperCase() + resourceId.slice(1);
            resources.push(modelName);
          }
        }
      });

      // Wrap arrays in List
      if (resources.length === 1) {
        let datatype = "ExpandableField<" + resources.join() + ">";
        if (property.type === "array") {
          datatype = "List<" + datatype + ">";
          imports["java.util.List"] = true;
        }
        property["x-javadatatype"] = datatype;
      }
    }
  }

  // Create model file
  renderAndWrite(
    modelTemplate,
    {
      ...modelProperties,
      imports: Object.keys(imports).sort(),
    },
    MODEL_PATH,
    `${modelProperties.schemaName}.java`
  );

  // Create update-parameter file
  renderAndWrite(
    updateParamsTemplate,
    {
      ...modelProperties,
      imports: Object.keys(imports).sort(),
    },
    PARAM_PATH,
    `${modelProperties.schemaName}UpdateParams.java`
  );

  // Create insert-parameter file
  renderAndWrite(
    insertParamsTemplate,
    {
      ...modelProperties,
      imports: Object.keys(imports).sort(),
    },
    PARAM_PATH,
    `${modelProperties.schemaName}InsertParams.java`
  );
};

export function generateRequest() {}

export function generateClient() {}

const renderAndWrite = async (
  renderer: (data: unknown) => string,
  data: unknown,
  path: string,
  fileName: string
) => {
  const rendered = renderer(data);

  // Create path if it doesn't exist
  if (!(await fs.promises.exists(path))) {
    await fs.promises.mkdir(path, { recursive: true });
  }

  // Write file
  await fs.promises.writeFile(`${path}/${fileName}`, rendered);
};
