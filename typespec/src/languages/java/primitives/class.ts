import { EmitContext, Model } from '@typespec/compiler';
import { Visibility } from '../../../types.js';
import Enum from './enum.js';
import Field from './field.js';
import JavaPrimitive from './javaprimitive.js';
import Method from './method.js';
import { isEInnsynEntity } from '../../../utils/typecheckers.js';

export default class Class extends JavaPrimitive {
  private abstract = false;
  private visibility: Visibility = 'public';
  private name: string;
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
      this.extends = extendClassName;
      this.addImport(extendModel);
    }
  }

  setAbstract(abstract: boolean) {
    this.abstract = abstract;
  }

  /**
   * Add "implements" to the class. Generics are stripped and must be imported manually. If the class name starts with `@`, it is not imported.
   *
   * @param i
   */
  addImplements(i: string) {
    if (!i.startsWith('@')) {
      const withoutGenerics = i.split('<')[0];
      this.addImport(withoutGenerics);
    }

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
      this.printDocumentation(),
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
