import React from "react";
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
  wsBaseUrl: string;
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

export const HeaderSection: React.FC<HeaderSectionProps> = ({
  isDarkMode,
  totalRequests,
  httpRowsLength,
  wsRowsLength,
  searchTerm,
  filteredHttpCount,
  filteredWsCount,
  wsBaseUrl,
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
  return (
    <div
      className={`rounded-lg shadow-sm border p-3 transition-colors duration-200 ${
        isDarkMode
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <h2
            className={`text-lg font-semibold transition-colors duration-200 ${
              isDarkMode ? "text-gray-100" : "text-gray-800"
            }`}
          >
            Network Activity Monitor
          </h2>
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-200 ${
                isDarkMode
                  ? "bg-blue-900 text-blue-200"
                  : "bg-blue-100 text-blue-800"
              }`}
            >
              Total: {totalRequests}
            </span>
            <span
              className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-200 ${
                isDarkMode
                  ? "bg-green-900 text-green-200"
                  : "bg-green-100 text-green-800"
              }`}
            >
              HTTP: {httpRowsLength}
            </span>
            <span
              className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-200 ${
                isDarkMode
                  ? "bg-purple-900 text-purple-200"
                  : "bg-purple-100 text-purple-800"
              }`}
            >
              WS: {wsRowsLength}
            </span>
            {searchTerm && (
              <span
                className={`px-2 py-1 rounded-full font-medium text-align-center transition-colors duration-200 ${
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
          <button
            onClick={openUrlPatternSettings}
            className={`p-2 rounded-md transition-colors ${
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
            className={`p-2 rounded-md transition-colors ${
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
            className={`p-2 rounded-md transition-colors ${
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
            className={`p-2 rounded-md transition-colors ${
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
            className={`p-2 rounded-md transition-colors ${
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
            className={`p-2 rounded-md transition-colors ${
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
            className={`p-2 rounded-md transition-colors ${
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
            className={`p-2 rounded-md transition-colors flex ${
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
        className={`relative transition-colors duration-200 ${
          isDarkMode ? "search-input-dark" : "search-input-light"
        }`}
      >
        <div
          className={`absolute inset-0 rounded-lg pointer-events-none transition-all duration-200`}
        ></div>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="🔍 Search requests, responses, headers, or any field value..."
        />
      </div>
      {wsBaseUrl && (
        <div
          className={`mt-2 p-2 border rounded-md transition-colors duration-200 ${
            isDarkMode
              ? "bg-green-900/20 border-green-700"
              : "bg-green-50 border-green-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span
              className={`text-xs font-medium transition-colors duration-200 ${
                isDarkMode ? "text-green-300" : "text-green-800"
              }`}
            >
              WebSocket Connected:
            </span>
            <code
              className={`text-xs px-1 py-0.5 rounded font-mono transition-colors duration-200 ${
                isDarkMode
                  ? "text-green-200 bg-green-800/30"
                  : "text-green-700 bg-green-100"
              }`}
            >
              {wsBaseUrl}
            </code>
          </div>
        </div>
      )}
    </div>
  );
};
