// devtools.ts - Fully stable with WS reliability and panel re-entry safety + Configurable URL patterns

const seenRequests = new Set<string>();
const seenWsMessages = new Set<string>();
let debuggerAttached = false;
let wsFirstTimestamp: number | null = null;
let wsFirstWallClock: number | null = null;
let reloadTimeout: ReturnType<typeof setTimeout> | null = null;

// URL Pattern Configuration System
interface UrlPattern {
  name: string;
  pattern: string;
  type: 'apex' | 'http' | 'generic';
  enabled: boolean;
  description?: string;
}

function getDefaultUrlPatterns(): UrlPattern[] {
  return [
    {
      name: "ApexRemote",
      pattern: "apexremote",
      type: "apex",
      enabled: true,
      description: "Salesforce ApexRemote calls - extracts method from JSON payload"
    },
    {
      name: "CongaCloud",
      pattern: "congacloud",
      type: "http",
      enabled: true,
      description: "CongaCloud API calls - uses HTTP method and endpoint"
    }
  ];
}

function getUrlPatternsFromStorage(): UrlPattern[] {
  try {
    const stored = localStorage.getItem('har_extractor_url_patterns');
    if (stored) {
      const patterns = JSON.parse(stored);
      
      // STRICT FILTERING: Only allow ApexRemote and CongaCloud patterns
      const allowedPatterns = ['apexremote', 'congacloud'];
      const filteredPatterns = patterns.filter((p: UrlPattern) => {
        return allowedPatterns.includes(p.pattern.toLowerCase()) && 
               (p.name.toLowerCase() === 'apexremote' || p.name.toLowerCase() === 'congacloud');
      });
      
      // If we filtered out patterns or have no valid patterns, reset to defaults
      if (filteredPatterns.length !== patterns.length || filteredPatterns.length === 0) {
        console.log('Filtering out invalid patterns or resetting to defaults - only ApexRemote and CongaCloud allowed');
        const defaults = getDefaultUrlPatterns();
        saveUrlPatternsToStorage(defaults);
        return defaults;
      }
      
      return filteredPatterns;
    }
  } catch (error) {
    console.warn('Error reading URL patterns from localStorage:', error);
  }
  
  // First time or error - set defaults
  const defaults = getDefaultUrlPatterns();
  saveUrlPatternsToStorage(defaults);
  return defaults;
}

function saveUrlPatternsToStorage(patterns: UrlPattern[]): void {
  try {
    localStorage.setItem('har_extractor_url_patterns', JSON.stringify(patterns));
  } catch (error) {
    console.error('Error saving URL patterns to localStorage:', error);
  }
}

function shouldProcessUrl(url: string): UrlPattern | null {
  const patterns = getUrlPatternsFromStorage();
  
  // Filter out static assets with comprehensive patterns
  const staticAssetExtensions = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', 
    '.ttf', '.woff', '.woff2', '.eot', '.map', '.json', '.xml',
    'favicon', '.webp', '.bmp', '.tiff', '.scss', '.less', '.ts.map',
    '.min.js', '.min.css', '.chunk.js', '.bundle.js', '.vendor.js',
    '.fonts', '.font', '.otf', '.woff2', '/assets/', '/static/',
    'googletagmanager', 'google-analytics', 'analytics.js',
    'gtag/js', 'doubleclick', 'googleadservices', 'facebook.net',
    'hotjar', 'intercom', 'zendesk', '/images/', '/img/', '/icons/'
  ];
  
  const isStaticAsset = staticAssetExtensions.some(ext => 
    url.toLowerCase().includes(ext.toLowerCase())
  );
  
  if (isStaticAsset) {
    return null;
  }
  
  // STRICT FILTERING: Only process ApexRemote and CongaCloud URLs
  const allowedPatterns = ['apexremote', 'congacloud'];
  const matchedPattern = patterns.find(p => p.enabled && url.includes(p.pattern));
  
  if (matchedPattern && allowedPatterns.includes(matchedPattern.pattern.toLowerCase())) {
    return matchedPattern;
  }
  
  return null;
}

function extractEndpointFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    let pathname = urlObj.pathname;
    
    // Remove leading slash
    if (pathname.startsWith('/')) {
      pathname = pathname.substring(1);
    }
    
    // For API-style URLs, show the relevant path
    if (pathname.includes('api/')) {
      // Find the API part and show everything after it
      const apiIndex = pathname.indexOf('api/');
      const apiPath = pathname.substring(apiIndex + 4); // Skip 'api/'
      
      // Only add query parameters if they contain meaningful data (not just IDs or tokens)
      if (urlObj.search && urlObj.search !== '?' && urlObj.search.length > 15 && 
          !urlObj.search.includes('token=') && !urlObj.search.includes('id=') && 
          !urlObj.search.includes('sessionId=')) {
        return `${apiPath}${urlObj.search}`;
      }
      
      return apiPath;
    }
    
    // For other URLs, show the clean path
    if (pathname.length > 0) {
      // Only include query params if they seem to contain actual endpoint data
      if (urlObj.search && urlObj.search !== '?' && urlObj.search.length > 20 && 
          urlObj.search.includes('=') && !urlObj.search.includes('token=') && 
          !urlObj.search.includes('sessionId=') && !urlObj.search.includes('timestamp=')) {
        return `${pathname}${urlObj.search}`;
      }
      return pathname;
    }
    
    return 'endpoint';
  } catch {
    return 'endpoint';
  }
}

