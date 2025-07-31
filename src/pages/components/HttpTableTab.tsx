// src/components/HttpTableTab.tsx
import React from "react";

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
  hasMessages?: boolean; // Add this for error detection
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
  const filtered = rows.filter((r) => {
    const combined = `${r.time} ${r.method} ${JSON.stringify(
      r.requestPayload
    )} ${JSON.stringify(r.responsePayload)}`;
    return !filter || combined.toLowerCase().includes(filter.toLowerCase());
  });

  type GroupKey = string;
  interface GroupedRow {
    time: string;
    method: string;
    status: number | null;
    actions: Set<"Request" | "Response">;
    lastRequestPayload?: any;
    lastResponsePayload?: any;
    id?: string;
    startTime: number;
    endTime?: number;
    urlPattern?: string;
    patternType?: 'apex' | 'http' | 'generic';
    httpMethod?: string;
    endpoint?: string;
    displayName?: string;
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
      };
      order.push(keyToUse);
    }

    if (r.requestPayload && Object.keys(r.requestPayload).length > 0) {
      groups[keyToUse].actions.add("Request");
      groups[keyToUse].lastRequestPayload = r.requestPayload;
    }
    if (r.responsePayload && Object.keys(r.responsePayload).length > 0) {
      groups[keyToUse].actions.add("Response");
      groups[keyToUse].lastResponsePayload = r.responsePayload;
    }
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
        // Client errors (4xx) - Orange/Red
        return isDarkMode 
          ? "bg-orange-900 border-l-4 border-orange-500" 
          : "bg-orange-100 border-l-4 border-orange-500";
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
        ? 'bg-orange-800 text-orange-200 border-orange-600' 
        : 'bg-orange-100 text-orange-800 border-orange-200';
    } else if (status >= 500) {
      return isDarkMode 
        ? 'bg-red-800 text-red-200 border-red-600' 
        : 'bg-red-100 text-red-800 border-red-200';
    }
    
    return isDarkMode ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-100 text-gray-600 border-gray-200';
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
      <h3 className={`p-2 font-semibold transition-colors duration-200 ${
        isDarkMode 
          ? "bg-gray-700 text-gray-100 border-b border-gray-600" 
          : "bg-gray-100 text-gray-800 border-b border-gray-200"
      }`}>
        {headerTitle}
      </h3>
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
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Duration</th>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Actions</th>
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
                    title={`${gr.status} - ${getStatusText(gr.status)}`}
                  >
                    {gr.status}
                  </span>
                ) : (
                  <span className={isDarkMode ? "text-gray-400" : "text-gray-400"}>–</span>
                )}
              </td>
              <td className={`px-3 py-1 text-sm transition-colors duration-200 ${
                isDarkMode 
                  ? "text-gray-200" 
                  : "text-gray-700"
              }`}>
                {gr.startTime && gr.endTime
                  ? `${((gr.endTime - gr.startTime) / 1000).toFixed(2)}s`
                  : "–"}
              </td>
              <td className={`px-3 py-1 space-x-1 flex transition-colors duration-200`}>
                {Array.from(gr.actions).map((action) => (
                  <button
                    key={action}
                    className={`px-2 py-0.5 text-xs font-medium text-white rounded transition-colors duration-200 ${
                      action === "Request" 
                        ? isDarkMode 
                          ? "bg-indigo-600 hover:bg-indigo-500" 
                          : "bg-indigo-500 hover:bg-indigo-600"
                        : isDarkMode 
                          ? "bg-indigo-800 hover:bg-indigo-700" 
                          : "bg-indigo-700 hover:bg-indigo-800"
                    }`}
                    onClick={() =>
                      onView(
                        `http-${i}`,
                        `${gr.method} ▶ ${action}`,
                        action === "Request"
                          ? gr.lastRequestPayload
                          : gr.lastResponsePayload
                      )
                    }
                  >
                    {action}
                  </button>
                ))}
              </td>
            </tr>
          ))}
          {displayRows.length === 0 && (
            <tr>
              <td colSpan={7} className={`text-center py-4 transition-colors duration-200 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}>
                No HTTP calls found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
