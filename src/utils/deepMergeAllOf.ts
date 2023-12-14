export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

export type JSONObject = Record<string, JSONValue>;

const isJSONArray = (value: JSONValue): value is JSONValue[] =>
  Array.isArray(value);

const isJSONObject = (value: JSONValue): value is JSONObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Deep merge the allOf property into a SchemaObject
export const deepMergeAllOf = (
  target: JSONObject,
  sources: JSONObject[] = [],
  visited = new Map<JSONValue, JSONValue>()
) => {
  if (
    Object.keys(target).length === 0 &&
    sources.length === 1 &&
    visited.has(sources[0])
  ) {
    return visited.get(sources[0]);
  }

  // Iterate all given sources
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (!source) continue;

    // If the source has an allOf property, add it to the sources after the current one
    if (Array.isArray(source.allOf)) {
      sources = [
        ...sources.slice(0, i + 1),
        ...(source.allOf as JSONObject[]),
        ...sources.slice(i + 1),
      ];
    }

    // Iterate properties of source
    for (const keyString in source) {
      const key = keyString;
      const sourceItem = source[key];
      let targetItem = target[key];

      if (key === "allOf") continue;

      // Concatenate arrays, skip duplicates
      if (isJSONArray(sourceItem)) {
        if (!isJSONArray(targetItem)) {
          targetItem = [];
          target[key] = targetItem;
        }
        for (const sourceItemItem of sourceItem) {
          if (!targetItem.includes(sourceItemItem)) {
            targetItem.push(sourceItemItem);
          }
        }
      }

      // Recursively deep merge objects
      else if (isJSONObject(sourceItem) && sourceItem !== null) {
        if (!isJSONObject(targetItem) || targetItem === null) {
          targetItem = {};
          target[key] = targetItem;
        }
        deepMergeAllOf(targetItem, [sourceItem], visited);
      }

      // Add / overwrite primitives
      else {
        target[key] = source[key];
      }
    }
  }

  delete target.allOf;

  return target;
};
