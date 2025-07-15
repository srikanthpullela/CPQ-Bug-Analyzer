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
}) => {
  if (!open) return null;

  return (
    <div className="query-modal-container fixed inset-0 bg-black z-40 bg-opacity-30 backdrop-blur-sm flex items-center justify-center">
      <div className="query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out bg-white p-4">
        <h2 className="text-lg font-bold">Add Rule</h2>
        {newConditions.map((c, idx) => (
          <div key={idx} className="flex gap-2">
            <input
              className="flex-1 border px-2 py-1"
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
              className="border px-2 py-1"
            >
              <option value="===">===</option>
              <option value="!==">!==</option>
            </select>
            <input
              className="flex-1 border px-2 py-1"
              placeholder="Value"
              value={c.value}
              onChange={(e) =>
                onUpdateCondition(idx, "value", e.target.value)
              }
            />
          </div>
        ))}
        <button
          className="text-sm text-blue-600 mt-4"
          onClick={onAddCondition}
        >
          + Add Condition
        </button>
        <input
          className="w-full border px-2 py-1 mt-4"
          placeholder="Method Names (optional, comma-separated)"
          value={methodNames}
          onChange={(e) => onUpdateMethodNames(e.target.value)}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            className="px-4 py-1 bg-gray-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-1 bg-green-600 text-white"
            onClick={onSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
