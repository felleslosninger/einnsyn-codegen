import { HelperOptions } from 'handlebars';
import {
  getEntityOperationList,
  getOperationName,
  getPropertyList,
  getPropertyObject,
  getRequestBodyResource,
  getRequestBodyResourceId,
  getResourceIds,
  getResponseBody,
  hasOperations,
  hasRequestBodyId,
  isExpandableField,
  isExpandableFieldList,
  isList,
  isUnionResource,
} from './helpers';

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

export const echo = (value: string) => {
  return value;
};

// Add a fallback-value helper
export const fallback = (value: string, fallbackValue: string) => {
  return value ?? fallbackValue;
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
  handlebars.registerHelper('echo', echo);
  handlebars.registerHelper('fallback', fallback);
  handlebars.registerHelper('operation-name', getOperationName);
  handlebars.registerHelper(
    'request-body-resource-id',
    getRequestBodyResourceId,
  );
  handlebars.registerHelper('const-var-name', constVarName);
  handlebars.registerHelper('request-body-resource', getRequestBodyResource);
  handlebars.registerHelper('is-union-resource', isUnionResource);
  handlebars.registerHelper('is-list', isList);
  handlebars.registerHelper('is-expandable-field', isExpandableField);
  handlebars.registerHelper('is-expandable-field-list', isExpandableFieldList);
  handlebars.registerHelper('propertyList', getPropertyList);
  handlebars.registerHelper('propertyObject', getPropertyObject);
  handlebars.registerHelper('response-body', getResponseBody);
  handlebars.registerHelper('entity-operation-list', getEntityOperationList);
  handlebars.registerHelper('has-operations', hasOperations);
  handlebars.registerHelper('resource-ids', getResourceIds);
  handlebars.registerHelper('has-request-body-id', hasRequestBodyId);
};
