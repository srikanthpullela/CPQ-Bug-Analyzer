import { useState, useEffect } from "react";
import { toast } from "react-hot-toast";
import { deepEvaluateRule } from "../utils/RulesHelper";

export const useRules = (httpRows: any[]) => {
  const [rules, setRules] = useState([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [newConditions, setNewConditions] = useState([
    { fieldPath: "", operator: "===", value: "" },
  ]);
  const [methodNames, setMethodNames] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchedResponses, setMatchedResponses] = useState([]);
  const [showMatchesModal, setShowMatchesModal] = useState(false);
  const [processedRequestIds, setProcessedRequestIds] = useState(new Set());

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
    setProcessedRequestIds(new Set());
    setMatchedResponses([]);
    setMatchCount(0);
  };

  const clearMatches = () => {
    setMatchedResponses([]);
    setMatchCount(0);
    setProcessedRequestIds(new Set());
  };

  // Clear matches when httpRows is empty (logs cleared)
  useEffect(() => {
    if (httpRows.length === 0) {
      setMatchedResponses([]);
      setMatchCount(0);
      setProcessedRequestIds(new Set());
    }
  }, [httpRows.length]);

  // Rules evaluation effect - only check response payload and prevent duplicates
  useEffect(() => {
    if (!httpRows.length || !rules.length) return;
    
    const latest = httpRows[httpRows.length - 1];
    
    // Skip if we've already processed this request (prevent duplicates)
    if (!latest.id || processedRequestIds.has(latest.id)) {
      return;
    }
    
    // Only evaluate rules on response payload, not request
    if (!latest.responsePayload) {
      return;
    }
    
    rules.forEach((rule) => {
      // Create a context object with only response data for rule evaluation
      const responseContext = {
        responsePayload: latest.responsePayload,
        method: latest.method,
        status: latest.status,
        endpoint: latest.endpoint,
        displayName: latest.displayName
      };
      
      if (deepEvaluateRule(rule, responseContext)) {
        toast.success(`Rule matched for ${latest.method || "Call"}`);
        setMatchCount((c) => c + 1);
        setMatchedResponses((prev) => [...prev, {
          method: latest.method || "Unknown Method",
          displayName: latest.displayName || latest.method || "Unknown",
          responsePayload: latest.responsePayload,
          status: latest.status,
          endpoint: latest.endpoint,
          timestamp: latest.timestamp,
          id: latest.id
        }]);
        
        // Mark this request as processed
        setProcessedRequestIds((prev) => new Set([...prev, latest.id]));
      }
    });
  }, [httpRows, rules, processedRequestIds]);

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
