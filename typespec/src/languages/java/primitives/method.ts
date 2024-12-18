import { EmitContext } from '@typespec/compiler';
import { Visibility } from '../../../types.js';
import JavaPrimitive from './javaprimitive.js';
import Parameter from './parameter.js';

export default class Method extends JavaPrimitive {
  private name?: string;
  private visibility: Visibility = 'public';
  private parameters: Parameter[];
  private returnType: string;
  private body: string;

  constructor(
    context: EmitContext,
    parent: JavaPrimitive | undefined,
    returnType: string,
    name?: string,
  ) {
    super(context, parent);
    this.name = name;
    this.parameters = [];
    this.returnType = returnType;
    this.body = '';
  }

  addParameter(parameter: Parameter) {
    this.parameters.push(parameter);
  }

  setBody(body: string) {
    this.body = body;
  }

  toString(): string {
    return [
      this.printDocumentation(),
      this.printAnnotations(),
      `${this.visibility ? `${this.visibility} ` : ''}${this.returnType} ${this.name || ''}(${this.parameters
        .map((p) => `${p.toString()}`)
        .join(', ')}) {`,
      ` ${this.body}`,
      '}',
    ]
      .filter((s) => s !== undefined)
      .join('\n');
  }
}
