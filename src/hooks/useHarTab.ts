import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

function formatDuration(ms: number): string {
  if (ms < 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export interface HttpRow {
  method: string;
  requestPayload: any;
  responsePayload: any;
  status: number | null;
  time: string;
  id: string;
  startTime: number;
  endTime?: number;
  urlPattern?: string;
  patternType?: 'apex' | 'http' | 'generic';
  httpMethod?: string;
  endpoint?: string;
  displayName?: string;
  hasMessages?: boolean; // Add this for error detection
  // Add header support
  headers?: {
    request?: any[];
    response?: any[];
  };
  requestHeaders?: any[];
  responseHeaders?: any[];
  url?: string;
  // Identity of the captured call (set by devtools) so updates replace the row instead of adding one
  key?: string;
  // 'orf' = live capture when the call finished, 'har' = backfilled from the DevTools network log
  source?: 'orf' | 'har';
}

export interface WsRow {
  // Stable row identity: the selection stays on the row when earlier messages are inserted
  id: string;
  endpoint: string;
  action: string;
  payload: any;
  status: number | null;
  time: string;
  timestamp: number; // <-- Needed for proper sorting
  direction: "sent" | "received";
  duration?: string; // e.g. "20s", "1m 5s" — only on received rows
}

// chrome.debugger connection state reported by devtools.ts. When it isn't attached, WS messages
// are read from the page interceptor and the DevTools network log instead.
export interface DebuggerStatus {
  state: "attached" | "unavailable" | "detached";
  error?: string;
  hint?: string;
}

function toWsRow(p: any, id: string): WsRow {
  const tsMs = Number(p.timestamp) || Date.now();
  return {
    id,
    endpoint: p.endpoint || "(unknown)",
    action: p.action || "",
    payload: p.payload,
    status: p.status ?? null,
    time: new Date(tsMs).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Kolkata",
    }),
    timestamp: tsMs,
    direction: p.direction || "received",
    duration: p.duration,
  };
}

// Adds WS rows in time order: messages read from the DevTools network log can arrive after later
// live messages. A received message without a duration gets the time since the sent message with
// the same TaskId.
function mergeWsRows(prev: WsRow[], incoming: WsRow[]): WsRow[] {
  if (!incoming.length) return prev;
  const rows = incoming.length > 1 ? incoming.slice().sort((a, b) => a.timestamp - b.timestamp) : incoming;
  const added: number[] = [];
  let next: WsRow[];
  if (!prev.length || rows[0].timestamp >= prev[prev.length - 1].timestamp) {
    next = prev.concat(rows);
    for (let k = prev.length; k < next.length; k++) added.push(k);
  } else {
    next = [];
    let i = 0;
    let j = 0;
    while (i < prev.length || j < rows.length) {
      if (j >= rows.length || (i < prev.length && prev[i].timestamp <= rows[j].timestamp)) {
        next.push(prev[i++]);
      } else {
        added.push(next.length);
        next.push(rows[j++]);
      }
    }
  }
  for (const k of added) {
    const row = next[k];
    const taskId = row.payload?.TaskId;
    if (!taskId || row.direction !== "received" || row.duration) continue;
    for (let m = k - 1; m >= 0 && m >= k - 5000; m--) {
      const r = next[m];
      if (r.direction === "sent" && r.payload?.TaskId === taskId) {
        next[k] = { ...row, duration: formatDuration(row.timestamp - r.timestamp) };
        break;
      }
    }
  }
  return next;
}

// Adds an HTTP row, or updates the row of the same call (same key) in place, keeping its id.
// Rows stay ordered by start time.
function upsertHttpRow(prev: HttpRow[], row: HttpRow): HttpRow[] {
  if (row.key) {
    const idx = prev.findIndex((r) => r.key === row.key);
    if (idx !== -1) {
      const existing = prev[idx];
      // The live capture of a call is never replaced by its network-log backfill copy
      if (row.source === 'har' && existing.source === 'orf') return prev;
      const next = prev.slice();
      next[idx] = { ...row, id: existing.id };
      return next;
    }
  }
  let i = prev.length;
  while (i > 0 && prev[i - 1].startTime > row.startTime) i--;
  if (i === prev.length) return [...prev, row];
  const next = prev.slice();
  next.splice(i, 0, row);
  return next;
}

