// src/components/HttpTableTab.tsx
import React, { useState } from "react";
import { LoadingIndicator } from "./LoadingIndicator";

export interface HttpRow {
  method: string;
  requestPayload: any;
  responsePayload: any;
  status: number | null;
  time: string;
  id: string;
  startTime: number;
  endTime?: number;
  urlPattern?: string;
  patternType?: 'apex' | 'http' | 'generic';
  httpMethod?: string;
  endpoint?: string;
  displayName?: string;
  hasMessages?: boolean;
  // Add header support
  headers?: {
    request?: any[];
    response?: any[];
  };
  requestHeaders?: any[];
  responseHeaders?: any[];
  url?: string;
}

interface Props {
  rows: HttpRow[];
  filter: string;
  selectedRowKey: string | null;
  onView: (rowKey: string, title: string, data: any) => void;
  isDarkMode?: boolean;
  headerTitle?: string;
  isLoading?: boolean;
  panelOpen?: boolean;
  autoScroll?: boolean;
  onToggleAutoScroll?: () => void;
}

export const HttpTableTab: React.FC<Props> = ({
  rows,
  filter,
  selectedRowKey,
  onView,
  isDarkMode = false,
  headerTitle = "API Methods",
  isLoading = false,
  panelOpen = false,
  autoScroll = false,
  onToggleAutoScroll,
}) => {
  // Add state for minimizing/expanding the table
  const [isMinimized, setIsMinimized] = useState(false);

  const filtered = rows.filter((r) => {
    const safeStringify = (obj: any) => {
      try {
        return JSON.stringify(obj || {});
      } catch {
        return String(obj || '');
      }
    };

    const combined = `${r.time} ${r.method} ${safeStringify(
      r.requestPayload
    )} ${safeStringify(r.responsePayload)} ${safeStringify(
      r.requestHeaders || []
    )} ${safeStringify(r.responseHeaders || [])} ${safeStringify(
      r.headers || {}
    )} ${r.url || ''} ${r.httpMethod || ''} ${r.endpoint || ''} ${r.displayName || ''}`;
    
    return !filter || combined.toLowerCase().includes(filter.toLowerCase());
  });

  type GroupKey = string;
  interface GroupedRow {
    time: string;
    method: string;
    status: number | null;
    actions: Set<"Request" | "Response" | "Headers">;
    lastRequestPayload?: any;
    lastResponsePayload?: any;
    lastHeaders?: any;
    id?: string;
    startTime: number;
    endTime?: number;
    urlPattern?: string;
    patternType?: 'apex' | 'http' | 'generic';
    httpMethod?: string;
    endpoint?: string;
    displayName?: string;
    hasMessages?: boolean;
  }

  const groups: Record<GroupKey, GroupedRow> = {};
  const order: GroupKey[] = [];

  filtered.forEach((r) => {
    if (groups[r.id]) return;

    const responseTid = Array.isArray(r.responsePayload)
      ? r.responsePayload[0]?.tid
      : null;

    const dupKey = order.find((key) => {
      const gr = groups[key];
      const existingTid = Array.isArray(gr.lastResponsePayload)
        ? gr.lastResponsePayload[0]?.tid
        : null;

      return (
        gr.startTime === r.startTime &&
        gr.method === r.method &&
        existingTid !== null &&
        existingTid === responseTid
      );
    });

    const keyToUse = dupKey || r.id;

    if (!groups[keyToUse]) {
      groups[keyToUse] = {
        time: r.time,
        method: r.method,
        status: r.status,
        actions: new Set(),
        startTime: r.startTime,
        endTime: r.endTime,
        id: r.id,
        urlPattern: r.urlPattern,
        patternType: r.patternType,
        httpMethod: r.httpMethod,
        endpoint: r.endpoint,
        displayName: r.displayName,
        hasMessages: r.hasMessages,
      };
      order.push(keyToUse);
    }

    // Always add Request action - even if no payload, show method info
    groups[keyToUse].actions.add("Request");
    
    // Check if requestPayload is empty object or null/undefined
    const hasValidRequestPayload = r.requestPayload && 
      typeof r.requestPayload === 'object' && 
      Object.keys(r.requestPayload).length > 0;
    
    // Always ensure URL information is available for resending
    if (hasValidRequestPayload) {
      groups[keyToUse].lastRequestPayload = {
        ...r.requestPayload,
        // Add URL metadata for resending - use underscore prefix to avoid conflicts
        _method: r.httpMethod || r.method,
        _url: r.url,
        _originalPayload: true,
        // Add request headers for authentication
        _headers: r.requestHeaders || r.headers?.request || [],
      };
    } else {
      groups[keyToUse].lastRequestPayload = {
        _method: r.httpMethod || r.method,
        _url: r.url,
        _noPayload: true,
        // Add request headers for authentication
        _headers: r.requestHeaders || r.headers?.request || [],
      };
    }

    // Always add Response action - even if no payload, show status info
    groups[keyToUse].actions.add("Response");
    
    // Check if responsePayload is empty object or null/undefined
    const hasValidResponsePayload = r.responsePayload && 
      typeof r.responsePayload === 'object' && 
      Object.keys(r.responsePayload).length > 0;
    
    groups[keyToUse].lastResponsePayload = hasValidResponsePayload ? r.responsePayload : {
      _status: r.status,
      _noPayload: true,
      _message: r.status >= 400 ? 'Error Response' : 'Success Response'
    };
    
    if (r.hasMessages) {
      groups[keyToUse].hasMessages = true;
    }

    // Add Headers action - Always add it since we always provide header arrays
    groups[keyToUse].actions.add("Headers");
    groups[keyToUse].lastHeaders = {
      requestHeaders: r.requestHeaders || r.headers?.request || [],
      responseHeaders: r.responseHeaders || r.headers?.response || [],
      url: r.url || 'Unknown URL',
      method: r.httpMethod || r.method || 'Unknown Method',
      status: r.status,
      _info: {
        hasRequestHeaders: (r.requestHeaders?.length || r.headers?.request?.length || 0) > 0,
        hasResponseHeaders: (r.responseHeaders?.length || r.headers?.response?.length || 0) > 0,
        requestHeaderCount: r.requestHeaders?.length || r.headers?.request?.length || 0,
        responseHeaderCount: r.responseHeaders?.length || r.headers?.response?.length || 0
      }
    };
  });

  function getRowColorClass(gr: any): string {
    // First check HTTP status codes for errors
    if (gr.status !== null && typeof gr.status === 'number') {
      if (gr.status >= 500) {
        // Server errors (5xx) - Red
        return isDarkMode 
          ? "bg-red-900 border-l-4 border-red-500" 
          : "bg-red-100 border-l-4 border-red-500";
      } else if (gr.status >= 400) {
        // Client errors (4xx) - Use inline styles for reliability
        return isDarkMode 
          ? "border-l-4 border-orange-500" 
          : "border-l-4 border-orange-500";
      } else if (gr.status >= 300) {
        // Redirects (3xx) - Yellow
        return isDarkMode 
          ? "bg-yellow-900 border-l-4 border-yellow-500" 
          : "bg-yellow-100 border-l-4 border-yellow-500";
      }
      // 2xx and 1xx are considered successful, continue to other checks
    }

    // Check if we have the new hasMessages property from error detection
    if (gr.hasMessages) {
      return isDarkMode 
        ? "bg-red-900 border-l-4 border-red-500" 
        : "bg-red-100 border-l-4 border-red-500";
    }

    // Fallback to legacy pageErrors check for backward compatibility
    const pageErrors =
      gr?.lastResponsePayload?.[0]?.result?.pageErrors ||
      gr?.lastResponsePayload?.result?.pageErrors;

    if (!pageErrors) return "";

    const hasErrors = pageErrors.errorMessages?.v?.length > 0;
    const hasWarnings = pageErrors.warningMessages?.v?.length > 0;
    const hasInfo = pageErrors.infoMessages?.v?.length > 0;
    const hasSuccess = pageErrors.successMessages?.v?.length > 0;

    if (hasErrors) {
      return isDarkMode 
        ? "bg-red-900 border-l-4 border-red-500" 
        : "bg-red-100 border-l-4 border-red-500";
    }
    if (hasWarnings) {
      return isDarkMode 
        ? "bg-yellow-900 border-l-4 border-yellow-500" 
        : "bg-yellow-100 border-l-4 border-yellow-500";
    }
    if (hasInfo) {
      return isDarkMode 
        ? "bg-blue-900 border-l-4 border-blue-500" 
        : "bg-blue-100 border-l-4 border-blue-500";
    }
    if (hasSuccess) {
      return isDarkMode 
        ? "bg-green-900 border-l-4 border-green-500" 
        : "bg-green-100 border-l-4 border-green-500";
    }

    return "";
  }

  // Add function to get status badge styling
  const getStatusBadgeClass = (status: number | null): string => {
    if (status === null) return isDarkMode ? 'bg-gray-800/20 text-gray-400 border-gray-600' : 'bg-gray-50/50 text-gray-500 border-gray-300';
    
    if (status >= 200 && status < 300) {
      return isDarkMode 
        ? 'bg-green-900/20 text-green-300 border-green-600' 
        : 'bg-green-50/50 text-green-700 border-green-300';
    } else if (status >= 300 && status < 400) {
      return isDarkMode 
        ? 'bg-yellow-900/20 text-yellow-300 border-yellow-600' 
        : 'bg-yellow-50/50 text-yellow-700 border-yellow-300';
    } else if (status >= 400 && status < 500) {
      return isDarkMode 
        ? 'bg-orange-900/20 text-orange-300 border-orange-600' 
        : 'bg-orange-50/50 text-orange-700 border-orange-300';
    } else if (status >= 500) {
      return isDarkMode 
        ? 'bg-red-900/20 text-red-300 border-red-600' 
        : 'bg-red-50/50 text-red-700 border-red-300';
    }
    
    return isDarkMode ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-200';
  };

  // Add function to get inline styles for problematic colors
  const getRowInlineStyle = (gr: any, isSelected: boolean): React.CSSProperties => {
    // Don't apply error coloring when the row is selected
    if (isSelected) return {};
    if (gr.status !== null && typeof gr.status === 'number') {
      if (gr.status >= 400 && gr.status < 500) {
        return {
          backgroundColor: isDarkMode ? '#7c2d12' : '#fed7aa', // orange-900 : orange-100
        };
      }
    }
    return {};
  };

  const getStatusInlineStyle = (status: number | null): React.CSSProperties => {
    // No longer needed as we're using subtle backgrounds via Tailwind classes
    return {};
  };

  // Add function to get status text for tooltips
  const getStatusText = (status: number | null): string => {
    if (status === null) return 'No status';
    
    if (status >= 200 && status < 300) {
      return 'Success';
    } else if (status >= 300 && status < 400) {
      return 'Redirect';
    } else if (status >= 400 && status < 500) {
      return 'Client Error';
    } else if (status >= 500) {
      return 'Server Error';
    }
    
    return 'Unknown';
  };

  const displayRows = order.map((key) => groups[key]);

  return (
    <div className={`rounded overflow-x-auto transition-colors duration-200 ${
      isDarkMode ? "bg-gray-800" : "bg-white"
    }`}>
      {/* Add hidden safelist classes to ensure Tailwind includes them */}
      <div className="hidden bg-orange-100 text-orange-800 border-orange-200 bg-orange-900 text-orange-200 border-orange-600"></div>
      <h3 className={`px-2 py-1 text-xs font-semibold transition-colors duration-200 ${
        isDarkMode 
          ? "bg-gray-700 text-gray-100 border-b border-gray-600" 
          : "bg-gray-100 text-gray-800 border-b border-gray-200"
      }`}>
        <div className="flex items-center justify-between">
          <span>{headerTitle}</span>
          <div className="flex items-center gap-1">
            {/* Auto-scroll toggle */}
            {onToggleAutoScroll && (
              <button
                onClick={onToggleAutoScroll}
                className={`p-1 rounded transition-colors duration-200 ${
                  autoScroll
                    ? isDarkMode
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : "bg-blue-500 text-white hover:bg-blue-600"
                    : isDarkMode
                    ? "hover:bg-gray-600 text-gray-300 hover:text-gray-100"
                    : "hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                }`}
                title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className={`p-1 rounded transition-colors duration-200 ${
                isDarkMode
                  ? "hover:bg-gray-600 text-gray-300 hover:text-gray-100"
                  : "hover:bg-gray-200 text-gray-600 hover:text-gray-800"
              }`}
              title={isMinimized ? "+" : "-"}
            >
              {isMinimized ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </h3>
      
      {/* Conditionally render the table based on isMinimized state */}
      {!isMinimized && (
      <table className="min-w-full table-auto">
        <thead className={`sticky top-0 z-10 transition-colors duration-200 ${
          isDarkMode ? "bg-gray-700" : "bg-gray-50"
        }`}>
          <tr>
            <th className={`px-1 py-0.5 text-left text-xs font-medium w-0 whitespace-nowrap transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>#</th>
            <th className={`px-1 py-0.5 text-left text-xs font-medium w-0 whitespace-nowrap transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Time</th>
            <th className={`px-2 py-0.5 text-left text-xs font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Method</th>
            {!panelOpen && (
              <>
                <th className={`px-2 py-0.5 text-left text-xs font-medium transition-colors duration-200 ${
                  isDarkMode ? "text-gray-200" : "text-gray-700"
                }`}>Type</th>
                <th className={`px-2 py-0.5 text-left text-xs font-medium transition-colors duration-200 ${
                  isDarkMode ? "text-gray-200" : "text-gray-700"
                }`}>Duration</th>
                <th className={`px-2 py-0.5 text-left text-xs font-medium transition-colors duration-200 ${
                  isDarkMode ? "text-gray-200" : "text-gray-700"
                }`}>Status</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((gr, i) => {
            const isSelected = selectedRowKey === `http-${i}`;
            return (
            <tr
              key={gr.id || i}
              data-row-key={`http-${i}`}
              className={`transition-colors duration-200 cursor-pointer ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-blue-50"
              } ${
                isSelected
                  ? isDarkMode 
                    ? "!bg-blue-800 border-l-4 border-blue-400" 
                    : "!bg-blue-100 border-l-4 border-blue-500"
                  : getRowColorClass(gr) ||
                    (i % 2 === 0 
                      ? isDarkMode 
                        ? "bg-gray-800" 
                        : "bg-white"
                      : isDarkMode 
                        ? "bg-gray-900" 
                        : "bg-gray-50")
              }`}
              style={getRowInlineStyle(gr, isSelected)}
              onClick={() => {
                const isHttpLike = gr.patternType === 'http' || gr.patternType === 'generic';
                onView(
                  `http-${i}`,
                  isHttpLike ? gr.endpoint || gr.method : gr.method,
                  {
                    _rowType: 'http',
                    method: gr.method,
                    time: gr.time,
                    status: gr.status,
                    patternType: gr.patternType,
                    httpMethod: gr.httpMethod,
                    endpoint: gr.endpoint,
                    urlPattern: gr.urlPattern,
                    displayName: gr.displayName,
                    hasMessages: gr.hasMessages,
                    startTime: gr.startTime,
                    endTime: gr.endTime,
                    requestPayload: gr.lastRequestPayload,
                    responsePayload: gr.lastResponsePayload,
                    headers: gr.lastHeaders,
                  }
                );
              }}
            >
              <td className={`px-1 py-0.5 text-xs w-0 whitespace-nowrap transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`}>{i + 1}</td>
              <td className={`px-1 py-0.5 text-xs w-0 whitespace-nowrap transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`}>{gr.time}</td>
              <td className={`px-2 py-0.5 text-xs method-td transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`} title={(gr.patternType === 'http' || gr.patternType === 'generic') ? gr.endpoint || gr.method : gr.method}>
                <div className="truncate max-w-xs">
                  {(gr.patternType === 'http' || gr.patternType === 'generic') ? gr.method || gr.endpoint : gr.method}
                </div>
              </td>
              {!panelOpen && (
                <>
                  <td className={`px-2 py-0.5 text-xs transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}>
                    <span className={`px-1.5 py-0 text-[11px] rounded font-medium border opacity-75 ${
                      gr.patternType === 'apex'
                        ? isDarkMode 
                          ? "border-purple-600 text-purple-300 bg-purple-900/20" 
                          : "border-purple-300 text-purple-700 bg-purple-50/50"
                        : (gr.patternType === 'http' || gr.patternType === 'generic')
                        ? isDarkMode 
                          ? "border-green-600 text-green-300 bg-green-900/20" 
                          : "border-green-300 text-green-700 bg-green-50/50"
                        : isDarkMode 
                          ? "border-gray-600 text-gray-300 bg-gray-800/20" 
                          : "border-gray-300 text-gray-600 bg-gray-50/50"
                    }`} title={(gr.patternType === 'http' || gr.patternType === 'generic') ? `${gr.httpMethod || 'HTTP'} - ${gr.urlPattern || 'HTTP API'}` : gr.urlPattern || 'Unknown'}>
                      {(gr.patternType === 'http' || gr.patternType === 'generic') ? gr.httpMethod || 'HTTP' : gr.urlPattern || 'Unknown'}
                    </span>
                  </td>
                  <td className={`px-2 py-0.5 text-xs whitespace-nowrap transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}>
                    {gr.endTime && gr.startTime ? (
                      <span className={`text-[11px] font-medium ${
                        (() => {
                          const ms = gr.endTime - gr.startTime;
                          if (ms > 5000) return isDarkMode ? "text-red-400" : "text-red-600";
                          if (ms > 1000) return isDarkMode ? "text-orange-400" : "text-orange-600";
                          return isDarkMode ? "text-gray-400" : "text-gray-500";
                        })()
                      }`} title={`${Math.round(gr.endTime - gr.startTime)}ms`}>
                        {(() => {
                          const ms = Math.round(gr.endTime - gr.startTime);
                          if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
                          return `${ms}ms`;
                        })()}
                      </span>
                    ) : (
                      <span className={isDarkMode ? "text-gray-500" : "text-gray-400"}>–</span>
                    )}
                  </td>
                  <td className={`px-2 py-0.5 text-xs transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}>
                    {gr.status !== null ? (
                      <span
                        className={`inline-block px-1.5 py-0 text-[11px] font-medium rounded border opacity-70 ${getStatusBadgeClass(gr.status)}`}
                        title={`${gr.status} - ${getStatusText(gr.status)}`}
                      >
                        {gr.status}
                      </span>
                    ) : (
                      <span className={isDarkMode ? "text-gray-400" : "text-gray-400"}>–</span>
                    )}
                  </td>
                </>
              )}

            </tr>
            );
            })}
        </tbody>
      </table>
      )}
      
      {/* Loading indicator when network calls are in progress */}
      {isLoading && !isMinimized && (
        <LoadingIndicator 
          isDarkMode={isDarkMode}
          message="Capturing HTTP requests..."
        />
      )}
    </div>
  );
};