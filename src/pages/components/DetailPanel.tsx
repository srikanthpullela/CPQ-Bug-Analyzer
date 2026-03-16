"use client";

import type React from "react";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import ReactJson from "react-json-view";

interface Props {
  open: boolean;
  title: string;
  data: any;
  onCopy: () => void;
  onClose: () => void;
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
      // not parseable
    }
  }
  return str;
}

// Recursively walk and replace any JSON-serialized strings
function deepParse(val: any): any {
  if (typeof val === "string") {
    const parsed = tryParseJSON(val);
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

// Helper function to format header arrays into key-value
function formatHeadersArray(headers: any[]): Record<string, string> {
  if (!Array.isArray(headers)) return {};
  const formatted: Record<string, string> = {};
  headers.forEach((header, index) => {
    if (header && typeof header === "object") {
      if (header.name && header.value !== undefined) {
        formatted[header.name] = header.value;
      } else {
        formatted[`header_${index}`] = JSON.stringify(header);
      }
    } else {
      formatted[`header_${index}`] = String(header);
    }
  });
  return formatted;
}

// Extract clean payload data (remove internal metadata)
function extractCleanPayload(data: any): any {
  if (!data) return {};
  if (typeof data !== "object") return data;

  const clean = { ...data };
  const metaKeys = [
    "_method", "_url", "_headers", "_rawPostData", "_queryString",
    "_originalPayload", "_noPayload", "_resendMethod", "_resendUrl",
    "_debug", "_noData",
  ];
  metaKeys.forEach((k) => delete clean[k]);

  const remaining = Object.keys(clean).filter((k) => !k.startsWith("_"));
  if (remaining.length === 0) return {};

  return clean;
}

const reactJsonThemeDark = {
  base00: "transparent",
  base01: "#374151",
  base02: "#4b5563",
  base03: "#6b7280",
  base04: "#9ca3af",
  base05: "#f3f4f6",
  base06: "#f9fafb",
  base07: "#ffffff",
  base08: "#f87171",
  base09: "#fb923c",
  base0A: "#fbbf24",
  base0B: "#34d399",
  base0C: "#22d3ee",
  base0D: "#60a5fa",
  base0E: "#a78bfa",
  base0F: "#9ca3af",
};

const reactJsonThemeLight = {
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
};

const reactJsonStyle = {
  fontSize: "11px",
  lineHeight: "1.4",
  fontFamily: "Menlo, Monaco, Consolas, 'SF Mono', 'Liberation Mono', monospace",
  backgroundColor: "transparent",
  padding: "0",
  maxHeight: "100%",
  overflow: "visible" as const,
};

// --- Sub-component: JSON content viewer (tree or raw with search) ---
const JsonContentView: React.FC<{
  data: any;
  isDarkMode: boolean;
  defaultCollapsed?: number;
  emptyMessage?: string;
}> = ({ data, isDarkMode, defaultCollapsed = 2, emptyMessage }) => {
  const [viewMode, setViewMode] = useState<"tree" | "raw">("tree");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rawJsonContainerRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => deepParse(data), [data]);
  const formattedJSON = useMemo(() => JSON.stringify(parsed, null, 2), [parsed]);

  const isEmpty =
    !data ||
    (typeof data === "object" && Object.keys(data).length === 0);

  const findMatches = useCallback(
    (text: string, query: string): SearchMatch[] => {
      if (!query.trim()) return [];
      const matches: SearchMatch[] = [];
      const term = caseSensitive ? query : query.toLowerCase();
      const searchable = caseSensitive ? text : text.toLowerCase();
      let idx = searchable.indexOf(term);
      let mi = 0;
      while (idx !== -1) {
        matches.push({
          path: [], type: "value", index: mi++,
          text: text.slice(idx, idx + query.length),
          startIndex: idx, endIndex: idx + query.length,
          value: text.slice(idx, idx + query.length),
        });
        idx = searchable.indexOf(term, idx + 1);
      }
      return matches;
    },
    [caseSensitive]
  );

  useEffect(() => {
    if (searchQuery && viewMode === "raw") {
      const m = findMatches(formattedJSON, searchQuery);
      setSearchMatches(m);
      setCurrentMatchIndex(0);
    } else {
      setSearchMatches([]);
      setCurrentMatchIndex(0);
    }
  }, [searchQuery, formattedJSON, viewMode, findMatches]);

  const goNext = useCallback(() => {
    if (searchMatches.length > 0)
      setCurrentMatchIndex((p) => (p + 1) % searchMatches.length);
  }, [searchMatches.length]);

  const goPrev = useCallback(() => {
    if (searchMatches.length > 0)
      setCurrentMatchIndex((p) => (p - 1 + searchMatches.length) % searchMatches.length);
  }, [searchMatches.length]);

  useEffect(() => {
    if (searchMatches.length > 0 && currentMatchIndex >= 0 && viewMode === "raw") {
      const el = document.getElementById(`search-match-${currentMatchIndex}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentMatchIndex, searchMatches, viewMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setViewMode("raw");
        setSearchVisible(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      if (searchVisible && searchMatches.length > 0 && e.key === "Enter") {
        e.preventDefault();
        e.shiftKey ? goPrev() : goNext();
      }
      if (e.key === "Escape" && searchVisible) {
        setSearchVisible(false);
        setSearchQuery("");
        setSearchMatches([]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchVisible, searchMatches.length, goNext, goPrev]);

  const renderHighlightedJSON = (jsonText: string) => {
    if (!searchQuery.trim() || searchMatches.length === 0) {
      return (
        <pre className="whitespace-pre-wrap break-words" style={{ fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: "11px", lineHeight: "1.4" }}>
          {jsonText}
        </pre>
      );
    }
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    searchMatches.forEach((match, index) => {
      if (match.startIndex > lastIndex) {
        parts.push(<span key={`t-${lastIndex}`}>{jsonText.slice(lastIndex, match.startIndex)}</span>);
      }
      const isCurrent = index === currentMatchIndex;
      parts.push(
        <span
          key={`m-${index}`}
          id={`search-match-${index}`}
          className={`px-0.5 rounded-sm cursor-pointer ${
            isCurrent
              ? "bg-yellow-400 text-black font-semibold ring-2 ring-yellow-500"
              : "bg-yellow-200 text-black hover:bg-yellow-300"
          }`}
          onClick={() => setCurrentMatchIndex(index)}
        >
          {jsonText.slice(match.startIndex, match.endIndex)}
        </span>
      );
      lastIndex = match.endIndex;
    });
    if (lastIndex < jsonText.length) {
      parts.push(<span key={`t-${lastIndex}`}>{jsonText.slice(lastIndex)}</span>);
    }
    return <pre className="whitespace-pre-wrap break-words" style={{ fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: "11px", lineHeight: "1.4" }}>{parts}</pre>;
  };

  if (isEmpty && emptyMessage) {
    return (
      <div className={`h-full flex items-center justify-center text-center text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* View mode toggle + search */}
      <div className={`flex items-center justify-between px-2 py-1 border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
        <div className="flex items-center gap-3">
          <label className="flex items-center cursor-pointer">
            <input type="radio" checked={viewMode === "tree"} onChange={() => setViewMode("tree")}
              className={`w-3 h-3 text-blue-600 ${isDarkMode ? "bg-gray-600" : "bg-gray-100"}`} />
            <span className={`ml-1 text-[11px] font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>Tree</span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input type="radio" checked={viewMode === "raw"} onChange={() => setViewMode("raw")}
              className={`w-3 h-3 text-blue-600 ${isDarkMode ? "bg-gray-600" : "bg-gray-100"}`} />
            <span className={`ml-1 text-[11px] font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>Raw</span>
          </label>
        </div>
        {viewMode === "raw" && (
          <button
            onClick={() => { setSearchVisible(!searchVisible); if (!searchVisible) setTimeout(() => searchInputRef.current?.focus(), 100); }}
            className={`text-[11px] px-1.5 py-0.5 rounded border ${
              searchVisible
                ? isDarkMode ? "text-blue-300 bg-blue-900 border-blue-600" : "text-blue-700 bg-blue-50 border-blue-300"
                : isDarkMode ? "text-gray-400 border-gray-600 hover:bg-gray-700" : "text-gray-500 border-gray-300 hover:bg-gray-50"
            }`}
          >
            Search{searchMatches.length > 0 ? ` (${searchMatches.length})` : ""}
          </button>
        )}
      </div>

      {/* Search bar */}
      {searchVisible && viewMode === "raw" && (
        <div className={`flex items-center gap-1 px-2 py-1 border-b ${isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"}`}>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className={`flex-1 px-1.5 py-0.5 text-[11px] border rounded ${isDarkMode ? "border-gray-600 bg-gray-700 text-gray-100" : "border-gray-300 bg-white text-gray-900"}`}
          />
          <button onClick={goPrev} disabled={searchMatches.length === 0} className={`p-0.5 rounded disabled:opacity-30 ${isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-black"}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </button>
          <button onClick={goNext} disabled={searchMatches.length === 0} className={`p-0.5 rounded disabled:opacity-30 ${isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-black"}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)}
              className={`w-3 h-3 rounded ${isDarkMode ? "bg-gray-600" : "bg-gray-100"}`} />
            <span className={`ml-1 text-[10px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>Aa</span>
          </label>
          {searchMatches.length > 0 && (
            <span className={`text-[10px] ${isDarkMode ? "text-blue-300" : "text-blue-600"}`}>
              {currentMatchIndex + 1}/{searchMatches.length}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-1">
        {viewMode === "tree" ? (
          <ReactJson
            src={typeof parsed === "object" && Object.keys(parsed).length > 0 ? parsed : { value: parsed }}
            name={false}
            collapsed={defaultCollapsed}
            enableClipboard={false}
            displayDataTypes={false}
            displayObjectSize={false}
            indentWidth={2}
            style={reactJsonStyle}
            theme={isDarkMode ? reactJsonThemeDark : reactJsonThemeLight}
          />
        ) : (
          <div ref={rawJsonContainerRef} className={`font-mono text-[11px] leading-snug ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
            {renderHighlightedJSON(formattedJSON)}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Sub-component: Headers view (like Chrome) ---
const HeadersView: React.FC<{
  data: any;
  isDarkMode: boolean;
}> = ({ data, isDarkMode }) => {
  const isHttp = data?._rowType === "http";

  const requestHeaders = isHttp
    ? formatHeadersArray(data?.headers?.requestHeaders || data?.headers?.request || [])
    : formatHeadersArray(data?.headers?.connectionHeaders || []);
  const responseHeaders = isHttp
    ? formatHeadersArray(data?.headers?.responseHeaders || data?.headers?.response || [])
    : formatHeadersArray(data?.headers?.responseHeaders || []);

  const generalInfo: Record<string, string> = {};
  if (isHttp) {
    if (data.headers?.url) generalInfo["Request URL"] = data.headers.url;
    if (data.httpMethod || data.headers?.method) generalInfo["Request Method"] = data.httpMethod || data.headers?.method || "";
    if (data.status !== null && data.status !== undefined) generalInfo["Status Code"] = String(data.status);
    if (data.urlPattern) generalInfo["URL Pattern"] = data.urlPattern;
    if (data.patternType) generalInfo["Pattern Type"] = data.patternType;
  } else {
    if (data.headers?.url || data.endpoint) generalInfo["URL"] = data.headers?.url || data.endpoint || "";
    generalInfo["Type"] = "WebSocket";
    if (data.direction) generalInfo["Direction"] = data.direction;
    if (data.status !== null && data.status !== undefined) generalInfo["Status"] = String(data.status);
  }

  const hasRequestHeaders = Object.keys(requestHeaders).length > 0;
  const hasResponseHeaders = Object.keys(responseHeaders).length > 0;
  const hasGeneral = Object.keys(generalInfo).length > 0;

  const Section: React.FC<{ title: string; entries: Record<string, string> }> = ({ title, entries }) => (
    <div className="mb-2">
      <div className={`text-[11px] font-semibold px-2 py-1 ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
        {title}
      </div>
      <table className="w-full">
        <tbody>
          {Object.entries(entries).map(([k, v]) => (
            <tr key={k} className={`border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}>
              <td className={`px-2 py-0.5 text-[11px] font-medium whitespace-nowrap align-top ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                {k}:
              </td>
              <td className={`px-2 py-0.5 text-[11px] break-all ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!hasGeneral && !hasRequestHeaders && !hasResponseHeaders) {
    return (
      <div className={`h-full flex items-center justify-center text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
        No headers available
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full p-1" style={{ fontFamily: "Menlo, Monaco, Consolas, monospace" }}>
      {hasGeneral && <Section title="General" entries={generalInfo} />}
      {hasResponseHeaders && <Section title="Response Headers" entries={responseHeaders} />}
      {hasRequestHeaders && <Section title={isHttp ? "Request Headers" : "Connection Headers"} entries={requestHeaders} />}
    </div>
  );
};

// --- Main DetailPanel ---
export const DetailPanel: React.FC<Props> = ({
  open,
  title,
  data,
  onCopy,
  onClose,
  origin,
  onEditRequest,
  isDarkMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<string>("preview");

  const isHttp = data?._rowType === "http";
  const isWs = data?._rowType === "ws";

  const tabs = useMemo(() => {
    if (isWs) {
      return [
        { id: "response", label: "Response" },
        { id: "headers", label: "Headers" },
      ];
    }
    return [
      { id: "headers", label: "Headers" },
      { id: "payload", label: "Payload" },
      { id: "preview", label: "Preview" },
      { id: "response", label: "Response" },
    ];
  }, [isWs]);

  // Persist the user's last-selected tab per row type (HTTP vs WS)
  const prevRowType = useRef<string | undefined>();
  const savedTabPerType = useRef<Record<string, string>>({});
  useEffect(() => {
    if (data) {
      const currentType = data._rowType;
      if (prevRowType.current !== currentType) {
        // Switching row types — restore saved tab or use default
        const saved = savedTabPerType.current[currentType];
        const validTabs = isWs ? ["response", "headers"] : ["headers", "payload", "preview", "response"];
        if (saved && validTabs.includes(saved)) {
          setActiveTab(saved);
        } else {
          setActiveTab(isWs ? "response" : "headers");
        }
        prevRowType.current = currentType;
      }
    }
  }, [data, isWs]);

  // Save the active tab whenever the user changes it
  useEffect(() => {
    if (prevRowType.current) {
      savedTabPerType.current[prevRowType.current] = activeTab;
    }
  }, [activeTab]);

  const payloadData = useMemo(() => {
    if (isHttp) {
      return extractCleanPayload(data?.requestPayload);
    }
    return null;
  }, [data, isHttp]);

  const responseData = useMemo(() => {
    if (isHttp) return deepParse(data?.responsePayload || {});
    if (isWs) return deepParse(data?.payload || {});
    return {};
  }, [data, isHttp, isWs]);

  const finalUrl = useMemo(() => {
    if (data?.requestPayload?._url || data?.requestPayload?.url) {
      return data.requestPayload._url || data.requestPayload.url;
    }
    if (data?.headers?.url) return data.headers.url;
    if (data?.patternType === "apex" || data?.urlPattern === "ApexRemote") {
      return origin ? `${origin}/apexremote` : null;
    }
    if (data?.patternType === "http" && data?.endpoint && origin) {
      const ep = data.endpoint.startsWith("/") ? data.endpoint : `/${data.endpoint}`;
      return `${origin}${ep}`;
    }
    return null;
  }, [data, origin]);

  const canResend = isHttp && data && (finalUrl || data.requestPayload?._url || data.requestPayload?._method);

  if (!open || !data) return null;

  const displayTitle = title || data?.method || data?.endpoint || "Details";

  // WS rows: show plain JSON viewer with title bar only (no tabs)
  if (isWs) {
    return (
      <div className={`h-full flex flex-col shadow-lg transition-colors duration-200 ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
        {/* Title bar */}
        <div className={`flex-shrink-0 flex items-center justify-between px-2 py-1 border-b ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <span className={`text-xs font-semibold truncate ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
            {displayTitle}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify(responseData, null, 2)).catch(() => {});
              }}
              className={`p-1 rounded ${isDarkMode ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
              title="Copy"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className={`p-1 rounded ${isDarkMode ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* JSON content */}
        <div className={`flex-1 min-h-0 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
          <JsonContentView
            data={responseData}
            isDarkMode={isDarkMode}
            defaultCollapsed={2}
            emptyMessage="No data"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col shadow-lg transition-colors duration-200 ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
      {/* Title bar */}
      <div className={`flex-shrink-0 flex items-center justify-between px-2 py-1 border-b ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
        <span className={`text-xs font-semibold truncate ${isDarkMode ? "text-gray-100" : "text-gray-900"}`}>
          {displayTitle}
          {data?.status !== null && data?.status !== undefined && (
            <span className={`ml-2 text-[11px] font-normal ${
              data.status >= 400 ? (isDarkMode ? "text-red-400" : "text-red-600")
                : data.status >= 300 ? (isDarkMode ? "text-yellow-400" : "text-yellow-600")
                : (isDarkMode ? "text-green-400" : "text-green-600")
            }`}>
              {data.status}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {canResend && onEditRequest && (
            <button
              onClick={() => {
                const enhancedData = {
                  ...data.requestPayload,
                  url: finalUrl || data.requestPayload?._url,
                  _resendUrl: finalUrl || data.requestPayload?._url,
                };
                onEditRequest(enhancedData, data.method || data.requestPayload?._method || "HTTP Request");
              }}
              className={`px-1.5 py-0.5 text-[11px] font-medium text-white rounded ${isDarkMode ? "bg-green-700 hover:bg-green-600" : "bg-green-600 hover:bg-green-700"}`}
            >
              Resend
            </button>
          )}
          <button
            onClick={() => {
              let copyData = data;
              if (activeTab === "payload") copyData = payloadData;
              else if (activeTab === "preview" || activeTab === "response") copyData = responseData;
              else if (activeTab === "headers") copyData = data.headers;
              navigator.clipboard?.writeText(JSON.stringify(copyData, null, 2)).catch(() => {});
            }}
            className={`p-1 rounded ${isDarkMode ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
            title="Copy"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className={`p-1 rounded ${isDarkMode ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chrome-style tab bar */}
      <div className={`flex-shrink-0 flex border-b ${isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? isDarkMode
                  ? "text-blue-400 border-blue-400"
                  : "text-blue-600 border-blue-600"
                : isDarkMode
                ? "text-gray-400 border-transparent hover:text-gray-200 hover:border-gray-500"
                : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={`flex-1 min-h-0 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        {activeTab === "headers" && (
          <HeadersView data={data} isDarkMode={isDarkMode} />
        )}

        {activeTab === "payload" && isHttp && (
          <JsonContentView
            data={payloadData}
            isDarkMode={isDarkMode}
            defaultCollapsed={1}
            emptyMessage="No request payload"
          />
        )}

        {activeTab === "preview" && (
          <JsonContentView
            data={responseData}
            isDarkMode={isDarkMode}
            defaultCollapsed={2}
            emptyMessage="No preview available"
          />
        )}

        {activeTab === "response" && (
          <JsonContentView
            data={responseData}
            isDarkMode={isDarkMode}
            defaultCollapsed={2}
            emptyMessage="No response data"
          />
        )}
      </div>
    </div>
  );
};
