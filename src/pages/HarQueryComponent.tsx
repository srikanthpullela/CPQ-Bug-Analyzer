"use client";

import type React from "react";
import { useState, useMemo, useRef } from "react";
import type { HttpRow, WsRow } from "../hooks/useHar";
import { Search, X } from "lucide-react";
import ReactJson from "react-json-view";

interface Props {
  httpRows: HttpRow[];
  wsRows: WsRow[];
  onClose?: () => void;
}

const HarQueryComponent: React.FC<Props> = ({ httpRows, wsRows, onClose }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const keyCounts = useMemo(() => {
    const counts = new Map<string, number>();

    function extractKeys(obj: any) {
      if (typeof obj !== "object" || obj === null) return;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof k === "string" && k.length > 1 && isNaN(Number(k))) {
          counts.set(k, (counts.get(k) || 0) + 1);
        }
        if (typeof v === "object") extractKeys(v);
      }
    }

    httpRows.forEach((r) => {
      extractKeys(r.requestPayload);
      extractKeys(r.responsePayload);
    });

    wsRows.forEach((r) => extractKeys(r.payload));

    return Array.from(counts.entries()).sort();
  }, [httpRows, wsRows]);

  const handleSearch = () => {
    if (!query) return;
    setHasSearched(true);
    const operatorMatch = query.match(
      /([\w.]+)\s*(=|!=|>=|<=|>|<|contains)\s*(.*)/i
    );
    const matches: any[] = [];

    let key = "";
    let operator = "";
    let value = "";

    if (operatorMatch) {
      key = operatorMatch[1].trim();
      operator = operatorMatch[2];
      value = operatorMatch[3]?.trim().replace(/^['"]|['"]$/g, "");
    } else {
      key = query.trim();
    }

    function searchObj(obj: any, context: string) {
      if (typeof obj !== "object" || obj === null) return;

      for (const [k, v] of Object.entries(obj)) {
        if (k === key) {
          const valStr = String(v).toLowerCase();
          const cmpVal = value.toLowerCase();

          let matched = false;
          if (!operator) {
            matched = valStr.includes(cmpVal);
          } else {
            const numVal = parseFloat(cmpVal);
            const actualVal = typeof v === "number" ? v : parseFloat(valStr);

            switch (operator) {
              case "=":
                matched = valStr.includes(cmpVal) || valStr === cmpVal;
                break;
              case "!=":
                matched = valStr !== cmpVal;
                break;
              case ">":
                matched = actualVal > numVal;
                break;
              case "<":
                matched = actualVal < numVal;
                break;
              case ">=":
                matched = actualVal >= numVal;
                break;
              case "<=":
                matched = actualVal <= numVal;
                break;
              case "contains":
                matched = valStr.includes(cmpVal);
                break;
            }
          }

          if (matched) {
            matches.push({
              source: context,
              matchKey: k,
              matchVal: v,
              parent: obj,
            });
          }
        }
        if (typeof v === "object") searchObj(v, context);
      }
    }

    httpRows.forEach((r) => {
      searchObj(r.requestPayload, `HTTP ▶ ${r.method} Request`);
      searchObj(r.responsePayload, `HTTP ▶ ${r.method} Response`);
    });

    wsRows.forEach((r) => {
      searchObj(r.payload, `WS ▶ ${r.payload?.Action || r.endpoint}`);
    });

    setResults(matches);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
    if (e.key === "Escape") {
      onClose?.();
    }
  };

  const filteredKeys = useMemo(() => {
    return keyCounts.filter(([k]) =>
      k.toLowerCase().includes(query.toLowerCase())
    );
  }, [query, keyCounts]);

  return (
    <div className="query-modal-container fixed inset-0 bg-black z-40 bg-opacity-30 backdrop-blur-sm flex items-center justify-center">
      <div className="query-modal bg-white rounded-xl shadow-2xl w-11/12 sm:w-3/4 lg:w-2/3  h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex-shrink-0 border-b border-gray-200 bg-white rounded-t-xl">
          <div className="flex items-center justify-between p-6 pb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                HAR Query Search
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Search through HTTP requests, responses, and WebSocket messages
              </p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              >
                <X size={20} className="text-gray-500" />
              </button>
            )}
          </div>

          <div className="px-6 pb-6 relative">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm placeholder-gray-500"
                  placeholder="e.g., Quantity=4, Quantity contains 4, Quantity > 2"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                />
                {showDropdown && filteredKeys.length > 0 && (
                  <ul className="absolute z-50 bg-white border mt-1 w-full shadow max-h-48 overflow-auto rounded-md">
                    {filteredKeys.map(([k, count]) => (
                      <li
                        key={k}
                        className="px-3 py-2 hover:bg-blue-100 cursor-pointer text-sm flex justify-between"
                        onMouseDown={() => {
                          setQuery(k);
                          setShowDropdown(false);
                        }}
                      >
                        <span>{k}</span>
                        <span className="text-gray-400 text-xs">({count})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={handleSearch}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-all duration-200 font-medium shadow-sm hover:shadow-md"
              >
                <Search size={16} />
                Search
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {results.length > 0 ? (
            <div className="p-6 space-y-4">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow duration-200"
                >
                  <div className="mb-3 pb-2 border-b border-gray-200">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-gray-700">
                        {r.source}
                      </span>
                      <span className="text-gray-400">→</span>
                      <code className="bg-gray-200 px-2 py-1 rounded text-xs font-mono text-gray-800">
                        {r.matchKey}
                      </code>
                      <span className="text-gray-400">=</span>
                      <span className="bg-yellow-100 px-2 py-1 rounded text-xs font-mono text-yellow-800 border border-yellow-200">
                        {String(r.matchVal)}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white rounded-md border border-gray-200 overflow-hidden">
                    <ReactJson
                      src={r.parent}
                      name={false}
                      collapsed={true}
                      enableClipboard={false}
                      displayDataTypes={false}
                      displayObjectSize={false}
                      indentWidth={2}
                      theme="rjv-default"
                      style={{
                        fontSize: "12px",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Consolas, monospace",
                        padding: "12px",
                        backgroundColor: "#fff",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search size={24} className="text-blue-600" />
                </div>
                {hasSearched ? (
                  <>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">
                      No Results Found
                    </h4>
                    <p className="text-gray-500 text-sm mb-4">
                      No matches found for "<strong>{query}</strong>". Try
                      adjusting your search.
                    </p>
                  </>
                ) : (
                  <>
                    <h4 className="text-lg font-medium text-gray-900 mb-2">
                      Search HAR Data
                    </h4>
                    <p className="text-gray-500 text-sm mb-4">
                      Supports key=value, key contains value, key {`>`} value
                      etc.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HarQueryComponent;
