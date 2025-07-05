// File: src/LineItemTable.tsx
import React from "react";
import "./style.css";

interface Props {
  lineItems: any[];
  selectedFields: string[];
  rootKeys?: string[];
  filterText?: string;
}

const LineItemTable: React.FC<Props> = ({
  lineItems,
  selectedFields,
  rootKeys = [],
  filterText = "",
}) => {
  const ft = filterText.trim().toLowerCase();
  const filteredItems = ft
    ? lineItems.filter((item) =>
        selectedFields.some((f) => {
          const val = item[f];
          return val != null && val.toString().toLowerCase().includes(ft);
        })
      )
    : lineItems;

  return (
    <div className="overflow-auto max-h-[600px] scroll-smooth border rounded">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-white z-9">
          <tr>
            <th>Level</th>
            {selectedFields.map((field) => (
              <th key={field}>{field}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((item, idx) => (
            <tr
              key={idx}
              className={
                item.level === "option"
                  ? "bg-blue-50"
                  : item.level === "sub-option"
                  ? "bg-green-50"
                  : ""
              }
            >
              <td>{item.level}</td>
              {selectedFields.map((field) => {
                const isRoot = rootKeys.includes(field);
                const raw = item[field];
                const display =
                  raw === null || raw === undefined ? "" : String(raw);
                return (
                  <td
                    key={field}
                    className={isRoot ? "bg-yellow-100 font-semibold" : ""}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LineItemTable;
