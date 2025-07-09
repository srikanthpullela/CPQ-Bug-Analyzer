"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { X, RotateCcw, AlertCircle, Send, Moon, Sun, BarChart2, Search, Trash2, Zap, BellRing } from "lucide-react";
import { useFieldHistory } from "../hooks/useFieldHistory";
import { DetailPanel } from "./components/DetailPanel";
import { HttpTableTab } from "./components/HttpTableTab";
import { SearchInput } from "./components/SearchInput";
import { WsTable } from "./components/WsTable";
import "../style.css";
import "./Sfdc.css";
import { useLiveHar } from "../hooks/useHarTab";
import { safeCopyToClipboard } from "../utils/clipboard";
import { HistoryModalTab } from "./components/HistoryModalTab";
import HarQueryComponent from "./HarQueryComponent";
import { toast, Toaster } from "react-hot-toast";
import { deepEvaluateRule } from "../utils/RulesHelper";

const HarMethodsTabPage: React.FC = () => {
  const { httpRows, wsRows, wsBaseUrl } = useLiveHar();
  const { buildHistory } = useFieldHistory(httpRows, wsRows);
  const [searchTerm, setSearchTerm] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState("");
  const [panelData, setPanelData] = useState<any>(null);
  const [viewTree, setViewTree] = useState(true);
  const [fieldName, setFieldName] = useState("");
  const [historyTree, setHistoryTree] = useState<any[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [queryModalOpen, setQueryModalOpen] = useState(false);
  const [editPayload, setEditPayload] = useState<any>(null);
  const [originalPayload, setOriginalPayload] = useState<any>(null);
  const [editMethod, setEditMethod] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Rules evaluation
  const [rules, setRules] = useState([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [newConditions, setNewConditions] = useState([
    { fieldPath: "", operator: "===", value: "" },
  ]);
  const [methodNames, setMethodNames] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [matchedResponses, setMatchedResponses] = useState([]);
  const [showMatchesModal, setShowMatchesModal] = useState(false);

  // Add missing state for edit modal
  const [jsonValue, setJsonValue] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("har-analyzer-dark-mode");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });

  // Rules evaluation effect
  const addCondition = () =>
    setNewConditions([
      ...newConditions,
      { fieldPath: "", operator: "===", value: "" },
    ]);
  const updateCondition = (i, field, val) => {
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
  }, [httpRows]);

  // Dark mode effect
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "har-analyzer-dark-mode",
        JSON.stringify(isDarkMode)
      );
      if (isDarkMode) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data.source === "HAR_EXTRACTOR" && e.data?.type === "HAR_SET_ORIGIN") {
        console.log("[React] Origin received:", e.data.origin);
        setOrigin(e.data.origin);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Update jsonValue when editPayload changes
  useEffect(() => {
    if (editPayload) {
      setJsonValue(JSON.stringify(editPayload, null, 2));
      setJsonError(null);
    }
  }, [editPayload]);

  const requestHarReload = () => {
    window.postMessage(
      { source: "HAR_EXTRACTOR", type: "REQUEST_HAR_RELOAD" },
      "*"
    );
  };

  const requestClearLogs = () => {
    console.log("[HarMethodsTabPage] Requesting to clear logs via devtools.ts");
    window.postMessage(
      {
        source: "HAR_EXTRACTOR",
        type: "CLEAR_LOGS",
      },
      "*"
    );
  };

  const openPanel = (title: string, data: any) => {
    const isRequest = title?.toLowerCase().includes("request");
    setPanelTitle(title);
    setPanelData(data);
    setPanelOpen(true);
    if (isRequest) {
      setEditPayload(data);
      setEditMethod(title.replace(" ▶ Request", ""));
      // setEditModalOpen(true);
    }
  };

  const handleEditRequest = (payload: any, method: string) => {
    setEditPayload(payload);
    setOriginalPayload(payload);
    setEditMethod(method);
    setEditModalOpen(true);
  };

  // Add missing functions for edit modal
  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    try {
      const parsed = JSON.parse(value);
      setEditPayload(parsed);
      setJsonError(null);
    } catch (error) {
      setJsonError("Invalid JSON format");
    }
  };

  const resetToOriginal = () => {
    if (originalPayload) {
      const originalJson = JSON.stringify(originalPayload, null, 2);
      setJsonValue(originalJson);
      setEditPayload(originalPayload);
      setJsonError(null);
    }
  };

  const handleSendRequest = () => {
    if (jsonError) return;

    window.postMessage(
      {
        source: "HAR_EXTRACTOR",
        type: "HAR_RETRIGGER",
        url: origin ? `${origin}/apexremote` : "",
        payload: editPayload,
      },
      "*"
    );
    setEditModalOpen(false);
  };

  const showHistory = () => {
    setHistoryTree(buildHistory(fieldName));
    setHistoryModalOpen(true);
  };

  function extractUniqueKeys(rows: any[]): string[] {
    const keySet = new Set<string>();
    rows.forEach((row) => {
      if (row && typeof row === "object") {
        const traverse = (obj: any, prefix = "") => {
          Object.entries(obj || {}).forEach(([key, value]) => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            keySet.add(fullKey);
            if (
              typeof value === "object" &&
              value !== null &&
              !Array.isArray(value)
            ) {
              traverse(value, fullKey);
            }
          });
        };
        traverse(row);
      }
    });
    return Array.from(keySet).sort();
  }

  const extractedKeys = useMemo(() => {
    return extractUniqueKeys([...httpRows, ...wsRows]);
  }, [httpRows, wsRows]);

  useEffect(() => {
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const onMessage = (event: MessageEvent) => {
    if (event.data?.source !== "HAR_EXTRACTOR") return;
    const { type } = event.data;
    if (type === "CLEAR") {
      setPanelOpen(false);
      setPanelData(null);
      setPanelTitle("");
      console.warn(
        "CLEAR received but httpRows/wsRows can't be cleared directly!"
      );
    }
  };

  const totalRequests = httpRows.length + wsRows.length;
  const filteredHttpCount = httpRows.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(searchTerm.toLowerCase())
  ).length;
  const filteredWsCount = wsRows.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(searchTerm.toLowerCase())
  ).length;

  return (
    <div
      className={`flex h-screen Har-tab-container transition-colors duration-200 ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <div
        className={`w-3/5 p-2 space-y-2 overflow-auto transition-colors duration-200 ${
          isDarkMode ? "border-gray-700" : "border-gray-200"
        } border-r`}
      >
        {/* Header Section */}
        <div
          className={`rounded-lg shadow-sm border p-3 transition-colors duration-200 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <h2
                className={`text-lg font-semibold transition-colors duration-200 ${
                  isDarkMode ? "text-gray-100" : "text-gray-800"
                }`}
              >
                Network Activity Monitor
              </h2>
              <div className="flex items-center gap-3 text-sm">
                <span
                  className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-200 ${
                    isDarkMode
                      ? "bg-blue-900 text-blue-200"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  Total: {totalRequests}
                </span>
                <span
                  className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-200 ${
                    isDarkMode
                      ? "bg-green-900 text-green-200"
                      : "bg-green-100 text-green-800"
                  }`}
                >
                  HTTP: {httpRows.length}
                </span>
                <span
                  className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-200 ${
                    isDarkMode
                      ? "bg-purple-900 text-purple-200"
                      : "bg-purple-100 text-purple-800"
                  }`}
                >
                  WS: {wsRows.length}
                </span>
                {searchTerm && (
                  <span
                    className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-200 ${
                      isDarkMode
                        ? "bg-orange-900 text-orange-200"
                        : "bg-orange-100 text-orange-800"
                    }`}
                  >
                    Filtered: {filteredHttpCount + filteredWsCount}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleDarkMode}
                className={`p-2 rounded-md transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600 text-yellow-400"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                }`}
                title={
                  isDarkMode ? "Switch to light mode" : "Switch to dark mode"
                }
              >
                {isDarkMode ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>

              <button
                className={`p-2 rounded-md transition-colors ${
                  isDarkMode
                    ? "bg-blue-700 hover:bg-blue-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
                onClick={requestHarReload}
                title="Reload network logs"
              >
                <RotateCcw className="h-4 w-4" />
              </button>

              <button
                className={`p-2 rounded-md transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-gray-600 hover:bg-gray-700 text-white"
                }`}
                onClick={() => setHistoryModalOpen(true)}
                title="Track field changes over time"
              >
                <BarChart2 className="h-4 w-4" />
              </button>

              <button
                className={`p-2 rounded-md transition-colors ${
                  isDarkMode
                    ? "bg-green-700 hover:bg-green-600 text-white"
                    : "bg-green-600 hover:bg-green-700 text-white"
                }`}
                onClick={() => setQueryModalOpen(true)}
                title="Query Search for payload or response"
              >
                <Search className="h-4 w-4" />
              </button>

              <button
                className={`p-2 rounded-md transition-colors ${
                  isDarkMode
                    ? "bg-red-700 hover:bg-red-600 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }`}
                onClick={requestClearLogs}
                title="Clear all logs"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <button
                className={`p-2 rounded-md transition-colors ${
                  isDarkMode
                    ? "bg-yellow-700 hover:bg-yellow-600 text-black"
                    : "bg-yellow-500 hover:bg-yellow-400 text-black"
                }`}
                onClick={openRuleModal}
                title={rules.length ? "Update Rule" : "Add Rule"}
              >
                <Zap className="h-4 w-4" />
              </button>

              <button
                className={`p-2 rounded-md transition-colors flex ${
                  isDarkMode
                    ? "bg-red-700 hover:bg-red-600 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                }`}
                onClick={() => setShowMatchesModal(true)}
                title="View rule matches"
              >
                <BellRing className="h-4 w-4" />
                <span className="ml-1 text-xs">{matchCount}</span>
              </button>
            </div>
          </div>
          <div
            className={`relative transition-colors duration-200 ${
              isDarkMode ? "search-input-dark" : "search-input-light"
            }`}
          >
            <div
              className={`absolute inset-0 rounded-lg pointer-events-none transition-all duration-200`}
            ></div>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="🔍 Search requests, responses, headers, or any field value..."
            />
          </div>
          {wsBaseUrl && (
            <div
              className={`mt-2 p-2 border rounded-md transition-colors duration-200 ${
                isDarkMode
                  ? "bg-green-900/20 border-green-700"
                  : "bg-green-50 border-green-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span
                  className={`text-xs font-medium transition-colors duration-200 ${
                    isDarkMode ? "text-green-300" : "text-green-800"
                  }`}
                >
                  WebSocket Connected:
                </span>
                <code
                  className={`text-xs px-1 py-0.5 rounded font-mono transition-colors duration-200 ${
                    isDarkMode
                      ? "text-green-200 bg-green-800/30"
                      : "text-green-700 bg-green-100"
                  }`}
                >
                  {wsBaseUrl}
                </code>
              </div>
            </div>
          )}
        </div>
        <Toaster position="top-right" />

        {/* Tables Section */}
        <div className="space-y-3">
          {httpRows.length > 0 && (
            <div
              className={`rounded-lg shadow-sm border transition-colors duration-200 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <div
                className={`px-3 py-2 border-b rounded-t-lg transition-colors duration-200 ${
                  isDarkMode
                    ? "bg-gray-700 border-gray-600"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3
                    className={`font-semibold flex items-center gap-2 transition-colors duration-200 ${
                      isDarkMode ? "text-gray-100" : "text-gray-800"
                    }`}
                  >
                    <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                    HTTP Requests
                  </h3>
                  <span
                    className={`text-sm transition-colors duration-200 ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {searchTerm
                      ? `${filteredHttpCount} of ${httpRows.length}`
                      : httpRows.length}{" "}
                    requests
                  </span>
                </div>
              </div>
              <div className="p-2">
                <HttpTableTab
                  rows={httpRows}
                  filter={searchTerm}
                  onView={openPanel}
                />
              </div>
            </div>
          )}

          {wsRows.length > 0 && (
            <div
              className={`rounded-lg shadow-sm border transition-colors duration-200 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <div
                className={`px-3 py-2 border-b rounded-t-lg transition-colors duration-200 ${
                  isDarkMode
                    ? "bg-gray-700 border-gray-600"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3
                    className={`font-semibold flex items-center gap-2 transition-colors duration-200 ${
                      isDarkMode ? "text-gray-100" : "text-gray-800"
                    }`}
                  >
                    <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                    WebSocket Messages
                  </h3>
                  <span
                    className={`text-sm transition-colors duration-200 ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {searchTerm
                      ? `${filteredWsCount} of ${wsRows.length}`
                      : wsRows.length}{" "}
                    messages
                  </span>
                </div>
              </div>
              <div className="p-2">
                <WsTable
                  rows={wsRows}
                  baseUrl={wsBaseUrl}
                  filter={searchTerm}
                  onView={openPanel}
                />
              </div>
            </div>
          )}

          {totalRequests === 0 && (
            <div
              className={`rounded-lg shadow-sm border p-8 text-center transition-colors duration-200 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <div
                className={`mb-2 transition-colors duration-200 ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                <svg
                  className="w-12 h-12 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3
                className={`text-lg font-medium mb-1 transition-colors duration-200 ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}
              >
                No Network Activity
              </h3>
              <p
                className={`text-sm mb-4 transition-colors duration-200 ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                Start browsing or interacting with the application to see
                network requests
              </p>
              <button
                className={`px-4 py-2 rounded-md transition-colors text-sm font-medium ${
                  isDarkMode
                    ? "bg-blue-700 text-white hover:bg-blue-600"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
                onClick={requestHarReload}
              >
                Reload to Check for Activity
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div
        className={`w-2/5 border-l transition-colors duration-200 ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <DetailPanel
          open={panelOpen}
          title={panelTitle}
          data={panelData}
          viewTree={viewTree}
          onCopy={() => safeCopyToClipboard(JSON.stringify(panelData, null, 2))}
          onClose={() => setPanelOpen(false)}
          onToggleView={setViewTree}
          origin={origin}
          onEditRequest={handleEditRequest}
        />
      </div>

      {/* History Modal */}
      <HistoryModalTab
        open={historyModalOpen}
        fieldName={fieldName}
        history={historyTree}
        onSearch={showHistory}
        onClose={() => setHistoryModalOpen(false)}
        onChangeField={setFieldName}
        allFields={extractedKeys}
        origin={origin}
      />

      {queryModalOpen && (
        <div
          className={`fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 transition-colors ${
            isDarkMode ? "bg-black/70" : "bg-black/50"
          }`}
          onClick={() => setQueryModalOpen(false)}
        >
          <div
            className={`rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300 transition-colors ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <HarQueryComponent
              httpRows={httpRows}
              wsRows={wsRows}
              onClose={() => setQueryModalOpen(false)}
            />
          </div>
        </div>
      )}

      {ruleModalOpen && (
        <div className="query-modal-container fixed inset-0 bg-black z-40 bg-opacity-30 backdrop-blur-sm flex items-center justify-center">
          <div className="query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out bg-white p-4">
            <h2 className="text-lg font-bold">Add Rule</h2>
            {newConditions.map((c, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  className="flex-1 border px-2 py-1"
                  placeholder="Field Path"
                  value={c.fieldPath}
                  onChange={(e) =>
                    updateCondition(idx, "fieldPath", e.target.value)
                  }
                />
                <select
                  value={c.operator}
                  onChange={(e) =>
                    updateCondition(idx, "operator", e.target.value)
                  }
                  className="border px-2 py-1"
                >
                  <option value="===">===</option>
                  <option value="!==">!==</option>
                </select>
                <input
                  className="flex-1 border px-2 py-1"
                  placeholder="Value"
                  value={c.value}
                  onChange={(e) =>
                    updateCondition(idx, "value", e.target.value)
                  }
                />
              </div>
            ))}
            <button
              className="text-sm text-blue-600 mt-4"
              onClick={addCondition}
            >
              + Add Condition
            </button>
            <input
              className="w-full border px-2 py-1 mt-4"
              placeholder="Method Names (optional, comma-separated)"
              value={methodNames}
              onChange={(e) => setMethodNames(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="px-4 py-1 bg-gray-300"
                onClick={() => setRuleModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-1 bg-green-600 text-white"
                onClick={saveRule}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Matches Modal */}
      {showMatchesModal && (
        <div className="query-modal-container fixed inset-0 bg-black z-40 bg-opacity-30 backdrop-blur-sm flex items-center justify-center">
          <div className="query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out bg-white p-4">
            <h2 className="text-lg font-bold">
              Rule Matches ({matchedResponses.length})
            </h2>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {matchedResponses.map((r, i) => (
                <pre
                  key={i}
                  className="p-2 bg-gray-100 dark:bg-gray-700 text-sm overflow-x-auto"
                >
                  {JSON.stringify(r, null, 2)}
                </pre>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                className="px-4 py-1 bg-gray-300"
                onClick={() => setShowMatchesModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && (
        <div
          className={`query-modal-container fixed inset-0 bg-black z-40 bg-opacity-30 backdrop-blur-sm flex items-center justify-center ${
            isDarkMode ? "bg-black/70" : "bg-black/30"
          }`}
          onClick={() => setEditModalOpen(false)}
        >
          <div
            className={`query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out p-4 ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between p-6 border-b transition-colors duration-200 ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <h2
                  className={`text-xl font-semibold transition-colors duration-200 ${
                    isDarkMode ? "text-gray-100" : "text-gray-900"
                  }`}
                >
                  Edit & Re-trigger Request
                </h2>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-mono transition-colors duration-200 ${
                    isDarkMode
                      ? "bg-gray-700 text-gray-200"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {editMethod}
                </span>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <X
                  className={`h-5 w-5 transition-colors duration-200 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col gap-4 p-6 min-h-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3
                    className={`text-sm font-medium mb-1 transition-colors duration-200 ${
                      isDarkMode ? "text-gray-200" : "text-gray-700"
                    }`}
                  >
                    Request Payload
                  </h3>
                  <p
                    className={`text-xs transition-colors duration-200 ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    Edit the JSON payload below and re-trigger the request
                  </p>
                </div>
                <button
                  onClick={resetToOriginal}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                    isDarkMode
                      ? "text-gray-200 bg-gray-700 border-gray-600 hover:bg-gray-600"
                      : "text-gray-700 bg-white border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              </div>

              {/* Error Alert */}
              {jsonError && (
                <div
                  className={`flex items-center gap-2 p-3 border rounded-lg transition-colors duration-200 ${
                    isDarkMode
                      ? "bg-red-900/20 border-red-700"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <AlertCircle
                    className={`h-4 w-4 flex-shrink-0 transition-colors duration-200 ${
                      isDarkMode ? "text-red-400" : "text-red-600"
                    }`}
                  />
                  <span
                    className={`text-sm transition-colors duration-200 ${
                      isDarkMode ? "text-red-300" : "text-red-700"
                    }`}
                  >
                    {jsonError}
                  </span>
                </div>
              )}

              {/* JSON Textarea */}
              <div className="flex-1 min-h-0">
                <textarea
                  value={jsonValue}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  className={`w-full h-full min-h-[300px] p-3 font-mono text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    jsonError
                      ? isDarkMode
                        ? "border-red-600 focus:border-red-500 focus:ring-red-500 bg-gray-900 text-gray-100"
                        : "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : isDarkMode
                      ? "border-gray-600 bg-gray-900 text-gray-100 focus:border-blue-500"
                      : "border-gray-300 bg-white text-gray-900"
                  }`}
                  placeholder="Enter JSON payload..."
                />
              </div>

              {/* Footer */}
              <div
                className={`flex items-center justify-between pt-4 border-t transition-colors duration-200 ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <div
                  className={`text-xs transition-colors duration-200 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {origin && (
                    <span>
                      Target:{" "}
                      <code
                        className={`px-1.5 py-0.5 rounded text-xs font-mono transition-colors duration-200 ${
                          isDarkMode
                            ? "bg-gray-700 text-gray-200"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {origin}/apexremote
                      </code>
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEditModalOpen(false)}
                    className={`px-4 py-2 text-sm font-medium border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                      isDarkMode
                        ? "text-gray-200 bg-gray-700 border-gray-600 hover:bg-gray-600"
                        : "text-gray-700 bg-white border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendRequest}
                    disabled={!!jsonError}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                      isDarkMode
                        ? "bg-blue-700 hover:bg-blue-600"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    <Send className="h-4 w-4" />
                    Send Request
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .search-input-light {
          position: relative;
        }
        .search-input-light::before {
          content: "";
          position: absolute;
          inset: -2px;
          background: linear-gradient(45deg, #3b82f6, #06b6d4, #3b82f6);
          border-radius: 8px;
          opacity: 0.1;
          z-index: -1;
        }
        .search-input-dark {
          position: relative;
        }
        .search-input-dark::before {
          content: "";
          position: absolute;
          inset: -2px;
          background: linear-gradient(45deg, #60a5fa, #22d3ee, #60a5fa);
          border-radius: 8px;
          opacity: 0.2;
          z-index: -1;
        }
      `}</style>
    </div>
  );
};

export default HarMethodsTabPage;
