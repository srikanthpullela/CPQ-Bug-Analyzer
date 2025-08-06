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
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Listen for debugger disconnection messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === "HAR_EXTRACTOR") {
        console.log("🔌 HeaderSection received message:", event.data.type);
        if (event.data.type === "DEBUGGER_DISCONNECTED") {
          console.log("🔌 Setting debugger as disconnected");
          setDebuggerConnected(false);
        } else if (event.data.type === "DEBUGGER_RECONNECTED") {
          console.log("🔌 Setting debugger as reconnected");
          setDebuggerConnected(true);
          setIsReconnecting(false);
          // Clear any pending timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
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

    // Timeout after 3 seconds if reconnection fails
    reconnectTimeoutRef.current = setTimeout(() => {
      console.warn("🔌 Reconnection timeout - resetting UI state");
      setIsReconnecting(false);
      reconnectTimeoutRef.current = null;
    }, 3000);
  };
  return (
    <div
      className={`rounded-lg shadow-sm border p-3 transition-colors duration-100 ${
        isDarkMode
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <h1
            className={`text-2xl font-bold transition-colors duration-100 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Network Calls
          </h1>
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-75 ${
                isDarkMode
                  ? "bg-blue-900 text-blue-200"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              Total: {totalRequests}
            </span>
            <span
              className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-75 ${
                isDarkMode
                  ? "bg-green-900 text-green-200"
                  : "bg-green-100 text-green-800"
              }`}
            >
              HTTP: {httpRowsLength}
            </span>
            <span
              className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-75 ${
                isDarkMode
                  ? "bg-purple-900 text-purple-200"
                  : "bg-purple-100 text-purple-800"
              }`}
            >
              WS: {wsRowsLength}
            </span>
            {searchTerm && (
              <span
                className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-75 ${
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
          {!debuggerConnected && (
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
              title="Reconnect debugger"
            >
              <RotateCcw className={`h-3 w-3 ${isReconnecting ? 'animate-spin text-blue-300' : 'text-red-200'}`} />
              <span className={isReconnecting 
                ? isDarkMode ? "text-blue-200 font-semibold" : "text-blue-100 font-semibold"
                : isDarkMode ? "text-red-100 font-medium" : "text-white font-medium"
              }>
                {isReconnecting ? "Connecting..." : "Reconnect WS"}
              </span>
            </button>
          )}
          
          <button
            onClick={openUrlPatternSettings}
            className={`p-2 rounded-md transition-colors duration-75 ${
              isDarkMode
                ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                : "bg-gray-100 hover:bg-gray-200 text-gray-600"
            }`}
            title="Configure URL patterns"
          >
            <Settings className="h-4 w-4" />
          </button>

          <button
            onClick={toggleDarkMode}
            className={`p-2 rounded-md transition-colors duration-75 ${
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
            className={`p-2 rounded-md transition-colors duration-75 ${
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
            className={`p-2 rounded-md transition-colors duration-75 ${
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
            className={`p-2 rounded-md transition-colors duration-75 ${
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
            className={`p-2 rounded-md transition-colors duration-75 ${
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
            className={`p-2 rounded-md transition-colors duration-75 ${
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
            className={`p-2 rounded-md transition-colors duration-75 flex ${
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
            <BellRing className="h-4 w-4" />
            <span className="ml-1 text-xs">{matchCount}</span>
          </button>
        </div>
      </div>
      <div
        className={`relative transition-colors duration-75 ${
          isDarkMode ? "search-input-dark" : "search-input-light"
        }`}
      >
        <div
          className={`absolute inset-0 rounded-lg pointer-events-none transition-colors duration-75`}
        ></div>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="🔍 Search requests, responses, headers, or any field value..."
        />
      </div>
    </div>
  );
};