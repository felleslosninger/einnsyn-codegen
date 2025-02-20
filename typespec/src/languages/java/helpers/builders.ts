import { EmitContext, getDoc, Model, ModelProperty } from '@typespec/compiler';
import { isReadonlyProperty } from '@typespec/openapi';
import { Props } from '../../../types.js';
import {
  getBodyProperties,
  getDefaultValue,
  getExpandableEntity,
  getInheritedProperties,
  getListType,
} from '../../../utils/getters.js';
import { pascalCase } from '../../../utils/stringutils.js';
import {
  isEInnsynEntity,
  isExpandableField,
  isList,
} from '../../../utils/typecheckers.js';
import Class from '../primitives/class.js';
import Field from '../primitives/field.js';
import JavaPrimitive from '../primitives/javaprimitive.js';
import Method from '../primitives/method.js';
import Parameter from '../primitives/parameter.js';
import { getJavaType } from './javaHelpers.js';

export type BuildProps = Props & {
  context: EmitContext;
  parent?: JavaPrimitive;
  validated?: boolean;
  entitySuffix?: string;
  wrapExpandableFields?: boolean;
};

export type BuildModelProps = BuildProps & {
  model: Model;
  className?: string;
  addFieldVariables?: boolean;
  addGetters?: boolean;
  addSetters?: boolean;
  addConstructors?: boolean;
  addBuilder?: boolean;
  addSubModels?: boolean;
  isBuilder?: boolean;
  skipReadOnlyProperties?: boolean;
  setDefaultValues?: boolean;
};

export type GetFieldVariablesProps = BuildModelProps & {
  visibility?: 'public' | 'protected' | 'private';
};

export type GetConstructorsProps = BuildModelProps & {};

export type GetSetterProps = BuildModelProps & {};

export type GetGetterProps = BuildModelProps & {};

const defaultProps: Partial<BuildModelProps> = {
  addFieldVariables: true,
  addGetters: true,
  addSetters: false,
  addConstructors: false,
  addBuilder: false,
  addSubModels: false,
  isBuilder: false,
  validated: false,
  wrapExpandableFields: true,
  entitySuffix: '',
  setDefaultValues: true,
};

export function buildGeneralModel(props: BuildModelProps) {
  const className = props.className ?? props.model.name;
  const clazz = new Class(props.parent, className);

  // Update props with new parent
  props = {
    className,
    ...defaultProps,
    ...props,
    parent: clazz,
  };

  // We need a constructor if we have Builder
  if (props.addBuilder) {
    props.addConstructors = true;
    props.addFieldVariables = true;
  }

  // We need fieldVariables if we have setters/getters
  if (props.addSetters || props.addGetters) {
    props.addFieldVariables = true;
  }

  // Extend base model
  if (props.model.baseModel) {
    const [extendsClassName, extendsImports] = getJavaType({
      ...props,
      type: props.model.baseModel,
    });
    clazz.setExtends(extendsClassName);
    clazz.addImport(...extendsImports);
  }

  if (props.addFieldVariables) {
    const [fields, fieldImports] = getFieldVariables(props);
    clazz.addField(...fields);
    clazz.addImport(...fieldImports);
  }

  if (props.addConstructors) {
    const [constructors, constructorImports] = getConstructors(props);
    clazz.addMethod(...constructors);
    clazz.addImport(...constructorImports);
  }

  if (props.addGetters) {
    const [getters, getterImports] = getGetters(props);
    clazz.addMethod(...getters);
    clazz.addImport(...getterImports);
  }

  if (props.addSetters) {
    const [setters, setterImports] = getSetters(props);
    clazz.addMethod(...setters);
    clazz.addImport(...setterImports);
  }

  if (props.addBuilder) {
    // .builder() method
    if (props.model.derivedModels.length === 0) {
      const [builderMethod, builderMethodImports] = getBuilderMethod(props);
      clazz.addMethod(builderMethod);
      clazz.addImport(...builderMethodImports);
      // .of() method
      const [ofMethod, ofMethodImports] = getOfMethod(props);
      clazz.addMethod(ofMethod);
      clazz.addImport(...ofMethodImports);
    }
    // Builder class
    const builderClass = buildGeneralModel({
      ...props,
      className: 'Builder',
      addFieldVariables: true,
      addGetters: false,
      addSetters: true,
      addBuilder: false,
      addConstructors: false,
      isBuilder: true,
      parent: clazz,
      skipReadOnlyProperties: true,
    });
    // Builder.build() method
    builderClass.addMethod(getBuildMethod(props));
    builderClass.setStatic(true);

    // Superclasses needs generic types
    if (props.model.derivedModels.length > 0) {
      builderClass.addGeneric('B extends Builder<B>');
    }

    if (props.model.baseModel) {
      const [extendsClassName, extendsImports] = getJavaType({
        ...props,
        type: props.model.baseModel,
      });
      if (props.model.derivedModels.length > 0) {
        builderClass.setExtends(extendsClassName + '.Builder<Builder<B>>');
      } else {
        builderClass.setExtends(extendsClassName + '.Builder<Builder>');
      }
      builderClass.addImport(...extendsImports);
    }

    clazz.addClass(builderClass);
  }

  // Add subclasses
  if (props.addSubModels) {
    const subModelClasses = getSubModelClasses(props);
    clazz.addClass(...subModelClasses);
  }

  return clazz;
}

