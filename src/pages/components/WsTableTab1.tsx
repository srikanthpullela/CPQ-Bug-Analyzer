// src/components/WsTableTab.tsx
import React from "react";

export interface WsRow {
  time: string;
  endpoint: string;
  action: string;
  status: number | null;
  payload: any;
}

interface Props {
  rows: WsRow[];
  filter: string;
  baseUrl: string;
  selectedRowKey: string | null;
  onView: (rowKey: string, title: string, data: any) => void;
  isDarkMode?: boolean;
}

export const WsTableTab: React.FC<Props> = ({
  rows,
  filter,
  baseUrl,
  onView,
  selectedRowKey,
  isDarkMode = false,
}) => {
  const matches = (row: WsRow) =>
    (row.time + row.endpoint + row.action + JSON.stringify(row.payload))
      .toLowerCase()
      .includes(filter.toLowerCase());

  function getWsRowColorClass(w: any): string {
    const errorDetails = w.payload?.PayLoad?.ErrorDetails;
    const warningDetails = w.payload?.PayLoad?.WarningDetails;
    const infoDetails = w.payload?.PayLoad?.InfoDetails;

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

  const getDisplayUrl = (url: string): string => {
    if (!url) return "Not connected";
    
    try {
      const urlObj = new URL(url);
      // Show protocol, hostname and port (if not default)
      let displayUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      if (urlObj.port && urlObj.port !== '80' && urlObj.port !== '443') {
        displayUrl += `:${urlObj.port}`;
      }
      // Add the path if it's meaningful
      if (urlObj.pathname && urlObj.pathname !== '/') {
        displayUrl += urlObj.pathname;
      }
      return displayUrl;
    } catch {
      return url; // Fallback to original URL if parsing fails
    }
  };

  if (!rows.length) return null;
  return (
    <div className={`rounded overflow-hidden transition-colors duration-200 ${
      isDarkMode ? "bg-gray-800" : "bg-white"
    }`}>
      <h3 className={`p-2 font-semibold transition-colors duration-200 ${
        isDarkMode 
          ? "bg-gray-700 text-gray-100" 
          : "bg-gray-100 text-gray-900"
      }`}>WebSocket Calls</h3>
      <div className={`px-3 py-1 text-sm transition-colors duration-200 ${
        isDarkMode ? "text-gray-300" : "text-gray-700"
      }`} title={baseUrl}>
        {/* <em>Connection: {getDisplayUrl(baseUrl)}</em> */}
      </div>
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
            }`}>EndPoint</th>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Action</th>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>Status</th>
            <th className={`px-3 py-1 text-left text-sm font-medium transition-colors duration-200 ${
              isDarkMode 
                ? "text-gray-200" 
                : "text-gray-700"
            }`}>View</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => {
            if (!matches(w)) return null;
            const rowColor = getWsRowColorClass(w);
            if (typeof w.payload?.PayLoad === "string") {
              try {
                w.payload.PayLoad = JSON.parse(w.payload.PayLoad);
              } catch {
                // do nothing
              }
            }
            return (
              <tr
                key={i}
                className={`transition-colors duration-200 cursor-pointer ${
                  selectedRowKey === `ws-${i}`
                    ? isDarkMode
                      ? "bg-blue-800 border-blue-600"
                      : "bg-blue-100 border-blue-300"
                    : ""
                } ${
                  selectedRowKey === `ws-${i}`
                    ? ""
                    : getWsRowColorClass(w) ||
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
                    isDarkMode ? "text-gray-200" : "text-gray-900"
                  }`}
                >
                  {i + 1}
                </td>
                <td
                  className={`px-3 py-1 text-sm transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-900"
                  }`}
                >
                  {w.time}
                </td>
                <td
                  className={`px-3 py-1 text-sm break-all transition-colors duration-200 ${
                    isDarkMode ? "text-gray-200" : "text-gray-900"
                  }`}
                >
                  {w.endpoint}
                </td>
                <td
                  className={`px-3 py-1 text-sm transition-colors duration-200 ${
                    isDarkMode ? "text-green-400" : "text-green-600"
                  } font-medium uppercase`}
                >
                  {w.action || "—"}
                </td>
                <td
                  className={`px-3 py-1 text-sm transition-colors duration-200 uppercase ${
                    isDarkMode ? "text-gray-200" : "text-gray-900"
                  }`}
                >
                  {w.status ?? "–"}
                </td>
                <td className={`px-3 py-1 transition-colors duration-200`}>
                  <button
                    className={`px-2 py-0.5 text-xs font-medium text-white rounded transition-colors duration-200 ${
                      isDarkMode
                        ? "bg-indigo-600 hover:bg-indigo-500"
                        : "bg-indigo-500 hover:bg-indigo-600"
                    }`}
                    onClick={() =>
                      onView(`ws-${i}`, `WS ▶ ${w.action}`, w.payload)
                    }
                  >
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
