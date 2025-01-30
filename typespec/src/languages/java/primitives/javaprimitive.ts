import { EmitContext, Model } from '@typespec/compiler';
import { getDependentModels } from '../../../utils/getters.js';
import { Primitive } from '../../common/primitive.js';
import {
  getJavaModelPackageName,
  getJavaType,
} from '../helpers/javaHelpers.js';
import { EmitterOptions } from '../../../types.js';

export default abstract class JavaPrimitive implements Primitive {
  context: EmitContext<EmitterOptions>;
  parent?: JavaPrimitive;
  annotations: { [key: string]: string } = {};
  imports: { [key: string]: boolean } = {};
  documentation: string | undefined;

  constructor(
    context: EmitContext<EmitterOptions>,
    parent: JavaPrimitive | undefined,
  ) {
    this.context = context;
    this.parent = parent;
  }

  addImport(...models: Model[]): void;
  addImport(...packageNames: string[]): void;
  addImport(...args: (string | Model)[]): void {
    for (const packageNameOrModel of args) {
      // Resolve required package names from model
      if (typeof packageNameOrModel !== 'string') {
        const models = getDependentModels(packageNameOrModel);
        const packageNames = models
          .filter((model) => !!model.name)
          .map(
            (model) =>
              getJavaModelPackageName(this.context.options.packageName, model) +
              '.' +
              getJavaType(model).split('<')[0],
          );
        return this.addImport(...packageNames);
      }

      if (this.parent === undefined) {
        this.imports[packageNameOrModel] = true;
      } else {
        this.parent.addImport(packageNameOrModel);
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
