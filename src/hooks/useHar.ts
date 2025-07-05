// src/hooks/useHar.ts
import { useState, useEffect } from "react";
import { hasHttpPageMessages, hasWsErrorDetails } from "../utils/errorHandler";
import { v4 as uuidv4 } from "uuid";

export interface HttpRow {
  method: string;
  requestPayload: any;
  responsePayload: any;
  status: number | null;
  time: string;
  id: string;
  timestamp?: number;
  startTime: number; // ✅ clear name
  endTime?: number;
}
export interface WsRow {
  endpoint: string;
  action: string;
  payload: any;
  status: number | null;
  time: string; // formatted HH:MM:SS display
  timestamp: number; // raw ms epoch, for sorting
}

export function useHar() {
  const [httpRows, setHttpRows] = useState<HttpRow[]>([]);
  const [wsRows, setWsRows] = useState<WsRow[]>([]);
  const [wsBaseUrl, setWsBaseUrl] = useState<string>("");

  const formatTime = (date: Date) => {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  function getLastSegment(url) {
    const parts = url.split("/");
    return parts.filter(Boolean).pop();
  }

  function parseAndPopulateTables(entries: any[]) {
    // 1) Build an initial array of HttpRow, possibly with null responsePayload
    const initialRows: HttpRow[] = entries
      .filter(
        (ent) =>
          ent.request.url.includes("apexremote") ||
          ent.request.url.includes("congacloud")
      )
      .map((ent) => {
        let method = "",
          req: any = null,
          res: any = null;
        if (ent.request.postData) {
          try {
            req = JSON.parse(ent.request.postData.text);
            method = req.method;
          } catch {}
        }
        if (ent.response?.content?.text) {
          try {
            res = JSON.parse(ent.response.content.text);
          } catch {}
        }
        if (ent.request.url.includes("conga")) {
          method =
            ent.request.method + " --> " + getLastSegment(ent.request.url);
        }

        const timeObj = new Date(ent.startedDateTime);
        const startTime = timeObj.getTime();

        // Estimate end time from HAR timing object
        const totalTimeMs = typeof ent.time === "number" ? ent.time : 0; // fallback
        const endTime = startTime + totalTimeMs;

        const content = ent.response?.content?.text || "";
        const hasMessages = hasHttpPageMessages(content);

        return {
          method,
          requestPayload: req,
          responsePayload: res,
          status:
            typeof ent.response?.status === "number"
              ? ent.response.status
              : null,
          time: formatTime(timeObj),
          hasMessages,
          id: uuidv4(),
          startTime,
          endTime,
          timestamp: startTime, // ✅ new addition
        };
      });

    // write that to state right away
    setHttpRows(initialRows);

    // 2) For any entry that didn’t have inline content, call entry.getContent and patch it in
    entries
      .filter(
        (ent) =>
          ent.request.url.includes("apexremote") && !ent.response?.content?.text
      )
      .forEach((ent, idx) => {
        ent.getContent((text: string) => {
          let parsed: any = null;
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch (err) {
              console.warn("Could not parse live response content:", err, text);
            }
          }
          // locate the matching row by time+method (or some other unique key)
          const rowTime = ent.startedDateTime
            ? formatTime(new Date(ent.startedDateTime))
            : "–";
          const rowMethod = (() => {
            try {
              return JSON.parse(ent.request.postData?.text || "{}").method;
            } catch {
              return "";
            }
          })();

          setHttpRows((prev) =>
            prev.map((r) =>
              r.time === rowTime && r.method === rowMethod
                ? { ...r, responsePayload: parsed }
                : r
            )
          );
        });
      });

    // …and your WS‐logic stays the same…
    const ws: WsRow[] = [];
    let base = "";
    entries.forEach((ent) => {
      if (!base && /^wss?:\/\//.test(ent.request.url)) {
        base = ent.request.url.split("?")[0];
        setWsBaseUrl(base);
      }
      if (!/^wss?:\/\//.test(ent.request.url)) return;
      const frames = ent.messages || ent._webSocketMessages || [];
      const status =
        typeof ent.response?.status === "number" ? ent.response.status : null;
      frames.forEach((frame) => {
        try {
          const obj = JSON.parse(frame.data);
          if ((obj.Action || "").toLowerCase() === "heartbeat") return;
          const endpoint = obj.EndPoint
            ? obj.EndPoint
            : obj.TaskId
            ? `TaskId: ${obj.TaskId}`
            : base;
          const action = obj.Action || "";
          const time =
            typeof frame.time === "number"
              ? formatTime(new Date(frame.time * 1000))
              : "–";
          const timeMs =
            typeof frame.time === "number" ? frame.time * 1000 : Date.now();
          const timeStr = formatTime(new Date(timeMs));
          const hasErrors = hasWsErrorDetails(frame.data);
          ws.push({
            endpoint,
            action,
            payload: obj,
            status,
            time: timeStr, // display version
            timestamp: timeMs, // raw epoch for sorting
          });
        } catch {}
      });
    });
    setWsRows(ws);
  }

  useEffect(() => {
    // 1) manual upload or DevTools.getHAR
    const onInjected = (e: CustomEvent) => {
      const entries = e.detail.log?.entries || e.detail.entries || [];
      parseAndPopulateTables(entries);
    };
    window.addEventListener("InjectedHAR", onInjected as any);

    // 2) live DevTools → window.postMessage
    const onMessage = (event: MessageEvent) => {
      if (event.data?.source !== "HAR_EXTRACTOR") return;
      if (event.data.type === "CLEAR") {
        setHttpRows([]);
        setWsRows([]);
        return;
      }
      const { type, payload } = event.data;
      if (type === "APEXREMOTE") {
        const start = new Date(payload.timestamp);
        const startTime = start.getTime();
        const endTime = Date.now();

        setHttpRows((prev) => [
          ...prev,
          {
            method: payload.method,
            requestPayload: payload.requestPayload,
            responsePayload: payload.responsePayload,
            status: payload.status,
            time: formatTime(start),
            startTime,
            endTime,
            id: uuidv4(),
          },
        ]);
      }
      if (type === "WS") {
        setWsRows((prev) => [
          ...prev,
          {
            endpoint: payload.endpoint,
            action: payload.action,
            payload: payload.payload,
            status: payload.status,
            time: payload.time, // pre-formatted by devtools.ts
            timestamp: payload.timestamp, // raw ms epoch
          },
        ]);
      }
    };
    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("InjectedHAR", onInjected as any);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return {
    httpRows,
    wsRows,
    wsBaseUrl,
    parseAndPopulateTables,
  };
}
