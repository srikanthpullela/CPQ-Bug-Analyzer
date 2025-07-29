"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import SfdcRequest from "./SfdcRequest";
import SfdcResponse from "./SfdcResponse";
import TurboRequest from "./TurboRequest";
import TurboResponse from "./TurboResponse";
import "./Sfdc.css"; // reuses the same styles

// Map the string key to the actual React component
const pageMap: Record<string, React.FC<any>> = {
  "SFDC Request": SfdcRequest,
  "SFDC Response": SfdcResponse,
  "Turbo Request": TurboRequest,
  "Turbo Response": TurboResponse,
};

const pageKeys = Object.keys(pageMap);

const Home: React.FC = () => {
  // picks for the left and right panels
  const [leftPage, setLeftPage] = useState<string>("SFDC Request");
  const [rightPage, setRightPage] = useState<string>("SFDC Response");

  // shared filter + sync state
  const [filterText, setFilterText] = useState<string>("");
  const [sync, setSync] = useState<boolean>(false);
  const [sharedFields, setSharedFields] = useState<string[]>([]);

  // individual selections if sync off
  const [leftFields, setLeftFields] = useState<string[]>([]);
  const [rightFields, setRightFields] = useState<string[]>([]);

  // Panel resizing state
  const [panelHeight, setPanelHeight] = useState({ top: "50%", bottom: "50%" });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [initialTopHeight, setInitialTopHeight] = useState(50);

  // Panel drag handlers (supports both mouse and touch)
  const handleMouseDown = (e: React.MouseEvent) => {
    console.log("Mouse down detected!"); // Debug log
    e.preventDefault();
    e.stopPropagation();
    startDrag(e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    console.log("Touch start detected!"); // Debug log
    e.preventDefault();
    e.stopPropagation();
    const touch = e.touches[0];
    startDrag(touch.clientY);
  };

  const startDrag = (startY: number) => {
    console.log("Starting drag at Y:", startY); // Debug log
    setIsDragging(true);
    setDragStartY(startY);
    
    // Get the container and calculate current top height ONCE
    const container = document.querySelector('.enhanced-panels') as HTMLElement;
    if (!container) {
      console.error("Container not found!");
      return;
    }
    
    const containerHeight = container.clientHeight;
    const topPanel = container.querySelector('.panel.top') as HTMLElement;
    const currentTopHeight = topPanel ? (topPanel.clientHeight / containerHeight) * 100 : 50;
    setInitialTopHeight(currentTopHeight);

    console.log("Container height:", containerHeight, "Current top height:", currentTopHeight);

    // Use requestAnimationFrame for smooth updates
    let animationId: number;

    // Create event handlers with closure over current values
    const handleMove = (clientY: number) => {
      // Cancel previous animation frame for smoother updates
      if (animationId) {
        cancelAnimationFrame(animationId);
      }

      animationId = requestAnimationFrame(() => {
        const deltaY = clientY - startY;
        const deltaPercent = (deltaY / containerHeight) * 100;
        let newTopHeight = currentTopHeight + deltaPercent;
        newTopHeight = Math.max(15, Math.min(85, newTopHeight));
        const newBottomHeight = 100 - newTopHeight;
        
        setPanelHeight({
          top: `${newTopHeight}%`,
          bottom: `${newBottomHeight}%`,
        });
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleMove(e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleMove(touch.clientY);
    };

    const cleanup = () => {
      console.log("Cleaning up drag"); // Debug log
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", cleanup);
    };

    // Add event listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", cleanup);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", cleanup);
  };

  const onSyncChange = (checked: boolean) => {
    if (checked) {
      // merge existing
      setSharedFields([...new Set([...leftFields, ...rightFields])]);
    } else {
      // push shared back to individuals
      setLeftFields(sharedFields);
      setRightFields(sharedFields);
    }
    setSync(checked);
  };

  // Handlers passed into child pages
  const handleLeftChange = (fields: string[]) => {
    sync ? setSharedFields(fields) : setLeftFields(fields);
  };
  const handleRightChange = (fields: string[]) => {
    sync ? setSharedFields(fields) : setRightFields(fields);
  };

  // Derived selections
  const leftSelected = sync ? sharedFields : leftFields;
  const rightSelected = sync ? sharedFields : rightFields;

  // Look up the component for each side
  const LeftComp = pageMap[leftPage];
  const RightComp = pageMap[rightPage];

  useEffect(() => {
    // Cleanup function in case component unmounts during drag
    return () => {
      setIsDragging(false);
    };
  }, []);

  return (
    <div className="sfdc-root">
      <header className="sfdc-header enhanced-header">
        <div className="header-row">
          <div className="header-section page-selectors">
            <select
              value={leftPage}
              onChange={(e) => setLeftPage(e.target.value)}
              className="sfdc-btn enhanced-select"
            >
              {pageKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <span className="vs-separator">vs</span>
            <select
              value={rightPage}
              onChange={(e) => setRightPage(e.target.value)}
              className="sfdc-btn enhanced-select"
            >
              {pageKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div className="header-section tool-buttons">
            <Link to="/formatter" className="btn enhanced-btn">
              <span className="btn-icon">{"{ }"}</span>
              <span className="btn-text">Prettify</span>
            </Link>

            <Link to="/compare" className="btn enhanced-btn">
              <span className="btn-icon">{"⚖"}</span>
              <span className="btn-text">Compare</span>
            </Link>

            <Link to="/pieces" className="btn enhanced-btn">
              <span className="btn-icon">{"📝"}</span>
              <span className="btn-text">Pieces</span>
            </Link>

            <Link to="/har" className="btn enhanced-btn">
              <span className="btn-icon">{"📊"}</span>
              <span className="btn-text">HAR</span>
            </Link>

            <Link to="/log" className="btn enhanced-btn">
              <span className="btn-icon">{"📋"}</span>
              <span className="btn-text">Log</span>
            </Link>
          </div>

          <div className="header-section controls">
            <div className="filter-container">
              <input
                type="text"
                placeholder="Filter..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="sfdc-filter enhanced-filter"
              />
              <span className="filter-icon">🔍</span>
            </div>

            <label className="sync-label enhanced-sync">
              <input
                type="checkbox"
                checked={sync}
                onChange={(e) => onSyncChange(e.target.checked)}
                className="sync-checkbox"
              />
              <span className="sync-slider"></span>
              <span className="sync-text">Sync</span>
            </label>
          </div>

          <nav className="sfdc-nav enhanced-nav">
            <Link to="/" className="nav-link">
              Home
            </Link>
            <span className="nav-separator">|</span>
            <Link to="/sfdc" className="nav-link">
              SFDC
            </Link>
            <span className="nav-separator">|</span>
            <Link to="/turbo" className="nav-link">
              Turbo
            </Link>
          </nav>
        </div>
      </header>

      <div
        className={`sfdc-panels enhanced-panels ${
          isDragging ? "dragging" : ""
        }`}
        style={{ flexDirection: "column", height: "calc(100vh - 100px)" }}
      >
        <section
          className="panel top half enhanced-panel"
          style={{
            height: panelHeight.top,
            minHeight: "150px",
            transition: isDragging ? "none" : "height 0.2s ease-out",
          }}
        >
          <div className="panel-header">
            <h3 className="panel-title">{leftPage}</h3>
            <div className="panel-indicator top-indicator"></div>
          </div>
          <div className="panel-content scrollable-content">
            <LeftComp
              filterText={filterText}
              selectedFields={leftSelected}
              onFieldChange={handleLeftChange}
            />
          </div>
        </section>

        <div
          className="panel-divider draggable-divider"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          style={{
            cursor: isDragging ? "ns-resize" : "ns-resize",
            backgroundColor: isDragging
              ? "rgba(102, 126, 234, 0.2)"
              : "transparent",
          }}
        >
          <div className="divider-line"></div>
          <div className="divider-handle">⋮⋮⋮</div>
        </div>

        <section
          className="panel bottom half enhanced-panel"
          style={{
            height: panelHeight.bottom,
            minHeight: "150px",
            transition: isDragging ? "none" : "height 0.2s ease-out",
          }}
        >
          <div className="panel-header">
            <h3 className="panel-title">{rightPage}</h3>
            <div className="panel-indicator bottom-indicator"></div>
          </div>
          <div className="panel-content scrollable-content">
            <RightComp
              filterText={filterText}
              selectedFields={rightSelected}
              onFieldChange={handleRightChange}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default Home;
