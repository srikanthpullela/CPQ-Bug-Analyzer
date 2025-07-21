// File: src/pages/TurboResponse.tsx
import React, { useRef, useState, useEffect } from "react";
import FieldSelector from "../FieldSelector";
import {
  extractTurboArrayItems,
  collectAllKeysFromLineItems,
} from "../utils/extract";
import LineItemTable from "../LineItemTable";
import { parseObjectStrings } from "../utils/jsonUtils";

interface TurboResponseProps {
  filterText: string;
  selectedFields?: string[];
  onFieldChange?: (fields: string[]) => void;
}

const TurboResponse: React.FC<TurboResponseProps> = ({
  filterText,
  selectedFields: propSel,
  onFieldChange,
}) => {
  const [jsonText, setJsonText] = useState("{}");
  const [hasCompleted, setHasCompleted] = useState(false);
  const [completedPLNs, setCompletedPLNs] = useState<number[]>([]);
  const [cartResponseData, setCartResponseData] = useState<Record<string, any>>(
    {}
  );
  const [arrayKeys, setArrayKeys] = useState<string[]>([]);
  const [selectedArray, setSelectedArray] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [allFields, setAllFields] = useState<string[]>([]);
  const [localSel, setLocalSel] = useState<string[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [errorDetails, setErrorDetails] = useState<Record<string, any>>({});
  const [missingPayload, setMissingPayload] = useState(false);

  const sel = propSel ?? localSel;
  const handleSel = (f: string[]) =>
    onFieldChange ? onFieldChange(f) : setLocalSel(f);

  // discover all __r arrays under CartResponse
  const discoverArrays = (parsed: any) => {
    const cart = parsed.PayLoad?.CartResponse;
    if (!cart || typeof cart !== "object") return [];
    return Object.keys(cart).filter(
      (k) => k.endsWith("__r") && Array.isArray(cart[k])
    );
  };

  const handleProcess = () => {
    setMissingPayload(false);
    let parsed: any;
    try {
      const raw = JSON.parse(jsonText);
      parsed = parseObjectStrings(raw);
    } catch {
      alert("Invalid JSON for Turbo Response");
      return;
    }

    const plns = Array.isArray(parsed.CompletedPLNs)
      ? parsed.CompletedPLNs
      : [];
    setCompletedPLNs(plns);
    setHasCompleted(plns.length > 0);

    if (
      !parsed.PayLoad ||
      typeof parsed.PayLoad.CartResponse !== "object" ||
      parsed.PayLoad.CartResponse === null ||
      Object.keys(parsed.PayLoad.CartResponse).length === 0
    ) {
      setMissingPayload(true);
      return;
    }

    if (parsed.PayLoad.CartResponse) {
      setCartResponseData(parsed.PayLoad.CartResponse);

      const keys = discoverArrays(parsed);
      if (parsed.PayLoad) {
        const pay = parsed.PayLoad;
        setErrorDetails(pay.ErrorDetails || {});
      }

      setArrayKeys(keys);

      // 💡 new: force clear and reset selectedArray so effect triggers
      setSelectedArray(""); // clear it first
      setTimeout(() => {
        setSelectedArray(keys[0] || ""); // then assign actual key
      }, 0); // let React flush first

      setItems([]);
      setAllFields([]);
      setLocalSel([]);
      return;
    }

    const keys = discoverArrays(parsed);
    setArrayKeys(keys);
    setSelectedArray(""); // same logic
    setTimeout(() => {
      setSelectedArray(keys[0] || "");
    }, 0);
  };

  useEffect(() => {
    if (!selectedArray || !cartResponseData) return;

    try {
      const parsed = parseObjectStrings(JSON.parse(jsonText));
      const rootKeys = ["Id", "Name"];
      const flat = extractTurboArrayItems(parsed, selectedArray, rootKeys);
      setItems(flat);
      setAllFields(collectAllKeysFromLineItems(flat));
      handleSel([]);
    } catch (e) {
      console.warn("🧨 Failed in effect parse:", e);
    }
  }, [selectedArray, cartResponseData]); // ✅ instead of jsonText

  // find any empty __r arrays under CartResponse
  const emptyArrays = Object.entries(cartResponseData)
    .filter(([k, v]) => k.endsWith("__r") && Array.isArray(v) && v.length === 0)
    .map(([k]) => k);

  return (
    <div className="main p-4 space-y-4">
      <div className="flex items-start gap-4">
        <h2 className="text-l font-bold pt-2 whitespace-nowrap">
          Turbo Response
        </h2>
        <textarea
          ref={textRef}
          className="w-full h-10 border p-2 font-mono flex-1"
          placeholder="Paste Turbo Response JSON here…"
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          onFocus={() => textRef.current?.select()}
        />
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={handleProcess}
        >
          Parse &amp; Load
        </button>
      </div>

      {/* If we detected CompletedPLNs, show CartResponse summary + comma list */}
      {hasCompleted && (
        <div className="space-y-4">
          {/* CompletedPLNs comma-separated, highlighted */}
          <div className="p-2 bg-yellow-100 rounded">
            <strong>Completed PLNs:</strong> {completedPLNs.join(", ")}
          </div>
          {/* Meaningful messages for any empty __r arrays */}
          {emptyArrays.map((arrKey) => (
            <div key={arrKey} className="text-gray-600 italic">
              No <strong>{arrKey}</strong> available.
            </div>
          ))}
          {/* CartResponse full table */}
          <div>
            <h3 className="text-xl font-semibold">CartResponse Summary</h3>
            <div className="overflow-x-auto border rounded shadow">
              <table className="min-w-full text-sm border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    {Object.keys(cartResponseData).map((k) => (
                      <th
                        key={k}
                        className="border px-3 py-2 text-left whitespace-nowrap"
                      >
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {Object.values(cartResponseData).map((v, i) => (
                      <td key={i} className="border px-3 py-2">
                        {typeof v === "string" ||
                        typeof v === "number" ||
                        typeof v === "boolean" ||
                        v === null
                          ? String(v)
                          : JSON.stringify(v)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {Object.keys(errorDetails).length > 0 && (
        <div className="p-3 bg-red-100 border border-red-400 rounded space-y-2">
          <h3 className="text-lg font-bold text-red-800">Error Details</h3>
          {Object.entries(errorDetails).map(([key, val]: [string, any]) => (
            <div key={key} className="text-sm text-red-700">
              <div>
                <strong>Cart ID:</strong> {key}
              </div>
              <div>
                <strong>Message:</strong> {val.FormattedMessage}
              </div>
            </div>
          ))}
        </div>
      )}

      {missingPayload && (
        <div className="p-3 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded">
          ⚠️ No <strong>PayLoad</strong> or <strong>CartResponse</strong> found
          in the provided JSON.
        </div>
      )}

      {/* Otherwise, show the normal dataset selector + field-table flow */}
      {!hasCompleted && arrayKeys.length > 0 && (
        <div className="array-selector my-2">
          <label className="mr-2">Select dataset:</label>
          <select
            value={selectedArray}
            onChange={(e) => setSelectedArray(e.target.value)}
            className="border px-2 py-1"
          >
            {arrayKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* Show message if chosen array is empty */}
      {!hasCompleted && selectedArray && items.length === 0 && (
        <div className="text-gray-600 italic">
          No <strong>{selectedArray}</strong> available.
        </div>
      )}

      {!hasCompleted && items.length > 0 && (
        <>
          <FieldSelector
            allFields={allFields}
            selectedFields={sel}
            onChange={handleSel}
          />
          <LineItemTable
            lineItems={items}
            selectedFields={sel}
            rootKeys={["Id", "Name"]}
            filterText={filterText}
          />
        </>
      )}
    </div>
  );
};

export default TurboResponse;
