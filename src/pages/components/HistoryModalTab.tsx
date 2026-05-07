// src/components/HistoryModalTab.tsx
import React, { useEffect, useState } from "react";
import ReactJson from "react-json-view";
import { diffLines, Change } from "diff";
import FieldSelector from "../../FieldSelector";
import { Search, X } from "lucide-react";

interface FrameMatch {
  id: string;
  source: string;
  time: string;
  oldVal: any;
  newVal: any;
  objName?: string;
  objData?: any;
  prevObjData?: any;
  productName?: string;
}

interface HistoryEvent {
  source: string;
  time: string;
  items: FrameMatch[];
}

interface Props {
  open: boolean;
  fieldName: string;
  history: HistoryEvent[];
  onSearch: () => void;
  onClose: () => void;
  onChangeField: (v: string) => void;
  allFields: [string, number][];
  origin?: string;
  isDarkMode?: boolean;
}

export const HistoryModalTab: React.FC<Props> = ({
  open,
  fieldName,
  history,
  onSearch,
  onClose,
  onChangeField,
  allFields,
  origin,
  isDarkMode = false,
}) => {
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>("");
  const [diffData, setDiffData] = useState<Change[] | null>(null);
  const [diffTitle, setDiffTitle] = useState<string>("");
  const [filterText, setFilterText] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = fieldName
    ? allFields.filter(
        ([k]) =>
          k.toLowerCase().includes(fieldName.toLowerCase()) &&
          k.toLowerCase() !== fieldName.toLowerCase()
      )
    : allFields;

  /** Wraps matching substrings in <mark> tags */
  const highlightText = (text: string, query: string) => {
    if (!query) return <>{text}</>;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-yellow-300 text-black rounded px-0.5">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  };

  if (!open) return null;

  const preview = (data: any, title: string) => {
    setPreviewData(data);
    setPreviewTitle(title);
  };

  const showDiff = (oldObj: any, newObj: any, title: string) => {
    const oldStr = JSON.stringify(oldObj, null, 2);
    const newStr = JSON.stringify(newObj, null, 2);
    const changes = diffLines(oldStr, newStr);
    setDiffData(changes);
    setDiffTitle(title);
  };

  const handleSearch = () => {
    setIsSearching(true);
    setTimeout(() => {
      onSearch();
      setIsSearching(false);
    }, 500);
  };

  // Check if origin is a chrome extension URL
  const isChromeExtension = origin?.startsWith('chrome-extension://');

  return (
    <>
      {/* Backdrop + Main Modal */}
      <div
        className={`history-modal-container fixed inset-0 z-40 backdrop-blur-sm flex items-center bg-black bg-opacity-70 justify-center transition-colors ${
          isDarkMode ? "bg-black/70" : "bg-black/30"
        }`}
      >
        <div
          className={`history-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 flex flex-col z-50 transform transition-all duration-300 ease-out border ${
            isDarkMode
              ? "bg-gray-800 border-gray-600"
              : "bg-white border-gray-300"
          }`}
          style={{ height: '85vh' }}
        >
          {/* Header */}
          <div
            className={`flex-shrink-0 flex justify-between items-center p-4 border-b transition-colors ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <h3
              className={`text-xl font-semibold transition-colors ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              History for "{fieldName}"
            </h3>
            <button
              onClick={onClose}
              className={`text-2xl transition-colors ${
                isDarkMode
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Search */}
          <div
            className={`flex-shrink-0 p-4 space-y-2 border-b transition-colors ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={fieldName}
                  placeholder="search with any API key..."
                  onChange={(e) => {
                    onChangeField(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  className={`w-full border px-3 py-2 rounded focus:ring transition-colors ${
                    isDarkMode
                      ? "border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:ring-blue-500"
                      : "border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:ring-blue-500"
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setShowSuggestions(false);
                      handleSearch();
                    }
                  }}
                  disabled={isSearching}
                />
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <ul
                    className={`absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded border shadow-lg ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600"
                        : "bg-white border-gray-300"
                    }`}
                  >
                    {filteredSuggestions.slice(0, 50).map(([key, count]) => (
                      <li
                        key={key}
                        className={`px-3 py-1.5 cursor-pointer text-sm flex justify-between transition-colors ${
                          isDarkMode
                            ? "text-gray-200 hover:bg-gray-600"
                            : "text-gray-800 hover:bg-blue-50"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onChangeField(key);
                          setShowSuggestions(false);
                        }}
                      >
                        <span className="font-mono truncate">
                          {highlightText(key, fieldName)}
                        </span>
                        <span
                          className={`text-xs ml-2 flex-shrink-0 ${
                            isDarkMode ? "text-gray-400" : "text-gray-400"
                          }`}
                        >
                          ({count})
                        </span>
                      </li>
                    ))}
                    {filteredSuggestions.length > 50 && (
                      <li
                        className={`px-3 py-1 text-xs italic ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        …and {filteredSuggestions.length - 50} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className={`px-4 py-2 rounded border focus:ring transition-colors flex gap-2 items-center min-w-[120px] disabled:opacity-50 disabled:cursor-not-allowed ${
                  isDarkMode
                    ? "border-gray-600 bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500"
                    : "border-gray-300 bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500"
                }`}
              >
                {isSearching ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <Search size={16} />
                    Search
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="Filter within results..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                  }
                }}
                className={`w-full border px-3 py-2 rounded focus:ring transition-colors ${
                  isDarkMode
                    ? "border-gray-600 bg-gray-700 text-white placeholder-gray-400 focus:ring-blue-500"
                    : "border-gray-300 bg-white text-gray-900 placeholder-gray-500 focus:ring-blue-500"
                }`}
                disabled={isSearching}
              />
              {filterText && (
                <button
                  onClick={() => setFilterText("")}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 text-sm ${
                    isDarkMode
                      ? "text-gray-400 hover:text-white"
                      : "text-gray-400 hover:text-gray-700"
                  }`}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable List */}
          <div className="overflow-y-auto force-scrollbar p-4 history-list" style={{ height: '85%' }}>
            {isSearching ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className={`w-8 h-8 border-4 rounded-full animate-spin mb-4 ${
                  isDarkMode 
                    ? "border-blue-800 border-t-blue-400" 
                    : "border-blue-200 border-t-blue-600"
                }`}></div>
                <p className={`transition-colors ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}>
                  Searching for field history...
                </p>
                <div className="flex space-x-1 mt-2">
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    isDarkMode ? "bg-blue-400" : "bg-blue-500"
                  }`} style={{ animationDelay: '0ms' }}></div>
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    isDarkMode ? "bg-blue-400" : "bg-blue-500"
                  }`} style={{ animationDelay: '150ms' }}></div>
                  <div className={`w-2 h-2 rounded-full animate-pulse ${
                    isDarkMode ? "bg-blue-400" : "bg-blue-500"
                  }`} style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            ) : history.length > 0 ? (
              history.map((evt, i) => {
                const filteredItems = evt.items.filter((it) =>
                  [it.id, it.objName, it.oldVal, it.newVal, (it as any).productName]
                    .map((v) => String(v ?? "").toLowerCase())
                    .some((val) => val.includes(filterText.toLowerCase()))
                );

                const sourceMatches = evt.source
                  .toLowerCase()
                  .includes(filterText.toLowerCase());

                if (!sourceMatches && filteredItems.length === 0) {
                  return null;
                }

                return (
                  <div
                    key={i}
                    className={`mb-4 border-b pb-2 transition-colors ${
                      isDarkMode ? "border-gray-700" : "border-gray-200"
                    }`}
                  >
                    <div
                      className={`font-medium mb-1 transition-colors ${
                        isDarkMode ? "text-gray-200" : "text-gray-900"
                      }`}
                    >
                      [{evt.time}] <strong>{filterText ? highlightText(evt.source, filterText) : evt.source}</strong>
                    </div>
                    <ul className="space-y-1 pl-4">
                      {(filterText ? filteredItems : evt.items).map((it) => {
                        const changed = it.oldVal !== it.newVal && it.oldVal !== undefined;
                        return (
                          <li
                            key={`${it.id}-${it.objName}`}
                            className={`flex items-center gap-2 py-1.5 px-2 rounded text-sm ${
                              changed
                                ? isDarkMode
                                  ? "bg-green-900/30 border-l-3 border-l-green-400"
                                  : "bg-green-50 border-l-3 border-l-green-500"
                                : ""
                            }`}
                          >
                            {it.objData && (
                              <button
                                className={`font-mono underline mr-1 flex-shrink-0 transition-colors ${
                                  isDarkMode
                                    ? "text-blue-400 hover:text-blue-300"
                                    : "text-blue-600 hover:text-blue-800"
                                }`}
                                onClick={() => preview(it.objData, it.objName!)}
                              >
                                {it.objName}
                              </button>
                            )}
                            <span
                              className={`flex-shrink-0 transition-colors ${
                                isDarkMode ? "text-gray-300" : "text-gray-700"
                              }`}
                            >
                              Id:{" "}
                            </span>
                            {!isChromeExtension && origin ? (
                              <a
                                className={`underline flex-shrink-0 transition-colors ${
                                  isDarkMode
                                    ? "text-blue-400 hover:text-blue-300"
                                    : "text-blue-600 hover:text-blue-800"
                                }`}
                                href={`${origin}/${it.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {filterText ? highlightText(it.id, filterText) : it.id}
                              </a>
                            ) : (
                              <span
                                className={`flex-shrink-0 transition-colors ${
                                  isDarkMode ? "text-gray-300" : "text-gray-700"
                                }`}
                              >
                                {filterText ? highlightText(it.id, filterText) : it.id}
                              </span>
                            )}
                            {(it as any).productName && (
                              <span
                                className={`ml-1 px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                                  isDarkMode
                                    ? "bg-indigo-900 text-indigo-200"
                                    : "bg-indigo-100 text-indigo-700"
                                }`}
                                title={(it as any).productName}
                              >
                                {filterText
                                  ? highlightText((it as any).productName, filterText)
                                  : (it as any).productName}
                              </span>
                            )}
                            <span className={`flex-shrink-0 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>&rarr;</span>
                            <span className={`flex-shrink-0 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>old:</span>
                            <button
                              className={`font-mono font-semibold flex-shrink-0 hover:underline transition-colors ${
                                changed
                                  ? isDarkMode ? "text-red-400" : "text-red-600"
                                  : isDarkMode ? "text-gray-300" : "text-gray-600"
                              } ${
                                it.oldVal === undefined ||
                                it.prevObjData == null
                                  ? "opacity-50 cursor-not-allowed"
                                  : ""
                              }`}
                              disabled={
                                it.oldVal === undefined ||
                                it.prevObjData == null
                              }
                              onClick={() =>
                                preview(
                                  it.prevObjData,
                                  `${it.objName} (before)`
                                )
                              }
                            >
                              <code>{filterText ? highlightText(String(it.oldVal ?? "—"), filterText) : String(it.oldVal ?? "—")}</code>
                            </button>
                            <span className={`flex-shrink-0 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>new:</span>
                            <button
                              className={`font-mono font-semibold flex-shrink-0 hover:underline transition-colors ${
                                changed
                                  ? isDarkMode ? "text-green-400" : "text-green-600"
                                  : isDarkMode ? "text-gray-300" : "text-gray-600"
                              }`}
                              onClick={() =>
                                preview(it.objData, `${it.objName} (after)`)
                              }
                            >
                              <code>{filterText ? highlightText(String(it.newVal), filterText) : String(it.newVal)}</code>
                            </button>
                            <button
                              className={`ml-auto px-2 py-1 rounded text-xs flex items-center gap-1 flex-shrink-0 transition-colors ${
                                isDarkMode
                                  ? "bg-blue-900 hover:bg-blue-800 text-blue-200"
                                  : "bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                              } ${
                                !it.prevObjData || !it.objData
                                  ? "opacity-50 pointer-events-none cursor-not-allowed"
                                  : ""
                              }`}
                              onClick={() =>
                                showDiff(
                                  it.prevObjData,
                                  it.objData,
                                  `Diff for ${it.objName || it.id}`
                                )
                              }
                            >
                              Diff
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            ) : (
              <p
                className={`text-center transition-colors ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                No changes found for that field.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Object Preview Modal */}
      {previewData && (
        <div
          className={`preview-data-container fixed inset-0 backdrop-blur-sm flex items-center justify-center z-60 transition-colors ${
            isDarkMode ? "bg-black/70" : "bg-black/40"
          }`}
          onClick={() => setPreviewData(null)}
        >
          <div
            className={`preview-data rounded-lg shadow-lg w-3/4 overflow-auto force-scrollbar p-6 transition-colors border ${
              isDarkMode
                ? "bg-gray-800 border-gray-600"
                : "bg-white border-gray-300"
            }`}
            style={{ maxHeight: '50vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h4
                className={`text-lg font-semibold transition-colors ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {previewTitle}
              </h4>
              <button
                onClick={() => setPreviewData(null)}
                className={`text-2xl transition-colors ${
                  isDarkMode
                    ? "text-gray-400 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                &times;
              </button>
            </div>
            <ReactJson
              src={previewData}
              name={false}
              collapsed={1}
              enableClipboard={false}
              displayDataTypes={false}
              displayObjectSize={false}
              indentWidth={2}
              theme={isDarkMode ? "monokai" : "rjv-default"}
              style={{
                fontSize: "0.9rem",
                fontFamily: "monospace",
                backgroundColor: isDarkMode ? "#374151" : "#ffffff",
              }}
            />
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {diffData && (
        <div
          className={`history-diff-container fixed inset-0 backdrop-blur-sm flex items-center justify-center z-60 transition-colors ${
            isDarkMode ? "bg-black/70" : "bg-black/40"
          }`}
          onClick={() => setDiffData(null)}
        >
          <div
            className={`history-diff rounded-lg shadow-lg w-4/5 overflow-auto force-scrollbar p-6 font-mono text-sm z-60 transition-colors border ${
              isDarkMode
                ? "bg-gray-800 border-gray-600"
                : "bg-white border-gray-300"
            }`}
            style={{ maxHeight: '60vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h4
                className={`text-lg font-semibold transition-colors ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {diffTitle}
              </h4>
              <button
                onClick={() => setDiffData(null)}
                className={`text-2xl transition-colors ${
                  isDarkMode
                    ? "text-gray-400 hover:text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                &times;
              </button>
            </div>
            <pre
              className={`overflow-auto transition-colors ${
                isDarkMode ? "text-gray-200" : "text-gray-900"
              }`}
            >
              {diffData.map((part, idx) => {
                const { added, removed, value } = part;
                let style: React.CSSProperties = {};
                if (added) {
                  style = {
                    backgroundColor: isDarkMode ? "#065f46" : "#dcfce7",
                  }; // dark green / light green
                } else if (removed) {
                  style = {
                    backgroundColor: isDarkMode ? "#7f1d1d" : "#fecaca",
                  }; // dark red / light red
                }

                return (
                  <span key={idx} style={style}>
                    {value
                      .split("\n")
                      .map((line, i, arr) =>
                        i === arr.length - 1 && !line
                          ? null
                          : (added ? "+ " : removed ? "- " : "  ") + line + "\n"
                      )}
                  </span>
                );
              })}
            </pre>
          </div>
        </div>
      )}
    </>
  );
};
