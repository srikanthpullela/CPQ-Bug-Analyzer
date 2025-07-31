// src/components/WsTable.tsx
import React from "react";

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
}

export const WsTable: React.FC<Props> = ({ rows, baseUrl, filter, onView, selectedRowId }) => {
  // Filter rows by search term - include all relevant fields with null safety
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
    )} ${r.status || ''} ${r.direction || ''} ${r.id || ''}`;
    
    return !filter || combined.toLowerCase().includes(filter.toLowerCase());
  });

  function getWsRowColorClass(w: any): string {
    const errorDetails = w.payload?.PayLoad?.ErrorDetails;
    const warningDetails = w.payload?.PayLoad?.WarningDetails;
    const infoDetails = w.payload?.PayLoad?.InfoDetails;

    if (errorDetails && Object.keys(errorDetails).length > 0) {
      return "bg-red-100 border-l-4 border-red-500";
    }
    if (warningDetails && Object.keys(warningDetails).length > 0) {
      return "bg-yellow-100 border-l-4 border-yellow-500";
    }
    if (infoDetails && Object.keys(infoDetails).length > 0) {
      return "bg-blue-100 border-l-4 border-blue-500";
    }

    return "";
  }
  
  return (
    <div className="border rounded overflow-hidden">
      <h3 className="bg-gray-100 p-2 font-semibold">WebSocket Calls</h3>
      <div className="px-4 py-2 text-sm">
        <em>Connection URL: {baseUrl}</em>
      </div>
      <table className="min-w-full table-auto">
        <thead className="bg-gray-50">
          <tr>
            <th className="border px-4 py-2">#</th>
            <th className="border px-4 py-2">Time</th>
            <th className="border px-4 py-2">EndPoint</th>
            <th className="border px-4 py-2">Action</th>
            <th className="border px-4 py-2">Direction</th>
            <th className="border px-4 py-2">Status</th>
            <th className="border px-4 py-2">View</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((w, i) => {
            const bg = i % 2 ? "bg-white" : "bg-gray-50";
            
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
                key={i}
                className={`${rowColor || bg} ${
                  selectedRowId === `ws-${i}`
                    ? "bg-blue-200 border-blue-200"
                    : ""
                } hover:bg-gray-200 transition-all duration-200`}
              >
                <td className="border px-4 text-sm">{i + 1}</td>
                <td className="border px-4 text-sm">{w.time}</td>
                <td className="border px-4 break-all text-sm">
                  {w.endpoint}
                </td>
                <td className="border px-4 text-sm">{w.action || "—"}</td>
                <td className="border px-4 text-sm">
                  {(() => {
                    // Try multiple ways to determine direction
                    let direction = w.direction;
                    
                    // If no direction is set, try to infer from other data
                    if (!direction) {
                      // Check payload structure for common WebSocket patterns
                      if (w.payload) {
                        // Check if it's a message being sent TO the server
                        if (w.payload.action || w.payload.Action || 
                            w.payload.method || w.payload.Method ||
                            w.payload.command || w.payload.Command) {
                          direction = 'sent';
                        }
                        // Check if it's a response FROM the server
                        else if (w.payload.result || w.payload.Result ||
                                 w.payload.response || w.payload.Response ||
                                 w.payload.data || w.payload.Data ||
                                 w.payload.PayLoad) {
                          direction = 'received';
                        }
                        // Check for error responses (typically from server)
                        else if (w.payload.error || w.payload.Error ||
                                 w.payload.ErrorDetails || w.payload.WarningDetails) {
                          direction = 'received';
                        }
                      }
                      
                      // Check action/endpoint patterns if payload doesn't help
                      if (!direction) {
                        const actionLower = (w.action || '').toLowerCase();
                        const endpointLower = (w.endpoint || '').toLowerCase();
                        
                        // Common send patterns
                        if (actionLower.includes('send') || actionLower.includes('request') ||
                            actionLower.includes('call') || actionLower.includes('invoke') ||
                            endpointLower.includes('send') || endpointLower.includes('out')) {
                          direction = 'sent';
                        }
                        // Common receive patterns
                        else if (actionLower.includes('receive') || actionLower.includes('response') ||
                                 actionLower.includes('result') || actionLower.includes('callback') ||
                                 endpointLower.includes('receive') || endpointLower.includes('in')) {
                          direction = 'received';
                        }
                        // If we still don't know, use a heuristic based on typical patterns
                        else if (w.status !== null && w.status !== undefined) {
                          // If there's a status code, it's likely a response
                          direction = 'received';
                        }
                        else {
                          // Default to 'sent' for outgoing actions
                          direction = 'sent';
                        }
                      }
                    }
                    
                    return direction ? (
                      <span
                        className={`inline-block px-2 py-1 text-xs rounded ${
                          direction === "sent"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {direction}
                      </span>
                    ) : (
                      <span className="text-gray-400">–</span>
                    );
                  })()}
                </td>
                <td className="border px-4">{w.status ?? "–"}</td>
                <td className="border px-4">
                  <button
                    className="px-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors"
                    onClick={() =>
                      onView(`WS ▶ ${w.action}`, w.payload, w.id || `ws-${i}`)
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