// File: src/utils/extract.ts

/**
 * For SFDC Response flows: flatten each lineItemSO.v (or lineItemSO) and
 * inject any top-level keys specified in `rootKeys`.
 *
 * @param root      Either { v: [...] } or a single response object.
 * @param rootKeys  Array of top-level field names to carry through.
 */
export function extractAllLineItemSOs(
  root: any,
  rootKeys: string[] = []
): any[] {
  const collected: any[] = [];

  // Helper to walk a node
  const traverse = (
    node: any,
    level: string,
    rootProps: Record<string, any>
  ) => {
    if (!node || typeof node !== "object") return;

    // Pull out the SO object, whether it's under .v or not
    const so = node.lineItemSO?.v?.Name
      ? node.lineItemSO.v
      : node.lineItemSO?.Name
      ? node.lineItemSO
      : null;

    if (so && typeof so === "object") {
      const flat: Record<string, any> = { ...rootProps, level };
      Object.entries(so).forEach(([key, val]) => {
        if (val && typeof val === "object" && !Array.isArray(val)) {
          const inner = (val as any).v || val;
          Object.entries(inner).forEach(([ik, iv]) => {
            flat[`${key}.${ik}`] = iv;
          });
        } else {
          flat[key] = val;
        }
      });
      collected.push(flat);
    }

    // Recurse into chargeLines and optionLines (under .v)
    ["chargeLines", "optionLines"].forEach((prop) => {
      (node[prop]?.v || []).forEach((child: any) => {
        const nextLevel =
          prop === "optionLines"
            ? "option"
            : level === "bundle"
            ? "bundle"
            : "sub-option";
        traverse(child, nextLevel, rootProps);
      });
    });
  };

  // Determine top-level entries array
  const entries: any[] = Array.isArray(root.v) ? root.v : [root];

  entries.forEach((entry) => {
    // Build rootProps dynamically from rootKeys
    const rootProps: Record<string, any> = {};
    rootKeys.forEach((rk) => {
      if (entry[rk] !== undefined) {
        rootProps[rk] = entry[rk];
      }
    });

    traverse(entry, "bundle", rootProps);
  });

  return collected;
}


export function findLineItemRoot(obj: any): any | null {
  if (!obj || typeof obj !== "object") return null;

  // If it's an array, check each item
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findLineItemRoot(item);
      if (found) return found;
    }
  }

  // If it has lineItemSO or chargeLines or optionLines — it's our root
  if (
    obj.lineItemSO ||
    (obj.chargeLines && Array.isArray(obj.chargeLines.v || obj.chargeLines)) ||
    (obj.optionLines && Array.isArray(obj.optionLines.v || obj.optionLines))
  ) {
    return obj;
  }

  // Recurse into each property
  for (const key of Object.keys(obj)) {
    const found = findLineItemRoot(obj[key]);
    if (found) return found;
  }

  return null;
}


// This function specifically supports SFDC Request JSONs where "lineItems" can appear at any nested level
export function findLineItemsArray(input: any): any[] {
  if (!input || typeof input !== 'object') return [];

  // If the object itself is a valid lineItems array
  if (Array.isArray(input)) {
    const firstItem = input[0];
    if (firstItem && typeof firstItem === 'object' &&
        (firstItem.chargeLines || firstItem.optionLines || firstItem.lineItemSO)) {
      return input;
    }
    // Recursively check each item
    for (const item of input) {
      const result = findLineItemsArray(item);
      if (result.length > 0) return result;
    }
    return [];
  }

  // If this object has a direct 'lineItems' array, return it
  if (Array.isArray(input.lineItems)) {
    return input.lineItems;
  }

  // Recurse into nested keys
  for (const key of Object.keys(input)) {
    const result = findLineItemsArray(input[key]);
    if (result.length > 0) return result;
  }

  return [];
}

export function extractSFDCRequestLineItems(
  input: any,
  rootKeys: string[]
): any[] {
  const collected: any[] = [];
  const lineItemsArray = findLineItemsArray(input);

  const traverse = (
    node: any,
    level: string,
    rootProps: Record<string, any>
  ) => {
    if (!node || typeof node !== 'object') return;

    const so = node.lineItemSO;
    if (so && typeof so === 'object') {
      const flat: Record<string, any> = { ...rootProps, level };
      Object.entries(so).forEach(([key, val]) => {
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          Object.entries(val).forEach(([ik, iv]) => {
            flat[`${key}.${ik}`] = iv;
          });
        } else {
          flat[key] = val;
        }
      });
      collected.push(flat);
    }

    ['chargeLines', 'optionLines'].forEach((prop) => {
      (node[prop] || []).forEach((child: any) =>
        traverse(
          child,
          prop === 'optionLines'
            ? 'option'
            : level === 'bundle'
            ? 'bundle'
            : 'sub-option',
          rootProps
        )
      );
    });
  };

  lineItemsArray.forEach((lineItem: any) => {
    const rootProps: Record<string, any> = {};
    rootKeys.forEach((rk) => {
      if (lineItem[rk] !== undefined) rootProps[rk] = lineItem[rk];
    });
    traverse(lineItem, 'bundle', rootProps);
  });

  return collected;
}

