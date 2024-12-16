import { EmitContext } from '@typespec/compiler';
import JavaPrimitive from './javaprimitive.js';

export default class Parameter extends JavaPrimitive {
  private name: string;
  private type: string;

  constructor(
    context: EmitContext,
    parent: JavaPrimitive | undefined,
    name: string,
    type: string,
  ) {
    super(context, parent);
    this.name = name;
    this.type = type;
  }

  toString(): string {
    return [this.printAnnotations(), `${this.type} ${this.name}`].join('\n');
  }
}
