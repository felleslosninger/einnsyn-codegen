import { EmitContext } from '@typespec/compiler';
import Class from './class.js';
import JavaPrimitive from './javaprimitive.js';

export class JavaFile extends JavaPrimitive {
  private header = `
// Auto-generated from our OpenAPI spec
// https://github.com/felleslosninger/ein-openapi/
  `.trim();

  private packageName: string;
  private classes: Class[] = [];

  constructor(context: EmitContext, packageName: string) {
    super(context, undefined);
    this.packageName = packageName;
  }

  addClass(clazz: Class): JavaFile {
    this.classes.push(clazz);
    return this;
  }

  toString(): string {
    return [
      this.header,
      '\n',
      'package ' + this.packageName + ';\n',
      Object.keys(this.imports)
        .map((i) => `import ${i};`)
        .join('\n'),
      '\n',
      this.classes.map((c) => c.toString()).join('\n'),
      '\n',
    ].join('\n');
  }
}
