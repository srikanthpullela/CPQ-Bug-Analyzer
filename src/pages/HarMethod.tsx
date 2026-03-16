"use client";

import type React from "react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import { Activity, History, FileText, Zap, ArrowLeft, Home } from "lucide-react";
import HarQueryComponent from "./HarQueryComponent";
import { v4 as uuidv4 } from "uuid";

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
  // The httpRows contain the auto-tracked HTTP calls
  const { buildHistory } = useFieldHistory(httpRows, wsRows);

  const [harText, setHarText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTitle, setPanelTitle] = useState("");
  const [panelData, setPanelData] = useState<any>(null);

  const [isPageLoaded, setIsPageLoaded] = useState(false);

  const [fieldName, setFieldName] = useState("");
  const [historyTree, setHistoryTree] = useState<any[]>([]);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [recentUploads, setRecentUploads] = useState<UploadEntry[]>([]);

  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const [queryModalOpen, setQueryModalOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  
  // Add state for showing all network calls vs filtered
  const [showAllNetworkCalls, setShowAllNetworkCalls] = useState(false);
  const [allHttpRows, setAllHttpRows] = useState<any[]>([]);
  const [allWsRows, setAllWsRows] = useState<any[]>([]);

  // Add state for panel sizes
  const [leftPanelWidth, setLeftPanelWidth] = useState(60); // percentage
  const [isResizing, setIsResizing] = useState(false);
  
  const panelRef = useRef(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Get current rows based on toggle state
  const currentHttpRows = showAllNetworkCalls ? allHttpRows : httpRows;
  const currentWsRows = showAllNetworkCalls ? allWsRows : wsRows;

  // Update history and query to use current rows
  const showHistory = () => {
    const history = buildHistory(fieldName);
    setHistoryTree(history);
    setHistoryModalOpen(true);
  };

  // Update extractedKeys to use current rows
  const extractedKeys = useMemo(() => {
    return extractUniqueKeys([...currentHttpRows, ...currentWsRows]);
  }, [currentHttpRows, currentWsRows]);

  // Add function to load all network calls
  const loadAllNetworkCalls = () => {
    if (!harText) return;
    
    try {
      const har = JSON.parse(harText);
      const allEntries = har.log?.entries || [];
      
      // Process ALL HTTP entries with minimal filtering - only exclude obvious static assets
      const allHttpRows = allEntries
        .filter((ent) => {
          // Only filter out obvious static assets, keep everything else
          if (!ent.request?.url) return false;
          
          const url = ent.request.url.toLowerCase();
          const staticAssets = [
            ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
            ".ttf", ".woff", ".woff2", ".eot", ".map", 
            "favicon", ".webp", ".bmp", ".tiff", ".scss", ".less", ".ts.map",
            ".min.js", ".min.css", ".chunk.js", ".bundle.js", ".vendor.js",
            ".fonts", ".font", ".otf", "/assets/", "/static/", "/images/", "/img/"
          ];
          const isStaticAsset = staticAssets.some((ext) => url.includes(ext));
          return !isStaticAsset;
        })
        .map((ent) => {
          // Process similar to existing logic but for ALL requests
          let method = "";
          let req: any = null;
          let res: any = null;

          // Extract request payload
          if (ent.request.postData?.text) {
            try {
              req = JSON.parse(ent.request.postData.text);
            } catch {
              req = { _rawText: ent.request.postData.text };
            }
          } else if (ent.request.queryString?.length > 0) {
            req = Object.fromEntries(
              ent.request.queryString.map((q) => [q.name, q.value])
            );
          } else {
            req = {
              _method: ent.request.method || "GET",
              _url: ent.request.url,
              _headers: ent.request.headers || [],
            };
          }

          const httpMethod = ent.request.method || "GET";
          const urlParts = ent.request.url.split("/").filter(Boolean);
          const urlPath = urlParts[urlParts.length - 1] || "endpoint";

          if (req && typeof req === "object" && req.method) {
            method = req.method;
          } else if (req && typeof req === "object" && req.action) {
            method = req.action;
          } else {
            method = `${urlPath}`;
          }

          // Parse response content
          if (ent.response?.content?.text) {
            try {
              res = JSON.parse(ent.response.content.text);
            } catch {
              res = { _rawContent: ent.response.content.text };
            }
          } else {
            res = {
              _status: ent.response?.status || null,
              _statusText: ent.response?.statusText || "",
              _noContent: true,
            };
          }

          const timeObj = new Date(ent.startedDateTime);
          const startTime = timeObj.getTime();
          const totalTimeMs = typeof ent.time === "number" ? ent.time : 0;
          const endTime = startTime + totalTimeMs;

          return {
            method,
            requestPayload: req,
            responsePayload: res,
            status: typeof ent.response?.status === "number" ? ent.response.status : null,
            time: formatTime(timeObj),
            hasMessages: false,
            id: uuidv4(),
            startTime,
            endTime,
            timestamp: startTime,
            httpMethod,
            url: ent.request.url,
            endpoint: urlPath,
            requestHeaders: ent.request?.headers || [],
            responseHeaders: ent.response?.headers || [],
            headers: {
              request: ent.request?.headers || [],
              response: ent.response?.headers || []
            }
          };
        });

      // Process ALL WebSocket entries - properly handle WebSocket messages
      const allWsEntries: any[] = [];
      let foundWsBaseUrl = wsBaseUrl; // Use existing wsBaseUrl as starting point
      
      allEntries.forEach((ent, entryIndex) => {
        // Check for WebSocket entries more comprehensively
        const hasWebSocketUrl = /^wss?:\/\//.test(ent.request?.url || '');
        const hasWebSocketMessages = (ent.messages && ent.messages.length > 0) || 
                                   (ent._webSocketMessages && ent._webSocketMessages.length > 0) ||
                                   (ent.response?._webSocketMessages && ent.response._webSocketMessages.length > 0);
        
        const isWebSocketEntry = hasWebSocketUrl || hasWebSocketMessages;
        
        if (isWebSocketEntry) {
          // Set WebSocket base URL if we find one
          if (hasWebSocketUrl && !foundWsBaseUrl) {
            foundWsBaseUrl = ent.request.url.split("?")[0];
          }
          
          // Get frames from multiple possible locations
          let frames = [];
          if (ent.messages && ent.messages.length > 0) {
            frames = ent.messages;
          } else if (ent._webSocketMessages && ent._webSocketMessages.length > 0) {
            frames = ent._webSocketMessages;
          } else if (ent.response?._webSocketMessages && ent.response._webSocketMessages.length > 0) {
            frames = ent.response._webSocketMessages;
          }
          
          const status = typeof ent.response?.status === "number" ? ent.response.status : null;
          
          // If no frames but it's a WebSocket URL, create a connection entry
          if (frames.length === 0 && hasWebSocketUrl) {
            allWsEntries.push({
              endpoint: ent.request.url.split("?")[0] || 'WebSocket Connection',
              action: 'Connection',
              payload: { 
                _connectionInfo: true,
                url: ent.request.url,
                headers: ent.request.headers || []
              },
              status,
              time: formatTime(new Date(ent.startedDateTime || Date.now())),
              timestamp: new Date(ent.startedDateTime || Date.now()).getTime(),
              direction: 'connection',
              id: `ws-connection-${entryIndex}`
            });
          }
          
          frames.forEach((frame, frameIndex) => {
            try {
              const obj = JSON.parse(frame.data);
              
              // Skip heartbeat messages
              if ((obj.Action || "").toLowerCase() === "heartbeat") return;
              
              const endpoint = obj.EndPoint
                ? obj.EndPoint
                : obj.TaskId
                ? `TaskId: ${obj.TaskId}`
                : foundWsBaseUrl || ent.request?.url?.split("?")[0] || 'Unknown WebSocket';
              
              const action = obj.Action || obj.action || frame.type || "Message";
              
              // Use frame timestamp if available, otherwise entry timestamp
              const frameTime = typeof frame.time === "number" 
                ? new Date(frame.time * 1000)
                : new Date(ent.startedDateTime || Date.now());
              
              const timeMs = frameTime.getTime();
              const timeStr = formatTime(frameTime);
              
              allWsEntries.push({
                endpoint,
                action,
                payload: obj,
                status,
                time: timeStr,
                timestamp: timeMs,
                direction: frame.type === 'send' ? 'sent' : 'received',
                id: `ws-${entryIndex}-${frameIndex}`
              });
            } catch (error) {
              console.warn('Failed to parse WebSocket frame:', error, frame);
              // Even if parsing fails, create an entry with raw data
              const endpoint = foundWsBaseUrl || ent.request?.url?.split("?")[0] || 'Unknown WebSocket';
              allWsEntries.push({
                endpoint,
                action: 'Raw Message',
                payload: { _rawData: frame.data, _parseError: error.message },
                status: null,
                time: formatTime(new Date(ent.startedDateTime || Date.now())),
                timestamp: new Date(ent.startedDateTime || Date.now()).getTime(),
                direction: frame.type === 'send' ? 'sent' : 'received',
                id: `ws-${entryIndex}-${frameIndex}-raw`
              });
            }
          });
        }
      });

      console.log('Loaded all network calls:', allHttpRows.length, 'HTTP,', allWsEntries.length, 'WS');
      setAllHttpRows(allHttpRows);
      setAllWsRows(allWsEntries);
    } catch (err) {
      console.warn("Failed to load all network calls", err);
    }
  };

  const formatTime = (date: Date) => {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const handleHistoryLoad = (id: string) => {
    const match = recentUploads.find((u) => u.id === id);
    if (match) {
      const animateLoad = async () => {
        setIsPageLoaded(false);
        
        // Clear cached data and reset state for history loads too
        setAllHttpRows([]);
        setAllWsRows([]);
        setShowAllNetworkCalls(false);
        setPanelOpen(false);
        setSelectedRowId(null);
        
        await new Promise((resolve) => setTimeout(resolve, 200));
        const parsed = match.data;
        const entries = parsed?.log?.entries || [];
        
        // Update harText to ensure loadAllNetworkCalls works with the loaded data
        setHarText(JSON.stringify(parsed));
        
        parseAndPopulateTables(entries);
        setIsPageLoaded(true);
      };

      animateLoad();
    }
  }

  const handleParse = (text: string, name: string) => {
    setHarText(text);
    
    // Clear all cached data when loading new HAR
    setAllHttpRows([]);
    setAllWsRows([]);
    setShowAllNetworkCalls(false); // Reset to filtered view for new uploads
    setPanelOpen(false); // Close any open panels
    setSelectedRowId(null);
    
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

  const openPanel = (title: string, data: any, rowId?: string) => {
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
    setSelectedRowId(rowId || null);
    const key = `${title}_${Date.now()}`;
    setActiveRowKey(key);
  };

  // Add resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    
    // Constrain between 30% and 80%
    const constrainedWidth = Math.max(30, Math.min(80, newLeftWidth));
    setLeftPanelWidth(constrainedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Load all calls when toggle is enabled for the first time
  useEffect(() => {
    if (showAllNetworkCalls && allHttpRows.length === 0 && harText) {
      console.log('Loading all network calls...');
      loadAllNetworkCalls();
    }
  }, [showAllNetworkCalls, harText]);

  return (
    <div ref={containerRef} className="flex h-screen bg-slate-50">
      <AnimatePresence>
        <motion.div
          className="flex flex-col overflow-hidden"
          style={{ width: `${leftPanelWidth}%` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isPageLoaded ? 1 : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {/* Fixed top section */}
          <div className="flex-shrink-0">
          {/* Updated Navigation to match pattern */}
          <nav className="bg-white border-b border-slate-200 px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 text-sm">
                <Link
                  to="/"
                  className="text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <Home className="w-4 h-4" />
                  <span>Back to Home</span>
                </Link>
                <span className="text-slate-300">|</span>
                <Link
                  to="/formatter"
                  className="text-slate-600 hover:text-indigo-600 transition-colors flex items-center gap-1"
                >
                  <Activity className="w-3 h-3" />
                  Formatter
                </Link>
                <span className="text-slate-300">|</span>
                <Link
                  to="/compare"
                  className="text-slate-600 hover:text-indigo-600 transition-colors"
                >
                  Compare
                </Link>
                <span className="text-slate-300">|</span>
                <Link
                  to="/pieces"
                  className="text-slate-600 hover:text-indigo-600 transition-colors"
                >
                  Pieces
                </Link>
                <span className="text-slate-300">|</span>
                <Link
                  to="/log"
                  className="text-slate-600 hover:text-indigo-600 transition-colors"
                >
                  Log
                </Link>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                <Zap className="w-3 h-3" />
                HAR Analyzer
              </div>
            </div>
          </nav>

          {/* Upload, Recent, Search — compact row */}
          <div className="px-3 py-2 bg-white border-b border-slate-200 space-y-2">
            {/* File upload */}
            <FileUploader
              onParse={handleParse}
              onDownload={handleDownload}
              hasHar={!!harText}
            />

            {/* Recent uploads */}
            {recentUploads.length > 0 && (
              <UploadHistoryList
                uploads={recentUploads}
                onLoad={handleHistoryLoad}
              />
            )}

            {/* Search + controls */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <SearchInput value={searchTerm} onChange={setSearchTerm} />
              </div>
              <motion.button
                className="px-2.5 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-medium rounded-lg hover:shadow-sm transition-all duration-200 flex items-center gap-1"
                onClick={() => setHistoryModalOpen(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <History className="w-3 h-3" />
                Track History
              </motion.button>
              <button
                className="px-2.5 py-1.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-medium rounded-lg hover:shadow-sm transition-all duration-200 flex items-center gap-1"
                onClick={() => setQueryModalOpen(true)}
              >
                Query Search
              </button>
            </div>

            {/* Show all toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={showAllNetworkCalls}
                    onChange={(e) => {
                      setShowAllNetworkCalls(e.target.checked);
                      if (e.target.checked && allHttpRows.length === 0) {
                        loadAllNetworkCalls();
                      }
                    }}
                    className="w-3.5 h-3.5 text-indigo-600 border-gray-300 focus:ring-indigo-500 rounded"
                  />
                  <span className="ml-1.5 text-xs text-slate-600 group-hover:text-slate-800">
                    Show All Network Calls
                  </span>
                </label>
                <span className="text-[11px] text-slate-400">
                  {currentHttpRows.length + currentWsRows.length} calls
                </span>
              </div>
              {showAllNetworkCalls && (
                <button
                  onClick={loadAllNetworkCalls}
                  className="px-2 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>
          </div>{/* end fixed top section */}

          {/* Scrollable tables area */}
          <div className="flex-1 overflow-auto p-3 space-y-3">

            {/* Query Modal */}
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
                    httpRows={currentHttpRows}
                    wsRows={currentWsRows}
                    onClose={() => setQueryModalOpen(false)}
                  />
                </div>
              </div>
            )}

            {/* HTTP Table Section */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="table-container-with-sticky">
                <HttpTable
                  rows={currentHttpRows}
                  filter={searchTerm}
                  onView={openPanel}
                  selectedRowId={selectedRowId}
                  showAllCalls={showAllNetworkCalls}
                  panelOpen={panelOpen}
                />
              </div>
            </div>

            {/* WebSocket Table Section - Only show if there are WS rows */}
            {currentWsRows.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <div className="table-container-with-sticky">
                  <WsTable
                    rows={currentWsRows}
                    baseUrl={wsBaseUrl}
                    filter={searchTerm}
                    onView={openPanel}
                    selectedRowId={selectedRowId}
                    panelOpen={panelOpen}
                  />
                </div>
              </div>
            )}
          </div>{/* end scrollable tables area */}
        </motion.div>
      </AnimatePresence>

      {/* Resizable Divider */}
      {panelOpen && (
        <div
          className={`w-1 bg-slate-300 hover:bg-slate-400 cursor-col-resize transition-colors duration-200 relative group ${
            isResizing ? "bg-slate-400" : ""
          }`}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-8 bg-slate-500 rounded-full"></div>
          </div>
        </div>
      )}

      {/* Right Panel with Animation */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            ref={panelRef}
            className="h-full border-l border-slate-200 shadow-lg"
            style={{ width: `${100 - leftPanelWidth}%` }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <DetailPanel
              open={panelOpen}
              title={panelTitle}
              data={panelData}
              onCopy={() =>
                navigator.clipboard.writeText(
                  JSON.stringify(panelData, null, 2)
                )
              }
              onClose={() => setPanelOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact History Modal */}
      <AnimatePresence>
        {historyModalOpen && (
          <HistoryModal
            open={historyModalOpen}
            fieldName={fieldName}
            history={historyTree}
            onSearch={showHistory}
            onClose={() => setHistoryModalOpen(false)}
            onChangeField={setFieldName}
            allFields={extractedKeys}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default HarMethodsPage;
