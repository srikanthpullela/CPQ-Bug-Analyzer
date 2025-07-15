import React from "react";

interface MatchesModalProps {
  open: boolean;
  matchedResponses: any[];
  onClose: () => void;
  isDarkMode?: boolean;
}

export const MatchesModal: React.FC<MatchesModalProps> = ({
  open,
  matchedResponses,
  onClose,
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
        }`}>
          Rule Matches ({matchedResponses.length})
        </h2>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {matchedResponses.map((r, i) => (
            <pre
              key={i}
              className={`p-2 text-sm overflow-x-auto transition-colors duration-200 ${
                isDarkMode 
                  ? "bg-gray-700 text-gray-200" 
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {JSON.stringify(r, null, 2)}
            </pre>
          ))}
        </div>
        <div className="flex justify-end">
          <button
            className={`px-4 py-1 transition-colors duration-200 ${
              isDarkMode 
                ? "bg-gray-600 text-gray-200 hover:bg-gray-500" 
                : "bg-gray-300 text-gray-700 hover:bg-gray-400"
            }`}
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
