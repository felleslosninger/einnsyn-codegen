import { EmitContext } from '@typespec/compiler';
import Class from './class.js';
import JavaPrimitive from './javaprimitive.js';
import { EmitterOptions } from '../../../types.js';

export class JavaFile extends JavaPrimitive {
  private header = `
// Auto-generated from our API specification
// https://github.com/felleslosninger/einnsyn-api
  `.trim();

  private packageName: string;
  private classes: Class[] = [];

  constructor(context: EmitContext<EmitterOptions>, packageName: string) {
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
