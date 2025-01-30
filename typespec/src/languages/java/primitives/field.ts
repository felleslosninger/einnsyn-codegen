import { EmitContext } from '@typespec/compiler';
import { EmitterOptions, Visibility } from '../../../types.js';
import JavaPrimitive from './javaprimitive.js';

export default class Field extends JavaPrimitive {
  private visibility: Visibility = '';
  private isFinal = false;
  private isStatic = false;
  private value?: string | boolean | number;
  private rawValue?: string;

  constructor(
    context: EmitContext<EmitterOptions>,
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

  setStatic(isStatic: boolean) {
    this.isStatic = isStatic;
  }

  setValue(value: string | boolean | number | undefined) {
    this.value = value;
  }

  setRawValue(rawValue: string) {
    this.rawValue = rawValue;
  }

  printValue(): string {
    if (this.rawValue) {
      return ` = ${this.rawValue}`;
    }

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
      this.printDocumentation(),
      this.printAnnotations() || undefined,
      `${this.visibility ? `${this.visibility} ` : ''}${
        this.isStatic ? 'static ' : ''
      }${
        this.isFinal ? 'final ' : ''
      }${this.javaType} ${this.fieldName}${this.printValue()};`,
      '',
    ]
      .filter((v) => v != undefined)
      .join('\n');
  }
}