export function useLiveHar() {
  const [httpRows, setHttpRows] = useState<HttpRow[]>([]);
  const [wsRows, setWsRows] = useState<WsRow[]>([]);
  const [wsBaseUrl, setWsBaseUrl] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [debuggerStatus, setDebuggerStatus] = useState<DebuggerStatus | null>(null);
  let listenerAttached = false;

  const formatTime = (date: Date) => {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  useEffect(() => {
    if (listenerAttached) return;
    listenerAttached = true;
    
    console.log("[useLiveHar] Attaching message listener for HAR_RETRIGGER");
    
    const processMessage = (data: any) => {
      if (data?.source !== "HAR_EXTRACTOR") return;

      const { type, payload } = data;
      
      console.log("[useLiveHar] Received message type:", type);

      switch (type) {
        case "LOADING_START":
          console.log("[useLiveHar] Network capture started");
          setIsLoading(true);
          break;

        case "LOADING_END":
          console.log("[useLiveHar] Network capture completed");
          setIsLoading(false);
          break;

        case "CLEAR_LOGS":
          setHttpRows([]);
          setWsRows([]);
          setWsBaseUrl("");
          setIsLoading(false);
          break;

        case "CLEAR":
          setHttpRows([]);
          setWsRows([]);
          setWsBaseUrl("");
          setIsLoading(false);
          break;

        case "WS_BASE_URL":
          if (typeof payload === "string") {
            console.log("[useLiveHar] Setting WebSocket base URL:", payload);
            setWsBaseUrl(payload);
          }
          break;

        case "WS_CREATED":
          if (payload?.wsUrl) {
            console.log("[useLiveHar] WebSocket created with URL:", payload.wsUrl);
            setWsBaseUrl(payload.wsUrl);
          }
          break;

        case "HTTP_REQUEST":
          if (payload?.method) {
            const rawDate = new Date(payload.timestamp);
            const time = formatTime(rawDate);
            const startTime = rawDate.getTime();
            const endTime = payload.endTime ?? Date.now();
            
            // Detect errors based on status code
            const hasMessages = payload.status && (payload.status >= 400);
            
            const newId = uuidv4();
            setHttpRows((prev) => [
              ...prev,
              {
                method: payload.method,
                requestPayload: payload.requestPayload || { _noData: true, _method: payload.method },
                responsePayload: payload.responsePayload || { _noData: true, _status: payload.status },
                status: payload.status ?? null,
                time,
                startTime,
                endTime,
                id: newId,
                urlPattern: payload.urlPattern,
                patternType: payload.patternType,
                httpMethod: payload.httpMethod,
                endpoint: payload.endpoint,
                displayName: payload.displayName,
                hasMessages,
                // Always include header data
                requestHeaders: payload.requestHeaders || [],
                responseHeaders: payload.responseHeaders || [],
                headers: {
                  request: payload.requestHeaders || [],
                  response: payload.responseHeaders || []
                },
                url: payload.url,
              },
            ]);
          }
          break;

        case "INITIAL_HTTP_REQUEST":
          if (payload?.method) {
            const rawDate = new Date(payload.timestamp);
            const time = formatTime(rawDate);
            const startTime = rawDate.getTime();
            const endTime = payload.endTime ?? Date.now();
            
            // Add error detection for initial HTTP requests
            const hasMessages = payload.status && (payload.status >= 400);
            
            const row: HttpRow = {
              method: payload.method,
              requestPayload: payload.requestPayload || { _noData: true, _method: payload.method },
              responsePayload: payload.responsePayload || { _noData: true, _status: payload.status },
              status: payload.status ?? null,
              time,
              startTime,
              endTime,
              id: uuidv4(),
              urlPattern: payload.urlPattern,
              patternType: payload.patternType,
              httpMethod: payload.httpMethod,
              endpoint: payload.endpoint,
              displayName: payload.displayName,
              hasMessages,
              // Always include header data
              requestHeaders: payload.requestHeaders || [],
              responseHeaders: payload.responseHeaders || [],
              headers: {
                request: payload.requestHeaders || [],
                response: payload.responseHeaders || []
              },
              url: payload.url || payload.baseUrl,
              key: payload.rowKey,
              source: payload.rowSource,
            };
            setHttpRows((prev) => upsertHttpRow(prev, row));
          }
          break;

        case "HTTP_RESYNC": {
          // URL patterns changed: drop rows that no longer match, relabel re-matched rows
          const remove = new Set<string>(payload?.remove || []);
          const restyle = new Map<string, any>(
            (payload?.restyle || []).map((r: any) => [r.key, r.fields] as [string, any])
          );
          if (!remove.size && !restyle.size) break;
          setHttpRows((prev) => {
            let changed = false;
            const next: HttpRow[] = [];
            for (const r of prev) {
              if (r.key && remove.has(r.key)) {
                changed = true;
                continue;
              }
              const fields = r.key ? restyle.get(r.key) : undefined;
              if (fields) {
                changed = true;
                next.push({ ...r, ...fields });
              } else {
                next.push(r);
              }
            }
            return changed ? next : prev;
          });
          break;
        }

        case "APEXREMOTE":
          if (payload?.method) {
            const rawDate = new Date(payload.timestamp);
            const time = formatTime(rawDate);
            const startTime = rawDate.getTime();
            const endTime = payload.endTime ?? Date.now();
            
            // Detect errors for APEXREMOTE as well
            const hasMessages = payload.status && (payload.status >= 400);
            
            setHttpRows((prev) => [
              ...prev,
              {
                method: payload.method,
                requestPayload: payload.requestPayload,
                responsePayload: payload.responsePayload,
                status: payload.status ?? null,
                time,
                startTime,
                endTime,
                id: uuidv4(),
                urlPattern: payload.urlPattern,
                patternType: payload.patternType,
                httpMethod: payload.httpMethod,
                endpoint: payload.endpoint,
                displayName: payload.displayName,
                hasMessages, // Add error flag
                // Add header data
                requestHeaders: payload.requestHeaders || [],
                responseHeaders: payload.responseHeaders || [],
                headers: {
                  request: payload.requestHeaders || [],
                  response: payload.responseHeaders || []
                },
                url: payload.url,
              },
            ]);
          } else {
            console.warn(
              "[useLiveHar] APEXREMOTE payload missing method:",
              payload
            );
          }
          break;

        case "WS":
          try {
            const row = toWsRow(payload, uuidv4());
            setWsRows((prev) => mergeWsRows(prev, [row]));
          } catch (err) {
            console.warn("[useLiveHar] Failed to process WS row:", err);
          }
          break;

        case "WS_BATCH":
          try {
            if (Array.isArray(payload) && payload.length) {
              const rows = payload.map((p: any) => toWsRow(p, uuidv4()));
              setWsRows((prev) => mergeWsRows(prev, rows));
            }
          } catch (err) {
            console.warn("[useLiveHar] Failed to process WS rows:", err);
          }
          break;

        case "PAGE_RESET": {
          // The page was (re)loaded: like the DevTools Network tab, show only the new page's calls
          const before = Number(payload?.before) || 0;
          const removeKeys = new Set<string>(payload?.removeHttpKeys || []);
          setWsRows((prev) => {
            const next = prev.filter((r) => r.timestamp >= before);
            return next.length === prev.length ? prev : next;
          });
          if (removeKeys.size) {
            setHttpRows((prev) => {
              const next = prev.filter((r) => !(r.key && removeKeys.has(r.key)));
              return next.length === prev.length ? prev : next;
            });
          }
          setWsBaseUrl("");
          break;
        }

        case "DEBUGGER_STATUS":
          if (payload && typeof payload.state === "string") {
            setDebuggerStatus(payload as DebuggerStatus);
          }
          break;
        case "INITIAL_HAR":
          if (payload?.method) {
            const rawDate = new Date(payload.timestamp);
            const time = formatTime(rawDate);
            const startTime = rawDate.getTime();
            const endTime = payload.endTime ?? Date.now();
            const hasMessages = payload.status && (payload.status >= 400);
            setHttpRows((prev) => [
              ...prev,
              {
                method: payload.method,
                requestPayload: payload.requestPayload,
                responsePayload: payload.responsePayload,
                status: payload.status ?? null,
                time,
                startTime,
                endTime,
                id: uuidv4(),
                urlPattern: payload.urlPattern,
                patternType: payload.patternType,
                httpMethod: payload.httpMethod,
                endpoint: payload.endpoint,
                displayName: payload.displayName,
                hasMessages, // Add error detection
                // Always include header data (even if empty arrays)
                requestHeaders: payload.requestHeaders || [],
                responseHeaders: payload.responseHeaders || [],
                headers: {
                  request: payload.requestHeaders || [],
                  response: payload.responseHeaders || []
                },
                url: payload.url || payload.baseUrl,
              },
            ]);
          }
          break;

        default:
          break;
      }
    };

    const onMessage = (event: MessageEvent) => processMessage(event.data);

    // Take over from panel.tsx's early buffer: process what arrived before this listener existed
    // (in order, exactly once), then listen directly.
    const stopEarlyBuffer = (window as any).__CONGA_STOP_EARLY_BUFFER__;
    const earlyMessages: any[] = typeof stopEarlyBuffer === "function" ? stopEarlyBuffer() || [] : [];
    for (const msg of earlyMessages) processMessage(msg);

    // Attach listener
    window.addEventListener("message", onMessage);

    // Cleanup on unmount
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return {
    httpRows,
    wsRows,
    wsBaseUrl,
    isLoading,
    debuggerStatus,
  };
}