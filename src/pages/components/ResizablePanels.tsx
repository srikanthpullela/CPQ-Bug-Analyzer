import React, { useState, useCallback, useEffect } from "react";

interface ResizablePanelsProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  defaultLeftWidth?: number; // percentage (0-100)
  minLeftWidth?: number; // percentage
  maxLeftWidth?: number; // percentage
  isDarkMode?: boolean;
}

export const ResizablePanels: React.FC<ResizablePanelsProps> = ({
  leftPanel,
  rightPanel,
  defaultLeftWidth = 60,
  minLeftWidth = 20,
  maxLeftWidth = 80,
  isDarkMode = false,
}) => {
  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("har-analyzer-panel-width");
      return saved ? Math.min(Math.max(parseInt(saved), minLeftWidth), maxLeftWidth) : defaultLeftWidth;
    }
    return defaultLeftWidth;
  });
  const [isDragging, setIsDragging] = useState(false);

  // Save to localStorage when width changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("har-analyzer-panel-width", leftWidth.toString());
    }
  }, [leftWidth]);

  // Keyboard shortcuts for quick resizing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + [ = expand left panel
      // Ctrl/Cmd + ] = expand right panel
      // Ctrl/Cmd + \ = reset to default
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (e.key === '[') {
          e.preventDefault();
          setLeftWidth(Math.min(leftWidth + 10, maxLeftWidth));
        } else if (e.key === ']') {
          e.preventDefault();
          setLeftWidth(Math.max(leftWidth - 10, minLeftWidth));
        } else if (e.key === '\\') {
          e.preventDefault();
          setLeftWidth(defaultLeftWidth);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [leftWidth, minLeftWidth, maxLeftWidth, defaultLeftWidth]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const containerRect = document.getElementById('resizable-container')?.getBoundingClientRect();
      if (!containerRect) return;

      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      
      // Clamp the width between min and max
      const clampedWidth = Math.min(Math.max(newLeftWidth, minLeftWidth), maxLeftWidth);
      setLeftWidth(clampedWidth);
    },
    [isDragging, minLeftWidth, maxLeftWidth]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
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
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const rightWidth = 100 - leftWidth;

  return (
    <div id="resizable-container" className="flex h-full w-full relative">
      {/* Left Panel */}
      <div
        style={{ width: `${leftWidth}%` }}
        className={`overflow-auto transition-colors duration-200 ${
          isDarkMode ? "border-gray-700" : "border-gray-200"
        }`}
      >
        {leftPanel}
      </div>

      {/* Resizer */}
      <div
        className={`relative flex-shrink-0 w-1 cursor-col-resize group transition-all duration-200 ${
          isDarkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-300 hover:bg-gray-400"
        } ${isDragging ? (isDarkMode ? "bg-blue-600" : "bg-blue-500") : ""}`}
        onMouseDown={handleMouseDown}
        title="Drag to resize panels"
      >
        {/* Hover indicator - vertical dots */}
        <div
          className={`absolute inset-y-0 -left-1 -right-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${
            isDragging ? "opacity-100" : ""
          }`}
        >
          <div className="flex flex-col space-y-1">
            <div
              className={`w-1 h-1 rounded-full ${
                isDarkMode ? "bg-gray-400" : "bg-gray-500"
              }`}
            />
            <div
              className={`w-1 h-1 rounded-full ${
                isDarkMode ? "bg-gray-400" : "bg-gray-500"
              }`}
            />
            <div
              className={`w-1 h-1 rounded-full ${
                isDarkMode ? "bg-gray-400" : "bg-gray-500"
              }`}
            />
          </div>
        </div>
        
        {/* Dragging indicator */}
        {isDragging && (
          <div
            className={`absolute inset-y-0 -left-2 -right-2 ${
              isDarkMode ? "bg-blue-600/30" : "bg-blue-500/30"
            } animate-pulse border-l-2 border-r-2 ${
              isDarkMode ? "border-blue-400" : "border-blue-600"
            }`}
          />
        )}
      </div>

      {/* Right Panel */}
      <div
        style={{ width: `${rightWidth}%` }}
        className={`overflow-auto transition-colors duration-200 ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        {rightPanel}
      </div>
    </div>
  );
};