function processRequestByPattern(request: any, reqJson: any, resJson: any, pattern: UrlPattern) {
  const httpMethod = request.request.method || 'GET';
  
  // For OPTIONS or non-standard responses, show the full response object
  const shouldShowFullResponse = httpMethod === 'OPTIONS' || 
    (resJson && typeof resJson === 'object' && !resJson.hasOwnProperty('result') && 
     !Array.isArray(resJson) && Object.keys(resJson).length > 0);

  const basePayload = {
    url: request.request.url,
    requestPayload: reqJson,
    responsePayload: shouldShowFullResponse ? resJson : resJson,
    status: request.response?.status ?? null,
    timestamp: new Date(request.startedDateTime).getTime(),
    endTime: Date.now(),
    urlPattern: pattern.name,
    patternType: pattern.type,
    httpMethod
  };

  switch (pattern.type) {
    case 'apex':
      return {
        ...basePayload,
        method: reqJson.method || "(unknown)",
        displayName: `${pattern.name}: ${reqJson.method || "(unknown)"}`
      };
    
    case 'http':
      const endpoint = extractEndpointFromUrl(request.request.url);
      return {
        ...basePayload,
        method: `${httpMethod} ${endpoint}`,
        endpoint,
        displayName: `${pattern.name}: ${httpMethod} ${endpoint}`
      };
    
    case 'generic':
    default:
      return {
        ...basePayload,
        method: request.request.method || reqJson.method || "(unknown)",
        displayName: `${pattern.name}: ${request.request.method || "(unknown)"}`
      };
  }
}

chrome.devtools.panels.create("HAR Extractor", "", "panel.html", (panel) => {
  let currentTabId: number | null = null;

  // Force clean patterns at startup to ensure only ApexRemote and CongaCloud are allowed
  forceResetUrlPatterns();

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

      if (method === "Network.webSocketCreated") {
        const wsUrl = params.url;
        const key = `ws-create-${wsUrl}`;
        if (seenWsMessages.has(key)) return;
        seenWsMessages.add(key);

        panelWindow.postMessage(
          {
            source: "HAR_EXTRACTOR",
            type: "WS_CREATED",
            payload: {
              wsUrl,
              time: new Date().toLocaleTimeString("en-GB"),
              timestamp: Date.now(),
            },
          },
          "*"
        );
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
          const matchedPattern = shouldProcessUrl(entry.request.url);
          if (!matchedPattern) continue;

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

            const processedPayload = processRequestByPattern(
              { 
                request: entry.request, 
                response: entry.response,
                startedDateTime: entry.startedDateTime
              }, 
              req, 
              res, 
              matchedPattern
            );

            panelWindow.postMessage(
              {
                source: "HAR_EXTRACTOR",
                type: "INITIAL_HTTP_REQUEST",
                payload: {
                  ...processedPayload,
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

      const matchedPattern = shouldProcessUrl(request.request.url);
      if (!matchedPattern) return;

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

          const processedPayload = processRequestByPattern(request, reqJson, resJson, matchedPattern);

          panelWindow.postMessage(
            {
              source: "HAR_EXTRACTOR",
              type: "HTTP_REQUEST",
              payload: processedPayload,
            },
            "*"
          );
          scheduleHarReload();
        });
      });
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

      if (event.data.type === "GET_URL_PATTERNS") {
        console.log("📋 Panel requested URL patterns");
        const patterns = getUrlPatternsFromStorage();
        panelWindow.postMessage(
          { 
            source: "HAR_EXTRACTOR", 
            type: "URL_PATTERNS_RESPONSE", 
            patterns 
          },
          "*"
        );
      }

      if (event.data.type === "SAVE_URL_PATTERNS") {
        console.log("💾 Panel requested to save URL patterns");
        if (event.data.patterns && Array.isArray(event.data.patterns)) {
          saveUrlPatternsToStorage(event.data.patterns);
          panelWindow.postMessage(
            { 
              source: "HAR_EXTRACTOR", 
              type: "URL_PATTERNS_SAVED",
              success: true
            },
            "*"
          );
        }
      }
    });

    sendInitialHar();
  });
});

// Force clear and reset localStorage patterns to only allow ApexRemote and CongaCloud
function forceResetUrlPatterns(): void {
  console.log('🔒 Force resetting URL patterns to only ApexRemote and CongaCloud');
  const strictDefaults = getDefaultUrlPatterns();
  localStorage.removeItem('har_extractor_url_patterns');
  saveUrlPatternsToStorage(strictDefaults);
}
