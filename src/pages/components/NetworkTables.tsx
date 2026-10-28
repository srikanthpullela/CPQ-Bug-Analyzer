import React, { useState, useEffect, useRef } from "react";
import { HttpTableTab } from "./HttpTableTab";
import { WsTableTab } from "./WsTableTab";
import type { DebuggerStatus } from "../../hooks/useHarTab";

// Shown while chrome.debugger isn't attached: why (Chrome's own error), what to do, and a Retry
// button. WS messages keep coming from the DevTools network log meanwhile.
const DebuggerStatusBanner: React.FC<{
  status: DebuggerStatus | null;
  isDarkMode: boolean;
}> = ({ status, isDarkMode }) => {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every status update (devtools answers each Retry, even when nothing changed) ends the spinner
  useEffect(() => {
    setRetrying(false);
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  }, [status]);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    []
  );

  if (!status || status.state === "attached") return null;
  const key = `${status.state}|${status.error || ""}`;
  if (dismissedKey === key) return null;

  const handleRetry = () => {
    setRetrying(true);
    window.postMessage({ source: "HAR_EXTRACTOR", type: "RECONNECT_DEBUGGER" }, "*");
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setRetrying(false);
    }, 10000);
  };

  const error = (status.error || "").trim();
  const errorText = error && !/[.!?]$/.test(error) ? `${error}.` : error;

  return (
    <div
      role="status"
      className={`flex items-start gap-2 px-3 py-2 rounded-md border text-xs leading-snug ${
        isDarkMode
          ? "bg-gray-800 border-yellow-600 text-yellow-100"
          : "bg-yellow-50 border-yellow-300 text-yellow-900"
      }`}
    >
      <svg
        className="w-4 h-4 mt-0.5 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
      <div className="flex-1 min-w-0 break-words">
        <div className="font-semibold">
          {status.state === "detached"
            ? "WebSocket debugger detached"
            : "WebSocket debugger not attached"}
        </div>
        {(errorText || status.hint) && (
          <div>
            {errorText} {status.hint}
          </div>
        )}
        <div className="opacity-75">
          WebSocket messages are still captured from the page and the DevTools Network log, but
          some can show up a few seconds late. If a connection opened before DevTools is missing,
          reload the page.
        </div>
      </div>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className={`flex items-center gap-1 px-2 py-1 rounded font-semibold flex-shrink-0 transition-colors ${
          retrying
            ? "bg-blue-300 text-white cursor-wait"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {retrying && (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {retrying ? "Retrying..." : "Retry"}
      </button>
      <button
        onClick={() => setDismissedKey(key)}
        title="Dismiss"
        aria-label="Dismiss"
        className={`px-1 rounded flex-shrink-0 text-base leading-none ${
          isDarkMode ? "hover:bg-gray-700" : "hover:bg-yellow-100"
        }`}
      >
        ×
      </button>
    </div>
  );
};

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
  debuggerStatus?: DebuggerStatus | null;
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
  debuggerStatus = null,
}) => {
  const debuggerBanner = (
    <DebuggerStatusBanner status={debuggerStatus} isDarkMode={isDarkMode} />
  );

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
        )} ${row.status || ''} ${row.direction || ''}`;
        
        return combined.toLowerCase().includes(term);
      }
      
      return false;
    };
  };

  const filterFunction = createFilterFunction(searchTerm);
  const filteredHttpRows = httpRows.filter(filterFunction);
  const filteredWsRows = wsRows.filter(filterFunction);

  const totalRequests = httpRows.length + wsRows.length;

  if (totalRequests === 0) {
    return (
      <>
        {debuggerBanner}
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
      </>
    );
  }

  return (
    <div className="space-y-4">
      {debuggerBanner}

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

      {/* WebSocket Table */}
      {wsRows.length > 0 && (
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
      )}
    </div>
  );
};