import React, { useState } from "react";

interface MatchesModalProps {
  open: boolean;
  matchedResponses: any[];
  onClose: () => void;
  onClearMatches?: () => void;
  isDarkMode?: boolean;
}

export const MatchesModal: React.FC<MatchesModalProps> = ({
  open,
  matchedResponses,
  onClose,
  onClearMatches,
  isDarkMode = false,
}) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  const toggleExpanded = (key: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedItems(newExpanded);
  };

  if (!open) return null;

  return (
    <div className={`query-modal-container fixed inset-0 z-40 backdrop-blur-sm flex items-center justify-center transition-colors ${
      isDarkMode ? "bg-black bg-opacity-70" : "bg-black bg-opacity-30"
    }`}>
      <div className={`query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out p-4 ${
        isDarkMode ? "bg-gray-800" : "bg-white"
      }`}>
        <h2 className={`text-lg font-bold transition-colors duration-200 ${
          isDarkMode ? "text-gray-100" : "text-gray-900"
        }`}>
          Rule Matches ({matchedResponses.length})
        </h2>
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {matchedResponses.map((response, i) => {
            const itemKey = `${response.id || i}-${response.timestamp || i}`;
            const isExpanded = expandedItems.has(itemKey);
            
            return (
              <div
                key={itemKey}
                className={`border rounded-lg p-3 transition-colors duration-200 ${
                  isDarkMode 
                    ? "border-gray-600 bg-gray-700" 
                    : "border-gray-300 bg-gray-50"
                }`}
              >
                {/* Method Name Header */}
                <div className={`font-semibold text-sm mb-2 pb-2 border-b transition-colors duration-200 ${
                  isDarkMode 
                    ? "text-gray-200 border-gray-600" 
                    : "text-gray-800 border-gray-300"
                }`}>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-mono mr-2 ${
                    isDarkMode 
                      ? "bg-blue-900 text-blue-200" 
                      : "bg-blue-100 text-blue-800"
                  }`}>
                    {response.method || response.displayName || "Unknown Method"}
                  </span>
                  {response.status && (
                    <span className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                      response.status >= 200 && response.status < 300
                        ? isDarkMode ? "bg-green-900 text-green-200" : "bg-green-100 text-green-800"
                        : isDarkMode ? "bg-red-900 text-red-200" : "bg-red-100 text-red-800"
                    }`}>
                      {response.status}
                    </span>
                  )}
                </div>
                
                {/* Collapsible Response Payload */}
                <div>
                  <button
                    onClick={() => toggleExpanded(itemKey)}
                    className={`flex items-center text-sm font-medium mb-2 transition-colors duration-200 hover:opacity-75 ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    <span className={`mr-2 transform transition-transform duration-200 ${
                      isExpanded ? "rotate-90" : "rotate-0"
                    }`}>
                      ▶
                    </span>
                    {isExpanded ? "Hide" : "Show"} Response Payload
                  </button>
                  
                  {isExpanded && (
                    <pre
                      className={`text-xs overflow-x-auto transition-colors duration-200 ${
                        isDarkMode 
                          ? "bg-gray-800 text-gray-300" 
                          : "bg-white text-gray-700"
                      } p-2 rounded border ${
                        isDarkMode ? "border-gray-600" : "border-gray-200"
                      }`}
                    >
                      {JSON.stringify(response.responsePayload || response, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between">
          {onClearMatches && (
            <button
              className={`px-4 py-2 rounded transition-colors duration-200 ${
                isDarkMode 
                  ? "bg-red-600 text-gray-200 hover:bg-red-500" 
                  : "bg-red-500 text-white hover:bg-red-600"
              }`}
              onClick={() => {
                onClearMatches();
                onClose();
              }}
            >
              Clear Matches
            </button>
          )}
          <button
            className={`px-4 py-2 rounded transition-colors duration-200 ${
              isDarkMode 
                ? "bg-gray-600 text-gray-200 hover:bg-gray-500" 
                : "bg-gray-300 text-gray-700 hover:bg-gray-400"
            }`}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
