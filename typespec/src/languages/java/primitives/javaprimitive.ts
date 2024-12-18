import { EmitContext, Model } from '@typespec/compiler';
import { JavaFile } from './javafile.js';
import { Primitive } from '../../common/primitive.js';
import { getJavaPackageName } from '../helpers/javaHelpers.js';
import { pascalCase } from '../../../utils/stringutils.js';

export default abstract class JavaPrimitive implements Primitive {
  context: EmitContext;
  parent?: JavaPrimitive;
  annotations: { [key: string]: string } = {};
  imports: { [key: string]: boolean } = {};
  documentation: string | undefined;

  constructor(context: EmitContext, parent: JavaPrimitive | undefined) {
    this.context = context;
    this.parent = parent;
  }

  addImport(...models: Model[]): void;
  addImport(...packageNames: string[]): void;
  addImport(...args: string[] | Model[]): void {
    for (const packageNameOrModel of args) {
      const packageName =
        typeof packageNameOrModel === 'string'
          ? packageNameOrModel
          : getJavaPackageName(packageNameOrModel) +
            '.' +
            pascalCase(packageNameOrModel.name + 'DTO');

      if (this.parent === undefined) {
        this.imports[packageName] = true;
      } else {
        this.parent.addImport(packageName);
      }
    }
  }

  setDocumentation(documentation?: string) {
    this.documentation = documentation;
  }

  printDocumentation(append?: string) {
    const strings = [];
    if (this.documentation) {
      strings.push(this.documentation);
    }
    if (append) {
      strings.push(append.split('\n'));
    }
    if (strings.length === 0) {
      return undefined;
    }
    return `/**\n * ${strings.join('\n * ')}\n */`;
  }

  addAnnotation(path: string, args = '') {
    if (!path.startsWith('@')) {
      this.addImport(path);
    } else {
      path = path.slice(1);
    }
    const annotation = path.split('.').slice(-1)[0];
    this.annotations[annotation] = args || '';
  }

  printAnnotations() {
    return Object.entries(this.annotations)
      .map(([annotation, args]) => `@${annotation}${args ? `(${args})` : ''}`)
      .join('\n');
  }
}
