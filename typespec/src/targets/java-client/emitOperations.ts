import {
  EmitContext,
  emitFile,
  Namespace,
  resolvePath,
} from '@typespec/compiler';
import { buildGeneralModel } from '../../languages/java/helpers/builders.js';
import {
  getJavaEntityPackageName,
  getJavaEntityPathName,
  getJavaModelPackageName,
  getJavaType,
} from '../../languages/java/helpers/javaHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import { JavaFile } from '../../languages/java/primitives/javafile.js';
import Method from '../../languages/java/primitives/method.js';
import Parameter from '../../languages/java/primitives/parameter.js';
import { Props } from '../../types.js';
import { getExtendedParameterModel } from '../../utils/controllerParameters.js';
import { getOperationsByNamespace } from '../../utils/getters.js';
import { pascalCase } from '../../utils/stringutils.js';
import { isEInnsynEntityNamespace } from '../../utils/typecheckers.js';

export function emitOperations(
  context: EmitContext,
  defaultProps: Props,
  eInnsynNamespace: Namespace,
) {
  const operationsByNamespace = getOperationsByNamespace(
    context.program,
    eInnsynNamespace,
  );
  operationsByNamespace.forEach(([namespace, httpOperationList]) => {
    const packageName = getJavaEntityPackageName(
      defaultProps.packageName,
      namespace,
    );
    const pathName = getJavaEntityPathName(defaultProps.packageName, namespace);
    const controllerFile = new JavaFile(packageName);

    const controllerClass = new Class(
      controllerFile,
      namespace.name + 'Operations',
    );
    if (isEInnsynEntityNamespace(namespace)) {
      controllerClass.setExtends(
        `ApiEntityOperations<${namespace.name}, ${namespace.name}Request>`,
      );
      controllerClass.addImport(
        'no.einnsyn.apiclient.common.apioperations.ApiEntityOperations',
      );
    } else {
      controllerClass.setExtends('ApiOperations');
      controllerClass.addImport(
        'no.einnsyn.apiclient.common.apioperations.ApiOperations',
      );
    }
    controllerFile.addClass(controllerClass);

    // Add constructor
    const constructor = new Method(
      controllerClass,
      namespace.name + 'Operations',
    );
    constructor.addParameter(
      new Parameter(constructor, 'requester', 'ApiRequester'),
    );
    constructor.addImport('no.einnsyn.apiclient.net.ApiRequester');
    constructor.addBody('super(requester);');
    controllerClass.addMethod(constructor);

    // Add operations
    httpOperationList.forEach((httpOperation) => {
      const operationName = httpOperation.operation.name;
      const verb = httpOperation.verb;
      const requestType = httpOperation.parameters.body?.type;
      const responseType = httpOperation.responses[0]?.type;
      const pathParameters = httpOperation.parameters.parameters.filter(
        (p) => p.type === 'path',
      );
      const queryParameters = httpOperation.parameters.parameters.filter(
        (f) => f.type === 'query',
      );
      const pathTemplate = httpOperation.path;
      const [responseJavaType, responseJavaTypeImports] = getJavaType({
        ...defaultProps,
        type: responseType,
      });
      if (responseJavaType === 'PaginatedList') {
        //console.log(httpOperation.responses[0]?.type?.);
      }

      const addedSignatures: { [signature: string]: boolean } = {};

      // Add all combinations of route methods
      addRouteMethod(false, false, false);
      addRouteMethod(false, false, true);
      addRouteMethod(false, true, false);
      addRouteMethod(false, true, true);
      addRouteMethod(true, false, false);
      addRouteMethod(true, false, true);
      addRouteMethod(true, true, false);
      addRouteMethod(true, true, true);

      function addRouteMethod(
        withQueryParameters: boolean,
        withOptions: boolean,
        withFunctions: boolean,
      ) {
        let renderedQueryParameters = false;
        let renderedOptions = false;
        let renderedFunctions = false;
        const routeMethod = new Method(
          controllerClass,
          responseJavaType,
          operationName,
        );
        controllerClass.addImport(...responseJavaTypeImports);

        // Add path parameters
        pathParameters.forEach((pathParameter) => {
          const parameterType = pathParameter.param.type;
          const [parameterJavaType, parameterJavaTypeImports] = getJavaType({
            ...defaultProps,
            type: parameterType,
          });
          routeMethod.addParameter(
            new Parameter(routeMethod, pathParameter.name, parameterJavaType),
          );
          routeMethod.addImport(...parameterJavaTypeImports);
        });

        // Add query parameters
        const queryParameterModel = getExtendedParameterModel(
          queryParameters,
          pascalCase(namespace.name + 'Parameters'),
        );
        let queryParameterVariable = 'null';
        if (queryParameterModel && withQueryParameters) {
          renderedQueryParameters = true;
          routeMethod.addParameter(
            new Parameter(
              routeMethod,
              'queryParameters',
              queryParameterModel.name,
            ),
          );
          queryParameterVariable = 'queryParameters';
          if (queryParameterModel.extend) {
            const importPath = getJavaModelPackageName(
              defaultProps.packageName,
              queryParameterModel.extend,
            );
            routeMethod.addImport(
              importPath + '.' + queryParameterModel.extend.name,
            );
          }
        }

        // Add request body
        let bodyVariable = 'null';
        if (requestType) {
          const [requestJavaType, requestJavaTypeImports] = getJavaType({
            ...defaultProps,
            propertyName: operationName,
            type: requestType,
            wrapExpandableFields: false,
            entitySuffix: 'Request',
          });
          if (withFunctions) {
            renderedFunctions = true;
            routeMethod.addImport('java.util.function.Function');
            routeMethod.addParameter(
              new Parameter(
                routeMethod,
                'bodyBuilderFunction',
                'Function<' +
                  requestJavaType +
                  '.Builder, ' +
                  requestJavaType +
                  '.Builder>',
              ),
            );
            bodyVariable = `bodyBuilderFunction.apply(${requestJavaType}.builder()).build()`;
          } else {
            routeMethod.addParameter(
              new Parameter(routeMethod, 'body', requestJavaType),
            );
            routeMethod.addImport(...requestJavaTypeImports);
            bodyVariable = 'body';
          }
        }

        // Add options
        let optionsVariable = 'null';
        if (withOptions) {
          renderedOptions = true;
          if (withFunctions) {
            renderedFunctions = true;
            routeMethod.addImport('java.util.function.Function');
            routeMethod.addParameter(
              new Parameter(
                routeMethod,
                'optionsBuilderFunction',
                'Function<EInnsynOptions.Builder, EInnsynOptions.Builder>',
              ),
            );
            optionsVariable =
              'optionsBuilderFunction.apply(EInnsynOptions.builder()).build()';
          } else {
            routeMethod.addParameter(
              new Parameter(routeMethod, 'options', 'EInnsynOptions'),
            );
            optionsVariable = 'options';
          }
          routeMethod.addImport('no.einnsyn.apiclient.EInnsynOptions');
        }

        // Skip if signature already added
        const signature =
          renderedQueryParameters +
          '-' +
          renderedOptions +
          '-' +
          renderedFunctions;
        if (addedSignatures[signature]) {
          return;
        }
        addedSignatures[signature] = true;

        // Generate URL path
        const path = pathTemplate
          .replace(/(.*)/, '"$1"') // Add quotes
          .replace(/{([^}]+)}/g, '" + $1 + "') // Replace path parameters
          .replace(/^"" \+ /, '') // Remove empty leading string
          .replace(/ \+ ""$/, ''); // Remove empty trailing string

        // Build request arguments
        const requestArguments = [
          'method',
          'url',
          queryParameterVariable,
          bodyVariable,
          optionsVariable,
          'type',
        ];

        // Build body
        routeMethod.addBody(`String url = ${path};`);
        routeMethod.addBody(
          `ApiRequestMethod method = ApiRequestMethod.${verb.toUpperCase()};`,
        );
        routeMethod.addBody(
          `Type type = new TypeToken<${responseJavaType}>() {}.getType();`,
          `return requester.request(${requestArguments.join(', ')});`,
        );
        routeMethod.addImport(
          'no.einnsyn.apiclient.net.ApiRequestMethod',
          'java.lang.reflect.Type',
          'com.google.gson.reflect.TypeToken',
        );

        // Throws
        routeMethod.addThrows(
          'no.einnsyn.apiclient.common.exceptions.models.EInnsynException',
        );

        // Add method
        controllerClass.addMethod(routeMethod);
      }

      // Add request body models if needed
      const bodyModel = httpOperation.parameters.body?.type;
      if (bodyModel?.kind === 'Model' && !bodyModel.name) {
        const requestBodyClass = buildGeneralModel({
          ...defaultProps,
          model: bodyModel,
          className: pascalCase(operationName),
          addBuilder: true,
          addSubModels: true,
        });
        requestBodyClass.setStatic(true);
        controllerClass.addClass(requestBodyClass);
      }

      // Add response models if needed
      const responseModel = responseType;
      if (responseModel?.kind === 'Model' && !responseModel.name) {
        const responseBodyClass = buildGeneralModel({
          ...defaultProps,
          model: responseModel,
          className: pascalCase(operationName) + 'Response',
          addBuilder: true,
          addSubModels: true,
        });
        responseBodyClass.setStatic(true);
        controllerClass.addClass(responseBodyClass);
      }
    });

    emitFile(context.program, {
      path: resolvePath(
        context.emitterOutputDir,
        pathName + '/' + namespace.name + 'Operations.java',
      ),
      content: controllerFile.toString(),
    });
  });
}
