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

        // For each condition, count individual field occurrences
        rule.conditions.forEach((condition: any) => {
          if (!condition.fieldPath || condition.value === '') return;

          console.log(`[DEBUG] Searching for field: ${condition.fieldPath} = ${condition.value} in`, rowId);
          
          const fieldOccurrences = findFieldOccurrences(
            payloadToCheck,
            condition.fieldPath,
            condition.value
          );

          console.log(`[DEBUG] Found ${fieldOccurrences.length} occurrences of ${condition.fieldPath}=${condition.value}`);

          // Each occurrence gets its own match entry
          fieldOccurrences.forEach((occurrence, index) => {
            const matchId = `${row.id || timestamp}-${condition.fieldPath}-${index}`;
            newMatches.push({
              ...row,
              id: matchId,
              timestamp: timestamp,
              matchedField: condition.fieldPath,
              matchedValue: condition.value,
              occurrencePath: occurrence,
              occurrenceIndex: index + 1,
              totalOccurrences: fieldOccurrences.length,
              // Ensure we have the right payload for display
              responsePayload: payloadToCheck,
              method: method,
              type: row.rowType,
            });
          });
        });
      });

      // Mark as processed regardless of matches
      newProcessedItems.add(rowId);
    });

    // Update processed items
    setProcessedItems(newProcessedItems);

    console.log(`[DEBUG] Found ${newMatches.length} new matches`);

    // Process new matches
    if (newMatches.length > 0) {
      // Filter out duplicates based on match ID
      const existingIds = new Set(matchedResponses.map((item) => item.id));
      const uniqueNewMatches = newMatches.filter((match) => !existingIds.has(match.id));

      console.log(`[DEBUG] Unique new matches: ${uniqueNewMatches.length}`);

      if (uniqueNewMatches.length > 0) {
        // Show individual toast notifications for each field occurrence
        uniqueNewMatches.forEach((match, index) => {
          const methodDisplay = match.method || 'Unknown';
          const typePrefix = match.type === 'ws' ? 'WS' : 'HTTP';
          
          const message = match.totalOccurrences > 1
            ? `Rule matched: ${typePrefix} ${methodDisplay} (${match.matchedField}=${match.matchedValue}, occurrence ${match.occurrenceIndex}/${match.totalOccurrences})`
            : `Rule matched: ${typePrefix} ${methodDisplay} (${match.matchedField}=${match.matchedValue})`;

          console.log(`[DEBUG] Showing toast ${index + 1}:`, message);

          // Add a small delay between toasts to make them more visible
          setTimeout(() => {
            toast.success(message, {
              duration: 4000,
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
    updateCondition,
    openRuleModal,
    saveRule,
    clearMatches,
  };
};
