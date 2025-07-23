import React from "react";
import { HttpTableTab } from "./HttpTableTab";
import { WsTableTab } from "./WsTableTab1";

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
}) => {
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
        rows={httpRows}
        filter={searchTerm}
        selectedRowKey={selectedRowKey}
        onView={onView}
        isDarkMode={isDarkMode}
        headerTitle={getActivePatternNames()}
      />

      {/* WebSocket Table with connection info - Only show if there are WS messages OR an active connection */}
      {(wsRows.length > 0 || wsBaseUrl) && (
        <div
          className={`rounded-lg shadow-sm border transition-colors duration-200 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          {/* WS Table Header with connection status */}
          <div
            className={`px-4 py-3 border-b transition-colors duration-200 ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3
                className={`text-sm font-medium transition-colors duration-200 ${
                  isDarkMode ? "text-gray-100" : "text-gray-900"
                }`}
              >
                WebSocket Messages ({filteredWsCount})
              </h3>

              {/* WebSocket Connection Status */}
              {wsBaseUrl && (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span
                    className={`text-xs font-medium transition-colors duration-200 ${
                      isDarkMode ? "text-green-300" : "text-green-800"
                    }`}
                  >
                    Connected:
                  </span>
                  <code
                    className={`text-xs px-2 py-1 rounded font-mono transition-colors duration-200 max-w-none ${
                      isDarkMode
                        ? "text-green-200 bg-green-800/30 border border-green-700"
                        : "text-green-700 bg-green-100 border border-green-200"
                    }`}
                    title={wsBaseUrl}
                  >
                    {wsBaseUrl}
                  </code>
                </div>
              )}
            </div>
          </div>

          {/* WS Table Content */}
          <WsTableTab
            rows={wsRows}
            baseUrl={wsBaseUrl}
            filter={searchTerm}
            selectedRowKey={selectedRowKey}
            onView={onView}
            isDarkMode={isDarkMode}
          />
        </div>
      )}
    </div>
  );
};