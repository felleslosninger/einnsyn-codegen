export function constVarName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

export function ucFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function lcFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function camelCase(...s: string[]): string {
  return lcFirst(
    s.join(' ').replace(/[ -]+([a-zA-Z])/g, (g) => g[1].toUpperCase()),
  );
}

export function pascalCase(...s: string[]): string {
  return ucFirst(camelCase(s.join(' ')));
}
