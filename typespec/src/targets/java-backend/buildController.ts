import { EmitContext, getDoc } from '@typespec/compiler';
import { HttpOperation } from '@typespec/http';
import { addAnnotations } from '../../languages/java/helpers/addAnnotations.js';
import {
  getJavaEntityPackageName,
  getJavaType,
} from '../../languages/java/helpers/javaHelpers.js';
import Class from '../../languages/java/primitives/class.js';
import Field from '../../languages/java/primitives/field.js';
import JavaPrimitive from '../../languages/java/primitives/javaprimitive.js';
import Method from '../../languages/java/primitives/method.js';
import Parameter from '../../languages/java/primitives/parameter.js';
import { getExtendedParameterModel } from '../../utils/controllerParameters.js';
import {
  getBodyPropertyModel,
  getDefaultValue,
  getEntityURI,
  getExpandableEntity,
} from '../../utils/getters.js';
import { camelCase, pascalCase } from '../../utils/stringutils.js';
import {
  isEInnsynEntity,
  isEInnsynId,
  isExpandableField,
  isFinal,
} from '../../utils/typecheckers.js';
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
  entityName: string,
  httpOperations: HttpOperation[],
): Class {
  const className = entityName + 'Controller';
  const modelClass = new Class(context, parent, className);
  modelClass.addAnnotation(
    'org.springframework.web.bind.annotation.RestController',
  );

  // Add service field variable
  const serviceField = new Field(
    context,
    modelClass,
    'service',
    entityName + 'Service',
  );
  serviceField.setFinal(true);
  serviceField.setVisibility('private');
  modelClass.addField(serviceField);

  // Add constructor
  const constructor = new Method(context, modelClass, className);
  constructor.addParameter(
    new Parameter(context, modelClass, 'service', entityName + 'Service'),
  );
  constructor.setBody(`this.service = service;`);
  modelClass.addMethod(constructor);

  for (const httpOperation of httpOperations) {
    const { verb, path } = httpOperation;
    const { name: operationName } = httpOperation.operation;
    const methodName = camelCase(operationName);
    const response = httpOperation.responses[0];
    const isInsert = verb === 'post';
    const isUpdate = verb === 'patch';

    // Create method
    const returnType = getJavaType(
      response?.type,
      methodName + 'Response',
      entityName,
    );
    const method = new Method(
      context,
      modelClass,
      'ResponseEntity<' + returnType + '>',
      methodName,
    );
    method.addImport('org.springframework.http.ResponseEntity');
    method.addThrows('no.einnsyn.backend.error.exceptions.EInnsynException');
    if (response?.type.kind === 'Model') {
      method.addImport(getBodyPropertyModel(response.type) ?? response.type);
    }
    method.setDocumentation(getDoc(context.program, httpOperation.operation));
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
        getJavaType(type, parameterModel.name, entityName),
      );
      parameter.addAnnotation('jakarta.validation.Valid');
      parameter.addAnnotation(
        'org.springframework.web.bind.annotation.PathVariable',
      );
      parameter.addAnnotation('jakarta.validation.constraints.NotNull');
      if (isEInnsynId(type)) {
        const generic = type.templateMapper?.args[0];
        const entityModel =
          generic?.entityKind === 'Type' && generic.kind === 'Model' && generic;
        if (entityModel) {
          const serviceName = pascalCase(entityModel.name) + 'Service';
          parameter.addImport(
            'no.einnsyn.backend.validation.expandableobject.ExpandableObject',
          );
          parameter.addImport(
            getJavaEntityPackageName(entityModel) + '.' + serviceName,
          );
          parameter.addAnnotation(
            'no.einnsyn.backend.validation.expandableobject.ExpandableObject',
            `service = ${serviceName}.class, mustExist = true`,
          );
        }
      }
      method.addParameter(parameter);
    }

    // Add query parameter object if there are any
    const parameters = httpOperation.parameters.parameters.filter(
      (f) => f.type === 'query',
    );
    const extendedParameterModel = getExtendedParameterModel(
      parameters,
      pascalCase(httpOperation.operation.name + 'Parameters'),
    );
    if (extendedParameterModel) {
      // Add parameter
      const parameterType = extendedParameterModel.name;
      const parameter = new Parameter(context, method, 'query', parameterType);
      parameter.addAnnotation('jakarta.validation.Valid');
      method.addParameter(parameter);

      // Create a model for the parameters, if we can't use a base class
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
            getJavaType(param.type, param.name, entityName),
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

      // Import the model
      if (extendedParameterModel.extend) {
        method.addImport(extendedParameterModel.extend);
      }
    }

    // Add request body object if it's not an existing entity
    const requestBody = httpOperation.parameters.body;
    if (
      (requestBody && isExpandableField(requestBody.type)) ||
      (requestBody?.type.kind === 'Model' &&
        requestBody.bodyKind !== 'multipart')
    ) {
      const requestBodyType =
        getJavaType(requestBody.type) || pascalCase(operationName + 'Request');
      const parameter = new Parameter(
        context,
        modelClass,
        'body',
        requestBodyType,
      );
      parameter.addAnnotation(
        'org.springframework.web.bind.annotation.RequestBody',
      );

      // Add import for ExpandableField
      if (isExpandableField(requestBody.type)) {
        parameter.addImport(
          'no.einnsyn.backend.common.expandablefield.ExpandableField',
        );
      }

      // Add import for the model
      if (requestBody.type.kind === 'Model') {
        parameter.addImport(
          getBodyPropertyModel(requestBody.type) ?? requestBody.type,
        );
      }

      // Add ExpandableObject validation if needed
      if (
        (isEInnsynEntity(requestBody.type) ||
          isExpandableField(requestBody.type)) &&
        requestBody.type.kind === 'Model'
      ) {
        const entityName = requestBody.type.name;
        const serviceName = pascalCase(entityName) + 'Service';
        parameter.addImport(
          'no.einnsyn.backend.validation.expandableobject.ExpandableObject',
        );
        parameter.addImport(
          getJavaEntityPackageName(requestBody.type) + '.' + serviceName,
        );

        if (isInsert) {
          parameter.addImport(
            'no.einnsyn.backend.validation.validationgroups.Insert',
          );
          parameter.addAnnotation(
            'org.springframework.validation.annotation.Validated',
            'Insert.class',
          );
        }
        if (isUpdate) {
          parameter.addImport(
            'no.einnsyn.backend.validation.validationgroups.Update',
          );
          parameter.addAnnotation(
            'org.springframework.validation.annotation.Validated',
            'Update.class',
          );
        }

        const expandableParameters = [`service = ${serviceName}.class`];
        if (isInsert) {
          expandableParameters.push(`mustNotExist = true`);
        }
        parameter.addAnnotation(
          'no.einnsyn.backend.validation.expandableobject.ExpandableObject',
          expandableParameters.join(', '),
        );
      } else {
        parameter.addAnnotation('jakarta.validation.Valid');
      }

      parameter.addAnnotation('jakarta.validation.constraints.NotNull');
      method.addParameter(parameter);

      // If the request body is an unknown object (not an entity), create an inline model
      if (requestBody.type.kind === 'Model' && !requestBody.type.name) {
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
      serviceParameters.push('query');
    }
    if (requestBody) {
      serviceParameters.push('body');
    }

    let body: string[] = [];
    body.push(
      `var responseBody = service.${methodName}(${serviceParameters.join(', ')});`,
    );

    const expandableRequestEntity = getExpandableEntity(requestBody?.type);

    // If we allow adding existing objects (the request body is an expandable field that also allows IDs), we need to check if we return 200 or 201
    if (isInsert && expandableRequestEntity) {
      method.addImport('java.net.URI');
      const entityUri = getEntityURI(expandableRequestEntity);
      body.push(
        `if (body.getId() == null) {`,
        ` var location = URI.create("${entityUri}/" + responseBody.getId());`,
        ` return ResponseEntity.created(location).body(responseBody);`,
        `} else {`,
        ` return ResponseEntity.ok().body(responseBody);`,
        `}`,
      );
    }

    // If this is an insert and we don't allow existing objects, return 201
    else if (isInsert && requestBody?.type.kind === 'Model') {
      method.addImport('java.net.URI');
      const entityUri = getEntityURI(requestBody.type);
      body.push(
        `var location = URI.create("${entityUri}/" + responseBody.getId());`,
        `return ResponseEntity.created(location).body(responseBody);`,
      );
    }

    // If we don't return a created entity, return the response body
    else {
      body.push(`return ResponseEntity.ok().body(responseBody);`);
    }

    method.setBody(body.join('\n'));
  }

  return modelClass;
}
