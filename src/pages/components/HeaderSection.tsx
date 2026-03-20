import React, { useState, useEffect, useRef } from "react";
import { RotateCcw, Moon, Sun, BarChart2, Search, Trash2, Zap, BellRing, Settings } from "lucide-react";
import { SearchInput } from "./SearchInput";

interface HeaderSectionProps {
  isDarkMode: boolean;
  totalRequests: number;
  httpRowsLength: number;
  wsRowsLength: number;
  searchTerm: string;
  filteredHttpCount: number;
  filteredWsCount: number;
  matchCount: number;
  rules: any[];
  toggleDarkMode: () => void;
  requestHarReload: () => void;
  setHistoryModalOpen: (open: boolean) => void;
  setQueryModalOpen: (open: boolean) => void;
  requestClearLogs: () => void;
  openRuleModal: () => void;
  setShowMatchesModal: (open: boolean) => void;
  setSearchTerm: (term: string) => void;
  openUrlPatternSettings: () => void;
}

declare const chrome: any;

export const HeaderSection: React.FC<HeaderSectionProps> = ({
  isDarkMode,
  totalRequests,
  httpRowsLength,
  wsRowsLength,
  searchTerm,
  filteredHttpCount,
  filteredWsCount,
  matchCount,
  rules,
  toggleDarkMode,
  requestHarReload,
  setHistoryModalOpen,
  setQueryModalOpen,
  requestClearLogs,
  openRuleModal,
  setShowMatchesModal,
  setSearchTerm,
  openUrlPatternSettings,
}) => {
  const [debuggerConnected, setDebuggerConnected] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [debuggerError, setDebuggerError] = useState<string | null>(null);
  const [interceptorMode, setInterceptorMode] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Listen for debugger disconnection messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === "HAR_EXTRACTOR") {
        console.log("🔌 HeaderSection received message:", event.data.type);
        if (event.data.type === "DEBUGGER_DISCONNECTED") {
          console.log("🔌 Setting debugger as disconnected");
          setDebuggerConnected(false);
          setInterceptorMode(false);
          setDebuggerError(null);
        } else if (event.data.type === "DEBUGGER_FALLBACK") {
          console.log("🔌 Debugger fallback - WS interceptor active");
          setDebuggerConnected(false);
          setInterceptorMode(true);
          setIsReconnecting(false);
          setDebuggerError(null);
        } else if (event.data.type === "DEBUGGER_RECONNECTED") {
          console.log("🔌 Setting debugger as reconnected");
          setDebuggerConnected(true);
          setInterceptorMode(false);
          setIsReconnecting(false);
          setDebuggerError(null);
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
        } else if (event.data.type === "DEBUGGER_ERROR") {
          console.log("🔌 Debugger error received:", event.data.error);
          setDebuggerError(event.data.error);
          setDebuggerConnected(false);
          setIsReconnecting(false);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      // Clean up any pending timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const handleReconnect = () => {
    console.log("🔌 HeaderSection: User clicked reconnect");
    setIsReconnecting(true);
    setDebuggerError(null); // Clear any previous errors
    
    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // Send reconnection request to devtools
    console.log("🔌 HeaderSection: Sending RECONNECT_DEBUGGER message");
    window.postMessage({
      source: "HAR_EXTRACTOR",
      type: "RECONNECT_DEBUGGER"
    }, "*");

    // Extended timeout for aggressive reconnection (10 seconds instead of 3)
    reconnectTimeoutRef.current = setTimeout(() => {
      console.warn("🔌 Extended reconnection timeout - but connection may still succeed");
      setIsReconnecting(false);
      reconnectTimeoutRef.current = null;
      
      // Don't show as disconnected - the aggressive strategy might still work
      // Just stop the loading indicator
    }, 10000);
  };
  return (
    <div
      className={`rounded shadow-sm border px-2 py-1 transition-colors duration-100 ${
        isDarkMode
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
            <rect width="128" height="128" fill="#1a1145" />
            <text x="64" y="96" textAnchor="middle" fontSize="100" fontWeight="bold" fill="#7c6cf0" fontFamily="Arial, Helvetica, sans-serif">C</text>
          </svg>
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={`px-1.5 py-0.5 rounded-full font-medium text-align-center transition-colors duration-75 ${
                isDarkMode
                  ? "bg-blue-900 text-blue-200"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              Total: {totalRequests}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-full font-medium text-align-center transition-colors duration-75 ${
                isDarkMode
                  ? "bg-green-900 text-green-200"
                  : "bg-green-100 text-green-800"
              }`}
            >
              HTTP: {httpRowsLength}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-full font-medium text-align-center transition-colors duration-75 ${
                isDarkMode
                  ? "bg-purple-900 text-purple-200"
                  : "bg-purple-100 text-purple-800"
              }`}
            >
              WS: {wsRowsLength}
            </span>
            {searchTerm && (
              <span
                className={`px-1.5 py-0.5 rounded-full font-bold text-align-center animate-pulse ${
                  isDarkMode
                    ? "bg-red-800 text-red-100 ring-1 ring-red-600"
                    : "bg-red-500 text-white ring-1 ring-red-400"
                }`}
              >
                Filtered: {filteredHttpCount + filteredWsCount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!debuggerConnected && !interceptorMode && (
            <div className="flex items-center gap-2">
              {debuggerError && debuggerError.includes("different extension") && (
                <div className={`px-3 py-1 rounded-md text-xs font-medium border ${
                  isDarkMode 
                    ? "bg-yellow-900 border-yellow-600 text-yellow-200" 
                    : "bg-yellow-100 border-yellow-400 text-yellow-800"
                }`}>
                  ⚠️ Extension conflict - force reconnecting...
                </div>
              )}
              <button
                onClick={handleReconnect}
                disabled={isReconnecting}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-100 border-2 ${
                  isReconnecting
                    ? isDarkMode
                      ? "bg-blue-700 border-blue-500 text-blue-200 hover:bg-blue-600 disabled:bg-blue-800 disabled:border-blue-600 disabled:opacity-70"
                      : "bg-blue-600 border-blue-400 text-blue-100 hover:bg-blue-500 disabled:bg-blue-300 disabled:border-blue-200"
                    : isDarkMode
                      ? "bg-red-600 border-red-400 text-red-100 hover:bg-red-500 hover:border-red-300"
                      : "bg-red-500 border-red-400 text-white hover:bg-red-600 hover:border-red-300"
                }`}
                title={debuggerError ? `Error: ${debuggerError} - Click to force reconnection` : "Force reconnect debugger (ignores conflicts)"}
              >
                <RotateCcw className={`h-3 w-3 ${isReconnecting ? 'animate-spin text-blue-300' : 'text-red-200'}`} />
                <span className={isReconnecting 
                  ? isDarkMode ? "text-blue-200 font-semibold" : "text-blue-100 font-semibold"
                  : isDarkMode ? "text-red-100 font-medium" : "text-white font-medium"
                }>
                  {isReconnecting ? "" : ""}
                </span>
              </button>
            </div>
          )}
          
          <button
            onClick={openUrlPatternSettings}
            className={`p-1 rounded transition-colors duration-75 ${
              isDarkMode
                ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                : "bg-gray-100 hover:bg-gray-200 text-gray-600"
            }`}
            title="Configure URL patterns"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={toggleDarkMode}
            className={`p-1 rounded transition-colors duration-75 ${
              isDarkMode
                ? "bg-gray-700 hover:bg-gray-600 text-yellow-400"
                : "bg-gray-100 hover:bg-gray-200 text-gray-600"
            }`}
            title={
              isDarkMode ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {isDarkMode ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            className={`p-1 rounded transition-colors duration-75 ${
              isDarkMode
                ? "bg-blue-700 hover:bg-blue-600 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
            onClick={requestHarReload}
            title="Reload network logs"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            className={`p-1 rounded transition-colors duration-75 ${
              isDarkMode
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-gray-600 hover:bg-gray-700 text-white"
            }`}
            onClick={() => setHistoryModalOpen(true)}
            title="Track field changes over time"
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </button>

          <button
            className={`p-1 rounded transition-colors duration-75 ${
              isDarkMode
                ? "bg-green-700 hover:bg-green-600 text-white"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
            onClick={() => setQueryModalOpen(true)}
            title="Query Search for payload or response"
          >
            <Search className="h-3.5 w-3.5" />
          </button>

          <button
            className={`p-1 rounded transition-colors duration-75 ${
              isDarkMode
                ? "bg-red-700 hover:bg-red-600 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
            onClick={requestClearLogs}
            title="Clear all logs"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            className={`p-1 rounded transition-colors duration-75 ${
              isDarkMode
                ? "bg-yellow-700 hover:bg-yellow-600 text-black"
                : "bg-yellow-500 hover:bg-yellow-400 text-black"
            }`}
            onClick={openRuleModal}
            title={rules.length ? "Update Rule" : "Add Rule"}
          >
            <Zap className="h-3.5 w-3.5" />
          </button>

          <button
            className={`p-1 rounded transition-colors duration-75 flex items-center ${
              matchCount > 0
                ? isDarkMode
                  ? "bg-red-700 hover:bg-red-600 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
                : isDarkMode
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
            onClick={() => matchCount > 0 && setShowMatchesModal(true)}
            disabled={matchCount === 0}
            title={matchCount > 0 ? "View rule matches" : "No rule matches available"}
          >
            <BellRing className="h-3.5 w-3.5" />
            <span className="ml-1 text-xs">{matchCount}</span>
          </button>
        </div>
      </div>
      <SearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        isDarkMode={isDarkMode}
        placeholder="Search requests, responses, headers…"
      />
    </div>
  );
};