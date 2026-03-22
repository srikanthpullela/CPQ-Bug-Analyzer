// src/components/HistoryModal.tsx
import React, { useState } from "react";
import ReactJson from "react-json-view";
import { diffLines, Change } from "diff";
import FieldSelector from "../../FieldSelector";
import { X, Search, Filter, ArrowRight, GitCompare, Clock, ChevronRight } from "lucide-react";

interface FrameMatch {
  id: string;
  source: string;
  time: string;
  oldVal: any;
  newVal: any;
  objName?: string;
  objData?: any;
  prevObjData?: any;
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
}

export const HistoryModal: React.FC<Props> = ({
  open,
  fieldName,
  history,
  onSearch,
  onClose,
  onChangeField,
  allFields,
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

  return (
    <>
      {/* Backdrop + Main Modal */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40">
        <div className="bg-gray-900 text-gray-100 rounded-xl shadow-2xl w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 border border-gray-700">
          {/* Header */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              History for &ldquo;<span className="text-blue-400">{fieldName}</span>&rdquo;
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-2 space-y-2 border-b border-gray-700 bg-gray-800/50">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  value={fieldName}
                  placeholder="Search with any API key..."
                  onChange={(e) => {
                    onChangeField(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-md text-xs bg-gray-900 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
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
                  <ul className="absolute z-50 left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-md border shadow-lg bg-gray-800 border-gray-600">
                    {filteredSuggestions.slice(0, 50).map(([key, count]) => (
                      <li
                        key={key}
                        className="px-3 py-1.5 cursor-pointer text-xs font-mono text-gray-200 hover:bg-gray-700 flex justify-between transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onChangeField(key);
                          setShowSuggestions(false);
                        }}
                      >
                        <span className="truncate">{key}</span>
                        <span className="text-[11px] text-gray-400 ml-2 flex-shrink-0">({count})</span>
                      </li>
                    ))}
                    {filteredSuggestions.length > 50 && (
                      <li className="px-3 py-1 text-[11px] italic text-gray-500">
                        \u2026and {filteredSuggestions.length - 50} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
              >
                {isSearching ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-3 h-3" />
                    Search
                  </>
                )}
              </button>
            </div>

            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter within results..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-md text-xs bg-gray-900 border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                disabled={isSearching}
              />
            </div>
          </div>

          {/* Scrollable List */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {isSearching ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-xs text-gray-400">Searching for field history...</p>
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-3">
                {history.map((evt, i) => {
                  const filteredItems = evt.items.filter((it) =>
                    [it.id, it.objName, it.oldVal, it.newVal]
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
                    <div key={i} className="rounded-lg border border-gray-700 overflow-hidden">
                      {/* Event header */}
                      <div className="px-3 py-1.5 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
                        <span className="text-[11px] font-mono text-gray-400">[{evt.time}]</span>
                        <ChevronRight className="w-3 h-3 text-gray-500" />
                        <span className="text-xs font-semibold text-gray-200">{evt.source}</span>
                      </div>
                      {/* Items */}
                      <div className="divide-y divide-gray-800">
                        {(filterText ? filteredItems : evt.items).map((it, idx) => {
                          const changed = it.oldVal !== it.newVal && it.oldVal !== undefined;
                          return (
                            <div
                              key={`${it.id}-${it.objName}-${idx}`}
                              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 flex-wrap ${
                                changed ? "bg-green-900/20 border-l-2 border-green-500" : "bg-gray-900/30"
                              }`}
                            >
                              <span className="text-gray-500 font-mono">{idx}</span>
                              {it.objData && (
                                <button
                                  className="font-mono text-blue-400 hover:text-blue-300 hover:underline"
                                  onClick={() => preview(it.objData, it.objName!)}
                                >
                                  {it.objName}
                                </button>
                              )}
                              <span className="text-gray-500">Id: {it.id}</span>
                              <ArrowRight className="w-3 h-3 text-gray-600" />
                              <span className="text-gray-500">old:</span>
                              <button
                                className="text-yellow-400 hover:text-yellow-300 font-mono hover:underline disabled:opacity-40"
                                disabled={it.oldVal === undefined || it.prevObjData == null}
                                onClick={() => preview(it.prevObjData, `${it.objName} (before)`)}
                              >
                                {String(it.oldVal ?? "\u2014")}
                              </button>
                              <span className="text-gray-500">new:</span>
                              <button
                                className="text-green-400 hover:text-green-300 font-mono hover:underline"
                                onClick={() => preview(it.objData, `${it.objName} (after)`)}
                              >
                                {String(it.newVal)}
                              </button>
                              <button
                                className={`ml-auto px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                                  !it.prevObjData || !it.objData
                                    ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                                    : "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-600/30"
                                }`}
                                disabled={!it.prevObjData || !it.objData}
                                onClick={() =>
                                  showDiff(it.prevObjData, it.objData, `Diff for ${it.objName || it.id}`)
                                }
                              >
                                <GitCompare className="w-3 h-3" />
                                Diff
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Clock className="w-8 h-8 text-gray-600 mb-2" />
                <p className="text-xs text-gray-500">No changes found for that field.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Object Preview Modal */}
      {previewData && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setPreviewData(null)}
        >
          <div
            className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700 w-3/4 max-h-[50vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-2 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
              <h4 className="text-sm font-semibold text-gray-100">{previewTitle}</h4>
              <button
                onClick={() => setPreviewData(null)}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4">
              <ReactJson
                src={previewData}
                name={false}
                collapsed={1}
                enableClipboard={false}
                displayDataTypes={false}
                displayObjectSize={false}
                indentWidth={2}
                theme="monokai"
                style={{ fontSize: "0.75rem", fontFamily: "monospace", background: "transparent" }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {diffData && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setDiffData(null)}
        >
          <div
            className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700 w-4/5 max-h-[60vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-2 border-b border-gray-700 sticky top-0 bg-gray-900 z-10">
              <h4 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
                <GitCompare className="w-4 h-4 text-blue-400" />
                {diffTitle}
              </h4>
              <button
                onClick={() => setDiffData(null)}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-4">
              <pre className="overflow-auto text-xs font-mono leading-5">
                {diffData.map((part, idx) => {
                  const { added, removed, value } = part;
                  let className = "text-gray-300";
                  if (added) className = "text-green-400 bg-green-900/30";
                  else if (removed) className = "text-red-400 bg-red-900/30";

                  return (
                    <span key={idx} className={className}>
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
        </div>
      )}
    </>
  );
};
