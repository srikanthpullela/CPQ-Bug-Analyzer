import React, { useState } from "react";

export interface WsRow {
  time: string;
  endpoint: string;
  action: string;
  status: number | null;
  payload: any;
  timestamp?: number;
  direction?: "sent" | "received";
  id?: string;
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
}

export const WsTableTab: React.FC<Props> = ({
  rows,
  baseUrl,
  filter,
  selectedRowKey,
  onView,
  isDarkMode = false,
  headerTitle = "WebSocket Messages",
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
    if (!direction) return isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600';
    
    switch (direction.toLowerCase()) {
      case 'sent':
        return isDarkMode 
          ? 'bg-blue-800 text-blue-200 border-blue-600' 
          : 'bg-blue-100 text-blue-800 border-blue-200';
      case 'received':
        return isDarkMode 
          ? 'bg-green-800 text-green-200 border-green-600' 
          : 'bg-green-100 text-green-800 border-green-200';
      case 'connection':
        return isDarkMode 
          ? 'bg-purple-800 text-purple-200 border-purple-600' 
          : 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div
      className={`rounded overflow-x-auto transition-colors duration-200 ${
        isDarkMode ? "bg-gray-800" : "bg-white"
      }`}
    >
      <h3
        className={`p-2 font-semibold transition-colors duration-200 ${
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

      {/* Connection URL display - only show when not minimized */}
      {!isMinimized && (
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
          title={baseUrl}
        >
          {baseUrl}
        </code>
      </div>
      )}

      {/* Conditionally render the table based on isMinimized state */}
      {!isMinimized && (
      <table className="min-w-full table-auto">
        <thead
          className={`transition-colors duration-200 ${
            isDarkMode ? "bg-gray-700" : "bg-gray-50"
          }`}
        >
          <tr>
            <th
              className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              #
            </th>
            <th
              className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Time
            </th>
            <th
              className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Endpoint
            </th>
            <th
              className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Action
            </th>
            <th
              className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Direction
            </th>
            <th
              className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Status
            </th>
            <th
              className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
                isDarkMode ? "text-gray-200" : "text-gray-700"
              }`}
            >
              Actions
            </th>
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

            return (
              <tr
                key={w.id || i}
                className={`transition-colors duration-200 cursor-pointer ${
                  selectedRowKey === `ws-${i}`
                    ? isDarkMode
                      ? "bg-blue-800 border-blue-600"
                      : "bg-blue-100 border-blue-300"
                    : ""
                } ${
                  selectedRowKey === `ws-${i}`
                    ? ""
                    : rowColor ||
                      (i % 2 === 0
                        ? isDarkMode
                          ? "bg-gray-800 hover:bg-gray-600"
                          : "bg-white hover:bg-gray-50"
                        : isDarkMode
                        ? "bg-gray-900 hover:bg-gray-600"
                        : "bg-gray-50 hover:bg-gray-100")
                }`}
              >
                <td
                  className={`px-3 py-1 text-sm transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {i + 1}
                </td>

                <td
                  className={`px-3 py-1 text-sm transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {w.time}
                </td>

                <td
                  className={`px-3 py-1 text-sm break-all transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  <div className="truncate max-w-xs" title={w.endpoint}>
                    {w.endpoint}
                  </div>
                </td>

                <td
                  className={`px-3 py-1 text-sm transition-colors duration-200 uppercase ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {w.action || "—"}
                </td>

                <td
                  className={`px-3 py-1 text-sm transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {w.direction && (
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded border ${getDirectionBadgeClass(
                        w.direction
                      )}`}
                      title={`Message direction: ${w.direction}`}
                    >
                      {w.direction}
                    </span>
                  )}
                </td>

                <td
                  className={`px-3 py-1 text-sm transition-colors duration-200 uppercase ${
                    isDarkMode ? "text-gray-200" : "text-gray-700"
                  }`}
                >
                  {w.status !== null && w.status !== undefined ? (
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                        w.status >= 4000
                          ? isDarkMode
                            ? "bg-red-800 text-red-200"
                            : "bg-red-100 text-red-800"
                          : w.status >= 1000
                          ? isDarkMode
                            ? "bg-yellow-800 text-yellow-200"
                            : "bg-yellow-100 text-yellow-800"
                          : isDarkMode
                          ? "bg-green-800 text-green-200"
                          : "bg-green-100 text-green-800"
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

                <td
                  className={`px-3 py-1 space-x-1 flex transition-colors duration-200`}
                >
                  <button
                    className={`px-2 py-0.5 text-xs font-medium text-white rounded transition-colors duration-200 ${
                      isDarkMode
                        ? "bg-indigo-600 hover:bg-indigo-500"
                        : "bg-indigo-500 hover:bg-indigo-600"
                    }`}
                    onClick={() =>
                      onView(
                        `ws-${i}`,
                        `WS ▶ ${w.action || "Message"}`,
                        w.payload
                      )
                    }
                  >
                    View
                  </button>

                  {/* Show Headers button if we have connection headers */}
                  {(w.headers || w.connectionHeaders || w.requestHeaders) && (
                    <button
                      className={`px-2 py-0.5 text-xs font-medium text-white rounded transition-colors duration-200 ${
                        isDarkMode
                          ? "bg-purple-700 hover:bg-purple-600"
                          : "bg-purple-600 hover:bg-purple-700"
                      }`}
                      onClick={() =>
                        onView(`ws-${i}`, `WS ▶ Headers`, {
                          connectionHeaders:
                            w.connectionHeaders || w.headers?.request || [],
                          responseHeaders:
                            w.responseHeaders || w.headers?.response || [],
                          url: w.endpoint || baseUrl,
                          method: "WebSocket",
                          status: w.status,
                          _info: {
                            hasConnectionHeaders:
                              (w.connectionHeaders?.length ||
                                w.headers?.request?.length ||
                                0) > 0,
                            hasResponseHeaders:
                              (w.responseHeaders?.length ||
                                w.headers?.response?.length ||
                                0) > 0,
                            connectionHeaderCount:
                              w.connectionHeaders?.length ||
                              w.headers?.request?.length ||
                              0,
                            responseHeaderCount:
                              w.responseHeaders?.length ||
                              w.headers?.response?.length ||
                              0,
                          },
                        })
                      }
                    >
                      Headers
                    </button>
                  )}
                </td>
              </tr>
            );
          })}

          {/* Empty state */}
          {filtered.length === 0 && (
            <tr>
              <td
                colSpan={7}
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
    </div>
  );
};
