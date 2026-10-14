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
  endpoint: string;
  action: string;
  payload: any;
  status: number | null;
  time: string;
  timestamp: number; // <-- Needed for proper sorting
  direction: "sent" | "received";
  duration?: string; // e.g. "20s", "1m 5s" — only on received rows
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
            const direction = payload.direction || "received";
            const endpoint = payload.endpoint || "(unknown)";
            const action = payload.action || "";
            const tsMs = Number(payload.timestamp) || Date.now();

            const time = new Date(tsMs).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZone: "Asia/Kolkata",
            });

            setWsRows((prev) => {
              // Calculate duration for received messages by finding matching sent TaskId
              let duration: string | undefined = payload.duration;
              const taskId = payload.payload?.TaskId;
              if (taskId && direction === "received" && !duration) {
                for (let i = prev.length - 1; i >= 0; i--) {
                  const r = prev[i];
                  if (r.direction === "sent" && r.payload?.TaskId === taskId) {
                    duration = formatDuration(tsMs - r.timestamp);
                    break;
                  }
                }
              }

              return [
                ...prev,
                {
                  endpoint,
                  action,
                  payload: payload.payload,
                  status: payload.status ?? null,
                  time,
                  timestamp: tsMs,
                  direction,
                  duration,
                },
              ];
            });
          } catch (err) {
            console.warn("[useLiveHar] Failed to process WS row:", err);
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
  };
}