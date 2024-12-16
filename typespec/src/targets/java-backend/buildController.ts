import { EmitContext } from '@typespec/compiler';
import { HttpOperation } from '@typespec/http';
import { addAnnotations } from '../../languages/java/helpers/addAnnotations.js';
import {
  getDefaultValue,
  getJavaType,
  isFinal,
} from '../../languages/java/helpers/modelPropertyHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import Field from '../../languages/java/primitives/field.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import Method from '../../languages/java/primitives/method.js';
import Parameter from '../../languages/java/primitives/parameter.js';
import { getExtendedParameterModel } from '../../utils/controllerParameters.js';
import { camelCase, getBodyProperty, pascalCase } from '../../utils/utils.js';
import { buildModel } from './buildModel.js';

const requestMappingMap = {
  get: 'GetMapping',
  put: 'PutMapping',
  post: 'PostMapping',
  patch: 'PatchMapping',
  delete: 'DeleteMapping',
  head: 'HeadMapping',
};

export function buildController(
  context: EmitContext,
  parent: JavaPrimitive | undefined,
  name: string,
  httpOperations: HttpOperation[],
): Class {
  const modelClass = new Class(context, parent, name + 'Controller');
  modelClass.addAnnotation(
    'org.springframework.web.bind.annotation.RestController',
  );

  // Add service field variable
  const serviceField = new Field(
    context,
    modelClass,
    'service',
    name + 'Service',
  );
  serviceField.setFinal(true);
  serviceField.setVisibility('private');
  modelClass.addField(serviceField);

  for (const httpOperation of httpOperations) {
    const { verb, path } = httpOperation;
    const { name: operationName } = httpOperation.operation;
    const methodName = camelCase(operationName);
    const response = httpOperation.responses[0];

    // Create method
    const returnType = getJavaType(response?.type, methodName + 'Response');
    const method = new Method(
      context,
      modelClass,
      methodName,
      'ResponseEntity<' + returnType + '>',
    );
    modelClass.addMethod(method);

    // Add request mapping
    method.addAnnotation(
      `org.springframework.web.bind.annotation.${requestMappingMap[verb]}`,
      `"${path}"`,
    );

    // Add path parameters
    const pathParameters = httpOperation.parameters.parameters.filter(
      (p) => p.type === 'path',
    );
    for (const parameterModel of pathParameters) {
      const parameterModelProperty = parameterModel.param;
      const type = parameterModelProperty.type;
      const parameter = new Parameter(
        context,
        method,
        parameterModel.name,
        getJavaType(type, parameterModel.name),
      );
      parameter.addAnnotation(
        'org.springframework.web.bind.annotation.PathVariable',
      );
      addAnnotations(context, parameter, parameterModelProperty);
      method.addParameter(parameter);
    }

    // Add query parameters
    const parameters = httpOperation.parameters.parameters.filter(
      (f) => f.type === 'query' || f.type === 'path',
    );
    const extendedParameterModel = getExtendedParameterModel(
      parameters,
      pascalCase(httpOperation.operation.name + 'Parameters'),
    );
    if (extendedParameterModel) {
      // Add parameter
      const parameterType = extendedParameterModel.name;
      const parameter = new Parameter(
        context,
        method,
        'queryParameters',
        parameterType,
      );
      parameter.addAnnotation('jakarta.validation.Valid');
      method.addParameter(parameter);

      // Create a model for the parameters, if needed
      const parameters = extendedParameterModel.params;
      if (parameters.length > 0) {
        const queryParameterModel = new Class(
          context,
          modelClass,
          parameterType,
          extendedParameterModel.extend,
        );
        // Add parameters
        for (const operationParameter of parameters) {
          const param = operationParameter.param;
          const field = new Field(
            context,
            queryParameterModel,
            param.name,
            getJavaType(param.type, param.name),
          );
          addAnnotations(context, field, param, {
            required: operationParameter.type === 'path',
          });
          field.setFinal(isFinal(param));
          field.setValue(getDefaultValue(param));
          queryParameterModel.addField(field);
        }
        modelClass.addClass(queryParameterModel);
      }
    }

    // Add request body object if it's not an existing entity
    const requestBody = httpOperation.parameters.body;
    if (
      requestBody?.type.kind === 'Model' &&
      requestBody.bodyKind !== 'multipart'
    ) {
      const requestBodyType = pascalCase(
        requestBody.type.name || operationName + 'Request',
      );
      const parameter = new Parameter(
        context,
        modelClass,
        'requestBody',
        getJavaType(requestBody.type, requestBodyType),
      );
      parameter.addAnnotation('jakarta.validation.Valid');
      parameter.addAnnotation('jakarta.validation.constraints.NotNull');
      method.addParameter(parameter);

      if (!requestBody.type.name) {
        const model = buildModel(
          context,
          modelClass,
          requestBody.type,
          requestBodyType,
        );
        modelClass.addClass(model);
      }
    }

    // Add response body if it's not an existing entity
    if (response?.type.kind === 'Model' && response.type.name === '') {
      const model = buildModel(context, modelClass, response.type, returnType);
      modelClass.addClass(model);
    }

    // Add method body
    const serviceParameters = pathParameters.map((p) => p.name);
    if (extendedParameterModel) {
      serviceParameters.push('queryParameters');
    }
    if (requestBody) {
      serviceParameters.push('requestBody');
    }

    let body = ``;
    body += `var responseBody = service.${methodName}(${serviceParameters.join(', ')});`;
    if (verb === 'post') {
      body += `URI uri = URI.create("/" + responseBody.getId());`;
      body += `return ResponseEntity.created(uri).body(responseBody);`;
    } else {
      body += `return ResponseEntity.ok(responseBody);`;
    }
    method.setBody(body);
  }

  return modelClass;
}
