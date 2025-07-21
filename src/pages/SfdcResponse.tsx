// File: src/pages/SfdcResponse.tsx
import React, { useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import FieldSelector from "../FieldSelector";
import {
  extractAllLineItemSOs,
  collectAllKeysFromLineItems,
  findLineItemRoot,
} from "../utils/extract";
import LineItemTable from "../LineItemTable";

interface SfdcResponseProps {
  filterText: string;
  selectedFields?: string[];
  onFieldChange?: (fields: string[]) => void;
}

const SfdcResponse: React.FC<SfdcResponseProps> = ({
  filterText,
  selectedFields: propSelectedFields,
  onFieldChange,
}) => {
  const [jsonText, setJsonText] = useState("{}");
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [allFields, setAllFields] = useState<string[]>([]);
  const [localSelectedFields, setLocalSelectedFields] = useState<string[]>([]);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // fields at root to highlight
  const rootKeys = ["lineAction", "txnPrimaryLineNumber", "IsSelected"];

  // Determine effective selections
  const selected = propSelectedFields ?? localSelectedFields;
  const handleFieldsChange = (fields: string[]) => {
    if (onFieldChange) {
      onFieldChange(fields);
    } else {
      setLocalSelectedFields(fields);
    }
  };

  const handleProcess = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const rootLike = findLineItemRoot(parsed);

      if (!rootLike) {
        alert("No lineItems found in the given input.");
        setLineItems([]);
        setAllFields([]);
        return;
      }

      const result = extractAllLineItemSOs(rootLike, rootKeys);
      if (!result.length) {
        alert("Found lineItems section, but no actual rows to display.");
      }

      const keys = collectAllKeysFromLineItems(result);
      setLineItems(result);
      setAllFields(keys);
      if (onFieldChange) onFieldChange([]);
      else setLocalSelectedFields([]);
    } catch {
      alert("Invalid JSON");
    }
  };

  const handleFocus = () => setTimeout(() => textAreaRef.current?.select(), 0);

  return (
    <div className="main p-4 space-y-4">
      <div className="flex items-start gap-4">
        <h2 className="text-l font-bold pt-2 whitespace-nowrap">
          SFDC Response
        </h2>
        <textarea
          ref={textAreaRef}
          className="h-10 border p-2 font-mono flex-1"
          placeholder="Paste your JSON here by simply copying lineItems object from the response ...."
          value={jsonText}
          onFocus={handleFocus}
          onChange={(e) => setJsonText(e.target.value)}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2"
          onClick={handleProcess}
        >
          Parse & Load
        </button>
      </div>

      {lineItems.length > 0 && (
        <>
          <FieldSelector
            allFields={allFields}
            selectedFields={selected}
            onChange={handleFieldsChange}
          />
          <LineItemTable
            lineItems={lineItems}
            selectedFields={selected}
            rootKeys={rootKeys}
            filterText={filterText}
          />
        </>
      )}
    </div>
  );
};

export default SfdcResponse;
