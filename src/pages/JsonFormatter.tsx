"use client";

import type React from "react";
import { useState, useRef } from "react";
import { js as beautify } from "js-beautify";
import { Link } from "react-router-dom";
import ReactJson from "react-json-view";

const JsonFormatter: React.FC = () => {
  const [input, setInput] = useState("");
  const [rawOutput, setRawOutput] = useState("");
  const [data, setData] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"tree" | "raw">("tree");
  const [banner, setBanner] = useState<string | null>(null);
  const [collapsedLevel, setCollapsedLevel] = useState(1);
  const [isFormatting, setIsFormatting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const outputRef = useRef<HTMLTextAreaElement>(null);

  const handleFormat = async () => {
    setIsFormatting(true);

    // Add a small delay to show the loading state
    await new Promise((resolve) => setTimeout(resolve, 150));

    let parsedJson: any;
    try {
      let txt = input.trim();
      // un-escape if it was wrapped in quotes
      if (txt.startsWith('"') && txt.endsWith('"')) {
        txt = JSON.parse(txt);
      }
      parsedJson = JSON.parse(txt);
    } catch {
      setIsFormatting(false);
      alert("Invalid JSON");
      return;
    }

    // walk once to detect "method" and "statusCode"
    let foundMethod: string | undefined;
    let foundStatus: number | undefined;
    const walk = (o: any) => {
      if (o && typeof o === "object") {
        if (!foundMethod && typeof o.method === "string") {
          foundMethod = o.method;
        }
        if (!foundStatus && typeof o.statusCode === "number") {
          foundStatus = o.statusCode;
        }
        Object.values(o).forEach(walk);
      }
    };
    walk(parsedJson);

    // set banner
    if (foundMethod) {
      const kind = foundStatus !== undefined ? "response" : "request";
      setBanner(`Viewing ${foundMethod} method ${kind}`);
      setCollapsedLevel(2);
    } else {
      setBanner(null);
      setCollapsedLevel(1);
    }

    // prepare raw prettified text
    setRawOutput(beautify(JSON.stringify(parsedJson), { indent_size: 2 }));
    setData(parsedJson);
    setIsFormatting(false);
  };

  const handleCopy = async () => {
    const txt = viewMode === "raw" ? rawOutput : JSON.stringify(data, null, 2);
    try {
      await navigator.clipboard.writeText(txt);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      alert("Copy failed");
    }
  };

  return (
    <div className="formatter-container min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <style>{`
        .formatter-container {
          animation: fadeIn 0.4s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
            max-height: 0;
          }
          to {
            opacity: 1;
            transform: translateY(0);
            max-height: 100px;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 1;
            transform: translateY(0);
            max-height: 100px;
          }
          to {
            opacity: 0;
            transform: translateY(-10px);
            max-height: 0;
          }
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .nav-link {
          transition: all 0.2s ease;
          position: relative;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .nav-link:hover {
          background-color: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          transform: translateY(-1px);
        }

        .nav-link:active {
          transform: translateY(0);
        }

        .formatter-input {
          transition: all 0.3s ease;
          border: 2px solid #e5e7eb;
          border-radius: 8px;
          resize: vertical;
        }

        .formatter-input:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          transform: translateY(-1px);
        }

        .btn-format {
          transition: all 0.2s ease;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          position: relative;
          overflow: hidden;
        }

        .btn-format:hover:not(:disabled) {
          background-color: #2563eb;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        }

        .btn-format:active:not(:disabled) {
          transform: translateY(-1px);
        }

        .btn-format:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .loading-spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid #ffffff;
          border-radius: 50%;
          border-top-color: transparent;
          animation: spin 1s linear infinite;
          margin-right: 8px;
        }

        .radio-group {
          transition: all 0.3s ease;
        }

        .radio-label {
          transition: all 0.2s ease;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 6px;
          border: 2px solid transparent;
        }

        .radio-label:hover {
          background-color: rgba(59, 130, 246, 0.05);
          border-color: rgba(59, 130, 246, 0.2);
        }

        .radio-label.active {
          background-color: rgba(59, 130, 246, 0.1);
          border-color: #3b82f6;
          color: #3b82f6;
        }

        .radio-input {
          transition: all 0.2s ease;
        }

        .formatter-output-wrapper {
          transition: all 0.4s ease;
          border: 2px solid #e5e7eb;
          border-radius: 12px;
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          animation: slideDown 0.4s ease-out;
        }

        .btn-copy {
          transition: all 0.2s ease;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-weight: 500;
        }

        .btn-copy:hover {
          background-color: #f3f4f6;
          border-color: #9ca3af;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .btn-copy:active {
          transform: translateY(0);
        }

        .btn-copy.success {
          background-color: #10b981;
          color: white;
          border-color: #10b981;
          animation: pulse 0.3s ease;
        }

        .formatter-output {
          transition: all 0.3s ease;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
        }

        .formatter-output:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
        }

        .banner {
          animation: slideDown 0.3s ease-out;
          border-radius: 8px;
          border-left: 4px solid #f59e0b;
          background: linear-gradient(90deg, #fef3c7, #fde68a);
        }

        .view-mode-container {
          opacity: 0;
          animation: fadeIn 0.3s ease-out 0.2s forwards;
        }

        .tree-view-container {
          transition: all 0.3s ease;
        }

        .raw-view-container {
          transition: all 0.3s ease;
        }
      `}</style>

      <nav className="bg-white shadow-sm border-b px-6 py-3 flex-shrink-0">
        <div className="flex items-center space-x-4 text-sm">
          <Link
            to="/"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            Home
          </Link>
          <span className="text-gray-400">|</span>
          <Link
            to="/compare"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            Compare
          </Link>
          <span className="text-gray-400">|</span>
          <Link
            to="/pieces"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            Pieces
          </Link>
          <span className="text-gray-400">|</span>
          <Link
            to="/har"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            HAR
          </Link>
          <span className="text-gray-400">|</span>
          <Link
            to="/log"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            Log
          </Link>
        </div>
      </nav>

      <div className="p-4">
        <h2 className="text-2xl font-bold mb-6 text-gray-800">
          JSON Formatter
        </h2>

        {banner && (
          <div className="banner mb-4 p-3 font-medium text-amber-800">
            {banner}
          </div>
        )}

        <div className="mb-6">
          <textarea
            className="formatter-input w-full h-40 p-4 font-mono text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
            placeholder="Paste raw or escaped JSON here…"
          />
        </div>

        <div className="flex items-center gap-6 mb-6">
          <button
            className="btn-format bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center"
            onClick={handleFormat}
            disabled={isFormatting || !input.trim()}
          >
            {isFormatting && <div className="loading-spinner"></div>}
            {isFormatting ? "Formatting..." : "Prettify"}
          </button>

          {data && (
            <div className="view-mode-container radio-group flex items-center gap-4">
              <label
                className={`radio-label flex items-center text-sm ${
                  viewMode === "tree" ? "active" : ""
                }`}
              >
                <input
                  type="radio"
                  className="radio-input mr-2"
                  name="viewMode"
                  value="tree"
                  checked={viewMode === "tree"}
                  onChange={() => setViewMode("tree")}
                />
                Tree View
              </label>
              <label
                className={`radio-label flex items-center text-sm ${
                  viewMode === "raw" ? "active" : ""
                }`}
              >
                <input
                  type="radio"
                  className="radio-input mr-2"
                  name="viewMode"
                  value="raw"
                  checked={viewMode === "raw"}
                  onChange={() => setViewMode("raw")}
                />
                Raw View
              </label>
            </div>
          )}
        </div>

        {data && (
          <div className="formatter-output-wrapper p-4 relative">
            <button
              className={`btn-copy absolute top-4 right-4 px-3 py-2 text-sm z-10 ${
                copySuccess ? "success" : ""
              }`}
              onClick={handleCopy}
            >
              {copySuccess ? "✓ Copied!" : "Copy"}
            </button>

            {viewMode === "tree" ? (
              <div className="tree-view-container">
                <ReactJson
                  src={data}
                  name={false}
                  collapsed={collapsedLevel}
                  enableClipboard={false}
                  displayDataTypes={false}
                  displayObjectSize={false}
                  indentWidth={2}
                  style={{
                    fontSize: "0.9rem",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace",
                    backgroundColor: "transparent",
                  }}
                />
              </div>
            ) : (
              <div className="raw-view-container">
                <textarea
                  className="formatter-output w-full h-80 p-3 font-mono text-sm resize-none"
                  readOnly
                  ref={outputRef}
                  value={rawOutput}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JsonFormatter;
