import React from "react";

interface MatchesModalProps {
  open: boolean;
  matchedResponses: any[];
  onClose: () => void;
}

export const MatchesModal: React.FC<MatchesModalProps> = ({
  open,
  matchedResponses,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div className="query-modal-container fixed inset-0 bg-black z-40 bg-opacity-30 backdrop-blur-sm flex items-center justify-center">
      <div className="query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out bg-white p-4">
        <h2 className="text-lg font-bold">
          Rule Matches ({matchedResponses.length})
        </h2>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {matchedResponses.map((r, i) => (
            <pre
              key={i}
              className="p-2 bg-gray-100 dark:bg-gray-700 text-sm overflow-x-auto"
            >
              {JSON.stringify(r, null, 2)}
            </pre>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            className="px-4 py-1 bg-gray-300"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
