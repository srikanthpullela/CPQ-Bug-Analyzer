// RulesHelper.js
import get from "lodash/get";

export function deepEvaluateRule(rule, row) {
  const method = row?.method || ""; // Fix for correct method field
  console.log("[Rule Debug] Checking methodName:", method);

  if (rule.methodNames?.length && !rule.methodNames.includes(method)) {
    console.log("[Rule Debug] Method name does not match, skipping rule");
    return false;
  }

  const allMatch = rule.conditions.every((cond) => {
    const result = deepSearch(row, cond);
    console.log(`[Rule Debug] Condition`, cond, "Result:", result);
    return result;
  });

  console.log("[Rule Debug] All conditions match:", allMatch);
  return allMatch;
}

function deepSearch(obj, cond) {
  if (typeof obj !== "object" || obj === null) return false;

  const value = get(obj, cond.fieldPath);
  const actualStr = String(value);
  const expectedStr = String(cond.value);

  const conditionMet =
    cond.operator === "==="
      ? actualStr === expectedStr
      : actualStr !== expectedStr;

  if (conditionMet) {
    console.log(`[Rule Debug] Found match at`, obj, "for", cond);
    return true;
  }

  return Object.values(obj).some((val) => {
    if (Array.isArray(val)) {
      return val.some((item) => deepSearch(item, cond));
    } else if (typeof val === "object" && val !== null) {
      return deepSearch(val, cond);
    }
    return false;
  });
}
