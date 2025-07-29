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
  startTime: number;
  endTime?: number;
  hasMessages?: boolean;
  headers?: {
    request?: any[];
    response?: any[];
  };
  requestHeaders?: any[];
  responseHeaders?: any[];
  url?: string;
  httpMethod?: string;
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

  function getLastSegment(url: string): string {
    const parts = url.split("/");
    return parts.filter(Boolean).pop() || "endpoint";
  }

  function parseAndPopulateTables(entries: any[]) {
    // Accept ALL HTTP requests, filter out only obvious static assets
    const initialRows: HttpRow[] = entries
      .filter((ent) => {
        const url = ent.request.url.toLowerCase();

        // Filter out common static assets
        const staticAssets = [
          ".js",
          ".css",
          ".png",
          ".jpg",
          ".jpeg",
          ".gif",
          ".svg",
          ".ico",
          ".ttf",
          ".woff",
          ".woff2",
          ".eot",
          ".map",
          ".json",
          ".xml",
          "favicon",
          ".webp",
          ".bmp",
          ".tiff",
          ".scss",
          ".less",
          ".ts.map",
          ".min.js",
          ".min.css",
          ".chunk.js",
          ".bundle.js",
          ".vendor.js",
          ".fonts",
          ".font",
          ".otf",
          "/assets/",
          "/static/",
          "/images/",
          "/img/",
          ".html",
        ];

        const isStaticAsset = staticAssets.some((ext) => url.includes(ext));
        return !isStaticAsset;
      })
      .map((ent) => {
        let method = "";
        let req: any = null;
        let res: any = null;

        // Extract request payload - handle all request types
        if (ent.request.postData?.text) {
          try {
            req = JSON.parse(ent.request.postData.text);
          } catch {
            // Not JSON, store as raw text
            req = { _rawText: ent.request.postData.text };
          }
        } else if (ent.request.queryString?.length > 0) {
          // For GET requests with query parameters
          req = Object.fromEntries(
            ent.request.queryString.map((q) => [q.name, q.value])
          );
        } else {
          // Even if no payload, create a basic request object
          req = {
            _method: ent.request.method || "GET",
            _url: ent.request.url,
            _headers: ent.request.headers || [],
          };
        }

        // Generate meaningful method name
        const httpMethod = ent.request.method || "GET";
        const urlPath = getLastSegment(ent.request.url);

        if (req && typeof req === "object" && req.method) {
          // If request has a method property (like ApexRemote), use it
          method = req.method;
        } else if (req && typeof req === "object" && req.action) {
          // If request has an action property, use it
          method = req.action;
        } else {
          // Default to HTTP method + URL endpoint
          method = `${urlPath}`;
        }

        // Parse response content - handle all response types
        if (ent.response?.content?.text) {
          try {
            res = JSON.parse(ent.response.content.text);
          } catch {
            // Not JSON, store as raw text
            res = { _rawContent: ent.response.content.text };
          }
        } else {
          // Even if no response content, create a basic response object
          res = {
            _status: ent.response?.status || null,
            _statusText: ent.response?.statusText || "",
            _noContent: true,
          };
        }

        const timeObj = new Date(ent.startedDateTime);
        const startTime = timeObj.getTime();
        const totalTimeMs = typeof ent.time === "number" ? ent.time : 0;
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
          timestamp: startTime,
          httpMethod: httpMethod, // Ensure this is always set
          url: ent.request.url,
          endpoint: urlPath,
          // Only include headers if they actually contain data
          requestHeaders: (ent.request?.headers?.length > 0) ? ent.request.headers : [],
          responseHeaders: (ent.response?.headers?.length > 0) ? ent.response.headers : [],
          // Also provide headers in the legacy format for backward compatibility
          headers: {
            request: (ent.request?.headers?.length > 0) ? ent.request.headers : [],
            response: (ent.response?.headers?.length > 0) ? ent.response.headers : []
          }
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
