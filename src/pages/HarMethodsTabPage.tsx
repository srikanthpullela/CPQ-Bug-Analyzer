"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useFieldHistory } from "../hooks/useFieldHistory";
import { DetailPanel } from "./components/DetailPanel";
import { HeaderSection } from "./components/HeaderSection";
import { NetworkTables } from "./components/NetworkTables";
import { EditModal } from "./components/EditModal";
import { RuleModal } from "./components/RuleModal";
import { MatchesModal } from "./components/MatchesModal";
import { ResizablePanels } from "./components/ResizablePanels";
import { UrlPatternSettings } from "./components/UrlPatternSettings";
import "../style.css";
import "./Sfdc.css";
import { useLiveHar } from "../hooks/useHarTab";
import { safeCopyToClipboard } from "../utils/clipboard";
import { HistoryModalTab } from "./components/HistoryModalTab";
import HarQueryComponent from "./HarQueryComponent";
import { toast, Toaster } from "react-hot-toast";
import { useRules } from "../hooks/useRules";
import { useEditModal } from "../hooks/useEditModal";
import { ClearLogsConfirmationModal } from "./components/ClearLogsConfirmationModal";

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
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [urlPatternSettingsOpen, setUrlPatternSettingsOpen] = useState(false);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("har-analyzer-dark-mode");
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });

  // Custom hooks - restore both rules and edit modal hooks
  const rulesHook = useRules(httpRows, wsRows);
  const editModalHook = useEditModal(origin);

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

  const showHistory = () => {
    setHistoryTree(buildHistory(fieldName));
    setHistoryModalOpen(true);
  };

  useEffect(() => {
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [rulesHook]);

  const onMessage = (event: MessageEvent) => {
    if (event.data?.source !== "HAR_EXTRACTOR") return;
    const { type } = event.data;
    if (type === "CLEAR") {
      setPanelOpen(false);
      setPanelData(null);
      setPanelTitle("");
      setSelectedRowKey(null);
      // Also clear rule matches when logs are cleared
      rulesHook.clearMatches();
    }
  };

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
        setOrigin(e.data.origin);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const requestHarReload = () => {
    window.postMessage(
      { source: "HAR_EXTRACTOR", type: "REQUEST_HAR_RELOAD" },
      "*"
    );
  };

  const requestClearLogs = () => {
    setShowClearConfirmation(true);
  };

  const confirmClearLogs = () => {
    window.postMessage(
      {
        source: "HAR_EXTRACTOR",
        type: "CLEAR_LOGS",
      },
      "*"
    );
    setShowClearConfirmation(false);
    
    // Show success toast
    toast.success("Network logs cleared successfully", {
      duration: 3000,
      position: 'top-right',
    });
  };

  const openPanel = (title: string, data: any) => {
    const isRequest = title?.toLowerCase().includes("request");
    setPanelTitle(title);
    setPanelData(data);
    setPanelOpen(true);
    if (isRequest) {
      editModalHook.setEditPayload(data);
    }
  };

  const handleView = (rowKey: string, title: string, data: any) => {
    const [type, indexStr] = rowKey.split("-");
    if (type !== "http" && type !== "ws") return;
    const index = parseInt(indexStr, 10);
    if (isNaN(index)) return;
    openPanel(title, data);
    setSelectedRowKey(rowKey);
  };

  const totalRequests = httpRows.length + wsRows.length;
  
  // Create a utility function for consistent filtering
  const createFilterFunction = (searchTerm: string) => {
    if (!searchTerm.trim()) return () => true;
    
    const term = searchTerm.toLowerCase();
    
    return (row: any) => {
      const safeStringify = (obj: any) => {
        try {
          return JSON.stringify(obj || {});
        } catch {
          return String(obj || '');
        }
      };

      // For HTTP rows
      if ('requestPayload' in row) {
        const combined = `${row.time || ''} ${row.method || ''} ${safeStringify(
          row.requestPayload
        )} ${safeStringify(row.responsePayload)} ${safeStringify(
          row.requestHeaders || []
        )} ${safeStringify(row.responseHeaders || [])} ${safeStringify(
          row.headers || {}
        )} ${row.url || ''} ${row.httpMethod || ''} ${row.endpoint || ''} ${row.displayName || ''}`;
        
        return combined.toLowerCase().includes(term);
      }
      
      // For WS rows
      if ('endpoint' in row) {
        const combined = `${row.time || ''} ${row.endpoint || ''} ${row.action || ''} ${safeStringify(
          row.payload
        )} ${row.status || ''} ${row.direction || ''} ${row.id || ''} ${safeStringify(
          row.headers || {}
        )} ${safeStringify(row.connectionHeaders || [])} ${safeStringify(
          row.responseHeaders || [])}`;
        
        return combined.toLowerCase().includes(term);
      }
      
      return false;
    };
  };

  const filterFunction = createFilterFunction(searchTerm);
  const filteredHttpCount = httpRows.filter(filterFunction).length;
  const filteredWsCount = wsRows.filter(filterFunction).length;

  return (
    <div
      className={`h-screen Har-tab-container transition-colors duration-200 ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <ResizablePanels
        isDarkMode={isDarkMode}
        defaultLeftWidth={60}
        minLeftWidth={25}
        maxLeftWidth={75}
        leftPanel={
          <div className="h-full flex flex-col">
            {/* Sticky Header Section */}
            <div className="sticky top-0 z-10 bg-inherit border-b border-gray-200 dark:border-gray-700">
              <div className="p-2 space-y-2">
                <HeaderSection
                  isDarkMode={isDarkMode}
                  totalRequests={totalRequests}
                  httpRowsLength={httpRows.length}
                  wsRowsLength={wsRows.length}
                  searchTerm={searchTerm}
                  filteredHttpCount={filteredHttpCount}
                  filteredWsCount={filteredWsCount}
                  matchCount={rulesHook.matchCount}
                  rules={rulesHook.rules}
                  toggleDarkMode={toggleDarkMode}
                  requestHarReload={requestHarReload}
                  setHistoryModalOpen={setHistoryModalOpen}
                  setQueryModalOpen={setQueryModalOpen}
                  requestClearLogs={requestClearLogs}
                  openRuleModal={rulesHook.openRuleModal}
                  setShowMatchesModal={rulesHook.setShowMatchesModal}
                  setSearchTerm={setSearchTerm}
                  openUrlPatternSettings={() => setUrlPatternSettingsOpen(true)}
                />
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-auto">
              <div className="p-2 space-y-2 pb-8">
                <Toaster position="top-right" />

                {/* Tables Section */}
                <NetworkTables
                  httpRows={httpRows}
                  wsRows={wsRows}
                  wsBaseUrl={wsBaseUrl}
                  searchTerm={searchTerm}
                  selectedRowKey={selectedRowKey}
                  isDarkMode={isDarkMode}
                  requestHarReload={requestHarReload}
                  onView={handleView}
                />
              </div>
            </div>
          </div>
        }
        rightPanel={
          <DetailPanel
            open={panelOpen}
            title={panelTitle}
            data={panelData}
            viewTree={viewTree}
            onCopy={() =>
              safeCopyToClipboard(JSON.stringify(panelData, null, 2))
            }
            onClose={() => {
              setPanelOpen(false);
              setSelectedRowKey(null);
            }}
            onToggleView={setViewTree}
            origin={origin}
            onEditRequest={editModalHook.handleEditRequest}
            isDarkMode={isDarkMode}
          />
        }
      />

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
        isDarkMode={isDarkMode}
      />

      {/* Query Modal */}
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
              isDarkMode={isDarkMode}
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <EditModal
        open={editModalHook.editModalOpen}
        editMethod={editModalHook.editMethod}
        jsonValue={editModalHook.jsonValue}
        jsonError={editModalHook.jsonError}
        origin={origin}
        isDarkMode={isDarkMode}
        onClose={() => editModalHook.setEditModalOpen(false)}
        onJsonChange={editModalHook.handleJsonChange}
        onResetToOriginal={editModalHook.resetToOriginal}
        onSendRequest={editModalHook.handleSendRequest}
      />

      {/* Rule Modal */}
      <RuleModal
        open={rulesHook.ruleModalOpen}
        newConditions={rulesHook.newConditions}
        methodNames={rulesHook.methodNames}
        onClose={() => rulesHook.setRuleModalOpen(false)}
        onAddCondition={rulesHook.addCondition}
        onUpdateCondition={rulesHook.updateCondition}
        onRemoveCondition={rulesHook.removeCondition}
        onUpdateMethodNames={rulesHook.setMethodNames}
        onSave={rulesHook.saveRule}
        isDarkMode={isDarkMode}
      />

      {/* Matches Modal */}
      {rulesHook.showMatchesModal && rulesHook.matchedResponses.length > 0 && (
        <MatchesModal
          open={rulesHook.showMatchesModal}
          matchedResponses={rulesHook.matchedResponses}
          onClose={() => rulesHook.setShowMatchesModal(false)}
          onClearMatches={rulesHook.clearMatches}
          isDarkMode={isDarkMode}
        />
      )}

      {/* URL Pattern Settings Modal */}
      {urlPatternSettingsOpen && (
        <UrlPatternSettings
          isDarkMode={isDarkMode}
          onClose={() => setUrlPatternSettingsOpen(false)}
        />
      )}

      {/* Clear Logs Confirmation Modal */}
      <ClearLogsConfirmationModal
        open={showClearConfirmation}
        onClose={() => setShowClearConfirmation(false)}
        onConfirm={confirmClearLogs}
        isDarkMode={isDarkMode}
      />

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
