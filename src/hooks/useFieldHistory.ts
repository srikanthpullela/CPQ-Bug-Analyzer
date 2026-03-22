import { HttpRow, WsRow } from "./useHar";

export interface FieldChange {
  id: string;
  objName: string;
  oldVal: any;
  newVal: any;
  objData: any;
  prevObjData?: any;
  productName?: string;
}

export interface HistoryEvent {
  source: string;
  time: string; // For display
  timestamp: number; // Raw ms for sorting
  items: FieldChange[];
}

export function useFieldHistory(httpRows: HttpRow[], wsRows: WsRow[]) {
  function buildHistory(fieldName: string): HistoryEvent[] {
    if (!fieldName) return [];

    type Match = {
      id: string;
      newVal: any;
      objName: string;
      objData: any;
    };

    const events: Array<{
      source: string;
      time: string;
      timestamp: number;
      items: Match[];
    }> = [];

    // Save all objects with Id for fallback
    const idToObject: Record<string, any> = {};

    function scan(obj: any, key: string, lastKey: string): Match[] {
      if (!obj || typeof obj !== "object") return [];

      let found: Match[] = [];

      const objHasId = typeof obj.Id === "string";
      if (objHasId) {
        idToObject[obj.Id] = obj; // Save all Id objects
      }

      const thisFieldVal = obj[fieldName];
      const fieldExists = thisFieldVal !== undefined;

      if (objHasId && fieldExists) {
        found.push({
          id: obj.Id,
          newVal: thisFieldVal,
          objName: lastKey,
          objData: obj,
        });
      }

      for (const [childKey, val] of Object.entries(obj)) {
        if (typeof val === "object") {
          const nextName = childKey === "v" ? lastKey : childKey;
          found.push(...scan(val, childKey, nextName));
        }
      }

      return found;
    }

    const processRows = (
      rows: any[],
      labelFn: (r: any) => string,
      tsFn: (r: any) => number
    ) => {
      for (const r of rows) {
        const payloads: Array<[string, string]> = [
          ["requestPayload", "Request"],
          ["responsePayload", "Response"],
          ["payload", "Request"],
        ];

        for (const [p, kind] of payloads) {
          if (r[p]) {
            const matches = scan(r[p], p, p);
            if (matches.length) {
              events.push({
                source: `${labelFn(r)} ${kind}`,
                time: r.time,
                timestamp: tsFn(r),
                items: matches,
              });
            }
          }
        }
      }
    };

    processRows(
      httpRows,
      (r) => `HTTP ▶ ${r.method}`,
      (r) => r.startTime
    );
    processRows(
      wsRows,
      (w) => `WS ▶ ${w.payload?.Action || w.endpoint}`,
      (w) => w.timestamp
    );

    const merged: Record<string, HistoryEvent> = {};
    const order: string[] = [];
    const lastValById: Record<string, any> = {};
    const lastFullObjById: Record<string, any> = {};

    // Sort events by timestamp first
    events.sort((a, b) => a.timestamp - b.timestamp);

    for (const e of events) {
      const key = `${e.source}||${e.timestamp}`;
      if (!merged[key]) {
        merged[key] = {
          source: e.source,
          time: e.time,
          timestamp: e.timestamp,
          items: [],
        };
        order.push(key);
      }

      for (const it of e.items) {
        if (
          !merged[key].items.some(
            (x) => x.id === it.id && x.objName === it.objName
          )
        ) {
          const oldVal = lastValById[it.id];
          const prevObj = lastFullObjById[it.id] || idToObject[it.id];

          // Extract product/record Name if available
          const productName =
            it.objData?.Name ??
            it.objData?.ProductName ??
            it.objData?.Apttus_Config2__ProductId__r?.Name ??
            it.objData?.APTS_Product_Name__c ??
            it.objData?.Product_Name__c ??
            undefined;

          merged[key].items.push({
            id: it.id,
            objName: it.objName,
            oldVal,
            newVal: it.newVal,
            objData: it.objData,
            prevObjData: oldVal !== undefined ? prevObj : undefined,
            productName,
          });

          lastValById[it.id] = it.newVal;
          lastFullObjById[it.id] = it.objData;
        }
      }
    }

    return order
      .sort((a, b) => {
        const tA = Number(a.split("||")[1]);
        const tB = Number(b.split("||")[1]);
        return tA - tB;
      })
      .map((k) => merged[k]);
  }

  return { buildHistory };
}
