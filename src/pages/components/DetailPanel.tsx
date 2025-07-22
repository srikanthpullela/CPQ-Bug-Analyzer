"use client";

import type React from "react";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import ReactJson from "react-json-view";

interface Props {
  open: boolean;
  title: string;
  data: any;
  viewTree: boolean;
  onCopy: () => void;
  onClose: () => void;
  onToggleView: (isTree: boolean) => void;
  origin?: string;
  onEditRequest?: (payload: any, method: string) => void;
  isDarkMode?: boolean;
}

interface SearchMatch {
  path: string[];
  key?: string;
  value: any;
  type: "key" | "value";
  index: number;
  text: string;
  startIndex: number;
  endIndex: number;
}

// Component for highlighting text in Raw JSON view
const HighlightedText: React.FC<{
  text: string;
  searchQuery: string;
  caseSensitive: boolean;
  currentMatchIndex: number;
  onMatchClick: (index: number) => void;
}> = ({
  text,
  searchQuery,
  caseSensitive,
  currentMatchIndex,
  onMatchClick,
}) => {
  if (!searchQuery.trim()) {
    return <>{text}</>;
  }

  const searchTerm = caseSensitive ? searchQuery : searchQuery.toLowerCase();
  const searchableText = caseSensitive ? text : text.toLowerCase();

  const parts = [];
  let lastIndex = 0;
  let matchIndex = 0;
  let index = searchableText.indexOf(searchTerm);

  while (index !== -1) {
    // Add text before match
    if (index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>{text.slice(lastIndex, index)}</span>
      );
    }

    // Add highlighted match
    const isCurrentMatch = matchIndex === currentMatchIndex;
    parts.push(
      <span
        key={`match-${matchIndex}`}
        className={`px-1 py-0.5 rounded-sm cursor-pointer transition-colors duration-200 ${
          isCurrentMatch
            ? "bg-yellow-400 text-black font-semibold shadow-sm ring-2 ring-yellow-500"
            : "bg-yellow-200 text-black hover:bg-yellow-300"
        }`}
        onClick={() => onMatchClick(matchIndex)}
        title={`Match ${matchIndex + 1} - Click to navigate`}
      >
        {text.slice(index, index + searchQuery.length)}
      </span>
    );

    matchIndex++;
    lastIndex = index + searchQuery.length;
    index = searchableText.indexOf(searchTerm, lastIndex);
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
};

