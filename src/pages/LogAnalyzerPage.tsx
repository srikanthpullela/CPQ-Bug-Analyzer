"use client";

import type React from "react";
import { useState, useEffect, useMemo } from "react";
import "./LogAnalyzerPage.css";
import { LogEntry, parseLogFile } from "../utils/log-parser";
import { Link } from "react-router-dom";
import { ArrowLeft, Home } from "lucide-react";

interface ExceptionEntry {
  exception: string;
  thread: string;
  lines: string[];
}

const INITIAL_LINES_TO_SHOW = 50;
const CHUNK_SIZE = 20;

export default function LogAnalyzerPage() {
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<LogEntry[][]>([]);
  const [exceptions, setExceptions] = useState<ExceptionEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [lineWindow, setLineWindow] = useState<
    Record<number, { start: number; end: number }>
  >({});

  // Debounced search to prevent excessive filtering
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  useEffect(() => {
    setSearchLoading(true);
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setSearchLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const escapeRegExp = (str: string) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Failed to copy to clipboard.");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setLoading(true);
    setTabs([]);
    setAllEntries([]);
    setExceptions([]);
    setActiveTab(null);
    setExpandedIndex(null);
    setLineWindow({});

    const readers: Promise<{ name: string; entries: LogEntry[] }>[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      const p: Promise<{ name: string; entries: LogEntry[] }> = new Promise(
        (resolve) => {
          reader.onload = () => {
            const content = reader.result as string;
            const entries = parseLogFile(content, file.name);

            entries.sort((a, b) => {
              if (!a.timestamp) return 1;
              if (!b.timestamp) return -1;
              return (
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
              );
            });

            resolve({ name: file.name, entries });
          };
          reader.readAsText(file);
        }
      );
      readers.push(p);
    }

    Promise.all(readers)
      .then((results) => {
        setTimeout(() => {
          setTabs(results.map((r) => r.name));
          setAllEntries(results.map((r) => r.entries));
          if (results.length > 0) {
            setActiveTab(results[0].name);
          }
          setLoading(false);
        }, 500); // Small delay to show loading animation
      })
      .catch(() => {
        alert("Failed to read one or more log files.");
        setLoading(false);
      });
  };

  // Memoized filtered exceptions for performance
  const filteredExceptions = useMemo(() => {
    if (!activeTab) return [];

    const idx = tabs.indexOf(activeTab);
    if (idx < 0) return [];

    const allEx: ExceptionEntry[] = allEntries[idx].map((entry) => ({
      exception: entry.lines[entry.lines.length - 1],
      thread: entry.threadId ? `Thread ${entry.threadId}` : "Thread unknown",
      lines: entry.lines,
    }));

    if (!debouncedSearchTerm.trim()) return allEx;

    const term = debouncedSearchTerm.toLowerCase();
    return allEx.filter((ex) => {
      if (ex.exception.toLowerCase().includes(term)) return true;
      if (ex.thread.toLowerCase().includes(term)) return true;
      return ex.lines.some((l) => l.toLowerCase().includes(term));
    });
  }, [activeTab, allEntries, tabs, debouncedSearchTerm]);

  useEffect(() => {
    setExceptions(filteredExceptions);
    setExpandedIndex(null);
    setLineWindow({});
  }, [filteredExceptions]);

  const onToggleExpand = (realIdx: number) => {
    setExpandedIndex((prev) => {
      const now = prev === realIdx ? null : realIdx;

      if (now !== null && !(now in lineWindow)) {
        const total = exceptions[now].lines.length;
        const start = Math.max(0, total - INITIAL_LINES_TO_SHOW);
        const end = total;
        setLineWindow((lw) => ({ ...lw, [now]: { start, end } }));
      }

      return now;
    });
  };

  const loadMoreAbove = (realIdx: number) => {
    setLineWindow((lw) => {
      const w = lw[realIdx];
      if (!w) return lw;
      const newStart = Math.max(0, w.start - CHUNK_SIZE);
      return { ...lw, [realIdx]: { start: newStart, end: w.end } };
    });
  };

  const loadMoreBelow = (realIdx: number) => {
    setLineWindow((lw) => {
      const w = lw[realIdx];
      if (!w) return lw;
      const total = exceptions[realIdx].lines.length;
      const newEnd = Math.min(total, w.end + CHUNK_SIZE);
      return { ...lw, [realIdx]: { start: w.start, end: newEnd } };
    });
  };

  return (
    <div className="log-analyzer-container">
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
            <span className="text-slate-700 font-medium">Log Analyzer</span>
            <Link
              to="/formatter"
              className="text-slate-600 hover:text-blue-600 transition-colors"
            >
              Formatter
            </Link>
            <Link
              to="/compare"
              className="text-slate-600 hover:text-blue-600 transition-colors"
            >
              Compare
            </Link>
            <Link
              to="/har"
              className="text-slate-600 hover:text-blue-600 transition-colors"
            >
              HAR
            </Link>
          </div>
        </div>
      </nav>
      <div className="log-analyzer-content">
        {/* Header */}
        <div className="header-section px-5">
          <h1 className="main-title">
            <span className="title-icon">📄</span>
            Turbo Log Analyzer
          </h1>
          <p className="subtitle">
            Upload and analyze log files with intelligent error detection
          </p>
        </div>

        {/* File Upload */}
        <div className="upload-card">
          <div className="upload-zone">
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="file-input"
              id="file-upload"
              accept=".log,.txt"
            />
            <label htmlFor="file-upload" className="upload-label">
              <div className="upload-icon">📁</div>
              <span className="upload-text">Choose Log Files</span>
              <span className="upload-subtext">or drag and drop</span>
            </label>
          </div>
        </div>

        {/* Loading Animation */}
        {loading && (
          <div className="loading-card p-4">
            <div className="loading-content">
              <div className="loading-spinner">
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
                <div className="spinner-ring"></div>
              </div>
              <div className="loading-text">
                <p className="loading-title">Parsing log files...</p>
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search Box */}
        {tabs.length > 0 && (
          <div className="search-card p-4">
            <div className="search-container">
              <div className="search-icon">🔍</div>
              <input
                type="text"
                placeholder="Search across headers or lines..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              {searchLoading && (
                <div className="search-loading">
                  <div className="search-spinner"></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tabs */}
        {tabs.length > 0 && (
          <div className="tabs-container p-4">
            {tabs.map((name, index) => (
              <button
                key={name}
                className={`tab-button ${name === activeTab ? "active" : ""}`}
                onClick={() => setActiveTab(name)}
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <span className="tab-icon">📄</span>
                {name}
              </button>
            ))}
          </div>
        )}

        {/* No Exceptions Message */}
        {tabs.length > 0 && exceptions.length === 0 && !loading && (
          <div className="no-results-card p-4">
            <div className="no-results-content">
              <div className="no-results-icon">⚠️</div>
              <p className="no-results-title">No exceptions found</p>
              <p className="no-results-subtitle">
                Try adjusting your search terms
              </p>
            </div>
          </div>
        )}

        {/* Exceptions Accordion */}
        {tabs.length > 0 && exceptions.length > 0 && (
          <div className="exceptions-section p-4">
            <h3 className="exceptions-title">
              <span className="exceptions-icon">⚠️</span>
              Exceptions & Errors ({exceptions.length})
            </h3>

            <div className="accordion-container">
              {exceptions.map((ex, realIdx) => {
                const term = debouncedSearchTerm.trim();
                let highlightRE: RegExp | null = null;
                if (term) {
                  const escaped = escapeRegExp(term);
                  highlightRE = new RegExp(`(${escaped})`, "gi");
                }

                const highlightedHeader = highlightRE
                  ? ex.exception.replace(
                      highlightRE,
                      (m) => `<mark>${m}</mark>`
                    )
                  : ex.exception;

                const highlightedThread = highlightRE
                  ? ex.thread.replace(highlightRE, (m) => `<mark>${m}</mark>`)
                  : ex.thread;

                const isOpen = expandedIndex === realIdx;
                const windowDef = lineWindow[realIdx] || { start: 0, end: 0 };
                const { start, end } = windowDef;
                const visibleLines = ex.lines.slice(start, end);

                return (
                  <div
                    key={realIdx}
                    className={`accordion-item ${isOpen ? "expanded" : ""}`}
                    style={{ animationDelay: `${realIdx * 50}ms` }}
                  >
                    <div
                      className="accordion-header"
                      onClick={() => onToggleExpand(realIdx)}
                    >
                      <div className="accordion-header-content">
                        <div className="accordion-info">
                          <div className="thread-info">
                            <span
                              className="thread-name"
                              dangerouslySetInnerHTML={{
                                __html: highlightedThread,
                              }}
                            />
                          </div>
                          <p
                            className="exception-text"
                            dangerouslySetInnerHTML={{
                              __html: highlightedHeader,
                            }}
                          />
                        </div>
                        <div className={`chevron ${isOpen ? "rotated" : ""}`}>
                          ▼
                        </div>
                      </div>
                    </div>

                    <div
                      className={`accordion-content ${isOpen ? "open" : ""}`}
                    >
                      <div className="accordion-body">
                        <button
                          className="copy-button"
                          onClick={() => copyToClipboard(ex.lines.join("\n"))}
                        >
                          📋 Copy Full Block
                        </button>

                        {start > 0 && (
                          <button
                            className="load-more-button"
                            onClick={() => loadMoreAbove(realIdx)}
                          >
                            ▲ Load earlier lines ({CHUNK_SIZE})
                          </button>
                        )}

                        <pre className="log-snippet">
                          {visibleLines.map((line, idx) => {
                            const rendered = highlightRE
                              ? line.replace(
                                  highlightRE,
                                  (m) => `<mark>${m}</mark>`
                                )
                              : line;
                            return (
                              <div
                                key={idx}
                                className="log-line"
                                style={{ animationDelay: `${idx * 20}ms` }}
                                dangerouslySetInnerHTML={{ __html: rendered }}
                              />
                            );
                          })}
                        </pre>

                        {end < ex.lines.length && (
                          <button
                            className="load-more-button"
                            onClick={() => loadMoreBelow(realIdx)}
                          >
                            Load later lines ({CHUNK_SIZE}) ▼
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
