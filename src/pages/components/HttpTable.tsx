import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";

export interface HttpRow {
  method: string;
  requestPayload: any;
  responsePayload: any;
  status: number | null;
  time: string;
  id: string;
  startTime: number;
  endTime?: number;
  hasMessages?: boolean;
  headers?: {
    request?: any[];
    response?: any[];
  };
  requestHeaders?: any[];
  responseHeaders?: any[];
  url?: string;
  httpMethod?: string;
}

interface Props {
  rows: HttpRow[];
  filter: string;
  onView: (title: string, data: any, rowId?: string) => void;
  selectedRowId?: string;
  showAllCalls?: boolean; // Add new prop to indicate if showing all calls
}

export const HttpTable: React.FC<Props> = ({ 
  rows, 
  filter, 
  onView, 
  selectedRowId, 
  showAllCalls = false 
}) => {
  // Add state for showing headers buttons
  const [showHeadersButtons, setShowHeadersButtons] = useState(false);

  // 1) Filter rows by search term - now including headers with null safety
  const filtered = rows.filter((r) => {
    const safeStringify = (obj: any) => {
      try {
        return JSON.stringify(obj || {});
      } catch {
        return String(obj || '');
      }
    };

    const combined = `${r.time || ''} ${r.method || ''} ${safeStringify(
      r.requestPayload
    )} ${safeStringify(r.responsePayload)} ${safeStringify(
      r.requestHeaders || []
    )} ${safeStringify(r.responseHeaders || [])} ${safeStringify(
      r.headers || {}
    )} ${r.url || ''} ${r.httpMethod || ''}`;
    
    return !filter || combined.toLowerCase().includes(filter.toLowerCase());
  });

  // 2) Collapse / group by unique ID
  type GroupKey = string;
  interface GroupedRow {
    time: string;
    method: string;
    status: number | null;
    actions: Set<"Headers" | "Request" | "Response">;
    lastRequestPayload?: any;
    lastResponsePayload?: any;
    lastHeaders?: any;
    id?: string;
    startTime: number;
    endTime?: number;
    hasMessages?: boolean;
    httpMethod?: string; // Add this missing property
  }

  const groups: Record<GroupKey, GroupedRow> = {};
  const order: GroupKey[] = [];

  filtered.forEach((r) => {
    const key = `${r.id}`;
    if (!groups[key]) {
      groups[key] = {
        time: r.time,
        method: r.method,
        status: r.status,
        actions: new Set(),
        startTime: r.startTime,
        endTime: r.endTime,
        id: r.id,
        hasMessages: r.hasMessages,
        httpMethod: r.httpMethod, // Add this line
      };
      order.push(key);
    }

    // Always add Request action if we have any request data or method
    if (r.requestPayload || r.method) {
      groups[key].actions.add("Request");
      groups[key].lastRequestPayload = r.requestPayload || {
        _method: r.method,
        _noPayload: true,
      };
    }

    // Always add Response action if we have any response data or status
    if (r.responsePayload || r.status !== null) {
      groups[key].actions.add("Response");
      groups[key].lastResponsePayload = r.responsePayload || {
        _status: r.status,
        _noPayload: true,
      };
      if (r.hasMessages) {
        groups[key].hasMessages = true;
      }
    }

    // Only add Headers action if we actually have headers (non-empty arrays)
    const hasRequestHeaders = (r.requestHeaders?.length || r.headers?.request?.length || 0) > 0;
    const hasResponseHeaders = (r.responseHeaders?.length || r.headers?.response?.length || 0) > 0;
    
    if (hasRequestHeaders || hasResponseHeaders) {
      groups[key].actions.add("Headers");
      groups[key].lastHeaders = {
        requestHeaders: r.requestHeaders || r.headers?.request || [],
        responseHeaders: r.responseHeaders || r.headers?.response || [],
        url: r.url || 'Unknown URL',
        method: r.httpMethod || r.method || 'Unknown Method',
        status: r.status,
        // Add some basic header info
        _info: {
          hasRequestHeaders,
          hasResponseHeaders,
          requestHeaderCount: r.requestHeaders?.length || r.headers?.request?.length || 0,
          responseHeaderCount: r.responseHeaders?.length || r.headers?.response?.length || 0
        }
      };
    }
  });

  function getRowColorClass(gr: any): string {
    // First check if we have the new hasMessages property from error detection
    if (gr.hasMessages) {
      return "bg-red-100 border-l-4 border-red-500";
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

    if (hasErrors) return "bg-red-100 border-l-4 border-red-500";
    if (hasWarnings) return "bg-yellow-100 border-l-4 border-yellow-500";
    if (hasInfo) return "bg-blue-100 border-l-4 border-blue-500";
    if (hasSuccess) return "bg-green-100 border-l-4 border-green-500";

    return "";
  }

  const getMethodColorClass = (method: string): string => {
    const httpMethod = method?.toUpperCase();
    switch (httpMethod) {
      case 'GET':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'POST':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'PUT':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'DELETE':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'PATCH':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'OPTIONS':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const displayRows = order.map((key) => groups[key]);

  return (
    <div className="border rounded overflow-x-auto">
      <h3 className="bg-gray-100 p-2 font-semibold flex items-center justify-between">
        <span>Network Calls</span>
        {showAllCalls && (
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
            All Calls Mode
          </span>
        )}
      </h3>
      <table className="min-w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="border px-2 py-2 w-12 text-center">#</th>
            <th className="border px-2 py-2 w-20 text-center">Time</th>
            <th className="border px-2 py-2 w-24 text-center">HTTP Method</th>
            <th className="border px-4 py-2 min-w-0">Method</th>
            {showAllCalls && <th className="border px-4 py-2 w-48">URL</th>}
            <th className="border px-2 py-2 w-16 text-center">Status</th>
            <th className="border px-2 py-2 w-20 text-center">Duration</th>
            <th className="border px-4 py-2 w-52">
              <div className="flex items-center justify-between">
                <span>Actions</span>
                <label className="flex items-center cursor-pointer ml-2">
                  <input
                    type="checkbox"
                    checked={showHeadersButtons}
                    onChange={(e) => setShowHeadersButtons(e.target.checked)}
                    className="w-3 h-3 text-indigo-600 border-gray-300 focus:ring-indigo-500 focus:ring-1 rounded"
                  />
                  <span className="ml-1 text-xs text-gray-600">Headers</span>
                </label>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((gr, i) => (
            <tr
              key={gr.id || i}
              className={`${
                getRowColorClass(gr) ||
                (i % 2 === 0 ? "bg-white" : "bg-gray-50")
              } ${
                selectedRowId === gr.id ? "bg-blue-200 border-blue-200" : ""
              } transition-all duration-200 hover:bg-blue-100`}
            >
              <td className="border px-2 text-center text-sm w-12">{i + 1}</td>
              <td className="border px-2 text-center text-sm w-20">{gr.time}</td>
              <td className="border px-2 text-center w-24">
                {gr.httpMethod && (
                  <span
                    className={`inline-block px-2 py-1 text-xs font-semibold rounded border ${getMethodColorClass(
                      gr.httpMethod
                    )}`}
                  >
                    {gr.httpMethod.toUpperCase()}
                  </span>
                )}
              </td>
              <td className="border px-4 py-2 text-sm method-td transition-colors duration-200 min-w-0">
                <div 
                  className="break-words" 
                  title={rows.find((r) => r.id === gr.id)?.url || gr.method}
                  style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
                >
                  {gr.method}
                </div>
              </td>
              {showAllCalls && (
                <td className="border px-4 w-48">
                  <div
                    className="truncate text-xs text-gray-600"
                    title={rows.find((r) => r.id === gr.id)?.url}
                  >
                    {rows
                      .find((r) => r.id === gr.id)
                      ?.url?.replace(/^https?:\/\/[^/]+/, "") || ""}
                  </div>
                </td>
              )}
              <td className="border px-2 text-center text-sm w-16">{gr.status ?? "–"}</td>
              <td className="border px-2 text-center text-sm w-20">
                {gr.startTime && gr.endTime
                  ? `${((gr.endTime - gr.startTime) / 1000).toFixed(2)}s`
                  : "–"}
              </td>
              <td className="border px-4 space-x-2 w-52">
                {Array.from(gr.actions).map((action) => {
                  // Only show Headers button if checkbox is checked
                  if (action === "Headers" && !showHeadersButtons) {
                    return null;
                  }
                  
                  return (
                    <button
                      key={action}
                      className={`px-2 py-1 ${
                        action === "Request"
                          ? "bg-indigo-500 hover:bg-indigo-600"
                          : action === "Response"
                          ? "bg-indigo-700 hover:bg-indigo-800"
                          : "bg-purple-600 hover:bg-purple-700"
                      } text-white rounded transition-colors duration-200 text-xs flex-shrink-0`}
                      onClick={() => {
                        onView(
                          `${gr.method} ▶ ${action}`,
                          action === "Request"
                            ? gr.lastRequestPayload
                            : action === "Response"
                            ? gr.lastResponsePayload
                            : gr.lastHeaders,
                          gr.id
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
          {displayRows.length === 0 && (
            <tr>
              <td
                colSpan={showAllCalls ? 8 : 7}
                className="text-center py-4 text-gray-500"
              >
                {showAllCalls
                  ? "No network calls found in HAR file."
                  : "No filtered network calls found."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
