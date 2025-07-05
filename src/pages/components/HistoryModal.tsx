// src/components/HistoryModal.tsx
import React, { useState } from "react";
import ReactJson from "react-json-view";
import { diffLines, Change } from "diff";
import FieldSelector from "../../FieldSelector";

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
  allFields: string[];
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

  return (
    <>
      {/* Backdrop + Main Modal */}
      <div className="history-modal-container fixed inset-0 bg-black z-40 bg-opacity-30 backdrop-blur-sm flex items-center justify-center">
        <div className="history-modal bg-white rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-transform duration-300 ease-out">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="text-xl font-semibold">History for “{fieldName}”</h3>
            <button onClick={onClose} className="text-2xl">
              ×
            </button>
          </div>

          {/* Search */}
          <div className="p-4 space-y-2 border-b">
            <div className="flex space-x-2">
              <input
                type="text"
                value={fieldName}
                placeholder="search with any API key..."
                onChange={(e) => onChangeField(e.target.value)}
                className="flex-1 border px-3 py-2 rounded focus:ring"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSearch();
                }}
              />
              {/* <FieldSelector
                allFields={allFields}
                selectedFields={fieldName ? [fieldName] : []}
                onChange={(fields) => {
                  const selected = fields[0] || "";
                  onChangeField(selected);
                  onSearch();
                }}
              /> */}
              <button
                onClick={onSearch}
                className="px-4 py-2 rounded border bg-gray-100 hover:bg-gray-200 focus:ring"
              >
                Search
              </button>
            </div>

            <input
              type="text"
              placeholder="Filter within results..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="w-full border px-3 py-2 rounded focus:ring"
            />
          </div>

          {/* Scrollable List */}
          <div className="min-h-0 overflow-y-auto p-4 history-list">
            {history.length > 0 ? (
              history.map((evt, i) => {
                const filteredItems = evt.items.filter((it) =>
                  [it.id, it.objName, it.oldVal, it.newVal]
                    .map((v) => String(v ?? "").toLowerCase())
                    .some((val) => val.includes(filterText.toLowerCase()))
                );

                // Skip entire group if neither source nor items match
                const sourceMatches = evt.source
                  .toLowerCase()
                  .includes(filterText.toLowerCase());

                if (!sourceMatches && filteredItems.length === 0) {
                  return null;
                }

                return (
                  <div key={i} className="mb-4 border-b pb-2">
                    <div className="font-medium mb-1">
                      [{evt.time}] <strong>{evt.source}</strong>
                    </div>
                    <ul className="space-y-1 pl-4">
                      {(filterText ? filteredItems : evt.items).map((it) => {
                        const changed = it.oldVal !== it.newVal;
                        return (
                          <li
                            key={`${it.id}-${it.objName}`}
                            className={
                              changed ? "bg-green-100 p-1 rounded" : ""
                            }
                          >
                            {it.objData && (
                              <button
                                className="font-mono text-blue-600 underline mr-1"
                                onClick={() => preview(it.objData, it.objName!)}
                              >
                                {it.objName}
                              </button>
                            )}
                            Id: {it.id} →{/* old value preview */}, 'oldValue'
                            <button
                              className="text-blue-600 underline ml-1 mr-1"
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
                              <code>{String(it.oldVal ?? "—")}</code>
                            </button>
                            ,{/* new value preview */}
                            'newValue'
                            <button
                              className="text-blue-600 underline ml-1"
                              onClick={() =>
                                preview(it.objData, `${it.objName} (after)`)
                              }
                            >
                              <code>{String(it.newVal)}</code>
                            </button>
                            <button
                              className={`ml-2 px-2 py-1 rounded text-sm bg-blue-100 hover:bg-blue-200
                        ${
                          !it.prevObjData || !it.objData
                            ? "opacity-50 pointer-events-none cursor-not-allowed"
                            : ""
                        }
                      `}
                              onClick={() =>
                                showDiff(
                                  it.prevObjData,
                                  it.objData,
                                  `Diff for ${it.objName || it.id}`
                                )
                              }
                            >
                              Compare Diff
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })
            ) : (
              <p className="text-center text-gray-500">
                No changes found for that field.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Object Preview Modal */}
      {previewData && (
        <div
          className="preview-data-container fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-60"
          onClick={() => setPreviewData(null)}
        >
          <div
            className="preview-data bg-white rounded-lg shadow-lg w-3/4 max-h-[50vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold">{previewTitle}</h4>
              <button onClick={() => setPreviewData(null)} className="text-2xl">
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
              style={{ fontSize: "0.9rem", fontFamily: "monospace" }}
            />
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {diffData && (
        <div
          className="history-diff-container fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-60"
          onClick={() => setDiffData(null)}
        >
          <div
            className="history-diff bg-white rounded-lg shadow-lg w-4/5 max-h-[60vh] overflow-auto p-6 font-mono text-sm z-60"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold">{diffTitle}</h4>
              <button onClick={() => setDiffData(null)} className="text-2xl">
                &times;
              </button>
            </div>
            <pre className="overflow-auto">
              {diffData.map((part, idx) => {
                const { added, removed, value } = part;
                let style = {};
                if (added) style = { backgroundColor: "#dfd" }; // green
                else if (removed) style = { backgroundColor: "#fdd" }; // red

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
