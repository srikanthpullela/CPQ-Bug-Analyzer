"use client";

import type React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { useHar } from "../hooks/useHar";
import { useFieldHistory } from "../hooks/useFieldHistory";
import { DetailPanel } from "./components/DetailPanel";
import { FileUploader } from "./components/FileUploader";
import { HistoryModal } from "./components/HistoryModal";
import { HttpTable } from "./components/HttpTable";
import { SearchInput } from "./components/SearchInput";
import { WsTable } from "./components/WsTable";
import { motion, AnimatePresence } from "framer-motion";
import { CSSTransition } from "react-transition-group";
import "../style.css";
import { UploadHistoryList } from "./components/UploadHistoryList";
import { Activity, History, Search, FileText, Zap } from "lucide-react";
import HarQueryComponent from "./HarQueryComponent";

interface HarEntry {
  startedDateTime?: string;
  request: {
    url: string;
    postData?: { text: string };
    headers?: { name: string; value: string }[];
  };
  response?: {
    status?: number;
    content?: { text: string };
    _webSocketMessages?: Array<{ type: string; data: string; time?: number }>;
  };
  messages?: Array<{ type: string; data: string; time?: number }>;
  _webSocketMessages?: Array<{ type: string; data: string; time?: number }>;
  [key: string]: any;
}

