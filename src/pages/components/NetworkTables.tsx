import React, { useState, useEffect } from "react";
import { HttpTableTab } from "./HttpTableTab";
import { WsTableTab } from "./WsTableTab";

function getActivePatternNames(): string {
  try {
    console.log('🔍 getActivePatternNames: Reading patterns...');
    const stored = localStorage.getItem('har_extractor_url_patterns');
    console.log('🔍 getActivePatternNames: Raw stored value:', stored);
    
    if (stored) {
      const patterns = JSON.parse(stored);
      console.log('🔍 getActivePatternNames: Parsed patterns:', patterns);
      
      const activeNames = patterns
        .filter((p: any) => p.enabled)
        .map((p: any) => p.name)
        .join(' & ');
      
      console.log('🔍 getActivePatternNames: Active names:', activeNames);
      return activeNames || 'API Methods';
    }
  } catch (error) {
    console.warn('Error reading URL patterns for header:', error);
  }
  console.log('🔍 getActivePatternNames: Returning default');
  return 'API Methods';
}

interface NetworkTablesProps {
  httpRows: any[];
  wsRows: any[];
  wsBaseUrl: string; // Keep this prop for the WS table
  searchTerm: string;
  selectedRowKey: string | null;
  isDarkMode: boolean;
  requestHarReload: () => void;
  onView: (rowKey: string, title: string, data: any) => void;
  isLoading?: boolean;
  panelOpen?: boolean;
  autoScroll?: boolean;
  onToggleAutoScroll?: () => void;
}

export const NetworkTables: React.FC<NetworkTablesProps> = ({
  httpRows,
  wsRows,
  wsBaseUrl,
  searchTerm,
  selectedRowKey,
  isDarkMode,
  requestHarReload,
  onView,
  isLoading = false,
  panelOpen = false,
  autoScroll = false,
  onToggleAutoScroll,
}) => {
  // Track debugger connection state for WS reconnect overlay
  const [debuggerDisconnected, setDebuggerDisconnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source !== "HAR_EXTRACTOR") return;
      if (event.data.type === "DEBUGGER_DISCONNECTED") {
        setDebuggerDisconnected(true);
        setIsReconnecting(false);
      } else if (event.data.type === "DEBUGGER_RECONNECTED") {
        setDebuggerDisconnected(false);
        setIsReconnecting(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleReconnectWs = () => {
    setIsReconnecting(true);
    window.postMessage(
      { source: "HAR_EXTRACTOR", type: "RECONNECT_DEBUGGER" },
      "*"
    );
    setTimeout(() => setIsReconnecting(false), 10000);
  };

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
        const combined = `${row.time} ${row.method} ${safeStringify(
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
        )} ${row.status || ''} ${row.direction || ''} ${row.id || ''}`;
        
        return combined.toLowerCase().includes(term);
      }
      
      return false;
    };
  };

  const filterFunction = createFilterFunction(searchTerm);
  const filteredHttpRows = httpRows.filter(filterFunction);
  const filteredWsRows = wsRows.filter(filterFunction);

  const totalRequests = httpRows.length + wsRows.length;
  const filteredHttpCount = httpRows.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(searchTerm.toLowerCase())
  ).length;
  const filteredWsCount = wsRows.filter((row) =>
    JSON.stringify(row).toLowerCase().includes(searchTerm.toLowerCase())
  ).length;

  if (totalRequests === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-4">
      {/* HTTP Table */}
      <HttpTableTab
        rows={filteredHttpRows}
        filter="" // Pass empty since we're pre-filtering
        selectedRowKey={selectedRowKey}
        onView={onView}
        isDarkMode={isDarkMode}
        headerTitle={`HTTP Requests (${filteredHttpRows.length}/${httpRows.length})`}
        isLoading={isLoading}
        panelOpen={panelOpen}
        autoScroll={autoScroll}
        onToggleAutoScroll={onToggleAutoScroll}
      />

      {/* WebSocket Table with reconnect overlay */}
      {wsRows.length > 0 && (
        <div className="relative" style={{ isolation: "isolate" }}>
          <WsTableTab
            rows={filteredWsRows}
            baseUrl={wsBaseUrl}
            filter="" // Pass empty since we're pre-filtering
            selectedRowKey={selectedRowKey}
            onView={onView}
            isDarkMode={isDarkMode}
            headerTitle={`WebSocket Messages (${filteredWsRows.length}/${wsRows.length})`}
            isLoading={isLoading}
            panelOpen={panelOpen}
          />

          {/* Blur overlay on WS table body — header & connection bar stay visible */}
          {debuggerDisconnected && (
            <div
              className="absolute left-0 right-0 bottom-0 z-50 flex items-center justify-center rounded-b-lg"
              style={{
                top: "58px", // Skip header (28px) + connection bar (30px)
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                backgroundColor: isDarkMode
                  ? "rgba(17, 24, 39, 0.85)"
                  : "rgba(255, 255, 255, 0.85)",
              }}
            >
              <div className="flex flex-col items-center gap-4 p-6">
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center ${
                    isDarkMode ? "bg-yellow-900/50" : "bg-yellow-100"
                  }`}
                >
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    stroke={isDarkMode ? "#facc15" : "#ca8a04"}
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                  </svg>
                </div>
                <h3
                  className={`text-base font-semibold ${
                    isDarkMode ? "text-gray-100" : "text-gray-800"
                  }`}
                >
                  WebSocket Debugger Disconnected
                </h3>
                <p
                  className={`text-sm max-w-sm text-center leading-relaxed ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  The debugger was cancelled. Reconnect to resume capturing
                  WebSocket messages.
                </p>
                <button
                  onClick={handleReconnectWs}
                  disabled={isReconnecting}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md ${
                    isReconnecting
                      ? isDarkMode
                        ? "bg-blue-800 text-blue-300 cursor-wait shadow-blue-900/30"
                        : "bg-blue-200 text-blue-600 cursor-wait shadow-blue-200/30"
                      : isDarkMode
                      ? "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/30 hover:shadow-blue-500/40"
                      : "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/30 hover:shadow-blue-700/40"
                  }`}
                >
                  {isReconnecting ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Reconnecting...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"
                        />
                      </svg>
                      Reconnect WebSocket Debugger
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};