import React from "react";
import { X, RotateCcw, AlertCircle, Send } from "lucide-react";

interface EditModalProps {
  open: boolean;
  editMethod: string;
  jsonValue: string;
  jsonError: string | null;
  origin: string;
  isDarkMode: boolean;
  onClose: () => void;
  onJsonChange: (value: string) => void;
  onResetToOriginal: () => void;
  onSendRequest: () => void;
}

export const EditModal: React.FC<EditModalProps> = ({
  open,
  editMethod,
  jsonValue,
  jsonError,
  origin,
  isDarkMode,
  onClose,
  onJsonChange,
  onResetToOriginal,
  onSendRequest,
}) => {
  if (!open) return null;

  return (
    <div
      className={`query-modal-container fixed inset-0 bg-black z-40 bg-opacity-30 backdrop-blur-sm flex items-center justify-center ${
        isDarkMode ? "bg-black/70" : "bg-black/30"
      }`}
      onClick={onClose}
    >
      <div
        className={`query-modal rounded-lg shadow-lg w-11/12 sm:w-3/4 lg:w-2/3 h-[85vh] flex flex-col min-h-0 z-50 transform transition-all duration-300 ease-out ${
          isDarkMode ? "bg-gray-800" : "bg-white"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-6 border-b transition-colors duration-200 ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <h2
              className={`text-xl font-semibold transition-colors duration-200 ${
                isDarkMode ? "text-gray-100" : "text-gray-900"
              }`}
            >
              Edit & Re-trigger Request
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-mono transition-colors duration-200 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-200"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {editMethod}
            </span>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
            }`}
          >
            <X
              className={`h-5 w-5 transition-colors duration-200 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-4 p-6 min-h-0">
          <div className="flex items-center justify-between">
            <div>
              <h3
                className={`text-sm font-medium mb-1 transition-colors duration-200 ${
                  isDarkMode ? "text-gray-200" : "text-gray-700"
                }`}
              >
                Request Payload
              </h3>
              <p
                className={`text-xs transition-colors duration-200 ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                Edit the JSON payload below and re-trigger the request
              </p>
            </div>
            <button
              onClick={onResetToOriginal}
              className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                isDarkMode
                  ? "text-gray-200 bg-gray-700 border-gray-600 hover:bg-gray-600"
                  : "text-gray-700 bg-white border-gray-300 hover:bg-gray-50"
              }`}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>

          {/* Error Alert */}
          {jsonError && (
            <div
              className={`flex items-center gap-2 p-3 border rounded-lg transition-colors duration-200 ${
                isDarkMode
                  ? "bg-red-900/20 border-red-700"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <AlertCircle
                className={`h-4 w-4 flex-shrink-0 transition-colors duration-200 ${
                  isDarkMode ? "text-red-400" : "text-red-600"
                }`}
              />
              <span
                className={`text-sm transition-colors duration-200 ${
                  isDarkMode ? "text-red-300" : "text-red-700"
                }`}
              >
                {jsonError}
              </span>
            </div>
          )}

          {/* JSON Textarea */}
          <div className="flex-1 min-h-0">
            <textarea
              value={jsonValue}
              onChange={(e) => onJsonChange(e.target.value)}
              className={`w-full h-full min-h-[300px] p-3 font-mono text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                jsonError
                  ? isDarkMode
                    ? "border-red-600 focus:border-red-500 focus:ring-red-500 bg-gray-900 text-gray-100"
                    : "border-red-300 focus:border-red-500 focus:ring-red-500"
                  : isDarkMode
                  ? "border-gray-600 bg-gray-900 text-gray-100 focus:border-blue-500"
                  : "border-gray-300 bg-white text-gray-900"
              }`}
              placeholder="Enter JSON payload..."
            />
          </div>

          {/* Footer */}
          <div
            className={`flex items-center justify-between pt-4 border-t transition-colors duration-200 ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div
              className={`text-xs transition-colors duration-200 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {origin && (
                <span>
                  Target:{" "}
                  <code
                    className={`px-1.5 py-0.5 rounded text-xs font-mono transition-colors duration-200 ${
                      isDarkMode
                        ? "bg-gray-700 text-gray-200"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {origin}/apexremote
                  </code>
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className={`px-4 py-2 text-sm font-medium border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors ${
                  isDarkMode
                    ? "text-gray-200 bg-gray-700 border-gray-600 hover:bg-gray-600"
                    : "text-gray-700 bg-white border-gray-300 hover:bg-gray-50"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={onSendRequest}
                disabled={!!jsonError}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white border border-transparent rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  isDarkMode
                    ? "bg-blue-700 hover:bg-blue-600"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <Send className="h-4 w-4" />
                Send Request
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
