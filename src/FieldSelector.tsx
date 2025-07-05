"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";

interface Props {
  allFields: string[];
  selectedFields: string[];
  onChange: (fields: string[]) => void;
  className?: string;
  placeholder?: string;
}

interface TreeNode {
  children: Record<string, TreeNode>;
  isLeaf?: boolean;
}

// Memoized tree builder for performance
const buildTree = (paths: string[]): TreeNode => {
  const root: TreeNode = { children: {} };

  for (const path of paths) {
    const parts = path.split(".");
    let cursor = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!cursor.children[part]) {
        cursor.children[part] = {
          children: {},
          isLeaf: i === parts.length - 1,
        };
      }
      cursor = cursor.children[part];
    }
  }

  return root;
};

export default function FieldSelector({
  allFields,
  selectedFields,
  onChange,
  className = "",
  placeholder = "Select fields...",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [openPath, setOpenPath] = useState<string[]>([]);
  const [searches, setSearches] = useState<string[]>([""]);
  const [animatingPanels, setAnimatingPanels] = useState<Set<number>>(
    new Set()
  );
  const [modalDimensions, setModalDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [mounted, setMounted] = useState(false);

  // Ensure component is mounted before rendering portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Memoize tree construction for performance
  const tree = useMemo(() => buildTree(allFields), [allFields]);

  // Calculate modal dimensions based on viewport
  const calculateModalDimensions = useCallback(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 32; // 16px padding on each side

    // Calculate width based on screen size
    let width = Math.min(viewportWidth - padding, 1200); // Max width of 1200px
    if (viewportWidth < 640) {
      width = viewportWidth - 16; // Smaller padding on mobile
    } else if (viewportWidth < 1024) {
      width = viewportWidth - padding;
    }

    // Calculate height (leave space for header and some padding)
    const height = Math.min(viewportHeight - 100, 800); // Max height of 800px, min 100px from top

    setModalDimensions({ width, height });
  }, []);

  // Handle window resize
  useEffect(() => {
    if (isOpen) {
      calculateModalDimensions();
      const handleResize = () => calculateModalDimensions();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [isOpen, calculateModalDimensions]);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setOpenPath([]);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
        setOpenPath([]);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscapeKey);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscapeKey);
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Reset state when fields change
  useEffect(() => {
    setOpenPath([]);
    setSearches([""]);
  }, [allFields]);

  const toggleField = useCallback(
    (path: string) => {
      onChange(
        selectedFields.includes(path)
          ? selectedFields.filter((f) => f !== path)
          : [...selectedFields, path]
      );
    },
    [selectedFields, onChange]
  );

  const selectAll = useCallback(
    () => onChange([...allFields]),
    [allFields, onChange]
  );
  const clearAll = useCallback(() => onChange([]), [onChange]);

  const getNode = useCallback(
    (path: string[]): TreeNode => {
      let node = tree;
      for (const key of path) {
        node = node.children[key];
      }
      return node;
    },
    [tree]
  );

  const drillInto = useCallback((newPath: string[], panelIndex: number) => {
    setAnimatingPanels((prev) => new Set([...prev, panelIndex + 1]));
    setOpenPath(newPath);
    setSearches((prev) =>
      prev.length > panelIndex + 1 ? prev : [...prev, ""]
    );

    // Remove animation class after transition
    setTimeout(() => {
      setAnimatingPanels((prev) => {
        const next = new Set(prev);
        next.delete(panelIndex + 1);
        return next;
      });
    }, 300);
  }, []);

  const updateSearch = useCallback((depth: number, value: string) => {
    setSearches((prev) => {
      const next = [...prev];
      next[depth] = value;
      return next;
    });
  }, []);

  const clearSearch = useCallback(
    (depth: number) => {
      updateSearch(depth, "");
    },
    [updateSearch]
  );

  const goBack = useCallback(() => {
    if (openPath.length > 0) {
      setOpenPath((prev) => prev.slice(0, -1));
      setSearches((prev) => prev.slice(0, -1));
    }
  }, [openPath.length]);

  // Generate panels with smooth transitions
  const panels = useMemo(() => {
    const levels = [[], ...openPath.map((_, i) => openPath.slice(0, i + 1))];

    return levels.map((path, depth) => {
      const node = getNode(path);
      let keys = Object.keys(node.children);

      // Sort: parents first, then leaves, alphabetically within each group
      keys.sort((a, b) => {
        const aHasChildren = Object.keys(node.children[a].children).length > 0;
        const bHasChildren = Object.keys(node.children[b].children).length > 0;
        if (aHasChildren !== bHasChildren) return aHasChildren ? -1 : 1;
        return a.localeCompare(b);
      });

      // Filter by search term
      const searchTerm = (searches[depth] || "").toLowerCase();
      if (searchTerm) {
        keys = keys.filter((key) => key.toLowerCase().includes(searchTerm));
      }

      return (
        <div
          key={depth}
          className={`
            field-panel flex-shrink-0 w-full sm:w-80 border-r border-gray-200 bg-white last:border-r-0
            transform transition-all duration-300 ease-out
            ${
              animatingPanels.has(depth)
                ? "translate-x-2 opacity-0"
                : "translate-x-0 opacity-100"
            }
          `}
        >
          {/* Panel header with breadcrumb */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {depth > 0 && (
                  <button
                    onClick={goBack}
                    className="p-1 hover:bg-gray-200 rounded-full transition-colors"
                    title="Go back"
                  >
                    <svg
                      className="h-4 w-4 text-gray-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                )}
                <h3 className="text-sm font-semibold text-gray-800">
                  {path.length === 0 ? "Root Fields" : path[path.length - 1]}
                </h3>
              </div>
              <span className="text-xs text-gray-500">Level {depth + 1}</span>
            </div>

            {/* Breadcrumb */}
            {path.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                <span>Root</span>
                {path.map((segment, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    <span className="font-medium">{segment}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Search input */}
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                placeholder={`Filter ${
                  path.length === 0 ? "fields" : path[path.length - 1]
                }...`}
                value={searches[depth] || ""}
                onChange={(e) => updateSearch(depth, e.target.value)}
                className="w-full pl-10 pr-8 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
              />
              {searches[depth] && (
                <button
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-red-100 rounded-full transition-colors"
                  onClick={() => clearSearch(depth)}
                >
                  <svg
                    className="h-3 w-3 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Items list with virtual scrolling */}
          <div
            className="flex-1 overflow-auto"
            style={{ maxHeight: "calc(100% - 140px)" }}
          >
            {keys.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                <svg
                  className="h-12 w-12 mx-auto mb-3 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.291-1.007-5.691-2.709M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                No fields found
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {keys.map((key) => {
                  const childNode = node.children[key];
                  const fullPath = [...path, key].join(".");
                  const hasChildren =
                    Object.keys(childNode.children).length > 0;

                  if (hasChildren) {
                    return (
                      <button
                        key={key}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-50 transition-colors duration-200 group"
                        onClick={() => drillInto([...path, key], depth)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1 bg-blue-100 rounded group-hover:bg-blue-200 transition-colors">
                            <svg
                              className="h-4 w-4 text-blue-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 1v6"
                              />
                            </svg>
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              {key}
                            </span>
                            <div className="text-xs text-gray-500">
                              {Object.keys(childNode.children).length} item
                              {Object.keys(childNode.children).length !== 1
                                ? "s"
                                : ""}
                            </div>
                          </div>
                        </div>
                        <svg
                          className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                    );
                  } else {
                    const isSelected = selectedFields.includes(fullPath);
                    return (
                      <label
                        key={key}
                        className={`
                          flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors duration-200
                          ${
                            isSelected
                              ? "bg-blue-50 border-l-4 border-blue-500"
                              : ""
                          }
                        `}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleField(fullPath)}
                          className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors"
                        />
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-1 bg-green-100 rounded">
                            <svg
                              className="h-4 w-4 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.291-1.007-5.691-2.709M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                              />
                            </svg>
                          </div>
                          <span className="text-sm text-gray-900">{key}</span>
                        </div>
                      </label>
                    );
                  }
                })}
              </div>
            )}
          </div>
        </div>
      );
    });
  }, [
    openPath,
    searches,
    tree,
    selectedFields,
    animatingPanels,
    getNode,
    drillInto,
    updateSearch,
    clearSearch,
    toggleField,
    goBack,
  ]);

  const selectionState = useMemo(() => {
    if (selectedFields.length === 0) return "none";
    if (selectedFields.length === allFields.length) return "all";
    return "partial";
  }, [selectedFields.length, allFields.length]);

  const openModal = () => {
    setIsOpen(true);
    setOpenPath([]);
    calculateModalDimensions();
  };

  const closeModal = () => {
    setIsOpen(false);
    setOpenPath([]);
  };

  // Modal content component
  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-8 px-4 sm:px-6 lg:px-8">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity duration-300"
        style={{ animation: "fadeIn 0.3s ease-out forwards" }}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white rounded-lg shadow-2xl w-full max-w-7xl"
        style={{
          width: modalDimensions.width,
          height: modalDimensions.height,
          animation: "slideDown 0.3s ease-out forwards",
          zIndex: 10000,
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gray-50 rounded-t-lg">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Select Fields
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                {selectedFields.length} selected
              </span>
              <span>of {allFields.length} total</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Select All Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectionState === "all"}
                ref={(el) => {
                  if (el) el.indeterminate = selectionState === "partial";
                }}
                onChange={(e) => (e.target.checked ? selectAll() : clearAll())}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-colors"
              />
              <span className="text-sm font-medium text-gray-700">
                Select All
              </span>
            </label>

            {/* Close Button */}
            <button
              onClick={closeModal}
              className="p-2 hover:bg-gray-200 rounded-full transition-colors"
              title="Close"
            >
              <svg
                className="h-5 w-5 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div
          className="flex h-full overflow-hidden"
          style={{ height: "calc(100% - 80px)" }}
        >
          <div className="flex w-full overflow-x-auto">{panels}</div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );

  return (
    <>
      {/* Trigger Button */}
      <div className={`relative ${className}`} ref={containerRef}>
        <button
          className={`
            w-full flex items-center justify-between px-4 py-3 text-left border border-gray-300 rounded-lg bg-white
            hover:border-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            transition-all duration-200 ease-out shadow-sm hover:shadow-md
          `}
          onClick={openModal}
        >
          <span className="text-sm">
            {selectedFields.length > 0
              ? `${selectedFields.length} field${
                  selectedFields.length === 1 ? "" : "s"
                } selected`
              : placeholder}
          </span>
          <div className="flex items-center gap-2">
            {selectionState === "all" && (
              <svg
                className="h-4 w-4 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {selectionState === "partial" && (
              <svg
                className="h-4 w-4 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 12H4"
                />
              </svg>
            )}
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </button>
      </div>

      {/* Portal Modal - Rendered to document.body */}
      {isOpen && mounted && createPortal(modalContent, document.body)}
    </>
  );
}
