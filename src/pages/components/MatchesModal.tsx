import { X, Copy, Check } from "lucide-react";
import React, { useState, useMemo } from "react";
import { toast } from "react-hot-toast";
import { safeCopyToClipboard } from "../../utils/clipboard";

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
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
  
  // Don't group matches anymore - show each individual field occurrence
  const sortedMatches = useMemo(() => {
    return matchedResponses.sort((a, b) => (b.timestamp || b.startTime || 0) - (a.timestamp || a.startTime || 0));
  }, [matchedResponses]);
  
  const toggleExpanded = (key: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedItems(newExpanded);
  };

  const handleCopyJson = async (itemKey: string, data: any) => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      await safeCopyToClipboard(jsonString);
      
      // Show temporary copied state
      setCopiedItems(prev => new Set([...prev, itemKey]));
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemKey);
          return newSet;
        });
      }, 2000);
      
      toast.success("JSON copied to clipboard", {
        duration: 2000,
        position: 'top-right',
      });
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error("Failed to copy to clipboard", {
        duration: 2000,
        position: 'top-right',
      });
    }
  };

  if (!open) return null;

  return (
    <div
      className={`query-modal-container fixed inset-0 z-40 backdrop-blur-sm flex items-center bg-black bg-opacity-70 justify-center transition-colors ${
        isDarkMode ? "bg-black/70" : "bg-black/30"
      }`}
    >
      <div
        className={`query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out border ${
          isDarkMode
            ? "bg-gray-800 border-gray-600"
            : "bg-white border-gray-300"
        }`}
      >
        {/* Header with close button */}
        <div
          className={`flex justify-between items-center p-4 border-b transition-colors ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <h2
            className={`text-lg font-bold transition-colors duration-200 ${
              isDarkMode ? "text-gray-100" : "text-gray-900"
            }`}
          >
            Rule Matches ({matchedResponses.length} field {matchedResponses.length === 1 ? 'occurrence' : 'occurrences'})
          </h2>
          <button
            onClick={onClose}
            className={`text-2xl transition-colors ${
              isDarkMode
                ? "text-gray-400 hover:text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - show each individual field occurrence */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {sortedMatches.map((response, i) => {
            const itemKey = `${response.method}-${response.matchedField}-${response.occurrenceIndex}-${i}`;
            const isExpanded = expandedItems.has(itemKey);
            const isCopied = copiedItems.has(itemKey);

            return (
              <div
                key={itemKey}
                className={`border rounded-lg p-3 transition-colors duration-200 ${
                  isDarkMode
                    ? "border-gray-600 bg-gray-700"
                    : "border-gray-300 bg-gray-50"
                }`}
              >
                {/* Method Name Header with field occurrence info */}
                <div
                  className={`font-semibold text-sm mb-2 pb-2 border-b transition-colors duration-200 ${
                    isDarkMode
                      ? "text-gray-200 border-gray-600"
                      : "text-gray-800 border-gray-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-wrap gap-1">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                          isDarkMode
                            ? "bg-blue-900 text-blue-200"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {response.method}
                      </span>
                      
                      {/* Field occurrence info - Updated to show all satisfied conditions */}
                      {response.satisfiedConditions && response.satisfiedConditions.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {response.satisfiedConditions.map((sc, idx) => (
                            <span 
                              key={idx}
                              className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                                isDarkMode
                                  ? "bg-purple-900 text-purple-200"
                                  : "bg-purple-100 text-purple-800"
                              }`}
                              title={`Found ${sc.occurrenceCount} occurrence(s) at: ${sc.occurrencePaths.join(', ')}`}
                            >
                              {sc.fieldPath} {sc.operator} {sc.value}
                              {sc.occurrenceCount > 1 && ` (${sc.occurrenceCount}x)`}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Legacy support for old single-condition matches */}
                      {response.matchedField && !response.satisfiedConditions && (
                        <span className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                          isDarkMode
                            ? "bg-purple-900 text-purple-200"
                            : "bg-purple-100 text-purple-800"
                        }`}>
                          {response.matchedField} = {response.matchedValue}
                        </span>
                      )}

                      {/* Occurrence location - Updated for multiple conditions */}
                      {response.satisfiedConditions && response.satisfiedConditions.length > 0 && (
                        <span className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                          isDarkMode
                            ? "bg-gray-600 text-gray-300"
                            : "bg-gray-200 text-gray-600"
                        }`} title={`All conditions satisfied`}>
                          ✓ All {response.satisfiedConditions.length} condition{response.satisfiedConditions.length > 1 ? 's' : ''} met
                        </span>
                      )}

                      {/* Legacy occurrence path support */}
                      {response.occurrencePath && !response.satisfiedConditions && (
                        <span className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                          isDarkMode
                            ? "bg-gray-600 text-gray-300"
                            : "bg-gray-200 text-gray-600"
                        }`} title={`Found at: ${response.occurrencePath}`}>
                          @ {response.occurrencePath.length > 20 ? `...${response.occurrencePath.slice(-20)}` : response.occurrencePath}
                        </span>
                      )}

                      {/* Occurrence number if multiple */}
                      {response.totalOccurrences > 1 && (
                        <span className={`inline-block px-2 py-1 rounded text-xs ${
                          isDarkMode
                            ? "bg-indigo-900 text-indigo-200"
                            : "bg-indigo-100 text-indigo-800"
                        }`}>
                          #{response.occurrenceIndex}/{response.totalOccurrences}
                        </span>
                      )}

                      {response.status && (
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                            response.status >= 200 && response.status < 300
                              ? isDarkMode
                                ? "bg-green-900 text-green-200"
                                : "bg-green-100 text-green-800"
                              : isDarkMode
                              ? "bg-red-900 text-red-200"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {response.status}
                        </span>
                      )}
                      
                      {/* Copy Button */}
                      <button
                        onClick={() => handleCopyJson(itemKey, response.responsePayload || response)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors duration-200 ${
                          isCopied
                            ? isDarkMode
                              ? "bg-green-900 text-green-200"
                              : "bg-green-100 text-green-800"
                            : isDarkMode
                              ? "bg-gray-600 text-gray-300 hover:bg-gray-500"
                              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                        title="Copy JSON to clipboard"
                      >
                        {isCopied ? (
                          <>
                            <Check size={12} />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collapsible Response Payload */}
                <div>
                  <button
                    onClick={() => toggleExpanded(itemKey)}
                    className={`flex items-center text-sm font-medium mb-2 transition-colors duration-200 hover:opacity-75 ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    <span
                      className={`mr-2 transform transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : "rotate-0"
                      }`}
                    >
                      ▶
                    </span>
                    {isExpanded ? "Hide" : "Show"} Response Payload
                  </button>

                  {isExpanded && (
                    <div className="relative">
                      <pre
                        className={`text-xs overflow-x-auto transition-colors duration-200 ${
                          isDarkMode
                            ? "bg-gray-800 text-gray-300"
                            : "bg-white text-gray-700"
                        } p-2 rounded border ${
                          isDarkMode ? "border-gray-600" : "border-gray-200"
                        }`}
                      >
                        {JSON.stringify(
                          response.responsePayload || response,
                          null,
                          2
                        )}
                      </pre>
                      {/* Copy button for expanded JSON */}
                      <button
                        onClick={() => handleCopyJson(`${itemKey}-expanded`, response.responsePayload || response)}
                        className={`absolute top-2 right-2 p-1 rounded transition-colors duration-200 ${
                          copiedItems.has(`${itemKey}-expanded`)
                            ? isDarkMode
                              ? "bg-green-800 text-green-200"
                              : "bg-green-200 text-green-800"
                            : isDarkMode
                              ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        title="Copy this JSON"
                      >
                        {copiedItems.has(`${itemKey}-expanded`) ? (
                          <Check size={14} />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className={`flex justify-end p-4 border-t transition-colors ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          {onClearMatches && (
            <button
              className={`px-4 py-2 rounded transition-colors duration-200 mr-2 ${
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
        </div>
      </div>
    </div>
  );
};