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
  };

  // Rules evaluation effect
  useEffect(() => {
    if (!httpRows.length || !rules.length) return;
    const latest = httpRows[httpRows.length - 1];
    rules.forEach((r) => {
      if (deepEvaluateRule(r, latest)) {
        toast.success(`Rule matched for ${latest.method || "Call"}`);
        setMatchCount((c) => c + 1);
        setMatchedResponses((prev) => [...prev, latest]);
      }
    });
  }, [httpRows, rules]);

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
  };
};
