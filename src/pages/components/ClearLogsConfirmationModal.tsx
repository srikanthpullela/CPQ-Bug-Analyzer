import { X } from "lucide-react";
import React from "react";

interface ClearLogsConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDarkMode?: boolean;
}

export const ClearLogsConfirmationModal: React.FC<ClearLogsConfirmationModalProps> = ({
  open,
  onClose,
  onConfirm,
  isDarkMode = false,
}) => {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 backdrop-blur-sm flex items-center bg-black bg-opacity-70 justify-center z-50 p-4 animate-in fade-in duration-200 transition-colors ${
        isDarkMode ? "bg-black/70" : "bg-black/50"
      }`}
      onClick={onClose}
    >
      <div
        className={`rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300 transition-colors border ${
          isDarkMode
            ? "bg-gray-800 border-gray-600"
            : "bg-white border-gray-300"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex justify-between items-center p-4 border-b transition-colors ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <h3
            className={`text-lg font-semibold transition-colors ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Clear Network Logs
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

        {/* Content */}
        <div className="p-4">
          {/* Warning Icon */}
          <div className="flex items-center justify-center mb-4">
            <div
              className={`w-16 rounded-full flex items-center justify-center ${
                isDarkMode ? "bg-yellow-900/30" : "bg-yellow-100"
              }`}
            >
              <svg
                className={`w-8 h-8 ${
                  isDarkMode ? "text-yellow-400" : "text-yellow-600"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
          </div>

          {/* Warning Message */}
          <div
            className={`text-center mb-6 transition-colors ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <p className="mb-3 font-medium">
              This action will remove all network logs from your current
              session.
            </p>

            {/* Note Box */}
            <div
              className={`p-3 rounded-lg border-l-4 text-left transition-colors ${
                isDarkMode
                  ? "bg-yellow-900/20 border-yellow-600 text-yellow-200"
                  : "bg-yellow-50 border-yellow-400 text-yellow-800"
              }`}
            >
              <div className="flex items-start">
                <svg
                  className={`w-5 h-5 mr-2 mt-0.5 flex-shrink-0 ${
                    isDarkMode ? "text-yellow-400" : "text-yellow-600"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="font-medium text-sm mb-1">Important Note:</p>
                  <p className="text-sm leading-relaxed">
                    • HTTP requests can be reloaded from the browser's network
                    tab
                    <br />•{" "}
                    <strong>WebSocket messages cannot be retrieved</strong> once
                    cleared
                    <br />• All rule matches and history data will also be lost
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`flex justify-end gap-3 p-4 border-t transition-colors ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg transition-colors duration-200 ${
              isDarkMode
                ? "bg-gray-600 text-gray-200 hover:bg-gray-500"
                : "bg-gray-300 text-gray-700 hover:bg-gray-400"
            }`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition-colors duration-200 ${
              isDarkMode
                ? "bg-red-600 hover:bg-red-500"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            Clear All Logs
          </button>
        </div>
      </div>
    </div>
  );
};
