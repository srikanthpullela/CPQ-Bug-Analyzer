import React from "react";
import { HttpTableTab } from "./HttpTableTab";
import { WsTableTab } from "./WsTableTab1";

interface NetworkTablesProps {
  httpRows: any[];
  wsRows: any[];
  wsBaseUrl: string;
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
    <div className="space-y-3">
      {httpRows.length > 0 && (
        <div
          className={`rounded-lg shadow-sm border transition-colors duration-200 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <div
            className={`px-3 py-2 border-b rounded-t-lg transition-colors duration-200 ${
              isDarkMode
                ? "bg-gray-700 border-gray-600"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3
                className={`font-semibold flex items-center gap-2 transition-colors duration-200 ${
                  isDarkMode ? "text-gray-100" : "text-gray-800"
                }`}
              >
                <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                HTTP Requests
              </h3>
              <span
                className={`text-sm transition-colors duration-200 ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {searchTerm
                  ? `${filteredHttpCount} of ${httpRows.length}`
                  : httpRows.length}{" "}
                requests
              </span>
            </div>
          </div>
          <div className="p-2">
            <HttpTableTab
              rows={httpRows}
              filter={searchTerm}
              selectedRowKey={selectedRowKey}
              onView={onView}
              isDarkMode={isDarkMode}
            />
          </div>
        </div>
      )}

      {wsRows.length > 0 && (
        <div
          className={`rounded-lg shadow-sm border transition-colors duration-200 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <div
            className={`px-3 py-2 border-b rounded-t-lg transition-colors duration-200 ${
              isDarkMode
                ? "bg-gray-700 border-gray-600"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <h3
                className={`font-semibold flex items-center gap-2 transition-colors duration-200 ${
                  isDarkMode ? "text-gray-100" : "text-gray-800"
                }`}
              >
                <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                WebSocket Messages
              </h3>
              <span
                className={`text-sm transition-colors duration-200 ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {searchTerm
                  ? `${filteredWsCount} of ${wsRows.length}`
                  : wsRows.length}{" "}
                messages
              </span>
            </div>
          </div>
          <div className="p-2">
            <WsTableTab
              rows={wsRows}
              baseUrl={wsBaseUrl}
              filter={searchTerm}
              selectedRowKey={selectedRowKey}
              onView={onView}
              isDarkMode={isDarkMode}
            />
          </div>
        </div>
      )}
    </div>
  );
};
