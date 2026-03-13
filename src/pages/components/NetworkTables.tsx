import React from "react";
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
}) => {
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