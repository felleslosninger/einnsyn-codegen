import { EmitContext, Model, ModelProperty } from '@typespec/compiler';
import { Visibility } from '../../../types.js';
import Field from './field.js';
import Method from './method.js';
import JavaPrimitive from './javaprimitive.js';
import Enum from './enum.js';
import { getJavaPackageName } from '../helpers/modelPropertyHelpers.js';
import { isEInnsynEntity } from '../../../utils/utils.js';

export default class Class extends JavaPrimitive {
  private abstract = false;
  private visibility: Visibility = 'public';
  private name: string;
  private extendModel?: Model;
  private extends?: string;
  private implements: string[] = [];
  private fields: Field[] = [];
  private methods: Method[] = [];
  private classes: Class[] = [];
  private enums: Enum[] = [];
  private generics: string[] = [];

  constructor(
    context: EmitContext,
    parent: JavaPrimitive | undefined,
    name: string,
    extendModel?: Model,
  ) {
    super(context, parent);
    this.name = name;

    if (extendModel) {
      const extendClassName = isEInnsynEntity(extendModel)
        ? extendModel.name + 'DTO'
        : extendModel.name;
      this.extendModel = extendModel;
      this.extends = extendClassName;
      this.addImport(extendModel);
    }
  }

  setAbstract(abstract: boolean) {
    this.abstract = abstract;
  }

  addImplements(i: string) {
    this.addImport(i);
    const className = i.split('.').slice(-1)[0];
    this.implements.push(className);
  }

  addField(field: Field) {
    this.fields.push(field);
    return this;
  }

  addEnum(e: Enum) {
    this.enums.push(e);
  }

  addMethod(m: Method) {
    this.methods.push(m);
  }

  addClass(clazz: Class) {
    this.classes.push(clazz);
    return this;
  }

  addGeneric(g: string) {
    this.generics.push(g);
  }

  toString(): string {
    return [
      this.printAnnotations(),

      // Write class + extends + implements
      `${this.visibility}${this.abstract ? ' abstract' : ''} class ${this.name}${
        this.generics.length > 0 ? `<${this.generics.join(', ')}>` : ''
      }${this.extends ? ` extends ${this.extends}` : ''}${
        this.implements.length
          ? ` implements ${this.implements.join(', ')}`
          : ''
      } {`,

      // Write fields
      this.fields.map((field) => field.toString()).join('\n'),

      // Write methods
      this.methods.map((m) => ` ${m}`).join('\n'),

      // Write classes
      this.classes.join('\n'),

      // Write enums
      this.enums.map((e) => e.toString()).join('\n'),

      '}',
    ].join('\n');
  }
}
