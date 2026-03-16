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
}

interface Props {
  rows: WsRow[];
  filter: string;
  baseUrl: string;
  onView: (title: string, data: any, rowId?: string) => void;
  selectedRowId?: string;
  panelOpen?: boolean;
}

export const WsTable: React.FC<Props> = ({
  rows,
  baseUrl,
  filter,
  onView,
  selectedRowId,
  panelOpen = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);

  const filtered = rows.filter((r) => {
    const safeStringify = (obj: any) => {
      try { return JSON.stringify(obj || {}); } catch { return String(obj || ""); }
    };
    const combined = `${r.time || ""} ${r.endpoint || ""} ${r.action || ""} ${safeStringify(r.payload)} ${r.status || ""} ${r.direction || ""} ${r.id || ""}`;
    return !filter || combined.toLowerCase().includes(filter.toLowerCase());
  });

  function getWsRowColorClass(w: any): string {
    const errorDetails = w.payload?.PayLoad?.ErrorDetails;
    const warningDetails = w.payload?.PayLoad?.WarningDetails;
    if (errorDetails && Object.keys(errorDetails).length > 0) return "bg-red-100 border-l-4 border-red-500";
    if (warningDetails && Object.keys(warningDetails).length > 0) return "bg-yellow-100 border-l-4 border-yellow-500";
    return "";
  }

  const getDirectionBadgeClass = (direction: string): string => {
    return direction === "sent"
      ? "bg-blue-50 text-blue-700 border-blue-300"
      : "bg-green-50 text-green-700 border-green-300";
  };

  return (
    <div className="rounded overflow-x-auto bg-white">
      <h3 className="px-2 py-1 text-xs font-semibold bg-gray-100 text-gray-800 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span>WebSocket Messages ({filtered.length}/{rows.length})</span>
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

      {baseUrl && (
        <div className="px-2 py-0.5 text-[11px] text-green-700 bg-green-50 border-b border-gray-200">
          <span className="font-medium">Connected:</span> <span className="text-green-600 italic">{baseUrl}</span>
        </div>
      )}

      {!isMinimized && (
        <table className="min-w-full table-auto">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-1 py-0.5 text-left text-xs font-medium text-gray-700 w-0 whitespace-nowrap">#</th>
              <th className="px-1 py-0.5 text-left text-xs font-medium text-gray-700 w-0 whitespace-nowrap">Time</th>
              <th className="px-2 py-0.5 text-left text-xs font-medium text-gray-700">Endpoint</th>
              <th className="px-2 py-0.5 text-left text-xs font-medium text-gray-700">Action</th>
              <th className="px-2 py-0.5 text-left text-xs font-medium text-gray-700">Direction</th>
              {!panelOpen && (
                <th className="px-2 py-0.5 text-left text-xs font-medium text-gray-700">Status</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((w, i) => {
              if (typeof w.payload?.PayLoad === "string") {
                try { w.payload.PayLoad = JSON.parse(w.payload.PayLoad); } catch {}
              }
              const rowColor = getWsRowColorClass(w);

              return (
                <tr
                  key={w.id || i}
                  className={`transition-colors duration-200 cursor-pointer hover:bg-blue-50 ${
                    selectedRowId === (w.id || `ws-${i}`) ? "bg-blue-100 border-blue-300" : ""
                  } ${
                    selectedRowId === (w.id || `ws-${i}`)
                      ? ""
                      : rowColor || (i % 2 === 0 ? "bg-white" : "bg-gray-50")
                  }`}
                  onClick={() => {
                    onView(
                      w.action || w.endpoint || "WebSocket",
                      {
                        _rowType: "ws",
                        endpoint: w.endpoint,
                        action: w.action,
                        status: w.status,
                        time: w.time,
                        direction: w.direction,
                        payload: w.payload,
                      },
                      w.id || `ws-${i}`
                    );
                  }}
                >
                  <td className="px-1 py-0.5 text-xs text-gray-700 w-0 whitespace-nowrap">{i + 1}</td>
                  <td className="px-1 py-0.5 text-xs text-gray-700 w-0 whitespace-nowrap">{w.time}</td>
                  <td className="px-2 py-0.5 text-xs text-gray-700 break-all">
                    <div className="truncate max-w-xs" title={w.endpoint}>{w.endpoint}</div>
                  </td>
                  <td className="px-2 py-0.5 text-xs text-gray-700 uppercase">{w.action || "—"}</td>
                  <td className="px-2 py-0.5 text-xs text-gray-700">
                    {w.direction ? (
                      <span className={`inline-block px-1.5 py-0 text-[11px] font-medium rounded border opacity-75 ${getDirectionBadgeClass(w.direction)}`}>
                        {w.direction}
                      </span>
                    ) : (
                      <span className="text-gray-400">–</span>
                    )}
                  </td>
                  {!panelOpen && (
                    <td className="px-2 py-0.5 text-xs text-gray-700">
                      {w.status !== null && w.status !== undefined ? (
                        <span className="inline-block px-1.5 py-0 text-[11px] font-medium rounded border opacity-70 bg-green-50 text-green-700 border-green-300">
                          {w.status}
                        </span>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={panelOpen ? 5 : 6} className="text-center py-4 text-gray-500 text-xs">
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
