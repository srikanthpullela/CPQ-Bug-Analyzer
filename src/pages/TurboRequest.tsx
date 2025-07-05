// File: src/pages/TurboRequest.tsx
import React, { useRef, useState } from "react";
import FieldSelector from "../FieldSelector";
import {
  extractTurboRequestItems,
  collectAllKeysFromLineItems,
} from "../utils/extract";
import LineItemTable from "../LineItemTable";

interface TurboRequestProps {
  filterText: string;
  selectedFields?: string[];
  onFieldChange?: (f: string[]) => void;
}

const TurboRequest: React.FC<TurboRequestProps> = ({
  filterText,
  selectedFields: propSel,
  onFieldChange,
}) => {
  const [jsonText, setJsonText] = useState("{}");
  const [items, setItems] = useState<any[]>([]);
  const [allFields, setAllFields] = useState<string[]>([]);
  const [localSel, setLocalSel] = useState<string[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [missingPayload, setMissingPayload] = useState(false);

  const sel = propSel ?? localSel;
  const handleSel = (f: string[]) =>
    onFieldChange ? onFieldChange(f) : setLocalSel(f);

  const handleProcess = () => {
    setMissingPayload(false);
    try {
      const parsed = JSON.parse(jsonText);
      const rootKeys: string[] = [
        "ExternalId",
        "Apttus_Config2__PrimaryLineNumber__c",
      ];

      let inputArray: any[] = [];

      if (Array.isArray(parsed)) {
        inputArray = parsed;
      } else if (Array.isArray(parsed.Payload)) {
        inputArray = parsed.Payload;
      }

      if (inputArray.length > 0) {
        const flat = extractTurboRequestItems(inputArray, rootKeys);
        setItems(flat);
        setAllFields(collectAllKeysFromLineItems(flat));
        handleSel([]);
      } else {
        setItems([]);
        setAllFields([]);
        setMissingPayload(true);
      }
    } catch {
      alert("Invalid JSON");
    }
  };

  return (
    <div className="main p-4 space-y-4">
      <div className="flex items-start gap-4">
        <h2 className="text-2xl font-bold">Turbo Request</h2>
        <textarea
          ref={textRef}
          className="w-full h-10 border p-2 flex-1"
          placeholder="Paste Turbo Request JSON array here…"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          onFocus={() => textRef.current?.select()}
        />
        <button
          className="bg-indigo-600 text-white px-4 py-2 rounded"
          onClick={handleProcess}
        >
          Parse &amp; Load
        </button>
      </div>

      {missingPayload && (
        <div className="p-3 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded">
          ⚠️ No <strong>PayLoad</strong> found
          in the provided JSON.
        </div>
      )}

      {items.length > 0 && (
        <>
          <FieldSelector
            allFields={allFields}
            selectedFields={sel}
            onChange={handleSel}
          />
          <LineItemTable
            lineItems={items}
            selectedFields={sel}
            rootKeys={["ExternalId", "Apttus_Config2__PrimaryLineNumber__c"]}
            filterText={filterText}
          />
        </>
      )}
    </div>
  );
};

export default TurboRequest;
