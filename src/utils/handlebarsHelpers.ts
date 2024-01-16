import { HelperOptions } from 'handlebars';
import {
  OperationObject,
  RequestBodyObject,
  SchemaObject,
} from 'openapi3-ts/oas30';
import { getRequestBody } from './helpers';

// Capitalize first letter
export const capitalize = (s = '') => {
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Decapitalize first letter
export const deCapitalize = (s = '') => {
  return s.charAt(0).toLowerCase() + s.slice(1);
};

// Add lowercase "lc" helper
export const lc = (s = '') => {
  return s.toLowerCase();
};

// Add uppercase "uc" helper
export const uc = (s = '') => {
  return s.toUpperCase();
};

export const constVarName = (s = '') => {
  return s.toUpperCase().replace(/[^a-zA-Z0-9]/g, '_');
};

export const length = (s = '') => {
  return s.length;
};

// Add equality "eq" helper
export function eq(this: any, a: string, b: string, options: HelperOptions) {
  if (!!options.inverse && !!options.fn) {
    return a === b ? options.fn(this) : options.inverse(this);
  } else {
    return a === b;
  }
}

// Add equality "ne" helper
export function ne(this: any, a: string, b: string, options: HelperOptions) {
  if (!!options.inverse && !!options.fn) {
    return a !== b ? options.fn(this) : options.inverse(this);
  } else {
    return a !== b;
  }
}

// Add a fallback-value helper
export const fallback = (value: string, fallbackValue: string) => {
  return value ?? fallbackValue;
};

/**
 * Generate the name for a resource's operation
 *
 * @param entity
 * @param entityOperation
 * @returns
 */
export const getOperationName = (
  entityName: string,
  method: string,
  operation: OperationObject,
) => {
  let operationId = operation.operationId;
  if (!operationId) {
    return undefined;
  }

  const methodAlias =
    method === 'post' ? 'add' : method === 'put' ? 'update' : method;

  // GetSaksmappe, PostSaksmappe operations should be named "get", "post"
  if (operationId === capitalize(method) + entityName) {
    return methodAlias;
  }
  // GetSaksmappeList should be named "list"
  else if (operationId === 'Get' + entityName + 'List') {
    return 'list';
  }
  // PostSaksmappeJournalpost (add journalpost to Saksmappe) should be named postJournalpost
  else {
    const stripPrefixRE = new RegExp('^' + capitalize(method) + entityName);
    return deCapitalize(
      operationId.replace(stripPrefixRE, capitalize(methodAlias)),
    );
  }
};

/**
 * Get the request body type for an operation
 *
 * @param entityOperation
 * @returns
 */
export const getRequestBodyType = (
  operation: OperationObject,
): string | undefined => {
  const requestBody = operation.requestBody as RequestBodyObject;
  const content = requestBody?.content;
  const schema = content?.['application/json']?.schema as SchemaObject;
  const bodyType = schema?.['x-resourceId'] ?? operation.operationId;
  return bodyType;
};

/**
 * Handlebar helpers that can be used for all templates
 * @param handlebars
 */
export const addHandlebarsHelpers = (handlebars: typeof Handlebars) => {
  handlebars.registerHelper('capitalize', capitalize);
  handlebars.registerHelper('deCapitalize', deCapitalize);
  handlebars.registerHelper('lc', lc);
  handlebars.registerHelper('uc', uc);
  handlebars.registerHelper('length', length);
  handlebars.registerHelper('eq', eq);
  handlebars.registerHelper('ne', ne);
  handlebars.registerHelper('log', (value: unknown) => console.log(value));
  handlebars.registerHelper('and', function () {
    return Array.prototype.every.call(arguments, Boolean);
  });
  handlebars.registerHelper('or', function () {
    return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
  });
  handlebars.registerHelper('fallback', fallback);
  handlebars.registerHelper('operation-name', getOperationName);
  handlebars.registerHelper('request-body-type', getRequestBodyType);
  handlebars.registerHelper('const-var-name', constVarName);
  handlebars.registerHelper('request-body', getRequestBody);
};
