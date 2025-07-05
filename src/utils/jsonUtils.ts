// File: src/utils/jsonUtils.ts

/**
 * Recursively collect every distinct object/key path into a Set,
 * so you never generate duplicates.
 */
export function getAllPaths(obj: any): string[] {
  const paths = new Set<string>();

  function helper(current: any, prefix: string) {
    if (prefix) {
      paths.add(prefix);
    }
    if (current && typeof current === "object") {
      for (const key of Object.keys(current)) {
        const next = prefix ? `${prefix}.${key}` : key;
        helper((current as any)[key], next);
      }
    }
  }

  helper(obj, "");
  return Array.from(paths).sort();
}

/**
 * Picks only the given paths out of an object, returning a new flat object
 * where each path is a top-level key.
 */
export function pickPaths(obj: any, paths: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  paths.forEach((path) => {
    const parts = path.split(".");
    let cur: any = obj;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) {
        cur = cur[p];
      } else {
        cur = undefined;
        break;
      }
    }
    result[path] = cur;
  });
  return result;
}


/**
 * Recursively parses any JSON strings inside an object or array,
 * preserving the full structure and deeply decoding stringified JSON fields.
 */
export function parseObjectStrings(input: any): any {
  // For arrays
  if (Array.isArray(input)) {
    return input.map(parseObjectStrings);
  }

  // For objects
  if (typeof input === "object" && input !== null) {
    const result: Record<string, any> = {};
    for (const key in input) {
      const val = input[key];

      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          result[key] = parseObjectStrings(parsed);
        } catch {
          result[key] = val; // Not parseable? Keep as-is
        }
      } else {
        result[key] = parseObjectStrings(val); // Recurse
      }
    }
    return result;
  }

  // For primitives (number, boolean, null, etc.)
  return input;
}