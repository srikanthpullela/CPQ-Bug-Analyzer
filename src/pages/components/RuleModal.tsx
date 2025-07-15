import React from "react";

interface RuleModalProps {
  open: boolean;
  newConditions: Array<{ fieldPath: string; operator: string; value: string }>;
  methodNames: string;
  onClose: () => void;
  onAddCondition: () => void;
  onUpdateCondition: (index: number, field: string, value: string) => void;
  onUpdateMethodNames: (value: string) => void;
  onSave: () => void;
  isDarkMode?: boolean;
}

export const RuleModal: React.FC<RuleModalProps> = ({
  open,
  newConditions,
  methodNames,
  onClose,
  onAddCondition,
  onUpdateCondition,
  onUpdateMethodNames,
  onSave,
  isDarkMode = false,
}) => {
  if (!open) return null;

  return (
    <div className={`query-modal-container fixed inset-0 z-40 backdrop-blur-sm flex items-center justify-center transition-colors ${
      isDarkMode ? "bg-black bg-opacity-70" : "bg-black bg-opacity-30"
    }`}>
      <div className={`query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out p-4 ${
        isDarkMode ? "bg-gray-800" : "bg-white"
      }`}>
        <h2 className={`text-lg font-bold transition-colors duration-200 ${
          isDarkMode ? "text-gray-100" : "text-gray-900"
        }`}>Add Rule</h2>
        {newConditions.map((c, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              className={`flex-1 border px-2 py-1 transition-colors duration-200 ${
                isDarkMode 
                  ? "border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400" 
                  : "border-gray-300 bg-white text-gray-900 placeholder-gray-500"
              }`}
              placeholder="Field Path"
              value={c.fieldPath}
              onChange={(e) =>
                onUpdateCondition(idx, "fieldPath", e.target.value)
              }
            />
            <select
              value={c.operator}
              onChange={(e) =>
                onUpdateCondition(idx, "operator", e.target.value)
              }
              className={`border px-2 py-1 transition-colors duration-200 ${
                isDarkMode 
                  ? "border-gray-600 bg-gray-700 text-gray-100" 
                  : "border-gray-300 bg-white text-gray-900"
              }`}
            >
              <option value="===">===</option>
              <option value="!==">!==</option>
            </select>
            <input
              className={`flex-1 border px-2 py-1 transition-colors duration-200 ${
                isDarkMode 
                  ? "border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400" 
                  : "border-gray-300 bg-white text-gray-900 placeholder-gray-500"
              }`}
              placeholder="Value"
              value={c.value}
              onChange={(e) =>
                onUpdateCondition(idx, "value", e.target.value)
              }
            />
          </div>
        ))}
        <button
          className={`text-sm mt-4 transition-colors duration-200 ${
            isDarkMode ? "text-blue-400" : "text-blue-600"
          }`}
          onClick={onAddCondition}
        >
          + Add Condition
        </button>
        <input
          className={`w-full border px-2 py-1 mt-4 transition-colors duration-200 ${
            isDarkMode 
              ? "border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400" 
              : "border-gray-300 bg-white text-gray-900 placeholder-gray-500"
          }`}
          placeholder="Method Names (optional, comma-separated)"
          value={methodNames}
          onChange={(e) => onUpdateMethodNames(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            className={`px-4 py-1 transition-colors duration-200 ${
              isDarkMode 
                ? "bg-gray-600 text-gray-200 hover:bg-gray-500" 
                : "bg-gray-300 text-gray-700 hover:bg-gray-400"
            }`}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={`px-4 py-1 text-white transition-colors duration-200 ${
              isDarkMode 
                ? "bg-green-700 hover:bg-green-600" 
                : "bg-green-600 hover:bg-green-700"
            }`}
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
