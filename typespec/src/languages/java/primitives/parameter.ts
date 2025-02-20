import { EmitContext } from '@typespec/compiler';
import JavaPrimitive from './javaprimitive.js';
import { EmitterOptions } from '../../../types.js';

export default class Parameter extends JavaPrimitive {
  private name: string;
  private type: string;

  constructor(parent: JavaPrimitive | undefined, name: string, type: string) {
    super(parent);
    this.name = name;
    this.type = type;
  }

  toString(): string {
    return [this.printAnnotations(), `${this.type} ${this.name}`]
      .filter((s) => s !== undefined)
      .join('\n');
  }
}
