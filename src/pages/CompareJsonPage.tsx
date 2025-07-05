"use client";

import type React from "react";
import { useState, useRef } from "react";
import { diffLines, type Change } from "diff";
import { Link } from "react-router-dom";

export default function CompareJsonPage() {
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [diffs, setDiffs] = useState<Change[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const oldRef = useRef<HTMLTextAreaElement>(null);
  const newRef = useRef<HTMLTextAreaElement>(null);

  const handleShowDiff = async () => {
    setIsLoading(true);

    // Add a small delay for smooth transition
    await new Promise((resolve) => setTimeout(resolve, 300));

    let o: any, n: any;
    try {
      o = JSON.parse(
        oldText.trim().startsWith('"') ? JSON.parse(oldText) : oldText
      );
      n = JSON.parse(
        newText.trim().startsWith('"') ? JSON.parse(newText) : newText
      );
    } catch {
      setIsLoading(false);
      alert("Invalid JSON in one of the boxes");
      return;
    }

    const prettyOld = JSON.stringify(o, null, 2);
    const prettyNew = JSON.stringify(n, null, 2);
    const diffResult = diffLines(prettyOld, prettyNew);

    setDiffs(diffResult);
    setShowDiff(true);
    setIsLoading(false);
  };

  const handleClear = () => {
    setOldText("");
    setNewText("");
    setDiffs(null);
    setShowDiff(false);
  };

  const selectAll = (ref: React.RefObject<HTMLTextAreaElement>) => {
    ref.current?.select();
  };

  const formatJson = (text: string, setText: (text: string) => void) => {
    try {
      const parsed = JSON.parse(
        text.trim().startsWith('"') ? JSON.parse(text) : text
      );
      const formatted = JSON.stringify(parsed, null, 2);
      setText(formatted);
    } catch {
      alert("Invalid JSON format");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b px-6 py-3 flex-shrink-0">
        <div className="flex items-center space-x-4 text-sm">
          <Link
            to="/"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            Home
          </Link>
          <span className="text-gray-400">|</span>
          {/* <Link
            to="/sfdc"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            SFDC
          </Link>
          <span className="text-gray-400">|</span>
          <Link
            to="/turbo"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            Turbo
          </Link>
          <span className="text-gray-400">|</span> */}
          <Link
            to="/formatter"
            className="text-blue-600 hover:text-blue-800 transition-colors"
          >
            Formatter
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Compare JSON</h1>
          <div className="flex space-x-3">
            <button
              onClick={handleClear}
              className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 hover:shadow-md"
            >
              Clear All
            </button>
            <button
              onClick={handleShowDiff}
              disabled={isLoading || !oldText.trim() || !newText.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg transform hover:scale-105 disabled:transform-none"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </div>
              ) : (
                "Show Differences"
              )}
            </button>
          </div>
        </div>

        {/* JSON Input Panels */}
        <div
          className={`grid gap-6 transition-all duration-500 ${
            showDiff
              ? "grid-cols-1 lg:grid-cols-2"
              : "grid-cols-1 md:grid-cols-2"
          }`}
        >
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <label className="font-semibold text-gray-700">Old JSON</label>
              <button
                onClick={() => formatJson(oldText, setOldText)}
                className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors"
              >
                Format
              </button>
            </div>
            <textarea
              ref={oldRef}
              className="w-full h-32 p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-all duration-200"
              value={oldText}
              onChange={(e) => setOldText(e.target.value)}
              onClick={() => selectAll(oldRef)}
              placeholder="Paste your old JSON here..."
            />
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <label className="font-semibold text-gray-700">New JSON</label>
              <button
                onClick={() => formatJson(newText, setNewText)}
                className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 transition-colors"
              >
                Format
              </button>
            </div>
            <textarea
              ref={newRef}
              className="w-full h-32 p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset transition-all duration-200"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onClick={() => selectAll(newRef)}
              placeholder="Paste your new JSON here..."
            />
          </div>
        </div>

        {/* Diff Results */}
        <div
          className={`flex-1 transition-all duration-500 ${
            showDiff && diffs
              ? "opacity-100 transform translate-y-0"
              : "opacity-0 transform translate-y-4 pointer-events-none"
          }`}
        >
          {diffs && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex-shrink-0">
                <h3 className="font-semibold text-gray-700">Differences</h3>
              </div>
              <div className="flex-1 overflow-auto">
                <pre className="p-4 font-mono text-sm leading-relaxed h-full">
                  {diffs.map((part, i) => {
                    const { added, removed, value } = part;
                    let prefix = " ";
                    let className = "text-gray-700";

                    if (added) {
                      prefix = "+";
                      className = "bg-green-100 text-green-800";
                    } else if (removed) {
                      prefix = "-";
                      className = "bg-red-100 text-red-800";
                    }

                    return (
                      <span
                        key={i}
                        className={`${className} transition-colors duration-200`}
                      >
                        {value
                          .split("\n")
                          .map((line, idx, arr) =>
                            idx === arr.length - 1 && !line
                              ? null
                              : prefix + " " + line + "\n"
                          )}
                      </span>
                    );
                  })}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
