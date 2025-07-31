"use client";

import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { diffLines, type Change } from "diff";
import { Link } from "react-router-dom";
import { ArrowLeft, Home, ChevronUp, ChevronDown } from "lucide-react";

interface ChangeMarker {
  type: "added" | "removed";
  lineNumber: number;
  content: string;
  offsetTop: number;
  element?: HTMLElement;
}

export default function CompareJsonPage() {
  const [oldText, setOldText] = useState("");
  const [newText, setNewText] = useState("");
  const [diffs, setDiffs] = useState<Change[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [changeMarkers, setChangeMarkers] = useState<ChangeMarker[]>([]);
  const [currentChangeIndex, setCurrentChangeIndex] = useState(-1);
  const [searchFilter, setSearchFilter] = useState("");

  // Add resizable panels state
  const [rightPanelWidth, setRightPanelWidth] = useState(25); // percentage for changes navigator
  const [isResizing, setIsResizing] = useState(false);

  const oldRef = useRef<HTMLTextAreaElement>(null);
  const newRef = useRef<HTMLTextAreaElement>(null);
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const diffPreRef = useRef<HTMLPreElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

  // Calculate change markers and scroll positions
  useEffect(() => {
    if (diffs && diffPreRef.current) {
      // Clear previous markers
      setChangeMarkers([]);

      // Wait for DOM to update and recalculate
      setTimeout(() => {
        calculateChangeMarkers();
      }, 300);
    }
  }, [diffs]);

  const calculateChangeMarkers = () => {
    if (!diffPreRef.current) return;

    const preElement = diffPreRef.current;
    const markers: ChangeMarker[] = [];
    let lineNumber = 0;

    // Process each diff part to build accurate line mapping
    diffs?.forEach((part, partIndex) => {
      const { added, removed, value } = part;
      const lines = value.split("\n");

      lines.forEach((line, lineIndex) => {
        // Skip empty line at end of part
        if (lineIndex === lines.length - 1 && !line) return;

        if (added || removed) {
          // Calculate accurate position using line height
          const lineHeight = 20; // Approximate line height in pixels
          const offsetTop = lineNumber * lineHeight;

          // Don't truncate the content - show more meaningful preview
          let content = line.trim();
          
          // If line is very long, show more context but still limit for UI
          if (content.length > 120) {
            // Try to find a good break point (after quotes, commas, colons)
            let breakPoint = 120;
            const goodBreaks = ['"', ',', ':', '}', ']'];
            
            for (let i = 80; i < Math.min(120, content.length); i++) {
              if (goodBreaks.includes(content[i])) {
                breakPoint = i + 1;
                break;
              }
            }
            
            content = content.substring(0, breakPoint) + "...";
          }
          
          // Remove the diff prefix (+ or -) if present for cleaner display
          if (content.startsWith('+ ') || content.startsWith('- ')) {
            content = content.substring(2);
          }

          markers.push({
            type: added ? "added" : "removed",
            lineNumber: lineNumber,
            content: content || "(empty line)",
            offsetTop,
          });
        }

        lineNumber++;
      });
    });

    console.log("Calculated markers:", markers);
    setChangeMarkers(markers);
  };

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
    setCurrentChangeIndex(-1);
    setIsLoading(false);
  };

  const handleClear = () => {
    setOldText("");
    setNewText("");
    setDiffs(null);
    setShowDiff(false);
    setChangeMarkers([]);
    setCurrentChangeIndex(-1);
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

  const scrollToChange = (index: number) => {
    if (!diffPreRef.current || index < 0 || index >= changeMarkers.length) return;

    const marker = changeMarkers[index];
    setCurrentChangeIndex(index);

    console.log("Scrolling to marker:", marker);

    // Use line-based scrolling for more accurate positioning
    const lineHeight = 20;
    const targetScrollTop = Math.max(0, marker.lineNumber * lineHeight - 100);

    // Scroll the pre element, not the container
    diffPreRef.current.scrollTo({
      top: targetScrollTop,
      behavior: "smooth",
    });

    // Highlight current change in navigator
    const navigatorItems = document.querySelectorAll(".change-navigator-item");
    navigatorItems.forEach((item, idx) => {
      if (idx === index) {
        item.classList.add("active");
        item.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        item.classList.remove("active");
      }
    });
  };

  const navigateChanges = (direction: "next" | "prev") => {
    const filteredMarkers = getFilteredMarkers();
    if (filteredMarkers.length === 0) return;

    // Find current index in filtered results
    const currentFilteredIndex = filteredMarkers.findIndex(marker => 
      changeMarkers.indexOf(marker) === currentChangeIndex
    );

    let newIndex;
    if (direction === "next") {
      const nextFilteredIndex = currentFilteredIndex < filteredMarkers.length - 1
        ? currentFilteredIndex + 1
        : 0;
      newIndex = changeMarkers.indexOf(filteredMarkers[nextFilteredIndex]);
    } else {
      const prevFilteredIndex = currentFilteredIndex > 0
        ? currentFilteredIndex - 1
        : filteredMarkers.length - 1;
      newIndex = changeMarkers.indexOf(filteredMarkers[prevFilteredIndex]);
    }

    scrollToChange(newIndex);
  };

  const getFilteredMarkers = () => {
    if (!searchFilter.trim()) return changeMarkers;
    
    const searchTerm = searchFilter.toLowerCase();
    return changeMarkers.filter(marker => 
      marker.content.toLowerCase().includes(searchTerm) ||
      marker.type.toLowerCase().includes(searchTerm)
    );
  };

  const getScrollIndicatorPosition = () => {
    if (!diffPreRef.current || changeMarkers.length === 0) return [];

    const preElement = diffPreRef.current;
    const scrollHeight = Math.max(preElement.scrollHeight, 1);
    const containerHeight = preElement.clientHeight;

    return changeMarkers.map((marker, index) => ({
      ...marker,
      position: Math.max(2, Math.min(98, (marker.offsetTop / scrollHeight) * 100)),
      isActive: index === currentChangeIndex,
    }));
  };

  const handleIndicatorClick = (index: number) => {
    scrollToChange(index);
  };

  // Add line numbers to diff output
  const renderDiffWithLineNumbers = () => {
    let lineNumber = 1;

    return diffs?.map((part, i) => {
      const { added, removed, value } = part;
      let prefix = " ";
      let className = "text-gray-700";
      let lineClassName = "";

      if (added) {
        prefix = "+";
        className = "bg-green-100 text-green-800";
        lineClassName = "added-line";
      } else if (removed) {
        prefix = "-";
        className = "bg-red-100 text-red-800";
        lineClassName = "removed-line";
      }

      const lines = value.split("\n");
      const renderedLines = lines.map((line, idx) => {
        if (idx === lines.length - 1 && !line) return null;

        const currentLineNumber = lineNumber++;

        return (
          <div
            key={`${i}-${idx}`}
            className={`diff-line ${lineClassName} flex hover:bg-opacity-75`}
            data-line-number={currentLineNumber}
          >
            <span className="line-number">{currentLineNumber}</span>
            <span className="line-content">{prefix + " " + line}</span>
          </div>
        );
      });

      return (
        <span
          key={i}
          className={`${className} transition-colors duration-200 ${lineClassName}`}
        >
          {renderedLines}
        </span>
      );
    });
  };

  // Add resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !resizeRef.current) return;

    const container = resizeRef.current.parentElement;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newRightWidth = ((containerRect.right - e.clientX) / containerRect.width) * 100;

    // Constrain between 15% and 50%
    const constrainedWidth = Math.max(15, Math.min(50, newRightWidth));
    setRightPanelWidth(constrainedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30 shadow-sm">
        <div className="mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-slate-600 hover:text-blue-600 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <Home className="w-4 h-4" />
              <span>Back to Home</span>
            </Link>
            <span className="text-slate-300">|</span>
            <span className="text-slate-700 font-medium">Compare JSON</span>
            <Link
              to="/formatter"
              className="text-slate-600 hover:text-blue-600 transition-colors"
            >
              Formatter
            </Link>
            <Link
              to="/har"
              className="text-slate-600 hover:text-blue-600 transition-colors"
            >
              HAR
            </Link>
            <Link
              to="/log"
              className="text-slate-600 hover:text-blue-600 transition-colors"
            >
              Log
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-gray-900">Compare JSON</h1>
            {changeMarkers.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-lg">
                <span className="font-medium">
                  {changeMarkers.length} changes found
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => navigateChanges("prev")}
                    className="p-1 hover:bg-blue-100 rounded transition-colors"
                    title="Previous change"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => navigateChanges("next")}
                    className="p-1 hover:bg-blue-100 rounded transition-colors"
                    title="Next change"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
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

        {/* Diff Results with Resizable Change Navigator */}
        <div
          className={`flex-1 transition-all duration-500 ${
            showDiff && diffs
              ? "opacity-100 transform translate-y-0"
              : "opacity-0 transform translate-y-4 pointer-events-none"
          }`}
        >
          {diffs && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex" style={{ height: '75vh' }}>
              {/* Diff Content - Resizable Left Panel */}
              <div
                className="flex flex-col transition-all duration-200"
                style={{ width: changeMarkers.length > 0 ? `${100 - rightPanelWidth}%` : '100%', height: '100%' }}
              >
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex-shrink-0 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-700">Differences</h3>
                  {currentChangeIndex >= 0 && (
                    <span className="text-sm text-gray-600">
                      Change {currentChangeIndex + 1} of {changeMarkers.length}
                    </span>
                  )}
                </div>

                <div
                  ref={diffContainerRef}
                  className="flex-1 overflow-auto relative"
                  style={{ position: "relative", height: 'calc(100% - 57px)' }}
                >
                  {/* Scroll Indicators */}
                  <div className="absolute left-1 top-0 bottom-0 w-4 pointer-events-none z-10">
                    <div className="relative h-full">
                      {getScrollIndicatorPosition().map((indicator, index) => (
                        <button
                          key={index}
                          className={`absolute w-4 h-3 rounded-full transition-all duration-200 pointer-events-auto cursor-pointer border border-white shadow-sm ${
                            indicator.isActive
                              ? "bg-blue-500 scale-125 z-20"
                              : indicator.type === "added"
                              ? "bg-green-400 hover:bg-green-500"
                              : "bg-red-400 hover:bg-red-500"
                          }`}
                          style={{
                            top: `${indicator.position}%`,
                            transform: "translateY(-50%)",
                          }}
                          title={`${indicator.type === "added" ? "Added" : "Removed"} - Line ${indicator.lineNumber + 1}: ${indicator.content}`}
                          onClick={() => handleIndicatorClick(index)}
                        />
                      ))}
                    </div>
                  </div>

                  <pre
                    ref={diffPreRef}
                    className="p-4 pl-8 font-mono text-sm leading-relaxed h-full whitespace-pre-wrap overflow-auto"
                  >
                    {renderDiffWithLineNumbers()}
                  </pre>
                </div>
              </div>

              {/* Resizable Divider */}
              {changeMarkers.length > 0 && (
                <div
                  ref={resizeRef}
                  className={`w-1 bg-gray-300 hover:bg-blue-400 cursor-col-resize transition-all duration-200 relative group ${
                    isResizing ? "bg-blue-400" : ""
                  }`}
                  onMouseDown={handleMouseDown}
                  style={{ height: '100%' }}
                >
                  <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-1 h-8 bg-blue-500 rounded-full"></div>
                  </div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                      Drag to resize
                    </div>
                  </div>
                </div>
              )}

              {/* Change Navigator Sidebar - Resizable Right Panel */}
              {changeMarkers.length > 0 && (
                <div
                  className="flex flex-col bg-gray-50 border-l border-gray-200 transition-all duration-200"
                  style={{ width: `${rightPanelWidth}%`, minWidth: '200px', height: '100%' }}
                >
                  <div className="p-4 border-b border-gray-200 bg-gray-100 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-800 text-sm">
                        Changes ({getFilteredMarkers().length}{searchFilter.trim() ? ` of ${changeMarkers.length}` : ""})
                      </h4>
                      <span className="text-xs text-gray-500">
                        {rightPanelWidth.toFixed(0)}% width
                      </span>
                    </div>
                    
                    {/* Search Filter */}
                    <div className="mb-3">
                      <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Search changes..."
                        className="w-full px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      {searchFilter.trim() && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500">
                            {getFilteredMarkers().length} results
                          </span>
                          <button
                            onClick={() => setSearchFilter("")}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => navigateChanges("prev")}
                        className="flex-1 px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        disabled={changeMarkers.length === 0}
                      >
                        ← Prev
                      </button>
                      <button
                        onClick={() => navigateChanges("next")}
                        className="flex-1 px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        disabled={changeMarkers.length === 0}
                      >
                        Next →
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto" style={{ height: 'calc(100% - 180px)' }}>
                    {getFilteredMarkers().length === 0 && searchFilter.trim() ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No changes match your search
                      </div>
                    ) : (
                      getFilteredMarkers().map((marker, filteredIndex) => {
                        const originalIndex = changeMarkers.indexOf(marker);
                        return (
                          <button
                            key={originalIndex}
                            onClick={() => scrollToChange(originalIndex)}
                            className={`change-navigator-item w-full p-3 text-left border-b border-gray-200 hover:bg-gray-100 transition-colors ${
                              currentChangeIndex === originalIndex
                                ? "bg-blue-100 border-blue-300 active"
                                : ""
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`inline-block w-3 h-3 rounded-full flex-shrink-0 ${
                                  marker.type === "added" ? "bg-green-500" : "bg-red-500"
                                }`}
                              />
                              <span className="text-sm font-medium">
                                {marker.type === "added" ? "Added" : "Removed"}
                              </span>
                              <span className="text-xs text-gray-500">
                                L{marker.lineNumber + 1}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 font-mono break-words whitespace-pre-wrap">
                              {searchFilter.trim() ? (
                                <HighlightedText text={marker.content} highlight={searchFilter} />
                              ) : (
                                marker.content
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Quick resize buttons */}
                  <div className="p-2 border-t border-gray-200 bg-gray-50 flex-shrink-0" style={{ height: '60px' }}>
                    <div className="flex gap-1 text-xs">
                      <button
                        onClick={() => setRightPanelWidth(20)}
                        className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        20%
                      </button>
                      <button
                        onClick={() => setRightPanelWidth(30)}
                        className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        30%
                      </button>
                      <button
                        onClick={() => setRightPanelWidth(40)}
                        className="px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                      >
                        40%
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .line-number {
          display: inline-block;
          width: 40px;
          color: #6b7280;
          background-color: #f9fafb;
          border-right: 1px solid #e5e7eb;
          padding-right: 8px;
          margin-right: 8px;
          text-align: right;
          font-size: 12px;
          user-select: none;
          flex-shrink: 0;
        }

        .line-content {
          flex: 1;
          white-space: pre;
        }

        .diff-line {
          display: flex;
          width: 100%;
          min-height: 20px;
          line-height: 20px;
        }

        .diff-line.added-line {
          background-color: rgba(34, 197, 94, 0.1);
          border-left: 3px solid #22c55e;
          padding-left: 4px;
          margin-left: -4px;
        }

        .diff-line.added-line .line-number {
          background-color: rgba(34, 197, 94, 0.05);
          color: #059669;
        }

        .diff-line.removed-line {
          background-color: rgba(239, 68, 68, 0.1);
          border-left: 3px solid #ef4444;
          padding-left: 4px;
          margin-left: -4px;
        }

        .diff-line.removed-line .line-number {
          background-color: rgba(239, 68, 68, 0.05);
          color: #dc2626;
        }

        .diff-line:hover {
          background-color: rgba(59, 130, 246, 0.05);
        }

        /* Enhanced resize functionality */
        .change-navigator-item.active {
          box-shadow: inset 3px 0 0 #3b82f6;
        }

        .change-navigator-item:hover {
          background-color: rgba(243, 244, 246, 0.8);
        }

        /* Ensure both panels use full height */
        .flex-1.overflow-auto {
          height: 100%;
        }

        /* Smooth transitions for resize */
        .transition-all {
          transition-property: all;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Better word wrapping for long content */
        .break-words {
          word-wrap: break-word;
          word-break: break-word;
          overflow-wrap: break-word;
          hyphens: auto;
        }

        /* Resize cursor indication */
        .cursor-col-resize {
          cursor: col-resize;
        }

        /* Improved hover states */
        .group:hover .opacity-0 {
          opacity: 1;
        }

        /* Responsive design for smaller screens */
        @media (max-width: 768px) {
          .change-navigator-item {
            padding: 8px;
          }

          .change-navigator-item .text-xs {
            font-size: 10px;
          }
        }

        /* Focus states for accessibility */
        .change-navigator-item:focus {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }

        /* Smooth scrolling for the diff container */
        .overflow-auto {
          scroll-behavior: smooth;
        }

        /* Custom scrollbar for better visibility */
        .overflow-auto::-webkit-scrollbar {
          width: 12px;
        }

        .overflow-auto::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 6px;
        }

        .overflow-auto::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 6px;
        }

        .overflow-auto::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        /* Better content display for change items */
        .change-navigator-item {
          max-height: none;
          min-height: 60px;
        }

        .change-navigator-item .text-xs {
          line-height: 1.4;
          max-height: none;
          overflow: visible;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
      `}</style>
    </div>
  );
}

// Helper component to highlight search terms
const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return (
    <>
      {parts.map((part, index) => 
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span key={index} className="bg-yellow-200 font-semibold">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
};
