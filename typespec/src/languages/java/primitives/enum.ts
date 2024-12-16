import { EmitContext } from '@typespec/compiler';
import { Visibility } from '../../../types.js';
import JavaPrimitive from './javaprimitive.js';
import { constVarName } from '../../../utils/utils.js';

export default class Enum extends JavaPrimitive {
  private visibility: Visibility = 'public';
  private name: string;
  private values: string[] = [];

  constructor(
    context: EmitContext,
    parent: JavaPrimitive | undefined,
    name: string,
  ) {
    super(context, parent);
    this.name = name;
  }

  setVisibility(visibility: Visibility) {
    this.visibility = visibility;
  }

  addValue(value: string) {
    this.values.push(value);
  }

  toString(): string {
    return [
      `${this.visibility} enum ${this.name} {`,
      this.values.map((v) => `${constVarName(v)}("${v}")`).join(',\n') + ';',
      '',
      '  private final String value;',
      '',
      `  ${this.name}(String value) { this.value = value; }`,
      '',
      `  @Override public String toString() { return value; }`,
      '',
      `  public String toJson() { return value; }`,
      '',
      `  public static ${this.name} fromValue(String value) {`,
      `    value = value.trim().toLowerCase();`,
      `    for (${this.name} val : ${this.name}.values()) {`,
      `      if (val.value.toLowerCase().equals(value)) { return val; }`,
      `    }`,
      `    throw new IllegalArgumentException("Unknown value: " + value);`,
      `  }`,
      '}',
    ].join('\n');
  }
}
