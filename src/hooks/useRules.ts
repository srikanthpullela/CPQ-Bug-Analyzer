import { useState, useEffect, useCallback } from "react";
import { toast } from "react-hot-toast";

// Helper function to find all occurrences of a field with a specific value
const findFieldOccurrences = (
  obj: any,
  fieldPath: string,
  expectedValue: any,
  path: string = ""
): string[] => {
  const occurrences: string[] = [];

  if (!obj || typeof obj !== "object") return occurrences;

  // Check direct property match
  if (obj.hasOwnProperty(fieldPath) && obj[fieldPath] == expectedValue) { // Use == for loose comparison
    occurrences.push(path || "root");
  }

  // Recursively check nested objects and arrays
  Object.keys(obj).forEach((key) => {
    const newPath = path ? `${path}.${key}` : key;
    const value = obj[key];

    if (typeof value === "object" && value !== null) {
      occurrences.push(...findFieldOccurrences(value, fieldPath, expectedValue, newPath));
    }
  });

  return occurrences;
};

export const useRules = (httpRows: any[], wsRows: any[] = []) => {
  const [rules, setRules] = useState([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [newConditions, setNewConditions] = useState([
    { fieldPath: "", operator: "===", value: "" },
  ]);
  const [methodNames, setMethodNames] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchedResponses, setMatchedResponses] = useState([]);
  const [showMatchesModal, setShowMatchesModal] = useState(false);
  const [processedItems, setProcessedItems] = useState<Set<string>>(new Set());

  const addCondition = () =>
    setNewConditions([
      ...newConditions,
      { fieldPath: "", operator: "===", value: "" },
    ]);

  const removeCondition = (index: number) => {
    setNewConditions(newConditions.filter((_, i) => i !== index));
  };

  const updateCondition = (i: number, field: string, val: string) => {
    const updated = [...newConditions];
    updated[i][field] = val;
    setNewConditions(updated);
  };

  const openRuleModal = () => {
    if (rules.length) {
      setNewConditions(rules[0].conditions);
      setMethodNames(rules[0].methodNames?.join(", ") || "");
    } else {
      setNewConditions([{ fieldPath: "", operator: "===", value: "" }]);
      setMethodNames("");
    }
    setRuleModalOpen(true);
  };

  const saveRule = () => {
    setRules([
      {
        id: Date.now().toString(),
        conditions: newConditions,
        methodNames: methodNames
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      },
    ]);
    setRuleModalOpen(false);
    // Clear processed IDs when rules change
    setProcessedItems(new Set());
    setMatchedResponses([]);
    setMatchCount(0);
  };

  const clearMatches = useCallback(() => {
    setMatchedResponses([]);
    setProcessedItems(new Set());
    setMatchCount(0);
  }, []);

  // Clear matches when both httpRows and wsRows are empty (logs cleared)
  useEffect(() => {
    if (httpRows.length === 0 && wsRows.length === 0) {
      setMatchedResponses([]);
      setMatchCount(0);
      setProcessedItems(new Set());
    }
  }, [httpRows.length, wsRows.length]);

  // Main rule evaluation - simplified single approach
  useEffect(() => {
    if ((!httpRows.length && !wsRows.length) || !rules.length) return;

    console.log('[DEBUG] Running rule evaluation...', {
      httpRowsLength: httpRows.length,
      wsRowsLength: wsRows.length,
      rulesLength: rules.length
    });

    const allRows = [
      ...httpRows.map(row => ({ ...row, rowType: 'http' })),
      ...wsRows.map(row => ({ ...row, rowType: 'ws' }))
    ];

    const newMatches: any[] = [];
    const newProcessedItems = new Set(processedItems);

    allRows.forEach((row) => {
      // Create unique identifier based on type + method + timestamp
      const method = row.method || row.action || 'unknown';
      const timestamp = row.startTime || row.timestamp || Date.now();
      const rowId = `${row.rowType}-${method}-${timestamp}`;

      // Skip if already processed this method + timestamp combination
      if (newProcessedItems.has(rowId)) {
        return;
      }

      // For HTTP: check responsePayload, for WS: check payload
      const payloadToCheck = row.rowType === 'http' ? row.responsePayload : row.payload;
      
      // Only evaluate rules if we have payload data
      if (!payloadToCheck) {
        console.log('[DEBUG] No payload data for row:', rowId);
        return;
      }

      console.log('[DEBUG] Processing row:', rowId, 'with payload keys:', Object.keys(payloadToCheck));

      rules.forEach((rule) => {
        // Check method names filter - works for both HTTP methods and WS actions
        if (rule.methodNames && rule.methodNames.length > 0) {
          const methodToCheck = method.toLowerCase();
          const methodMatches = rule.methodNames.some((methodName: string) =>
            methodToCheck.includes(methodName.toLowerCase())
          );
          if (!methodMatches) {
            console.log('[DEBUG] Method filter not matched:', methodToCheck, 'against', rule.methodNames);
            return;
          }
        }

        // Check if ALL conditions are satisfied (AND logic)
        const satisfiedConditions: Array<{condition: any, occurrences: string[]}> = [];
        let allConditionsSatisfied = true;

        for (const condition of rule.conditions) {
          if (!condition.fieldPath || condition.value === '') {
            console.log('[DEBUG] Skipping empty condition:', condition);
            continue;
          }

          console.log(`[DEBUG] Checking condition: ${condition.fieldPath} ${condition.operator} ${condition.value}`);
          
          const fieldOccurrences = findFieldOccurrences(
            payloadToCheck,
            condition.fieldPath,
            condition.value
          );

          console.log(`[DEBUG] Found ${fieldOccurrences.length} occurrences of ${condition.fieldPath}=${condition.value}`);

          if (fieldOccurrences.length > 0) {
            // Condition is satisfied
            satisfiedConditions.push({
              condition,
              occurrences: fieldOccurrences
            });
          } else {
            // This condition is not satisfied, so the entire rule fails
            allConditionsSatisfied = false;
            console.log(`[DEBUG] Condition not satisfied: ${condition.fieldPath} ${condition.operator} ${condition.value}`);
            break;
          }
        }

        // Only create matches if ALL conditions are satisfied
        if (allConditionsSatisfied && satisfiedConditions.length > 0) {
          console.log(`[DEBUG] All ${satisfiedConditions.length} conditions satisfied for rule`);
          
          // Create a single match for this rule with all satisfied conditions
          const ruleMatch = {
            ...row,
            id: `${row.id || timestamp}-rule-${Date.now()}`,
            timestamp: timestamp,
            satisfiedConditions: satisfiedConditions.map(sc => ({
              fieldPath: sc.condition.fieldPath,
              operator: sc.condition.operator,
              value: sc.condition.value,
              occurrenceCount: sc.occurrences.length,
              occurrencePaths: sc.occurrences
            })),
            responsePayload: payloadToCheck,
            method: method,
            type: row.rowType,
          };

          newMatches.push(ruleMatch);
        } else {
          console.log(`[DEBUG] Rule not satisfied - only ${satisfiedConditions.length} of ${rule.conditions.length} conditions met`);
        }
      });

      // Mark as processed regardless of matches
      newProcessedItems.add(rowId);
    });

    // Update processed items
    setProcessedItems(newProcessedItems);

    console.log(`[DEBUG] Found ${newMatches.length} new rule matches`);

    // Process new matches
    if (newMatches.length > 0) {
      // Filter out duplicates based on match ID
      const existingIds = new Set(matchedResponses.map((item) => item.id));
      const uniqueNewMatches = newMatches.filter((match) => !existingIds.has(match.id));

      console.log(`[DEBUG] Unique new matches: ${uniqueNewMatches.length}`);

      if (uniqueNewMatches.length > 0) {
        // Show individual toast notifications for each rule match
        uniqueNewMatches.forEach((match, index) => {
          const methodDisplay = match.method || 'Unknown';
          const typePrefix = match.type === 'ws' ? 'WS' : 'HTTP';
          
          // Build condition summary for toast
          const conditionSummary = match.satisfiedConditions
            .map(sc => `${sc.fieldPath}${sc.operator}${sc.value}${sc.occurrenceCount > 1 ? ` (${sc.occurrenceCount}x)` : ''}`)
            .join(' AND ');
          
          const message = `Rule matched: ${typePrefix} ${methodDisplay} - Conditions: ${conditionSummary}`;

          console.log(`[DEBUG] Showing toast ${index + 1}:`, message);

          // Add a small delay between toasts to make them more visible
          setTimeout(() => {
            toast.success(message, {
              duration: 6000, // Longer duration since message is more detailed
              position: "top-right",
              id: `rule-match-${match.id}`, // Unique ID prevents deduplication
            });
          }, index * 100); // 100ms delay between each toast
        });

        // Update state
        setMatchedResponses(prev => [...prev, ...uniqueNewMatches]);
        setMatchCount(prev => prev + uniqueNewMatches.length);
      }
    }
  }, [httpRows, wsRows, rules]); // Removed processedItems from dependencies to avoid loops

  return {
    rules,
    ruleModalOpen,
    setRuleModalOpen,
    newConditions,
    methodNames,
    setMethodNames,
    matchCount,
    matchedResponses,
    showMatchesModal,
    setShowMatchesModal,
    addCondition,
    removeCondition,
    updateCondition,
    openRuleModal,
    saveRule,
    clearMatches,
  };
};
