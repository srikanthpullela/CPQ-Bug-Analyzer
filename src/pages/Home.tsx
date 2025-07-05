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

  // Panel drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartY(e.clientY);
    const containerHeight = e.currentTarget.parentElement?.clientHeight || 600;
    const topPanel = e.currentTarget.previousElementSibling as HTMLElement;
    const currentTopHeight = (topPanel.clientHeight / containerHeight) * 100;
    setInitialTopHeight(currentTopHeight);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;

    const deltaY = e.clientY - dragStartY;
    const containerHeight = 600; // approximate container height
    const deltaPercent = (deltaY / containerHeight) * 100;

    let newTopHeight = initialTopHeight + deltaPercent;
    newTopHeight = Math.max(20, Math.min(80, newTopHeight)); // Constrain between 20% and 80%

    const newBottomHeight = 100 - newTopHeight;

    setPanelHeight({
      top: `${newTopHeight}%`,
      bottom: `${newBottomHeight}%`,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
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
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="sfdc-root">
      <header className="sfdc-header enhanced-header">
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

          <Link to="/har" className="btn enhanced-btn">
            <span className="btn-icon">{"📊"}</span>
            <span className="btn-text">HAR</span>
          </Link>

          <Link to="/log" className="btn enhanced-btn">
            <span className="btn-icon">{"📋"}</span>
            <span className="btn-text">Log Analyzer</span>
          </Link>
        </div>

        <div className="header-section controls">
          <div className="filter-container">
            <input
              type="text"
              placeholder="Global filter..."
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
            <span className="sync-text">Sync fields</span>
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
      </header>

      <div
        className="sfdc-panels enhanced-panels"
        style={{ flexDirection: "column", height: "calc(100vh - 120px)" }}
      >
        <section
          className="panel top half enhanced-panel"
          style={{ height: panelHeight.top, minHeight: "200px" }}
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

        {/* <div
          className="panel-divider draggable-divider"
          onMouseDown={handleMouseDown}
          style={{ cursor: isDragging ? "ns-resize" : "ns-resize" }}
        >
          <div className="divider-line"></div>
          <div className="divider-handle">⋮⋮⋮</div>
        </div> */}

        <section
          className="panel bottom half enhanced-panel"
          style={{ height: panelHeight.bottom, minHeight: "200px" }}
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
