// src/components/HttpTableTab.tsx
import React, { useState } from "react";

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
}

export const HttpTableTab: React.FC<Props> = ({
  rows,
  filter,
  selectedRowKey,
  onView,
  isDarkMode = false,
  headerTitle = "API Methods",
}) => {
  // Add state for showing headers buttons
  const [showHeadersButtons, setShowHeadersButtons] = useState(false);
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
    if (status === null) return isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600';
    
    if (status >= 200 && status < 300) {
      return isDarkMode 
        ? 'bg-green-800 text-green-200 border-green-600' 
        : 'bg-green-100 text-green-800 border-green-200';
    } else if (status >= 300 && status < 400) {
      return isDarkMode 
        ? 'bg-yellow-800 text-yellow-200 border-yellow-600' 
        : 'bg-yellow-100 text-yellow-800 border-yellow-200';
    } else if (status >= 400 && status < 500) {
      return isDarkMode 
        ? 'border-orange-600' 
        : 'border-orange-200';
    } else if (status >= 500) {
      return isDarkMode 
        ? 'bg-red-800 text-red-200 border-red-600' 
        : 'bg-red-100 text-red-800 border-red-200';
    }
    
    return isDarkMode ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-200';
  };

  // Add function to get inline styles for problematic colors
  const getRowInlineStyle = (gr: any): React.CSSProperties => {
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
    if (status !== null && status >= 400 && status < 500) {
      return isDarkMode ? {
        backgroundColor: '#9a3412', // orange-800
        color: '#fed7aa', // orange-100
        borderColor: '#ea580c', // orange-600
      } : {
        backgroundColor: '#fed7aa', // orange-100
        color: '#9a3412', // orange-800
        borderColor: '#fdba74', // orange-200
      };
    }
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
      <h3 className={`p-2 font-semibold transition-colors duration-200 ${
        isDarkMode 
          ? "bg-gray-700 text-gray-100 border-b border-gray-600" 
          : "bg-gray-100 text-gray-800 border-b border-gray-200"
      }`}>
        <div className="flex items-center justify-between">
          <span>{headerTitle}</span>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className={`ml-2 p-1 rounded transition-colors duration-200 ${
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
      </h3>
      
      {/* Conditionally render the table based on isMinimized state */}
      {!isMinimized && (
      <table className="min-w-full table-auto">
        <thead className={`transition-colors duration-200 ${
          isDarkMode ? "bg-gray-700" : "bg-gray-50"
        }`}>
          <tr>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>#</th>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Time</th>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Method</th>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Type</th>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Status</th>
            {/* <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Duration</th> */}
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>
              <div className="flex items-center justify-between">
                <span>Actions</span>
                <label className="flex items-center cursor-pointer ml-2">
                  <input
                    type="checkbox"
                    checked={showHeadersButtons}
                    onChange={(e) => setShowHeadersButtons(e.target.checked)}
                    className={`w-3 h-3 text-indigo-600 border-gray-300 focus:ring-indigo-500 focus:ring-1 rounded ${
                      isDarkMode ? "bg-gray-600" : "bg-gray-100"
                    }`}
                  />
                  <span className={`ml-1 text-xs transition-colors duration-200 ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}>
                    Headers
                  </span>
                </label>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((gr, i) => (
            <tr
              key={gr.id || i}
              className={`transition-colors duration-200 cursor-pointer ${
                selectedRowKey === `http-${i}` 
                  ? isDarkMode 
                    ? "bg-blue-800 border-blue-600" 
                    : "bg-blue-100 border-blue-300"
                  : ""
              } ${
                selectedRowKey === `http-${i}` 
                  ? "" 
                  : getRowColorClass(gr) ||
                    (i % 2 === 0 
                      ? isDarkMode 
                        ? "bg-gray-800 hover:bg-gray-600" 
                        : "bg-white hover:bg-gray-50"
                      : isDarkMode 
                        ? "bg-gray-900 hover:bg-gray-600" 
                        : "bg-gray-50 hover:bg-gray-100")
              }`}
              style={getRowInlineStyle(gr)}
            >
              <td className={`px-3 py-1 text-sm transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`}>{i + 1}</td>
              <td className={`px-3 py-1 text-sm transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`}>{gr.time}</td>
              <td className={`px-3 py-1 text-sm method-td transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`} title={gr.patternType === 'http' ? gr.endpoint || gr.method : gr.method}>
                <div className="truncate max-w-xs">
                  {gr.patternType === 'http' ? gr.endpoint || gr.method : gr.method}
                </div>
              </td>
              <td className={`px-3 py-1 text-sm transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`}>
                <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                  gr.patternType === 'apex'
                    ? isDarkMode 
                      ? "bg-purple-800 text-purple-200" 
                      : "bg-purple-100 text-purple-800"
                    : gr.patternType === 'http'
                    ? isDarkMode 
                      ? "bg-green-800 text-green-200" 
                      : "bg-green-100 text-green-800"
                    : isDarkMode 
                      ? "bg-gray-700 text-gray-200" 
                      : "bg-gray-100 text-gray-700"
                }`} title={gr.patternType === 'http' ? `${gr.httpMethod || 'HTTP'} - ${gr.urlPattern || 'HTTP API'}` : gr.urlPattern || 'Unknown'}>
                  {gr.patternType === 'http' ? gr.httpMethod || 'HTTP' : gr.urlPattern || 'Unknown'}
                </span>
              </td>
              <td className={`px-3 py-1 text-sm transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`}>
                {gr.status !== null ? (
                  <span
                    className={`inline-block px-2 py-1 text-xs font-medium rounded border ${getStatusBadgeClass(gr.status)}`}
                    style={getStatusInlineStyle(gr.status)}
                    title={`${gr.status} - ${getStatusText(gr.status)}`}
                  >
                    {gr.status}
                  </span>
                ) : (
                  <span className={isDarkMode ? "text-gray-400" : "text-gray-400"}>–</span>
                )}
              </td>
              {/* <td className={`px-3 py-1 text-sm transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`}>
                {gr.startTime && gr.endTime
                  ? `${((gr.endTime - gr.startTime) / 1000).toFixed(2)}s`
                  : "–"}
              </td> */}
              <td className={`px-3 py-1 space-x-1 flex transition-colors duration-200`}>
                {Array.from(gr.actions).map((action) => {
                  // Only show Headers button if checkbox is checked
                  if (action === "Headers" && !showHeadersButtons) {
                    return null;
                  }
                  
                  return (
                    <button
                      key={action}
                      className={`px-2 py-0.5 text-xs font-medium text-white rounded transition-colors duration-200 ${
                        action === "Request" 
                          ? isDarkMode 
                            ? "bg-indigo-600 hover:bg-indigo-500" 
                            : "bg-indigo-500 hover:bg-indigo-600"
                          : action === "Response"
                          ? isDarkMode 
                            ? "bg-indigo-800 hover:bg-indigo-700" 
                            : "bg-indigo-700 hover:bg-indigo-800"
                          : isDarkMode 
                            ? "bg-purple-700 hover:bg-purple-600" 
                            : "bg-purple-600 hover:bg-purple-700"
                      }`}
                      onClick={() => {
                        const dataToPass = action === "Request"
                          ? gr.lastRequestPayload
                          : action === "Response"
                          ? gr.lastResponsePayload
                          : gr.lastHeaders;
                        
                        onView(
                          `http-${i}`,
                          `${gr.method} ▶ ${action}`,
                          dataToPass
                        );
                      }}
                    >
                      {action}
                    </button>
                  );
                })}
              </td>
            </tr>
            ))}
        </tbody>
      </table>
      )}
    </div>
  );
};