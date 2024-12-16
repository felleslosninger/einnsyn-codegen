import { EmitContext, Model } from '@typespec/compiler';
import { JavaFile } from './javafile.js';
import { Primitive } from '../../common/primitive.js';
import { getJavaPackageName } from '../helpers/modelPropertyHelpers.js';
import { pascalCase } from '../../../utils/utils.js';

export default abstract class JavaPrimitive implements Primitive {
  context: EmitContext;
  parent?: JavaPrimitive;
  annotations: { [key: string]: string } = {};
  imports: { [key: string]: boolean } = {};

  constructor(context: EmitContext, parent: JavaPrimitive | undefined) {
    this.context = context;
    this.parent = parent;
  }

  addImport(model: Model): void;
  addImport(packageName: string): void;
  addImport(packageNameOrModel: string | Model): void {
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

  addAnnotation(path: string, args = '') {
    this.addImport(path);
    const annotation = path.split('.').slice(-1)[0];
    this.annotations[annotation] = args || '';
  }

  printAnnotations() {
    return Object.entries(this.annotations)
      .map(([annotation, args]) => `@${annotation}${args ? `(${args})` : ''}`)
      .join('\n');
  }
}
