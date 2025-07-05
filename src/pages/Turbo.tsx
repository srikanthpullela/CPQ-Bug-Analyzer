// File: src/Turbo.tsx
import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./Sfdc.css"; // reuse same CSS
import TurboRequest from "./TurboRequest";
import TurboResponse from "./TurboResponse";

type Panel = "both" | "request" | "response";

const Turbo: React.FC = () => {
  const [active, setActive] = useState<Panel>("both");
  const [filterText, setFilterText] = useState<string>("");
  const [sync, setSync] = useState<boolean>(false);

  const [reqFields, setReqFields] = useState<string[]>([]);
  const [respFields, setRespFields] = useState<string[]>([]);
  const [shared, setShared] = useState<string[]>([]);

  const toggle = (which: Panel) =>
    setActive((prev) => (prev === which ? "both" : which));

  const handleReq = (f: string[]) => (sync ? setShared(f) : setReqFields(f));
  const handleResp = (f: string[]) => (sync ? setShared(f) : setRespFields(f));

  const reqSelected = sync ? shared : reqFields;
  const respSelected = sync ? shared : respFields;

  const onSync = (checked: boolean) => {
    if (checked) {
      setShared([...new Set([...reqFields, ...respFields])]);
    } else {
      setReqFields(shared);
      setRespFields(shared);
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
          Turbo Request
        </button>
        <button
          className={`sfdc-btn ${active === "response" ? "active" : ""}`}
          onClick={() => toggle("response")}
        >
          Turbo Response
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
            onChange={(e) => onSync(e.target.checked)}
          />
          Sync fields
        </label>

        <nav className="sfdc-nav">
          <Link to="/">Home</Link> | <Link to="/sfdc">SFDC</Link>
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
          <TurboRequest
            filterText={filterText}
            selectedFields={reqSelected}
            onFieldChange={handleReq}
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
          <TurboResponse
            filterText={filterText}
            selectedFields={respSelected}
            onFieldChange={handleResp}
          />
        </section>
      </div>
    </div>
  );
};

export default Turbo;