function getFieldVariables(props: GetFieldVariablesProps): [Field[], string[]] {
  const { context, model, parent, skipReadOnlyProperties } = props;
  const properties = getBodyProperties(model);
  const entityName = model.name;
  const fields: Field[] = [];
  const imports: string[] = [];

  properties
    .filter(
      (prop) =>
        !skipReadOnlyProperties || !isReadonlyProperty(context.program, prop),
    )
    .forEach((property) => {
      const name = property.name;
      const [javaType, javaTypeImports] = getJavaType({
        ...props,
        type: property.type,
        propertyName: property.name,
        parentName: entityName,
      });
      const field = new Field(parent, name, javaType);
      field.setVisibility('protected');
      field.setDocumentation(getDoc(context.program, property));
      if (props.setDefaultValues !== false) {
        field.setValue(getDefaultValue(property));
      }

      fields.push(field);
      javaTypeImports.push(...javaTypeImports);
    });

  return [fields, imports];
}

export function getConstructors(
  props: GetConstructorsProps,
): [Method[], string[]] {
  const { context, model, className, parent } = props;
  const notDefault = (prop: ModelProperty) =>
    !isReadonlyProperty(context.program, prop);
  const properties = getBodyProperties(model).filter(notDefault);
  const inheritedProperties = getInheritedProperties(model).filter(notDefault);
  const allProperties = [...inheritedProperties, ...properties];
  const constructors: Method[] = [];
  const imports: string[] = [];

  const constructor = new Method(parent, className ?? model.name);
  for (const { name, type } of allProperties) {
    const [javaType, javaTypeImports] = getJavaType({
      ...props,
      type,
      propertyName: name,
      parentName: className,
    });
    constructor.addParameter(new Parameter(parent, name, javaType));
    imports.push(...javaTypeImports);
  }
  constructor.addBody(
    `super(${inheritedProperties.map((prop) => prop.name).join(', ')});`,
  );
  for (const property of properties) {
    constructor.addBody(`this.${property.name} = ${property.name};`);
  }

  constructors.push(constructor);
  return [constructors, imports];
}

function getGetters(props: GetGetterProps): [Method[], string[]] {
  const { context, model, parent, skipReadOnlyProperties } = props;
  const properties = getBodyProperties(model);
  const entityName = model.name;
  const getters: Method[] = [];
  const imports: string[] = [];

  properties
    .filter(
      (prop) =>
        !skipReadOnlyProperties || !isReadonlyProperty(context.program, prop),
    )
    .forEach((property) => {
      const name = property.name;
      const [javaType, javaTypeImports] = getJavaType({
        ...props,
        type: property.type,
        propertyName: property.name,
        parentName: entityName,
      });

      const getter = new Method(parent, javaType, 'get' + pascalCase(name));
      getter.addBody(`return ${name};`);
      getter.setDocumentation(getDoc(props.context.program, property));

      getters.push(getter);
      imports.push(...javaTypeImports);
    });

  return [getters, imports];
}