const HarMethodsPage: React.FC = () => {
  const { httpRows, wsRows, wsBaseUrl, parseAndPopulateTables } = useHar();
  const { buildHistory } = useFieldHistory(httpRows, wsRows);

  const [harText, setHarText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState("");
  const [panelData, setPanelData] = useState<any>(null);
  const [viewTree, setViewTree] = useState(true);
  const [isPageLoaded, setIsPageLoaded] = useState(false);

  const [fieldName, setFieldName] = useState("");
  const [historyTree, setHistoryTree] = useState<any[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [recentUploads, setRecentUploads] = useState<UploadEntry[]>([]);

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [queryModalOpen, setQueryModalOpen] = useState(false);

  const panelRef = useRef(null);

  useEffect(() => {
    setIsPageLoaded(true);
  }, []);

  interface HarJsonType {
    log: {
      entries: any[];
      [key: string]: any;
    };
    [key: string]: any;
  }

  interface UploadEntry {
    id: string;
    name: string;
    timestamp: number;
    data: HarJsonType;
  }

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

  function handleHistoryLoad(id: string) {
    const match = recentUploads.find((u) => u.id === id);
    if (match) {
      const animateLoad = async () => {
        setIsPageLoaded(false);
        await new Promise((resolve) => setTimeout(resolve, 200));
        const parsed = match.data;
        const entries = parsed?.log?.entries || [];
        parseAndPopulateTables(entries);
        setIsPageLoaded(true);
      };

      animateLoad();
    }
  }

  const handleParse = (text: string, name: string) => {
    setHarText(text);
    try {
      const har = JSON.parse(text);
      const entry: UploadEntry = {
        id: Date.now().toString(),
        name,
        timestamp: Date.now(),
        data: har,
      };
      setRecentUploads((prev) => {
        const isDuplicate = prev.some((item) => item.name === entry.name);
        return isDuplicate ? prev : [entry, ...prev];
      });

      setIsPageLoaded(false);
      setTimeout(() => {
        parseAndPopulateTables(har.log?.entries || []);
        setIsPageLoaded(true);
      }, 200);
    } catch (err) {
      console.warn("Invalid HAR format", err);
    }
  };

  const handleDownload = () => {
    if (!harText) return;
    try {
      const har = JSON.parse(harText);
      har.log.entries = har.log.entries.map((ent: HarEntry) => {
        // Handle HTTP apexremote
        if (ent.request?.url?.includes("apexremote")) {
          let methodName = "";
          if (ent.request.postData) {
            try {
              methodName = JSON.parse(ent.request.postData.text).method;
            } catch {}
          }
          const url = new URL(ent.request.url);
          url.searchParams.set("method", methodName);
          ent.request.url = url.toString();
        }

        // Handle WS _webSocketMessages at root level
        if (ent._webSocketMessages?.length) {
          ent._webSocketMessages = ent._webSocketMessages.map((msg) => {
            try {
              const parsed = JSON.parse(msg.data);
              if (parsed?.method) {
                msg.data = JSON.stringify({
                  ...parsed,
                  _extractedMethod: parsed.method,
                });
              }
            } catch {}
            return msg;
          });
        }

        // Handle WS _webSocketMessages inside response
        if (ent.response?._webSocketMessages?.length) {
          ent.response._webSocketMessages = ent.response._webSocketMessages.map(
            (msg) => {
              try {
                const parsed = JSON.parse(msg.data);
                if (parsed?.method) {
                  msg.data = JSON.stringify({
                    ...parsed,
                    _extractedMethod: parsed.method,
                  });
                }
              } catch {}
              return msg;
            }
          );
        }

        return ent;
      });

      const blob = new Blob([JSON.stringify(har, null, 2)], {
        type: "application/json",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "modified.har";
      a.click();
    } catch {
      alert("Unable to prepare download.");
    }
  };

  const openPanel = (title: string, data: any) => {
    console.log("Opening panel with title:", title);
    console.log(
      "Data passed to panel (data.responsePayload if applicable):",
      data
    );
    console.log("Type of data:", typeof data);
    if (typeof data === "object" && data !== null) {
      console.log("Is data empty object?", Object.keys(data).length === 0);
    }

    setPanelTitle(title);
    setPanelData(data);
    setPanelOpen(true);
    const key = `${title}_${Date.now()}`;
    setActiveRowKey(key);
  };

  const showHistory = () => {
    setHistoryTree(buildHistory(fieldName));
    setHistoryModalOpen(true);
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <AnimatePresence>
        <motion.div
          className="w-3/5 overflow-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: isPageLoaded ? 1 : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {/* Compact Navigation */}
          <nav className="bg-white border-b border-slate-200 px-4 py-2 flex-shrink-0 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 text-sm">
                <Link
                  to="/"
                  className="text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" />
                  Home
                </Link>
                <span className="text-slate-300">|</span>
                <Link
                  to="/formatter"
                  className="text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1"
                >
                  <Activity className="w-3 h-3" />
                  Formatter
                </Link>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                <Zap className="w-3 h-3" />
                HAR Analyzer
              </div>
            </div>
          </nav>

          {/* Compact Header */}
          <motion.div
            className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-200"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Activity className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  HTTP & WebSocket Extractor
                </h1>
                <p className="text-slate-600 text-sm">
                  Analyze network traffic from HAR files
                </p>
              </div>
            </div>
          </motion.div>

          {/* Compact Content Area */}
          <motion.div
            className="p-4 space-y-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {/* Upload History Section */}
            <motion.div
              className="bg-white rounded-lg border border-slate-200 p-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <div className="flex items-center gap-2 mb-2">
                <History className="w-4 h-4 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-800">
                  Recent Uploads
                </h3>
              </div>
              <UploadHistoryList
                uploads={recentUploads}
                onLoad={handleHistoryLoad}
              />
            </motion.div>

            {queryModalOpen && (
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
                onClick={() => setQueryModalOpen(false)}
              >
                <div
                  className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
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

            {/* <HarQueryComponent httpRows={httpRows} wsRows={wsRows} /> */}

            {/* File Upload Section */}
            <motion.div
              className="bg-white rounded-lg border border-slate-200 p-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
            >
              <FileUploader
                onParse={handleParse}
                onDownload={handleDownload}
                hasHar={!!harText}
              />
            </motion.div>

            {/* Search and Controls */}
            <motion.div
              className="bg-white rounded-lg border border-slate-200 p-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-2 top-1/2 pl-3 transform -translate-y-1/2 w-3 h-3 text-slate-400" />
                  <SearchInput
                    value={searchTerm}
                    onChange={setSearchTerm}
                    // className="pl-7 py-1.5 text-sm"
                  />
                </div>
                <motion.button
                  className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium rounded-lg hover:shadow-sm transition-all duration-200 flex items-center gap-1"
                  onClick={() => setHistoryModalOpen(true)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <History className="w-3 h-3" />
                  Track History
                </motion.button>
                <button
                  className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium rounded-lg hover:shadow-sm transition-all duration-200 flex items-center gap-1"
                  onClick={() => setQueryModalOpen(true)}
                >
                  Query Search
                </button>
              </div>
            </motion.div>

            {/* HTTP Table Section */}
            <motion.div
              className="bg-white rounded-lg border border-slate-200 overflow-hidden"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
            >
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                  HTTP Requests
                </h3>
              </div>
              <div className="p-3">
                <HttpTable
                  rows={httpRows}
                  filter={searchTerm}
                  onView={openPanel}
                />
              </div>
            </motion.div>

            {/* WebSocket Table Section */}
            <motion.div
              className="bg-white rounded-lg border border-slate-200 overflow-hidden"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                  WebSocket Messages
                </h3>
              </div>
              <div className="p-3">
                <WsTable
                  rows={wsRows}
                  baseUrl={wsBaseUrl}
                  filter={searchTerm}
                  onView={openPanel}
                />
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      {/* Right Panel with Animation */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            ref={panelRef}
            className="w-2/5 h-full border-l border-slate-200 shadow-lg"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <DetailPanel
              open={panelOpen}
              title={panelTitle}
              data={panelData}
              viewTree={viewTree}
              onCopy={() =>
                navigator.clipboard.writeText(
                  JSON.stringify(panelData, null, 2)
                )
              }
              onClose={() => setPanelOpen(false)}
              onToggleView={setViewTree}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact History Modal */}
      <AnimatePresence>
        {historyModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="bg-white rounded-lg border border-slate-200 max-w-4xl w-full max-h-[90vh] overflow-hidden"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <HistoryModal
                open={historyModalOpen}
                fieldName={fieldName}
                history={historyTree}
                onSearch={showHistory}
                onClose={() => setHistoryModalOpen(false)}
                onChangeField={setFieldName}
                allFields={extractedKeys}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HarMethodsPage;
