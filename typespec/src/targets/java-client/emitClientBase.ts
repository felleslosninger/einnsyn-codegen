import {
  EmitContext,
  emitFile,
  Namespace,
  resolvePath,
} from '@typespec/compiler';
import { getJavaEntityPackageName } from '../../languages/java/helpers/javaHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import Field from '../../languages/java/primitives/field.js';
import { JavaFile } from '../../languages/java/primitives/javafile.js';
import Method from '../../languages/java/primitives/method.js';
import Parameter from '../../languages/java/primitives/parameter.js';
import { Props } from '../../types.js';
import { getOperationsByNamespace } from '../../utils/getters.js';
import { pascalCase } from '../../utils/stringutils.js';

export function emitClientBase(
  context: EmitContext,
  defaultProps: Props,
  eInnsynNamespace: Namespace,
) {
  const packageName = defaultProps.packageName;
  const pathName = packageName.split('.').join('/').toLowerCase();
  const file = new JavaFile(packageName);

  const clientBaseClass = new Class(file, 'EInnsynClientBase');
  clientBaseClass.addImport('no.einnsyn.apiclient.net.ApiRequester');
  clientBaseClass.addField(
    new Field(clientBaseClass, 'requester', 'ApiRequester')
      .setFinal(true)
      .setVisibility('private'),
  );

  const constructor = new Method(clientBaseClass, 'EInnsynClientBase');
  constructor.addParameter(
    new Parameter(constructor, 'requester', 'ApiRequester'),
  );
  constructor.addBody('this.requester = requester;');
  clientBaseClass.addMethod(constructor);

  // Emit Operations getter for each namespace
  const operationsByNamespace = getOperationsByNamespace(
    context.program,
    eInnsynNamespace,
  );
  operationsByNamespace.forEach(([namespace, operations]) => {
    const namespaceName = namespace.name;
    const namespacePath = getJavaEntityPackageName(
      defaultProps.packageName,
      namespace,
    );
    console.log('Namespace path: ' + namespacePath);
    const className = `${pascalCase(namespaceName)}Operations`;
    const getterMethod = new Method(
      clientBaseClass,
      className,
      namespaceName.toLowerCase(),
    );
    getterMethod.addBody(`return new ${className}(this.requester);`);
    clientBaseClass.addMethod(getterMethod);
    clientBaseClass.addImport(`${namespacePath}.${className}`);
  });

  file.addClass(clientBaseClass);

  // Emit file
  emitFile(context.program, {
    path: resolvePath(
      context.emitterOutputDir,
      `${pathName}/EInnsynClientBase.java`,
    ),
    content: file.toString(),
  });
}
