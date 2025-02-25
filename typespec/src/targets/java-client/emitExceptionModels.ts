import {
  EmitContext,
  emitFile,
  isErrorModel,
  Model,
  Namespace,
  resolvePath,
} from '@typespec/compiler';
import { isReadonlyProperty } from '@typespec/openapi';
import { buildGeneralModel } from '../../languages/java/helpers/modelBuilder.js';
import {
  getJavaModelPackageName,
  getJavaModelPathName,
  getJavaType,
} from '../../languages/java/helpers/javaHelpers.js';
import { JavaFile } from '../../languages/java/primitives/javafile.js';
import Method from '../../languages/java/primitives/method.js';
import Parameter from '../../languages/java/primitives/parameter.js';
import { JavaBaseProps } from '../../languages/java/types.js';
import {
  getBodyProperties,
  recursivelyGetModels,
} from '../../utils/getters.js';
import { pascalCase } from '../../utils/stringUtils.js';

export function emitExceptionModels(
  context: EmitContext,
  defaultProps: JavaBaseProps,
  eInnsynNamespace: Namespace,
) {
  const defaultImports = [
    'no.einnsyn.apiclient.common.expandablefield.ExpandableField',
    'java.util.List',
    'java.util.ArrayList',
  ];

  const models = recursivelyGetModels(eInnsynNamespace).filter((model) =>
    isErrorModel(context.program, model),
  );
  models.forEach((model) => {
    // Create java file
    const modelPackageName = getJavaModelPackageName(
      defaultProps.packageName,
      model,
    );
    const modelPathName = getJavaModelPathName(defaultProps.packageName, model);
    const modelFile = new JavaFile(modelPackageName);
    modelFile.addImport(...defaultImports);

    const props = {
      ...defaultProps,
      context,
      model: model,
      className: model.name,
      addGetters: true,
      addSubModels: true,
      parent: modelFile,
    };

    /**
     *
     */
    const getExceptionConstructorParameters = (
      model: Model,
    ): {
      inheritedParameters: [string, string][];
      parameters: [string, string][];
    } => {
      const parameters: [string, string][] = getBodyProperties(model)
        .filter((p) => !isReadonlyProperty(context.program, p))
        .map((p) => [
          p.name,
          getJavaType({ ...props, type: p.type, propertyName: p.name })[0],
        ]);

      if (model.baseModel) {
        const parentParameters = getExceptionConstructorParameters(
          model.baseModel,
        );
        return {
          inheritedParameters: [
            ...parentParameters.inheritedParameters,
            ...parentParameters.parameters,
          ],
          parameters,
        };
      } else {
        return {
          inheritedParameters: [
            ['message', 'String'],
            ['cause', 'Throwable'],
          ],
          parameters: parameters.filter(([name]) => name !== 'message'),
        };
      }
    };

    const getGetter = (name: string) => {
      return `get${pascalCase(name)}()`;
    };

    // Create model class
    const modelClass = buildGeneralModel(props);
    modelFile.addClass(modelClass);

    if (!model.baseModel) {
      modelClass.setExtends('Exception');
    }

    // Create constructor
    const { inheritedParameters, parameters } =
      getExceptionConstructorParameters(model);
    const constructors: Method[] = [];
    const parameterConstructor = new Method(modelClass, model.name);
    // Add parameters
    [...inheritedParameters, ...parameters].forEach(([name, type]) =>
      parameterConstructor.addParameter(new Parameter(modelClass, name, type)),
    );
    // Add super() call
    parameterConstructor.addBody(
      `super(${inheritedParameters.map(([name]) => name).join(', ')});`,
    );
    // Set properties
    parameters.forEach(([name]) =>
      parameterConstructor.addBody(`this.${name} = ${name};`),
    );
    constructors.push(parameterConstructor);

    // Create Object constructor (get an Exception instance from a parsed object)
    const objectConstructor = new Method(modelClass, model.name);
    objectConstructor.addParameter(
      new Parameter(modelClass, 'object', model.name + '.DTO'),
    );
    // Add super() call
    if (model.baseModel) {
      objectConstructor.addBody(`super(object);`);
    } else {
      objectConstructor.addBody(`super(object.getMessage());`);
    }
    // Set properties
    parameters.forEach(([name]) =>
      objectConstructor.addBody(`this.${name} = object.${getGetter(name)};`),
    );
    constructors.push(objectConstructor);

    // Add constructors
    modelClass.addMethod(...constructors);

    // Add DTO class
    const dtoClass = buildGeneralModel({
      ...props,
      className: `DTO`,
      addFieldVariables: true,
      addGetters: true,
      addSetters: false,
      addConstructors: false,
      addSubModels: false,
    });
    if (model.baseModel) {
      dtoClass.setExtends(`${model.baseModel.name}.DTO`);
    }
    dtoClass.setStatic(true);
    modelClass.addClass(dtoClass);

    // Emit file
    emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        `${modelPathName}/${model.name}.java`,
      ),
      content: modelFile.toString(),
    });
  });
}