function getSetters(props: GetSetterProps): [Method[], string[]] {
  const { context, model, parent, skipReadOnlyProperties } = props;
  const properties = getBodyProperties(model);
  const entityName = model.name;
  const setters: Method[] = [];
  const imports: string[] = [];
  const returnType = props.isBuilder
    ? props.model.derivedModels.length > 0
      ? 'B'
      : 'Builder'
    : 'void';

  properties
    .filter(
      (prop) =>
        !skipReadOnlyProperties || !isReadonlyProperty(context.program, prop),
    )
    .forEach((property) => {
      const name = property.name;
      const [javaType, javaTypeImports] = getJavaType({
        ...props,
        type: property.type,
        propertyName: property.name,
        parentName: entityName,
        wrapExpandableFields: false,
      });

      // Add setter method
      const setter = new Method(parent, returnType, 'set' + pascalCase(name));
      setter.addParameter(new Parameter(parent, name, javaType));
      // If the property is an expandable field, we need to wrap it
      if (
        isList(property.type) &&
        isExpandableField(getListType(property.type))
      ) {
        setter.addImport('java.util.stream.Collectors');
        setter.addBody(
          `this.${name} = ${name}.stream().map(ExpandableField::new).collect(Collectors.toList());`,
        );
      } else if (isExpandableField(property.type)) {
        setter.addBody(`this.${name} = new ExpandableField<>(${name});`);
      } else {
        setter.addBody(`this.${name} = ${name};`);
      }
      if (props.isBuilder) {
        setter.addBody(`return (${returnType}) this;`);
      }
      setter.setDocumentation(getDoc(context.program, property));
      setters.push(setter);
      imports.push(...javaTypeImports);

      // Add addProperty(propertyTypeRequest) method
      const listType = getListType(property.type);
      if (listType) {
        const listType = getListType(property.type);
        const [targetJavaType, targetJavaTypeImports] = getJavaType({
          ...props,
          type: listType,
          propertyName: property.name,
          parentName: entityName,
          wrapExpandableFields: false,
        });

        const adder = new Method(parent, returnType, 'add' + pascalCase(name));
        adder.addParameter(new Parameter(parent, name, targetJavaType));
        adder.addBody(
          `if (this.${name} == null) {`,
          `this.${name} = new ArrayList<>();`,
          `}`,
        );
        if (isExpandableField(listType)) {
          const expandableEntity = getExpandableEntity(listType);
          const [expandableJavaType, expandableJavaTypeImports] = getJavaType({
            ...props,
            type: expandableEntity,
          });
          adder.addBody(
            `this.${name}.add(new ExpandableField<${expandableJavaType}>(${name}));`,
          );
          imports.push(...expandableJavaTypeImports);
        } else {
          adder.addBody(`this.${name}.add(${name});`);
        }

        if (props.isBuilder) {
          adder.addBody(`return (${returnType}) this;`);
        }

        adder.setDocumentation(getDoc(context.program, property));
        setters.push(adder);
        imports.push(...targetJavaTypeImports);
      }

      // Add addProperty(builder) method
      if (listType && isExpandableField(listType)) {
        const [targetJavaType, targetJavaTypeImports] = getJavaType({
          ...props,
          type: listType,
          propertyName: property.name,
          parentName: entityName,
          wrapExpandableFields: false,
        });
        const adder = new Method(parent, returnType, 'add' + pascalCase(name));
        adder.addParameter(
          new Parameter(
            parent,
            'builderFunction',
            `Function<${targetJavaType}.Builder, ${targetJavaType}.Builder>`,
          ),
        );
        adder.addBody(
          `this.${name}.add(new ExpandableField<>(builderFunction.apply(new ${targetJavaType}.Builder()).build()));`,
        );
        if (props.isBuilder) {
          adder.addBody(`return (${returnType}) this;`);
        }
        adder.addImport('java.util.function.Function');
        adder.setDocumentation(getDoc(context.program, property));
        setters.push(adder);
        imports.push(...targetJavaTypeImports);
      }
    });

  return [setters, imports];
}

function getBuilderMethod(props: BuildProps): [Method, string[]] {
  const builderMethod = new Method(props.parent, 'Builder', 'builder');
  builderMethod.setStatic(true);
  builderMethod.addBody('return new Builder();');

  return [builderMethod, []];
}

function getOfMethod(props: BuildModelProps): [Method, string[]] {
  const ofMethod = new Method(
    props.parent,
    props.className ?? props.model.name,
    'of',
  );
  ofMethod.setStatic(true);
  ofMethod.addParameter(
    new Parameter(
      props.parent,
      'builderFunction',
      'Function<Builder, Builder>',
    ),
  );
  ofMethod.addBody('return builderFunction.apply(new Builder()).build();');

  return [ofMethod, ['java.util.function.Function']];
}

function getBuildMethod(props: BuildModelProps) {
  const { model } = props;
  const properties = getBodyProperties(model);
  const inheritedProperties = getInheritedProperties(model);
  const allProperties = [...inheritedProperties, ...properties].filter(
    (p) => !isReadonlyProperty(props.context.program, p),
  );
  const buildMethod = new Method(
    props.parent,
    props.className ?? props.model.name,
    'build',
  );
  buildMethod.addBody(
    `return new ${props.className} (${allProperties.map((p) => `this.${p.name}`)});`,
  );

  return buildMethod;
}

function getSubModelClasses(props: BuildModelProps) {
  const { model, skipReadOnlyProperties } = props;
  const properties = getBodyProperties(model);
  const classes: Class[] = [];

  // Filter properties by non-eInnsynEntity models
  properties
    .filter(
      (property) =>
        !skipReadOnlyProperties ||
        !isReadonlyProperty(props.context.program, property),
    )
    .filter((property) => {
      const model = isList(property.type)
        ? getListType(property.type)
        : property.type;
      return (
        model?.kind === 'Model' &&
        model.name === '' &&
        !isEInnsynEntity(model) &&
        !isExpandableField(model)
      );
    })
    .forEach((property) => {
      const model = (
        isList(property.type) ? getListType(property.type) : property.type
      ) as Model;
      const [javaType, javaTypeImports] = getJavaType({
        ...props,
        type: model,
        propertyName: property.name,
      });
      const subModelClass = buildGeneralModel({
        ...props,
        model,
        className: javaType,
      });
      subModelClass.setStatic(true);
      subModelClass.addImport(...javaTypeImports);
      classes.push(subModelClass);
    });

  return classes;
}
