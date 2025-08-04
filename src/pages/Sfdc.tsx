// File: src/Sfdc.tsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import SfdcRequest from "./SfdcRequest";
import SfdcResponse from "./SfdcResponse";
import "./Sfdc.css";

type Panel = "both" | "request" | "response";

const Sfdc: React.FC = () => {
  const [active, setActive] = useState<Panel>("both");
  const [filterText, setFilterText] = useState<string>("");
  const [sync, setSync] = useState<boolean>(false);

  // Individual selections
  const [requestFields, setRequestFields] = useState<string[]>([]);
  const [responseFields, setResponseFields] = useState<string[]>([]);
  // Shared when sync is on
  const [sharedFields, setSharedFields] = useState<string[]>([]);

  const toggle = (which: Panel) =>
    setActive((prev) => (prev === which ? "both" : which));

  // Called by both panels
  const handleRequestChange = (fields: string[]) => {
    if (sync) {
      setSharedFields(fields);
    } else {
      setRequestFields(fields);
    }
  };
  const handleResponseChange = (fields: string[]) => {
    if (sync) {
      setSharedFields(fields);
    } else {
      setResponseFields(fields);
    }
  };

  // Determine what to pass down
  const reqSelected = sync ? sharedFields : requestFields;
  const respSelected = sync ? sharedFields : responseFields;

  // Handle sync toggle to preserve values when turning off
  const onSyncChange = (checked: boolean) => {
    if (checked) {
      // turning on: merge existing selections
      setSharedFields(
        Array.from(new Set([...requestFields, ...responseFields]))
      );
    } else {
      // turning off: propagate shared to individual
      setRequestFields(sharedFields);
      setResponseFields(sharedFields);
    }
    setSync(checked);
  };

  return (
    <div className="sfdc-root">
      <header className="sfdc-header">
        <button
          className={`sfdc-btn ${active === "request" ? "active" : ""}`}
          onClick={() => toggle("request")}
        >
          SFDC Request
        </button>
        <button
          className={`sfdc-btn ${active === "response" ? "active" : ""}`}
          onClick={() => toggle("response")}
        >
          SFDC Response
        </button>

        <input
          type="text"
          placeholder="Global filter..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="sfdc-filter"
        />

        <label className="sync-label">
          <input
            type="checkbox"
            checked={sync}
            onChange={(e) => onSyncChange(e.target.checked)}
          />
          Sync fields
        </label>

        <nav className="py-1">
          <Link to="/" className="text-xs text-blue-600 hover:text-blue-800">Home</Link> 
          <span className="text-xs text-gray-500 mx-1">|</span> 
          <Link to="/turbo" className="text-xs text-blue-600 hover:text-blue-800">Turbo</Link>
        </nav>
      </header>

      <div className="sfdc-panels">
        <section
          className={`panel request ${
            active === "both"
              ? "half"
              : active === "request"
              ? "full"
              : "collapsed"
          }`}
        >
          <SfdcRequest
            filterText={filterText}
            selectedFields={reqSelected}
            onFieldChange={handleRequestChange}
          />
        </section>

        <section
          className={`panel response ${
            active === "both"
              ? "half"
              : active === "response"
              ? "full"
              : "collapsed"
          }`}
        >
          <SfdcResponse
            filterText={filterText}
            selectedFields={respSelected}
            onFieldChange={handleResponseChange}
          />
        </section>
      </div>
    </div>
  );
};

export default Sfdc;
