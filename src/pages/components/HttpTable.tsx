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
  showAllCalls?: boolean;
  panelOpen?: boolean;
}

export const HttpTable: React.FC<Props> = ({
  rows,
  filter,
  onView,
  selectedRowId,
  showAllCalls = false,
  panelOpen = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const filtered = rows.filter((r) => {
    const safeStringify = (obj: any) => {
      try { return JSON.stringify(obj || {}); } catch { return String(obj || ""); }
    };
    const combined = `${r.time || ""} ${r.method || ""} ${safeStringify(r.requestPayload)} ${safeStringify(r.responsePayload)} ${safeStringify(r.requestHeaders || [])} ${safeStringify(r.responseHeaders || [])} ${safeStringify(r.headers || {})} ${r.url || ""} ${r.httpMethod || ""}`;
    return !filter || combined.toLowerCase().includes(filter.toLowerCase());
  });

  type GroupKey = string;
  interface GroupedRow {
    time: string;
    method: string;
    status: number | null;
    lastRequestPayload?: any;
    lastResponsePayload?: any;
    lastHeaders?: any;
    id?: string;
    startTime: number;
    endTime?: number;
    hasMessages?: boolean;
    httpMethod?: string;
    url?: string;
    patternType?: string;
    urlPattern?: string;
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
        startTime: r.startTime,
        endTime: r.endTime,
        id: r.id,
        hasMessages: r.hasMessages,
        httpMethod: r.httpMethod,
        url: r.url,
      };
      order.push(key);
    }
    if (r.requestPayload || r.method) {
      groups[key].lastRequestPayload = r.requestPayload || { _method: r.method, _noPayload: true };
    }
    if (r.responsePayload || r.status !== null) {
      groups[key].lastResponsePayload = r.responsePayload || { _status: r.status, _noPayload: true };
      if (r.hasMessages) groups[key].hasMessages = true;
    }
    const hasReqH = (r.requestHeaders?.length || r.headers?.request?.length || 0) > 0;
    const hasResH = (r.responseHeaders?.length || r.headers?.response?.length || 0) > 0;
    if (hasReqH || hasResH) {
      groups[key].lastHeaders = {
        requestHeaders: r.requestHeaders || r.headers?.request || [],
        responseHeaders: r.responseHeaders || r.headers?.response || [],
        url: r.url || "Unknown URL",
        method: r.httpMethod || r.method || "Unknown",
        status: r.status,
      };
    }
  });

  function getRowColorClass(gr: any): string {
    if (gr.status !== null && typeof gr.status === "number") {
      if (gr.status >= 500) return "bg-red-100 border-l-4 border-red-500";
      if (gr.status >= 400) return "border-l-4 border-orange-500";
      if (gr.status >= 300) return "bg-yellow-100 border-l-4 border-yellow-500";
    }
    if (gr.hasMessages) return "bg-red-100 border-l-4 border-red-500";
    const pe = gr?.lastResponsePayload?.[0]?.result?.pageErrors || gr?.lastResponsePayload?.result?.pageErrors;
    if (!pe) return "";
    if (pe.errorMessages?.v?.length > 0) return "bg-red-100 border-l-4 border-red-500";
    if (pe.warningMessages?.v?.length > 0) return "bg-yellow-100 border-l-4 border-yellow-500";
    return "";
  }

  const getRowInlineStyle = (gr: any): React.CSSProperties => {
    if (gr.status !== null && typeof gr.status === "number" && gr.status >= 400 && gr.status < 500) {
      return { backgroundColor: "#fed7aa" };
    }
    return {};
  };

  const getStatusBadgeClass = (status: number | null): string => {
    if (status === null) return "bg-gray-50 text-gray-500 border-gray-300";
    if (status >= 200 && status < 300) return "bg-green-50 text-green-700 border-green-300";
    if (status >= 300 && status < 400) return "bg-yellow-50 text-yellow-700 border-yellow-300";
    if (status >= 400 && status < 500) return "bg-orange-50 text-orange-700 border-orange-300";
    if (status >= 500) return "bg-red-50 text-red-700 border-red-300";
    return "bg-gray-100 text-gray-600 border-gray-200";
  };

  const displayRows = order.map((key) => groups[key]);

  return (
    <div className="rounded overflow-x-auto bg-white">
      <h3 className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-800 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span>HTTP Requests ({displayRows.length}/{rows.length})</span>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="ml-2 p-1 rounded hover:bg-gray-200 text-gray-600 hover:text-gray-800"
            title={isMinimized ? "+" : "-"}
          >
            {isMinimized ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" /></svg>
            )}
          </button>
        </div>
      </h3>

      {!isMinimized && (
        <table className="min-w-full table-auto">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-1 py-0.5 text-left text-xs font-medium text-gray-700 w-0 whitespace-nowrap">#</th>
              <th className="px-1 py-0.5 text-left text-xs font-medium text-gray-700 w-0 whitespace-nowrap">Time</th>
              <th className="px-2 py-0.5 text-left text-xs font-medium text-gray-700">Method</th>
              {!panelOpen && (
                <>
                  <th className="px-2 py-0.5 text-left text-xs font-medium text-gray-700">Status</th>
                  <th className="px-2 py-0.5 text-left text-xs font-medium text-gray-700">Duration</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((gr, i) => {
              const isSelected = selectedRowId === gr.id;
              return (
              <tr
                key={gr.id || i}
                className={`transition-colors duration-200 cursor-pointer hover:bg-blue-50 ${
                  isSelected ? "!bg-blue-100 border-l-4 border-blue-500" : ""
                } ${
                  isSelected ? "" : getRowColorClass(gr) || (i % 2 === 0 ? "bg-white" : "bg-gray-50")
                }`}
                style={isSelected ? {} : getRowInlineStyle(gr)}
                onClick={() => {
                  onView(
                    gr.method,
                    {
                      _rowType: "http",
                      method: gr.method,
                      time: gr.time,
                      status: gr.status,
                      httpMethod: gr.httpMethod,
                      hasMessages: gr.hasMessages,
                      startTime: gr.startTime,
                      endTime: gr.endTime,
                      requestPayload: gr.lastRequestPayload,
                      responsePayload: gr.lastResponsePayload,
                      headers: gr.lastHeaders,
                    },
                    gr.id
                  );
                }}
              >
                <td className="px-1 py-0.5 text-xs text-gray-700 w-0 whitespace-nowrap">{i + 1}</td>
                <td className="px-1 py-0.5 text-xs text-gray-700 w-0 whitespace-nowrap">{gr.time}</td>
                <td className="px-2 py-0.5 text-xs text-gray-700 method-td" title={gr.url || gr.method}>
                  <div className="truncate max-w-xs">{gr.method}</div>
                </td>
                {!panelOpen && (
                  <>
                    <td className="px-2 py-0.5 text-xs text-gray-700">
                      {gr.status !== null ? (
                        <span className={`inline-block px-1.5 py-0 text-[11px] font-medium rounded border opacity-70 ${getStatusBadgeClass(gr.status)}`}>
                          {gr.status}
                        </span>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </td>
                    <td className="px-2 py-0.5 text-xs text-gray-700">
                      {gr.startTime && gr.endTime ? `${((gr.endTime - gr.startTime) / 1000).toFixed(2)}s` : "–"}
                    </td>
                  </>
                )}
              </tr>
              );
            })}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={panelOpen ? 3 : 5} className="text-center py-4 text-gray-500 text-xs">
                  No HTTP requests found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
};
