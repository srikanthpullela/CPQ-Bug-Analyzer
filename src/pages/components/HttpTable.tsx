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
}

interface Props {
  rows: HttpRow[];
  filter: string;
  onView: (title: string, data: any) => void;
}

export const HttpTable: React.FC<Props> = ({ rows, filter, onView }) => {
  // 1) Filter rows by search term
  const filtered = rows.filter((r) => {
    const combined = `${r.time} ${r.method} ${JSON.stringify(
      r.requestPayload
    )} ${JSON.stringify(r.responsePayload)}`;
    return !filter || combined.toLowerCase().includes(filter.toLowerCase());
  });

  // 2) Collapse / group by unique ID
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
      };
      order.push(key);
    }
    if (r.requestPayload && Object.keys(r.requestPayload).length > 0) {
      groups[key].actions.add("Request");
      groups[key].lastRequestPayload = r.requestPayload;
    }
    if (r.responsePayload && Object.keys(r.responsePayload).length > 0) {
      groups[key].actions.add("Response");
      groups[key].lastResponsePayload = r.responsePayload;
    }
  });

  function getRowColorClass(gr: any): string {
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

  const displayRows = order.map((key) => groups[key]);

  return (
    <div className="border rounded overflow-x-auto">
      <h3 className="bg-gray-100 p-2 font-semibold">ApexRemote Methods</h3>
      <table className="min-w-full table-auto">
        <thead className="bg-gray-50">
          <tr>
            <th className="border px-4 py-2">#</th>
            <th className="border px-4 py-2">Time</th>
            <th className="border px-4 py-2">Method</th>
            <th className="border px-4 py-2">Status</th>
            <th className="border px-4 py-2">Duration</th>
            <th className="border px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((gr, i) => (
            <tr
              key={gr.id || i}
              className={`${
                getRowColorClass(gr) ||
                (i % 2 === 0 ? "bg-white" : "bg-gray-50")
              }`}
            >
              <td className="border px-4">{i + 1}</td>
              <td className="border px-4">{gr.time}</td>
              <td className="border px-4 method-td">{gr.method}</td>
              <td className="border px-4">{gr.status ?? "–"}</td>
              <td className="border px-4">
                {gr.startTime && gr.endTime
                  ? `${((gr.endTime - gr.startTime) / 1000).toFixed(2)}s`
                  : "–"}
              </td>
              <td className="border px-4 space-x-2 flex">
                {Array.from(gr.actions).map((action) => (
                  <button
                    key={action}
                    className={`px-2 py-1 ${
                      action === "Request" ? "bg-indigo-500" : "bg-indigo-700"
                    } text-white rounded`}
                    onClick={() =>
                      onView(
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
              <td colSpan={6} className="text-center py-4 text-gray-500">
                No HTTP calls found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
