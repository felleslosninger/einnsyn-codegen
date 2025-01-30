import { EmitContext, getDoc, Model } from '@typespec/compiler';
import { isReadonlyProperty } from '@typespec/openapi';
import {
  getJavaType,
  JavaTypeOptions,
} from '../../languages/java/helpers/javaHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import Field from '../../languages/java/primitives/field.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import Method from '../../languages/java/primitives/method.js';
import Parameter from '../../languages/java/primitives/parameter.js';
import { EmitterOptions } from '../../types.js';
import { getExpandableEntity, getListType } from '../../utils/getters.js';
import { pascalCase } from '../../utils/stringutils.js';
import { get } from 'http';

export function buildBuildableModel(
  context: EmitContext<EmitterOptions>,
  parent: JavaPrimitive | undefined,
  model: Model,
  javaTypeOptions: JavaTypeOptions,
  className = model.name,
): Class {
  const modelClass = new Class(context, parent, className, model.baseModel);
  const entityName = model.name;
  modelClass.setDocumentation(getDoc(context.program, model));
  const properties = model.properties;

  // Add constructor
  const constructor = new Method(context, modelClass, className);
  const constructorBody: string[] = [];
  modelClass.addMethod(constructor);
  constructor.addParameter(
    new Parameter(context, modelClass, 'builder', 'Builder'),
  );
  for (const property of properties.values()) {
    if (isReadonlyProperty(context.program, property)) {
      continue;
    }
    constructorBody.push(
      `this.${property.name} = builder.get${pascalCase(property.name)}();`,
    );
  }
  constructor.setBody(constructorBody.join('\n'));

  // Add static "of" method
  const ofMethod = new Method(context, modelClass, className, 'of');
  modelClass.addMethod(ofMethod);
  ofMethod.setStatic(true);
  ofMethod.addParameter(
    new Parameter(
      context,
      modelClass,
      'builderFunction',
      'Function<Builder, Builder>',
    ),
  );
  ofMethod.setBody(`return builderFunction.apply(new Builder()).build();`);
  ofMethod.addImport('java.util.function.Function');

  // Add properties
  for (const property of properties.values()) {
    if (isReadonlyProperty(context.program, property)) {
      continue;
    }

    const rawType = getJavaType(
      javaTypeOptions,
      property.type,
      property.name,
      entityName,
    );

    // Add field variable
    const field = new Field(context, modelClass, property.name, rawType);
    field.setVisibility('private');
    modelClass.addField(field);

    // Add getter
    const getter = new Method(
      context,
      modelClass,
      rawType,
      'get' + pascalCase(property.name),
    );
    getter.setBody(`return ${property.name};`);
    getter.setDocumentation(getDoc(context.program, property));
    modelClass.addMethod(getter);
  }

  // Add builder class
  const builderClass = new Class(context, modelClass, 'Builder');
  modelClass.addClass(builderClass);
  for (const property of properties.values()) {
    if (isReadonlyProperty(context.program, property)) {
      continue;
    }

    const rawType = getJavaType(
      javaTypeOptions,
      property.type,
      property.name,
      entityName,
    );

    // Add field variable
    const field = new Field(context, builderClass, property.name, rawType);
    builderClass.addField(field);

    // Add getter
    const getter = new Method(
      context,
      builderClass,
      rawType,
      'get' + pascalCase(property.name),
    );
    getter.setBody(`return ${property.name};`);
    getter.setDocumentation(getDoc(context.program, property));
    builderClass.addMethod(getter);

    // Add setter
    const setter = new Method(
      context,
      builderClass,
      'void',
      'set' + pascalCase(property.name),
    );
    setter.addParameter(
      new Parameter(context, builderClass, property.name, rawType),
    );
    setter.setBody(`this.${property.name} = ${property.name};`);
    setter.setDocumentation(getDoc(context.program, property));
    builderClass.addMethod(setter);

    // For lists, add "add" method
    const listType = getListType(property.type);
    if (listType !== undefined) {
      const addMethod = new Method(
        context,
        builderClass,
        'void',
        'add' + pascalCase(property.name),
      );
      addMethod.addParameter(
        new Parameter(
          context,
          builderClass,
          property.name,
          getJavaType(javaTypeOptions, listType, property.name, entityName),
        ),
      );
      let body = [
        `if (this.${property.name} == null) {`,
        `  this.${property.name} = new ArrayList<>();`,
        `}`,
        `this.${property.name}.add(${property.name});`,
      ];
      addMethod.setBody(body.join('\n'));
      addMethod.setDocumentation(getDoc(context.program, property));
      builderClass.addMethod(addMethod);

      // If the type is an entity, accept Function<Builder, Builder>
      var eInnsynEntity = getExpandableEntity(listType);
      if (eInnsynEntity) {
        const addFunctionMethod = new Method(
          context,
          builderClass,
          'void',
          'add' + pascalCase(property.name),
        );
        addFunctionMethod.addParameter(
          new Parameter(
            context,
            builderClass,
            'builderFunction',
            'Function<Builder, Builder>',
          ),
        );
        let functionBody = [
          `if (this.${property.name} == null) {`,
          `  this.${property.name} = new ArrayList<>();`,
          `}`,
          `this.${property.name}.add(`,
          `  builderFunction.apply(new Builder()).build()`,
          `);`,
        ];
        addFunctionMethod.setBody(functionBody.join('\n'));
        addFunctionMethod.addImport('java.util.function.Function');
        addFunctionMethod.setDocumentation(getDoc(context.program, property));
        builderClass.addMethod(addFunctionMethod);
      }
    }
  }
  var buildMethod = new Method(context, builderClass, entityName, 'build');
  buildMethod.setBody(`return new ${entityName}(this);`);
  builderClass.addMethod(buildMethod);

  return modelClass;
}
