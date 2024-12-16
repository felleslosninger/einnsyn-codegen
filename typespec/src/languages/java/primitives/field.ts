import { EmitContext } from '@typespec/compiler';
import { Visibility } from '../../../types.js';
import JavaPrimitive from './javaprimitive.js';

export default class Field extends JavaPrimitive {
  private visibility: Visibility = '';
  private isFinal = false;
  private value?: string | boolean | number;

  constructor(
    context: EmitContext,
    parent: JavaPrimitive | undefined,
    private fieldName: string,
    private javaType: string,
  ) {
    super(context, parent);
  }

  setVisibility(visibility: Visibility) {
    this.visibility = visibility;
  }

  setFinal(isFinal: boolean) {
    this.isFinal = isFinal;
  }

  setValue(value: string | boolean | number | undefined) {
    this.value = value;
  }

  printValue(): string {
    if (typeof this.value === 'string') {
      return ` = "${this.value}"`;
    }

    // Numbers and boolean values are printed without quotes
    if (this.value !== undefined) {
      return ` = ${this.value}`;
    }

    return '';
  }

  toString(): string {
    return [
      this.printAnnotations() || undefined,
      `${this.visibility ? `${this.visibility} ` : ''}${
        this.isFinal ? 'final ' : ''
      }${this.javaType} ${this.fieldName}${this.printValue()};`,
      '',
    ]
      .filter((v) => v != undefined)
      .join('\n');
  }
}
