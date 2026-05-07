import React, { useState } from "react";
import { LoadingIndicator } from "./LoadingIndicator";

export interface WsRow {
  time: string;
  endpoint: string;
  action: string;
  status: number | null;
  payload: any;
  timestamp?: number;
  direction?: "sent" | "received";
  id?: string;
  duration?: string;
  // Add header support for WebSocket connections
  headers?: {
    request?: any[];
    response?: any[];
  };
  requestHeaders?: any[];
  responseHeaders?: any[];
  connectionHeaders?: any[];
}

interface Props {
  rows: WsRow[];
  baseUrl: string;
  filter: string;
  selectedRowKey: string | null;
  onView: (rowKey: string, title: string, data: any) => void;
  isDarkMode?: boolean;
  headerTitle?: string;
  isLoading?: boolean;
  panelOpen?: boolean;
}

export const WsTableTab: React.FC<Props> = ({
  rows,
  baseUrl,
  filter,
  selectedRowKey,
  onView,
  isDarkMode = false,
  headerTitle = "WebSocket Messages",
  isLoading = false,
  panelOpen = false,
}) => {
  // Add state for minimizing/expanding the table
  const [isMinimized, setIsMinimized] = useState(false);
  // Enhanced filtering to include header data and all relevant fields
  const filtered = rows.filter((r) => {
    const safeStringify = (obj: any) => {
      try {
        return JSON.stringify(obj || {});
      } catch {
        return String(obj || '');
      }
    };

    const combined = `${r.time || ''} ${r.endpoint || ''} ${r.action || ''} ${safeStringify(
      r.payload
    )} ${r.status || ''} ${r.direction || ''} ${r.id || ''} ${safeStringify(
      r.headers || {}
    )} ${safeStringify(r.requestHeaders || [])} ${safeStringify(
      r.responseHeaders || []
    )} ${safeStringify(r.connectionHeaders || [])} ${baseUrl || ''}`;
    
    return !filter || combined.toLowerCase().includes(filter.toLowerCase());
  });

  function getWsRowColorClass(w: any): string {
    // Check for WebSocket-specific error indicators
    const errorDetails = w.payload?.PayLoad?.ErrorDetails || w.payload?.ErrorDetails;
    const warningDetails = w.payload?.PayLoad?.WarningDetails || w.payload?.WarningDetails;
    const infoDetails = w.payload?.PayLoad?.InfoDetails || w.payload?.InfoDetails;
    const statusCode = w.payload?.StatusCode || w.status;

    // Check status codes for errors (similar to HTTP)
    if (statusCode && typeof statusCode === 'number') {
      if (statusCode >= 4000) {
        // WebSocket error codes (4000+)
        return isDarkMode 
          ? "bg-red-900 border-l-4 border-red-500" 
          : "bg-red-100 border-l-4 border-red-500";
      } else if (statusCode >= 1000 && statusCode < 2000) {
        // WebSocket close codes in error range
        return isDarkMode 
          ? "bg-orange-900 border-l-4 border-orange-500" 
          : "bg-orange-100 border-l-4 border-orange-500";
      }
    }

    // Check for error details in payload
    if (errorDetails && Object.keys(errorDetails).length > 0) {
      return isDarkMode 
        ? "bg-red-900 border-l-4 border-red-500" 
        : "bg-red-100 border-l-4 border-red-500";
    }
    if (warningDetails && Object.keys(warningDetails).length > 0) {
      return isDarkMode 
        ? "bg-yellow-900 border-l-4 border-yellow-500" 
        : "bg-yellow-100 border-l-4 border-yellow-500";
    }
    if (infoDetails && Object.keys(infoDetails).length > 0) {
      return isDarkMode 
        ? "bg-blue-900 border-l-4 border-blue-500" 
        : "bg-blue-100 border-l-4 border-blue-500";
    }

    return "";
  }

  const getDirectionBadgeClass = (direction?: string): string => {
    if (!direction) return isDarkMode ? 'bg-gray-800/20 text-gray-400 border-gray-600' : 'bg-gray-50/50 text-gray-500 border-gray-300';
    
    switch (direction.toLowerCase()) {
      case 'sent':
        return isDarkMode 
          ? 'bg-blue-900/20 text-blue-300 border-blue-600' 
          : 'bg-blue-50/50 text-blue-700 border-blue-300';
      case 'received':
        return isDarkMode 
          ? 'bg-green-900/20 text-green-300 border-green-600' 
          : 'bg-green-50/50 text-green-700 border-green-300';
      case 'connection':
        return isDarkMode 
          ? 'bg-purple-900/20 text-purple-300 border-purple-600' 
          : 'bg-purple-50/50 text-purple-700 border-purple-300';
      default:
        return isDarkMode ? 'bg-gray-800/20 text-gray-400 border-gray-600' : 'bg-gray-50/50 text-gray-500 border-gray-300';
    }
  };

  return (
    <div
      className={`rounded overflow-x-auto transition-colors duration-200 ${
        isDarkMode ? "bg-gray-800" : "bg-white"
      }`}
    >
      <h3
        className={`px-2 py-1 text-xs font-semibold transition-colors duration-200 ${
          isDarkMode
            ? "bg-gray-700 text-gray-100 border-b border-gray-600"
            : "bg-gray-100 text-gray-800 border-b border-gray-200"
        }`}
      >
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

      {/* Connection URL display - only show when not minimized and URL is available */}
      {!isMinimized && (baseUrl || rows.length > 0) && (
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
        <span
          className={`text-[11px] font-medium transition-colors duration-200 ${
            isDarkMode ? "text-green-300" : "text-green-800"
          }`}
        >
          Connected:
        </span>
        <code
          className={`text-[11px] px-1 py-0 rounded font-mono transition-colors duration-200 truncate ${
            isDarkMode
              ? "text-green-200 bg-green-800/30 border border-green-700"
              : "text-green-700 bg-green-100 border border-green-200"
          }`}
          title={baseUrl || rows[0]?.endpoint || ''}
        >
          {baseUrl || rows[0]?.endpoint || 'WebSocket'}
        </code>
      </div>
      )}

      {/* Conditionally render the table based on isMinimized state */}
      {!isMinimized && (
      <table className="min-w-full table-auto">
        <thead
          className={`sticky top-0 z-10 transition-colors duration-200 ${
            isDarkMode ? "bg-gray-700" : "bg-gray-50"
          }`}
        >
          <tr>
            <th
              className={`px-1 py-0.5 text-left text-xs font-medium w-0 whitespace-nowrap transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              #
            </th>
            <th
              className={`px-1 py-0.5 text-left text-xs font-medium w-0 whitespace-nowrap transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Time
            </th>
            <th
              className={`px-2 py-0.5 text-left text-xs font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Endpoint
            </th>
            <th
              className={`px-2 py-0.5 text-left text-xs font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Action
            </th>
            <th
              className={`px-2 py-0.5 text-left text-xs font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Direction
            </th>
            {!panelOpen && (
              <th
                className={`px-2 py-0.5 text-left text-xs font-medium transition-colors duration-200 ${
                  isDarkMode ? "text-gray-200" : "text-gray-700"
                }`}
              >
                Status
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {filtered.map((w, i) => {
            // Handle PayLoad parsing safely
            if (typeof w.payload?.PayLoad === "string") {
              try {
                w.payload.PayLoad = JSON.parse(w.payload.PayLoad);
              } catch {
                // If it fails, we leave it as a string
              }
            }

            const rowColor = getWsRowColorClass(w);
            const isSelected = selectedRowKey === `ws-${i}`;

            return (
              <tr
                key={w.id || i}
                data-row-key={`ws-${i}`}
                className={`transition-colors duration-200 cursor-pointer har-table-row ${
                  isSelected ? "har-row-selected" : ""
                } ${
                  isSelected
                    ? ""
                    : rowColor ||
                      (i % 2 === 0
                        ? isDarkMode
                          ? "bg-gray-800"
                          : "bg-white"
                        : isDarkMode
                        ? "bg-gray-900"
                        : "bg-gray-50")
                }`}
                style={isSelected ? {} : {}}
                onClick={() => {
                  onView(
                    `ws-${i}`,
                    w.action || w.endpoint || 'WebSocket',
                    {
                      _rowType: 'ws',
                      endpoint: w.endpoint,
                      action: w.action,
                      status: w.status,
                      time: w.time,
                      direction: w.direction,
                      payload: w.payload,
                      headers: {
                        connectionHeaders: w.connectionHeaders || w.headers?.request || [],
                        responseHeaders: w.responseHeaders || w.headers?.response || [],
                        url: w.endpoint || baseUrl,
                        method: 'WebSocket',
                        status: w.status,
                      },
                    }
                  );
                }}
              >
                <td
                  className={`px-1 py-0.5 text-xs w-0 whitespace-nowrap transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {i + 1}
                </td>

                <td
                  className={`px-1 py-0.5 text-xs w-0 whitespace-nowrap transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {w.time}
                  {w.duration && (
                    <span className={`ml-1 text-[10px] font-medium ${
                      isDarkMode ? "text-orange-400" : "text-orange-600"
                    }`}>({w.duration})</span>
                  )}
                </td>

                <td
                  className={`px-2 py-0.5 text-xs break-all transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  <div className="truncate max-w-xs" title={w.endpoint}>
                    {w.endpoint}
                  </div>
                </td>

                <td
                  className={`px-2 py-0.5 text-xs transition-colors duration-200 uppercase ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {w.action || "—"}
                </td>

                <td
                  className={`px-2 py-0.5 text-xs transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {w.direction && (
                    <span
                      className={`inline-block px-1.5 py-0 text-[11px] font-medium rounded border opacity-75 ${getDirectionBadgeClass(
                        w.direction
                      )}`}
                      title={`Message direction: ${w.direction}`}
                    >
                      {w.direction}
                    </span>
                  )}
                </td>

                {!panelOpen && (
                <td
                  className={`px-2 py-0.5 text-xs transition-colors duration-200 uppercase ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {w.status !== null && w.status !== undefined ? (
                    <span
                      className={`inline-block px-1.5 py-0 text-[11px] font-medium rounded opacity-70 ${
                        w.status >= 4000
                          ? isDarkMode
                            ? "bg-red-900/20 text-red-300 border border-red-600"
                            : "bg-red-50/50 text-red-700 border border-red-300"
                          : w.status >= 1000
                          ? isDarkMode
                            ? "bg-yellow-900/20 text-yellow-300 border border-yellow-600"
                            : "bg-yellow-50/50 text-yellow-700 border border-yellow-300"
                          : isDarkMode
                          ? "bg-green-900/20 text-green-300 border border-green-600"
                          : "bg-green-50/50 text-green-700 border border-green-300"
                      }`}
                      title={`WebSocket status: ${w.status}`}
                    >
                      {w.status}
                    </span>
                  ) : (
                    <span
                      className={isDarkMode ? "text-gray-400" : "text-gray-400"}
                    >
                      –
                    </span>
                  )}
                </td>
                )}
              </tr>
            );
          })}

          {/* Empty state */}
          {filtered.length === 0 && (
            <tr>
              <td
                colSpan={panelOpen ? 6 : 7}
                className={`text-center py-4 transition-colors duration-200 ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                No WebSocket messages found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      )}
      
      {/* Loading indicator when WebSocket messages are being captured */}
      {isLoading && !isMinimized && (
        <LoadingIndicator 
          isDarkMode={isDarkMode}
          message="Capturing WebSocket messages..."
        />
      )}
    </div>
  );
};
