// devtools.ts - Fully stable with WS reliability and panel re-entry safety

const seenRequests = new Set<string>();
const seenWsMessages = new Set<string>();
let debuggerAttached = false;
let wsFirstTimestamp: number | null = null;
let wsFirstWallClock: number | null = null;
let reloadTimeout: ReturnType<typeof setTimeout> | null = null;

chrome.devtools.panels.create("HAR Extractor", "", "panel.html", (panel) => {
  let currentTabId: number | null = null;

  panel.onShown.addListener((panelWindow) => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    currentTabId = tabId;
    const debuggee = { tabId };

    if (!debuggerAttached) {
      chrome.debugger.attach(debuggee, "1.3", () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Failed to attach debugger:",
            chrome.runtime.lastError.message
          );
          return;
        }
        debuggerAttached = true;
        console.log("✅ Debugger attached");

        chrome.debugger.sendCommand(debuggee, "Network.enable", {});
        chrome.debugger.sendCommand(debuggee, "Page.enable", {});
      });
    }

    // Always rebind the listener safely
    chrome.debugger.onEvent.removeListener(handleEvent);
    chrome.debugger.onEvent.addListener(handleEvent);

    function handleEvent(source, method, params) {
      if (source.tabId !== currentTabId) return;

      if (
        method === "Network.webSocketFrameReceived" ||
        method === "Network.webSocketFrameSent"
      ) {
        const direction =
          method === "Network.webSocketFrameSent" ? "sent" : "received";
        const rawPayload = params.response?.payloadData;
        if (!rawPayload) return;

        let topLevel: any = {};
        try {
          topLevel = JSON.parse(rawPayload);
        } catch {
          console.warn(`[WS ${direction}] Failed to parse top-level JSON`);
          return;
        }

        if (wsFirstTimestamp === null) {
          wsFirstTimestamp = params.timestamp;
          wsFirstWallClock = Date.now();
        }

        let nested: any = {};
        try {
          nested =
            typeof topLevel.Payload === "string" &&
            topLevel.Payload.trim().startsWith("{")
              ? JSON.parse(topLevel.Payload)
              : topLevel.Payload;
        } catch {}

        const action = (nested?.Action || topLevel?.Action || "").toLowerCase();
        if (action === "heartbeat") return;

        const endpoint =
          topLevel.EndPoint ||
          (topLevel.TaskId ? `TaskId: ${topLevel.TaskId}` : "(unknown)");
        const status = topLevel.StatusCode ?? 200;

        const baseTime = Date.now() - performance.now();
        const timestamp =
          wsFirstTimestamp != null && wsFirstWallClock != null
            ? new Date(
                wsFirstWallClock + (params.timestamp - wsFirstTimestamp) * 1000
              )
            : new Date(baseTime + params.timestamp * 1000);

        const key = `${timestamp.getTime()}-${action}-${direction}-${endpoint}`;
        if (seenWsMessages.has(key)) return;
        seenWsMessages.add(key);

        panelWindow.postMessage(
          {
            source: "HAR_EXTRACTOR",
            type: "WS",
            payload: {
              endpoint,
              action,
              payload: nested || topLevel,
              status,
              direction,
              timestamp: timestamp.getTime(),
              time: timestamp.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
            },
          },
          "*"
        );
        scheduleHarReload();
      }

      if (method === "Page.loadEventFired") {
        console.log("🔄 Page reload detected → clearing HTTP & WS data");
        seenRequests.clear();
        seenWsMessages.clear();
        wsFirstTimestamp = null;
        wsFirstWallClock = null;

        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "CLEAR" },
          "*"
        );

        chrome.devtools.inspectedWindow.eval(
          "window.location.origin",
          (res, isErr) => {
            if (!isErr && typeof res === "string") {
              panelWindow.postMessage(
                {
                  source: "HAR_EXTRACTOR",
                  type: "HAR_SET_ORIGIN",
                  origin: res,
                },
                "*"
              );
            }
          }
        );
      }
    }

    function scheduleHarReload() {
      if (reloadTimeout) clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "REQUEST_HAR_RELOAD" },
          "*"
        );
        reloadTimeout = null;
      }, 500); // adjust debounce delay as needed
    }

    function sendInitialHar() {
      if (!chrome.devtools.network.getHAR) return;

      chrome.devtools.network.getHAR((harLog) => {
        for (const entry of harLog.entries || []) {
          if (!entry.request.url.includes("apexremote")) continue;

          const rid = (entry as any)._requestId;
          if (seenRequests.has(rid)) continue;
          seenRequests.add(rid);

          const timestamp = new Date(entry.startedDateTime);
          const startTime = timestamp.getTime();
          const totalTimeMs = entry.time || 0;
          const endTime = startTime + totalTimeMs;

          let req = {};
          try {
            req = JSON.parse(entry.request.postData?.text || "{}");
          } catch {}

          entry.getContent((content) => {
            let res = {};
            try {
              res = JSON.parse(content || "{}");
            } catch {}

            panelWindow.postMessage(
              {
                source: "HAR_EXTRACTOR",
                type: "INITIAL_HAR",
                payload: {
                  method: (req as any).method || "(unknown)",
                  requestPayload: req,
                  responsePayload: res,
                  status: entry.response.status ?? null,
                  timestamp: startTime,
                  baseUrl: new URL(entry.request.url).origin,
                  endTime,
                },
              },
              "*"
            );
          });
        }
      });
    }

    chrome.devtools.network.onRequestFinished.addListener((request) => {
      const rid = (request as any).requestId || (request as any)._requestId;
      if (rid && seenRequests.has(rid)) return;
      if (rid) seenRequests.add(rid);

      if (request.request.url.includes("apexremote")) {
        const extractReq = (cb: (j: any) => void) => {
          if (typeof request.getRequestBody === "function") {
            request.getRequestBody((b) => {
              let j = {};
              try {
                j = JSON.parse(b.postData?.text || "{}");
              } catch {}
              cb(j);
            });
          } else {
            try {
              cb(JSON.parse(request.request.postData?.text || "{}"));
            } catch {
              cb({});
            }
          }
        };

        extractReq((reqJson) => {
          request.getContent((content) => {
            let resJson = {};
            if (content) {
              try {
                resJson = JSON.parse(content);
              } catch {}
            }

            panelWindow.postMessage(
              {
                source: "HAR_EXTRACTOR",
                type: "APEXREMOTE",
                payload: {
                  method: reqJson.method || "(unknown)",
                  url: request.request.url,
                  requestPayload: reqJson,
                  responsePayload: resJson,
                  status: request.response?.status ?? null,
                  timestamp: new Date(request.startedDateTime).getTime(),
                  endTime: Date.now(),
                },
              },
              "*"
            );
            scheduleHarReload();
          });
        });
      }
    });

    panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "INIT" }, "*");

    window.addEventListener("message", (event) => {
      if (event.data?.source !== "HAR_EXTRACTOR") return;

      if (event.data.type === "REQUEST_HAR_RELOAD") {
        console.log("🔁 Panel requested HAR reload");
        sendInitialHar();
      }

      if (event.data.type === "CLEAR_LOGS") {
        console.log("🧹 Panel requested CLEAR_LOGS");
        seenRequests.clear();
        seenWsMessages.clear();
        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "CLEAR" },
          "*"
        );
      }
    });

    sendInitialHar();
  });
});
