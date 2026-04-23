"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const { httpRows, wsRows, wsBaseUrl, isLoading } = useLiveHar();
  const { buildHistory } = useFieldHistory(httpRows, wsRows);
  const [searchTerm, setSearchTerm] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState("");
  const [panelData, setPanelData] = useState<any>(null);
  const [fieldName, setFieldName] = useState("");
  const [historyTree, setHistoryTree] = useState<any[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [queryModalOpen, setQueryModalOpen] = useState(false);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [urlPatternSettingsOpen, setUrlPatternSettingsOpen] = useState(false);
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);

  // Auto-scroll state
  const [autoScroll, setAutoScroll] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  function extractKeyCounts(rows: any[]): [string, number][] {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      if (row && typeof row === "object") {
        const traverse = (obj: any) => {
          if (typeof obj !== "object" || obj === null) return;
          for (const [key, value] of Object.entries(obj)) {
            if (typeof key === "string" && key.length > 1 && isNaN(Number(key))) {
              counts.set(key, (counts.get(key) || 0) + 1);
            }
            if (typeof value === "object") traverse(value);
          }
        };
        traverse(row);
      }
    });
    return Array.from(counts.entries()).sort();
  }

  const extractedKeys = useMemo(() => {
    return extractKeyCounts([...httpRows, ...wsRows]);
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
    setPanelTitle(title);
    setPanelData(data);
    setPanelOpen(true);
    if (data?._rowType === "http" && data?.requestPayload) {
      editModalHook.setEditPayload(data.requestPayload);
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

  // Arrow-key navigation: move selection up/down between filtered rows and
  // load the corresponding data into the detail panel.
  const filteredHttpRows = useMemo(
    () => httpRows.filter(filterFunction),
    [httpRows, searchTerm]
  );
  const filteredWsRows = useMemo(
    () => wsRows.filter(filterFunction),
    [wsRows, searchTerm]
  );

  useEffect(() => {
    if (!panelOpen || !selectedRowKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      // Don't hijack arrow keys while the user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      const [type, indexStr] = selectedRowKey.split("-");
      const index = parseInt(indexStr, 10);
      if (isNaN(index)) return;

      const list = type === "http" ? filteredHttpRows : filteredWsRows;
      if (list.length === 0) return;

      const delta = e.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(list.length - 1, index + delta));
      if (nextIndex === index) return;

      e.preventDefault();
      const nextRow = list[nextIndex];
      if (!nextRow) return;

      if (type === "http") {
        const r: any = nextRow;
        const isHttpLike = r.patternType === "http" || r.patternType === "generic";
        const title = isHttpLike ? r.endpoint || r.method : r.method;
        handleView(`http-${nextIndex}`, title, {
          _rowType: "http",
          method: r.method,
          time: r.time,
          status: r.status,
          patternType: r.patternType,
          httpMethod: r.httpMethod,
          endpoint: r.endpoint,
          urlPattern: r.urlPattern,
          displayName: r.displayName,
          hasMessages: r.hasMessages,
          startTime: r.startTime,
          endTime: r.endTime,
          requestPayload: r.requestPayload,
          responsePayload: r.responsePayload,
          headers: r.headers,
        });
      } else {
        const r: any = nextRow;
        handleView(`ws-${nextIndex}`, r.endpoint || r.action || "WebSocket", {
          _rowType: "ws",
          endpoint: r.endpoint,
          action: r.action,
          payload: r.payload,
          status: r.status,
          direction: r.direction,
          time: r.time,
          timestamp: r.timestamp,
          duration: r.duration,
          headers: r.headers,
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelOpen, selectedRowKey, filteredHttpRows, filteredWsRows]);

  // Scroll the selected row into view whenever the selection changes.
  useEffect(() => {
    if (!selectedRowKey) return;
    const el = document.querySelector(`[data-row-key="${selectedRowKey}"]`);
    if (el && typeof (el as any).scrollIntoView === "function") {
      (el as any).scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedRowKey]);

  // Auto-scroll to bottom when new rows arrive
  useEffect(() => {
    if (!autoScroll || !scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [autoScroll, httpRows.length, wsRows.length]);

  return (
    <div
      className={`h-screen Har-tab-container transition-colors duration-200 ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <ResizablePanels
        isDarkMode={isDarkMode}
        defaultLeftWidth={panelOpen ? 40 : 100}
        minLeftWidth={20}
        maxLeftWidth={80}
        showRightPanel={panelOpen}
        leftPanel={
          <div className="h-full flex flex-col">
            {/* Sticky Header Section */}
            <div className="sticky top-0 z-10 bg-inherit">
              <div className="p-1 space-y-1">
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
            <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
              <div className="p-1 space-y-1 pb-4">
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
                  isLoading={isLoading}
                  panelOpen={panelOpen}
                  autoScroll={autoScroll}
                  onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
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
            onCopy={() =>
              safeCopyToClipboard(JSON.stringify(panelData, null, 2))
            }
            onClose={() => {
              setPanelOpen(false);
              setSelectedRowKey(null);
            }}
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