export const DetailPanel: React.FC<Props> = ({
  open,
  title,
  data,
  viewTree,
  onCopy,
  onClose,
  onToggleView,
  origin,
  onEditRequest,
  isDarkMode = false,
}) => {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rawJsonContainerRef = useRef<HTMLDivElement>(null);
  const [showEditRequest, setShowEditRequest] = useState(false);
  // For ApexRemote calls, construct the URL if needed
  const finalUrl = data?.url || (origin ? `${origin}/apexremote` : null);

  // const [rawPayloadText, setRawPayloadText] = useState<string>("");
  // const [requestPayloadOverride, setRequestPayloadOverride] = useState<any>({});

  const isRequestView = title?.toLowerCase().includes("request");
  
  // Check if we have enough data to re-trigger a request
  const canRetriggerRequest = isRequestView && data && (
    // For HTTP requests, we need at least a URL or method/endpoint info
    data.url || 
    data.method || 
    data.displayName ||
    // For ApexRemote calls, we need the constructed finalUrl
    finalUrl ||
    // For any request with sufficient payload data
    (data.requestPayload || data.payload)
  );

  // Try to JSON.parse any string that *looks* like JSON
  function tryParseJSON(str: string): any {
    str = str.trim();
    if (
      (str.startsWith("{") && str.endsWith("}")) ||
      (str.startsWith("[") && str.endsWith("]"))
    ) {
      try {
        return JSON.parse(str);
      } catch {
        // not parseable, fall through
      }
    }
    return str;
  }

  // Recursively walk and replace any JSON-serialized strings
  function deepParse(val: any): any {
    if (typeof val === "string") {
      const parsed = tryParseJSON(val);
      // if we got an object/array back, recurse into it
      return typeof parsed === "object" ? deepParse(parsed) : parsed;
    }
    if (Array.isArray(val)) {
      return val.map(deepParse);
    }
    if (val && typeof val === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = deepParse(v);
      }
      return out;
    }
    return val;
  }

  // Find matches in raw JSON text
  const findMatchesInRawJSON = useCallback(
    (jsonText: string, query: string): SearchMatch[] => {
      if (!query.trim()) return [];

      const matches: SearchMatch[] = [];
      const searchTerm = caseSensitive ? query : query.toLowerCase();
      const searchableText = caseSensitive ? jsonText : jsonText.toLowerCase();

      let index = searchableText.indexOf(searchTerm);
      let matchIndex = 0;

      while (index !== -1) {
        matches.push({
          path: [],
          type: "value",
          index: matchIndex++,
          text: jsonText.slice(index, index + query.length),
          startIndex: index,
          endIndex: index + query.length,
          value: jsonText.slice(index, index + query.length),
        });
        index = searchableText.indexOf(searchTerm, index + 1);
      }

      return matches;
    },
    [caseSensitive]
  );

  // Render highlighted JSON text
  const renderHighlightedJSON = (jsonText: string) => {
    if (!searchQuery.trim() || searchMatches.length === 0) {
      return <pre className="whitespace-pre-wrap break-words" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{jsonText}</pre>;
    }

    const parts = [];
    let lastIndex = 0;

    searchMatches.forEach((match, index) => {
      // Add text before match
      if (match.startIndex > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {jsonText.slice(lastIndex, match.startIndex)}
          </span>
        );
      }

      // Add highlighted match
      const isCurrentMatch = index === currentMatchIndex;
      parts.push(
        <span
          key={`match-${index}`}
          id={`search-match-${index}`}
          className={`px-1 py-0.5 rounded-sm cursor-pointer transition-all duration-200 ${
            isCurrentMatch
              ? "bg-yellow-400 text-black font-semibold shadow-md ring-2 ring-yellow-500 ring-offset-1"
              : "bg-yellow-200 text-black hover:bg-yellow-300"
          }`}
          onClick={() => setCurrentMatchIndex(index)}
          title={`Match ${index + 1} of ${searchMatches.length}`}
        >
          {jsonText.slice(match.startIndex, match.endIndex)}
        </span>
      );

      lastIndex = match.endIndex;
    });

    // Add remaining text
    if (lastIndex < jsonText.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>{jsonText.slice(lastIndex)}</span>
      );
    }

    return <pre className="whitespace-pre-wrap break-words">{parts}</pre>;
  };

  // Handle search navigation with proper scrolling
  const goToNextMatch = useCallback(() => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % searchMatches.length);
    }
  }, [searchMatches.length]);

  const goToPrevMatch = useCallback(() => {
    if (searchMatches.length > 0) {
      setCurrentMatchIndex(
        (prev) => (prev - 1 + searchMatches.length) % searchMatches.length
      );
    }
  }, [searchMatches.length]);

  // Scroll to current match
  useEffect(() => {
    if (searchMatches.length > 0 && currentMatchIndex >= 0 && !viewTree) {
      const matchElement = document.getElementById(
        `search-match-${currentMatchIndex}`
      );
      if (matchElement && rawJsonContainerRef.current) {
        // Scroll the match into view
        matchElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });

        // Add a brief flash effect to make it more visible
        matchElement.style.transform = "scale(1.05)";
        setTimeout(() => {
          matchElement.style.transform = "scale(1)";
        }, 200);
      }
    }
  }, [currentMatchIndex, searchMatches, viewTree]);

  // Enhanced keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Open search with Ctrl+F/Cmd+F
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
        return;
      }

      // Search navigation when search is active
      if (searchVisible && searchMatches.length > 0) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) {
            goToPrevMatch();
          } else {
            goToNextMatch();
          }
        }
      }

      // Close search with Escape
      if (e.key === "Escape" && searchVisible) {
        setSearchVisible(false);
        setSearchQuery("");
        setSearchMatches([]);
      }

      // Original functionality preserved
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && !searchVisible) {
        onToggleView(false);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    onToggleView,
    searchVisible,
    searchMatches.length,
    goToNextMatch,
    goToPrevMatch,
  ]);

  // memoize so we only do this heavy walk once per data change
  const parsedData = useMemo(() => deepParse(data), [data]);

  // Get formatted JSON string
  const formattedJSON = useMemo(() => {
    return JSON.stringify(parsedData, null, 2);
  }, [parsedData]);

  // Update search matches when query or data changes
  useEffect(() => {
    if (searchQuery && !viewTree) {
      const matches = findMatchesInRawJSON(formattedJSON, searchQuery);
      setSearchMatches(matches);
      setCurrentMatchIndex(0);
    } else {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
    }
  }, [searchQuery, formattedJSON, viewTree, findMatchesInRawJSON]);

  if (!open) return null;

  return (
    <div className={`h-full flex flex-col shadow-lg transition-colors duration-200 ${
      isDarkMode ? "bg-gray-800" : "bg-white"
    }`}>
      {/* Header */}
      <div className={`flex-shrink-0 border-b px-6 py-4 transition-colors duration-200 ${
        isDarkMode 
          ? "bg-gray-800 border-gray-700" 
          : "bg-white border-gray-200"
      }`}>
        <div className="flex justify-between items-center mb-4">
          <span className={`font-semibold truncate pr-4 transition-colors duration-200 ${
            isDarkMode ? "text-gray-100" : "text-gray-900"
          }`}>
            {title}
          </span>
          <div className="flex items-center gap-3">
            {/* Search Toggle Button - Only show when in Raw JSON view */}
            {!viewTree && (
              <button
                onClick={() => {
                  setSearchVisible(!searchVisible);
                  if (!searchVisible) {
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                  }
                }}
                className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg border transition-colors duration-200 ${
                  searchVisible
                    ? (isDarkMode 
                        ? "text-blue-300 bg-blue-900 border-blue-600" 
                        : "text-blue-700 bg-blue-50 border-blue-300")
                    : (isDarkMode 
                        ? "text-gray-300 bg-gray-700 border-gray-600 hover:bg-gray-600" 
                        : "text-gray-700 bg-white border-gray-300 hover:bg-gray-50")
                }`}
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                Search
                {searchMatches.length > 0 && (
                  <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                    isDarkMode 
                      ? "bg-blue-800 text-blue-200" 
                      : "bg-blue-100 text-blue-800"
                  }`}>
                    {searchMatches.length}
                  </span>
                )}
              </button>
            )}

            {canRetriggerRequest && onEditRequest && (
              <button
                onClick={() => {
                  if (onEditRequest) {
                    onEditRequest(data, data.method || data.displayName || 'HTTP Request');
                  }
                }}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
                  isDarkMode 
                    ? "bg-green-700 hover:bg-green-600" 
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                Resend
              </button>
            )}

            <button
              onClick={onCopy}
              className={`inline-flex items-center px-4 py-2 text-sm font-medium border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200 bg-gray-700 border-gray-600 hover:bg-gray-600 hover:text-blue-300" 
                  : "text-gray-700 bg-white border-gray-300 hover:bg-gray-50 hover:text-blue-600"
              }`}
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className={`inline-flex items-center justify-center w-9 h-9 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700" 
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Search Bar - Only show when in Raw JSON view */}
        {searchVisible && !viewTree && (
          <div className={`mb-4 p-4 rounded-lg border transition-colors duration-200 ${
            isDarkMode 
              ? "bg-gradient-to-r from-gray-800 to-gray-700 border-gray-600" 
              : "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200"
          }`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search in JSON text..."
                  className={`w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-colors duration-200 ${
                    isDarkMode 
                      ? "border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400" 
                      : "border-gray-300 bg-white text-gray-900 placeholder-gray-500"
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setSearchMatches([]);
                    }}
                    className={`absolute right-3 top-1/2 transform -translate-y-1/2 transition-colors ${
                      isDarkMode 
                        ? "text-gray-400 hover:text-gray-200" 
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Navigation buttons */}
              <div className={`flex items-center gap-1 rounded-lg p-1 shadow-sm transition-colors duration-200 ${
                isDarkMode ? "bg-gray-700" : "bg-white"
              }`}>
                <button
                  onClick={goToPrevMatch}
                  disabled={searchMatches.length === 0}
                  className={`p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                    isDarkMode 
                      ? "text-gray-400 hover:text-gray-200 hover:bg-gray-600" 
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                  title="Previous match (Shift+Enter)"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 15l7-7 7 7"
                    />
                  </svg>
                </button>
                <button
                  onClick={goToNextMatch}
                  disabled={searchMatches.length === 0}
                  className={`p-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                    isDarkMode 
                      ? "text-gray-400 hover:text-gray-200 hover:bg-gray-600" 
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                  title="Next match (Enter)"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <label className="flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                    className={`w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 focus:ring-2 rounded ${
                      isDarkMode ? "bg-gray-600" : "bg-gray-100"
                    }`}
                  />
                  <span className={`ml-2 transition-colors duration-200 ${
                    isDarkMode 
                      ? "text-gray-300 group-hover:text-gray-100" 
                      : "text-gray-700 group-hover:text-gray-900"
                  }`}>
                    Case sensitive
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                {searchMatches.length > 0 && (
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-md shadow-sm transition-colors duration-200 ${
                    isDarkMode ? "bg-gray-700" : "bg-white"
                  }`}>
                    <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                    <span className={`text-xs transition-colors duration-200 ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}>Highlighted</span>
                  </div>
                )}
                <div className={`font-medium transition-colors duration-200 ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}>
                  {searchMatches.length > 0 ? (
                    <span className={isDarkMode ? "text-blue-300" : "text-blue-700"}>
                      {currentMatchIndex + 1} of {searchMatches.length} matches
                    </span>
                  ) : searchQuery ? (
                    <span className={isDarkMode ? "text-red-400" : "text-red-600"}>No matches found</span>
                  ) : (
                    <span>Enter search term</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Toggle */}
        <div className="flex items-center space-x-6">
          <label className="flex items-center cursor-pointer group">
            <input
              type="radio"
              checked={viewTree}
              onChange={() => onToggleView(true)}
              className={`w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 focus:ring-2 transition-colors duration-200 ${
                isDarkMode ? "bg-gray-600" : "bg-gray-100"
              }`}
            />
            <span className={`ml-3 text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-300 group-hover:text-gray-100" 
                : "text-gray-700 group-hover:text-gray-900"
            }`}>
              Tree View
            </span>
          </label>
          <label className="flex items-center cursor-pointer group">
            <input
              type="radio"
              checked={!viewTree}
              onChange={() => onToggleView(false)}
              className={`w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 focus:ring-2 transition-colors duration-200 ${
                isDarkMode ? "bg-gray-600" : "bg-gray-100"
              }`}
            />
            <span className={`ml-3 text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-300 group-hover:text-gray-100" 
                : "text-gray-700 group-hover:text-gray-900"
            }`}>
              Raw JSON
            </span>
          </label>
        </div>
      </div>
      {/* Content */}
      <div className={`flex-1 px-4 py-4 min-h-0 transition-colors duration-200 ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}>
        <div className={`rounded-lg border h-full flex flex-col transition-colors duration-200 ${
          isDarkMode 
            ? "bg-gray-800 border-gray-700" 
            : "bg-white border-gray-200"
        }`}>
          {viewTree ? (
            <div className="flex-1 min-h-0 p-4">
              <div
                className="h-full overflow-auto"
                style={{ maxHeight: "100%" }}
              >
                <ReactJson
                  src={
                    typeof parsedData === "object"
                      ? parsedData
                      : { value: parsedData }
                  }
                  name={false}
                  collapsed={2}
                  enableClipboard={false}
                  displayDataTypes={false}
                  displayObjectSize={false}
                  indentWidth={2}
                  style={{
                    fontSize: "0.75rem",
                    fontFamily:
                      "monospace, ui-monospace, SFMono-Regular, 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Menlo'",
                    backgroundColor: "transparent",
                    padding: "0",
                    maxHeight: "100%",
                    overflow: "visible",
                  }}
                  theme={
                    isDarkMode
                      ? {
                          base00: "transparent", // editor background
                          base01: "#374151", // lighter background
                          base02: "#4b5563", // selection background
                          base03: "#6b7280", // comments
                          base04: "#9ca3af", // dark foreground
                          base05: "#f3f4f6", // default foreground
                          base06: "#f9fafb", // light foreground
                          base07: "#ffffff", // lightest foreground
                          base08: "#f87171", // red
                          base09: "#fb923c", // orange
                          base0A: "#fbbf24", // yellow
                          base0B: "#34d399", // green
                          base0C: "#22d3ee", // cyan
                          base0D: "#60a5fa", // blue
                          base0E: "#a78bfa", // purple
                          base0F: "#9ca3af", // brown
                        }
                      : {
                          base00: "transparent",
                          base01: "#f8f9fa",
                          base02: "#e9ecef",
                          base03: "#6c757d",
                          base04: "#495057",
                          base05: "#212529",
                          base06: "#212529",
                          base07: "#000000",
                          base08: "#dc3545",
                          base09: "#fd7e14",
                          base0A: "#ffc107",
                          base0B: "#28a745",
                          base0C: "#17a2b8",
                          base0D: "#007bff",
                          base0E: "#6f42c1",
                          base0F: "#6c757d",
                        }
                  }
                />
              </div>
            </div>
          ) : (
            <div
              ref={rawJsonContainerRef}
              className={`flex-1 m-4 font-mono text-sm leading-relaxed overflow-auto transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-800"
              }`}
            >
              {renderHighlightedJSON(formattedJSON)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
