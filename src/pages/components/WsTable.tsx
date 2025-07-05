// src/components/WsTable.tsx
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
  onView: (title: string, data: any) => void;
}

export const WsTable: React.FC<Props> = ({ rows, filter, baseUrl, onView }) => {
  const matches = (row: WsRow) =>
    (row.time + row.endpoint + row.action + JSON.stringify(row.payload))
      .toLowerCase()
      .includes(filter.toLowerCase());
  
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

  if (!rows.length) return null;
  return (
    <div className="border rounded overflow-hidden">
      <h3 className="bg-gray-100 p-2 font-semibold">WebSocket Calls</h3>
      <div className="px-4 py-2 text-sm">
        <em>Connection URL: {baseUrl}</em>
      </div>
      <table className="min-w-full table-auto">
        <thead className="bg-gray-50">
          <tr>
            <th>#</th>
            <th>Time</th>
            <th>EndPoint</th>
            <th>Action</th>
            <th>Status</th>
            <th>View</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => {
            if (!matches(w)) return null;
            const bg = i % 2 ? "bg-white" : "bg-gray-50";
            if (typeof w.payload.PayLoad === "string") {
              try {
                w.payload.PayLoad = JSON.parse(w.payload.PayLoad);
              } catch {
                // If it fails, we leave it as a string
              }
            }
            const rowColor = getWsRowColorClass(w);
            return (
              <tr key={i} className={`${rowColor} hover:bg-gray-100`}>
                <td className="border px-4">{i + 1}</td>
                <td className="border px-4">{w.time}</td>
                <td className="border px-4 break-all">{w.endpoint}</td>
                <td className="border px-4">{w.action || "—"}</td>
                <td className="border px-4">{w.status ?? "–"}</td>
                <td className="border px-4">
                  <button
                    className="px-2 py-1 bg-indigo-500 text-white rounded"
                    onClick={() => onView(`WS ▶ ${w.action}`, w.payload)}
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