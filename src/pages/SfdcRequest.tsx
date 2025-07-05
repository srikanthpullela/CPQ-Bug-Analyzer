// File: src/pages/SfdcRequest.tsx
import React, { useRef, useState } from "react";
import FieldSelector from "../FieldSelector";
import {
  extractSFDCRequestLineItems,
  collectAllKeysFromLineItems,
} from "../utils/extract";
import LineItemTable from "../LineItemTable";

interface SfdcRequestProps {
  filterText: string;
  selectedFields?: string[];
  onFieldChange?: (fields: string[]) => void;
}

const SfdcRequest: React.FC<SfdcRequestProps> = ({
  filterText,
  selectedFields: propSelectedFields,
  onFieldChange,
}) => {
  const [jsonText, setJsonText] = useState("{}");
  const [lineItems, setLineItems] = useState<any[]>([]);
  const [allFields, setAllFields] = useState<string[]>([]);
  const [localSelectedFields, setLocalSelectedFields] = useState<string[]>([]);
  const [parsedOnce, setParsedOnce] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const rootKeys = ["lineAction", "txnPrimaryLineNumber"];

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
      const result = extractSFDCRequestLineItems(parsed, rootKeys);
      const keys = collectAllKeysFromLineItems(result);
      setLineItems(result);
      setAllFields(keys);
      setParsedOnce(true);
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
        <h2 className="text-xl font-bold pt-2 whitespace-nowrap">
          SFDC Request
        </h2>

        <textarea
          ref={textAreaRef}
          className="h-10 border p-2 font-mono flex-1"
          placeholder="Paste your SFDC Request JSON here…"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          onFocus={handleFocus}
        />

        <button
          className="bg-blue-600 text-white px-4 py-2 rounded shrink-0 mt-1"
          onClick={handleProcess}
        >
          Parse &amp; Load
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

      {parsedOnce && lineItems.length === 0 && (
        <div className="text-red-600 font-semibold">
          No line items found in the given input.
        </div>
      )}
    </div>
  );
};

export default SfdcRequest;
