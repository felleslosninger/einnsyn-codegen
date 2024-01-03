import { HelperOptions } from 'handlebars';

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

// Add equality "eq" helper
export function eq(this: any, a: string, b: string, options: HelperOptions) {
  return a === b ? options.fn(this) : options.inverse(this);
}

// Add equality "ne" helper
export function ne(this: any, a: string, b: string, options: HelperOptions) {
  return a !== b ? options.fn(this) : options.inverse(this);
}

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
};
