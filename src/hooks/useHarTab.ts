import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

export interface HttpRow {
  method: string;
  requestPayload: any;
  responsePayload: any;
  status: number | null;
  time: string;
  id: string;
  startTime: number; // also use as timestamp for sorting
  endTime?: number;
}

export interface WsRow {
  endpoint: string;
  action: string;
  payload: any;
  status: number | null;
  time: string;
  timestamp: number; // <-- Needed for proper sorting
  direction: "sent" | "received";
}

export function useLiveHar() {
  const [httpRows, setHttpRows] = useState<HttpRow[]>([]);
  const [wsRows, setWsRows] = useState<WsRow[]>([]);
  const [wsBaseUrl, setWsBaseUrl] = useState<string>("");
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
    const onMessage = (event: MessageEvent) => {
      if (event.data?.source !== "HAR_EXTRACTOR") return;

      const { type, payload } = event.data;
      console.log(`[useLiveHar] Received message: ${type}`);

      switch (type) {
        case "CLEAR_LOGS":
          console.log("[useLiveHar] Resetting logs and base URL");
          setHttpRows([]);
          setWsRows([]);
            setWsBaseUrl("");
          break;

        case "WS_BASE_URL":
          if (typeof payload === "string") {
            console.log("[useLiveHar] Setting WebSocket base URL:", payload);
            setWsBaseUrl(payload);
          }
          break;

        case "APEXREMOTE":
          if (payload?.method) {
            const rawDate = new Date(payload.timestamp);
            const time = formatTime(rawDate);
            const startTime = rawDate.getTime();
            const endTime = payload.endTime ?? Date.now();
            console.log("Pushing row", payload.method, time);
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

            setWsRows((prev) => [
              ...prev,
              {
                endpoint,
                action,
                payload: payload.payload,
                status: payload.status ?? null,
                time,
                timestamp: tsMs,
                direction,
              },
            ]);
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
              },
            ]);
          }
          break;

        case "REQUEST_HAR_RELOAD":
          if (!chrome?.devtools?.network?.getHAR) {
            console.warn("chrome.devtools.network.getHAR is not available");
            return;
          }

          console.log("[useLiveHar] Reloading HAR via getHAR()");
          chrome.devtools.network.getHAR((harLog) => {
            const entries = (harLog.entries || []).filter((e) =>
              e.request.url.includes("apexremote")
            );

            if (!entries.length) {
              console.warn("[useLiveHar] No apexremote entries found");
              return;
            }

            const freshRows: HttpRow[] = [];
            let completed = 0;

            entries.forEach((entry) => {
              const start = new Date(entry.startedDateTime);
              const time = formatTime(start);
              const startTime = start.getTime();
              const totalTime = entry.time || 0;
              const endTime = startTime + totalTime;

              let req = {};
              try {
                req = JSON.parse(entry.request.postData?.text || "{}");
              } catch {}

              entry.getContent((content) => {
                let res = {};
                try {
                  res = JSON.parse(content || "{}");
                } catch {}

                freshRows.push({
                  method: (req as any).method || "(unknown)",
                  requestPayload: req,
                  responsePayload: res,
                  status: entry.response.status ?? null,
                  time,
                  startTime,
                  endTime,
                  id: uuidv4(),
                });

                completed++;
                if (completed === entries.length) {
                  console.log(
                    `[useLiveHar] Reloaded ${freshRows.length} calls`
                  );
                  setHttpRows(freshRows);
                }
              });
            });
          });
          break;
        case "HAR_RETRIGGER":
          if (event.data?.type === "HAR_RETRIGGER") {
            chrome.devtools.inspectedWindow.eval(`
              fetch("${event.data.url}", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: ${JSON.stringify(JSON.stringify(event.data.payload))},
                credentials: "include"
              }).then(r => r.text()).then(resp => {
                window.postMessage({ source: "HAR_EXTRACTOR", type: "HAR_RETRIGGER_RESPONSE", data: resp }, "*");
              }).catch(err => {
                window.postMessage({ source: "HAR_EXTRACTOR", type: "HAR_RETRIGGER_RESPONSE", data: "Error: " + err.message }, "*");
              });
            `);
          }
          break;
        default:
          console.debug("[useLiveHar] Ignored message of type:", type);
      }
    };

    // Attach listener
    window.addEventListener("message", onMessage);

    // Cleanup on unmount
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return {
    httpRows,
    wsRows,
    wsBaseUrl,
  };
}