/**
 * Collects all distinct keys across all flattened items
 * (so your dropdown shows *every* possible path).
 */
export function collectAllKeysFromLineItems(items: any[]): string[] {
  const keys = new Set<string>();
  items.forEach((item) => {
    Object.keys(item).forEach((k) => {
      if (k !== "level") keys.add(k);
    });
  });
  return Array.from(keys).sort();
}

/**
 * For Turbo Request flows: takes a flat array of objects and
 * flattens any top-level nested __r structures, carrying along
 * specified rootKeys.
 */
export function extractTurboRequestItems(
  input: any,
  rootKeys: string[] = []
): any[] {
  if (!Array.isArray(input)) return [];

  const collected: any[] = [];

  input.forEach((entry) => {
    // build rootProps
    const rootProps: Record<string, any> = {};
    rootKeys.forEach((rk) => {
      if (entry[rk] !== undefined) rootProps[rk] = entry[rk];
    });

    // flatten nested __r at top level
    const flat: Record<string, any> = { ...rootProps, level: 'bundle' };
    Object.entries(entry).forEach(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        // nested relation object (e.g. AttributeValueId__r)
        Object.entries(v).forEach(([ik, iv]) => {
          flat[`${k}.${ik}`] = iv;
        });
      } else {
        flat[k] = v;
      }
    });

    collected.push(flat);
  });

  return collected;
}

/**
 * For Turbo Response flows: pulls the CartResponse.Apttus_Config2__LineItems__r
 * array and flattens each entry (including any nested __r relations), carrying
 * along any specified rootKeys from the CartResponse.
 *
 * Now also explodes UsagePriceTiers__r into separate entries.
 */
export function extractTurboResponseLineItems(
  input: any,
  rootKeys: string[] = []
): any[] {
  const cart = input?.CartResponse;
  if (!cart || !Array.isArray(cart.Apttus_Config2__LineItems__r)) return [];

  const collected: any[] = [];
  const entries = cart.Apttus_Config2__LineItems__r;

  entries.forEach((entry) => {
    // Build any root-level props you want to carry from CartResponse
    const rootProps: Record<string, any> = {};
    rootKeys.forEach((rk) => {
      if (cart[rk] !== undefined) {
        rootProps[rk] = cart[rk];
      }
    });

    // Base flat data for this lineItem
    const baseFlat: Record<string, any> = { ...rootProps, level: 'bundle' };
    Object.entries(entry).forEach(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.entries(v).forEach(([ik, iv]) => {
          baseFlat[`${k}.${ik}`] = iv;
        });
      } else {
        baseFlat[k] = v;
      }
    });

    // If there is a UsagePriceTiers__r array, explode each tier
    const tiers = entry.Apttus_Config2__UsagePriceTiers__r;
    if (Array.isArray(tiers) && tiers.length) {
      tiers.forEach((tier: any, idx: number) => {
        const flatTier: Record<string, any> = { ...baseFlat };
        // Prefix tier fields with index for uniqueness
        Object.entries(tier).forEach(([tk, tv]) => {
          flatTier[`UsagePriceTiers__r[${idx}].${tk}`] = tv;
        });
        collected.push(flatTier);
      });
    } else {
      // No tiers: push the base row
      collected.push(baseFlat);
    }
  });

  return collected;
}

/**
 * Flattens any chosen sub‐array (e.g. Apttus_Config2__LineItems__r or
 * Apttus_Config2__SummaryGroups__r) on CartResponse into row objects.
 * Carries through rootKeys from CartResponse as before.
 */
export function extractTurboArrayItems(
  input: any,
  arrayKey: string,
  rootKeys: string[] = []
): any[] {
  const cart = input?.PayLoad?.CartResponse;
  if (!cart || !Array.isArray(cart[arrayKey])) return [];

  const entries = cart[arrayKey] as any[];
  const collected: any[] = [];

  entries.forEach((entry) => {
    // carry top‐level props
    const rootProps: Record<string, any> = {};
    rootKeys.forEach((rk) => {
      if (cart[rk] !== undefined) rootProps[rk] = cart[rk];
    });

    // flatten the entry
    const flat: Record<string, any> = { ...rootProps, level: arrayKey };
    Object.entries(entry).forEach(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        // nested relation object, flatten its fields
        Object.entries(v).forEach(([ik, iv]) => {
          flat[`${k}.${ik}`] = iv;
        });
      } else {
        flat[k] = v;
      }
    });

    collected.push(flat);
  });

  return collected;
}

