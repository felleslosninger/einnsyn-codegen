/**
 * Converts a string to CONSTANT_CASE format
 * @param name - The string to convert
 * @returns The string in CONSTANT_CASE format
 */
export function constVarName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

/**
 * Capitalizes the first character of a string
 * @param s - The string to capitalize
 * @returns The string with first character capitalized
 */
export function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Lowercases the first character of a string
 * @param s - The string to process
 * @returns The string with first character lowercased
 */
export function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Converts strings to camelCase format
 * @param s - The strings to convert
 * @returns The strings joined and converted to camelCase
 */
export function camelCase(...s: string[]): string {
  return lcFirst(
    s.join(' ').replace(/[ \-_]+([a-zA-Z])/g, (match, letter) => letter.toUpperCase()),
  );
}

/**
 * Converts strings to PascalCase format
 * @param s - The strings to convert
 * @returns The strings joined and converted to PascalCase
 */
export function pascalCase(...s: string[]): string {
  return ucFirst(camelCase(...s));
}
