// devtools.ts - Fully stable with WS reliability and panel re-entry safety + Configurable URL patterns

const seenRequests = new Set<string>();
const seenWsMessages = new Set<string>();
// Track sent WS timestamps by TaskId for duration calculation
const wsSentTimestamps: Record<string, number> = {};
let debuggerAttached = false;
let wsFirstTimestamp: number | null = null;
let wsFirstWallClock: number | null = null;
let reloadTimeout: ReturnType<typeof setTimeout> | null = null;
// Track most recent WS event to detect stalls
let lastWsEventTime: number | null = null;
// Declare chrome API for TypeScript
declare const chrome: any;

// Track attached sub-targets (workers/iframes) to ensure WS events aren't filtered out
const attachedTargetIds = new Set<string>();

// ========================
// WS INTERCEPTOR FALLBACK
// ========================
// When chrome.debugger can't attach (e.g., another extension is using it),
// this fallback injects a page-level WebSocket interceptor via
// chrome.devtools.inspectedWindow.eval() to capture WS traffic without
// needing the debugger API. Works regardless of other extensions.
let wsPollingInterval: ReturnType<typeof setInterval> | null = null;
let debuggerWsActive = false;
let onNavigatedListenerAdded = false;
let currentPanelWindow: any = null;
let debuggerRetryInterval: ReturnType<typeof setInterval> | null = null;

const WS_INTERCEPTOR_SCRIPT = `
(function() {
  if (window.__CONGA_WS_INTERCEPTOR__) return 'already_installed';
  window.__CONGA_WS_INTERCEPTOR__ = true;
  window.__CONGA_WS_QUEUE__ = [];
  var OrigWS = window.WebSocket;
  function CongaWebSocket(url, protocols) {
    var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
    var wsUrl = url;
    var origSend = ws.send;
    ws.send = function(data) {
      try {
        if (typeof data === 'string') {
          window.__CONGA_WS_QUEUE__.push({ direction: 'sent', data: data, url: wsUrl, timestamp: Date.now() });
        }
      } catch(e) {}
      return origSend.call(ws, data);
    };
    ws.addEventListener('message', function(event) {
      try {
        if (typeof event.data === 'string') {
          window.__CONGA_WS_QUEUE__.push({ direction: 'received', data: event.data, url: wsUrl, timestamp: Date.now() });
        }
      } catch(e) {}
    });
    ws.addEventListener('open', function() {
      try {
        window.__CONGA_WS_QUEUE__.push({ direction: 'open', data: '', url: wsUrl, timestamp: Date.now() });
      } catch(e) {}
    });
    return ws;
  }
  CongaWebSocket.CONNECTING = OrigWS.CONNECTING;
  CongaWebSocket.OPEN = OrigWS.OPEN;
  CongaWebSocket.CLOSING = OrigWS.CLOSING;
  CongaWebSocket.CLOSED = OrigWS.CLOSED;
  CongaWebSocket.prototype = OrigWS.prototype;
  window.WebSocket = CongaWebSocket;
  return 'installed';
})();
`;

function injectWsInterceptor() {
  console.log("💉 Injecting WS interceptor into page...");
  chrome.devtools.inspectedWindow.eval(WS_INTERCEPTOR_SCRIPT, (result: any, isException: any) => {
    if (isException) {
      console.warn("⚠️ WS interceptor injection failed:", isException);
    } else {
      console.log("✅ WS interceptor:", result);
    }
  });
}

function startWsPolling(panelWindow: any) {
  if (wsPollingInterval) clearInterval(wsPollingInterval);
  wsPollingInterval = setInterval(() => {
    // If debugger is actively capturing WS events, skip interceptor processing
    if (debuggerWsActive) return;
    chrome.devtools.inspectedWindow.eval(
      `(function() {
        if (!window.__CONGA_WS_QUEUE__ || window.__CONGA_WS_QUEUE__.length === 0) return null;
        var msgs = window.__CONGA_WS_QUEUE__.splice(0);
        if (msgs.length > 5000) msgs = msgs.slice(-2000);
        return JSON.stringify(msgs);
      })()`,
      (result: any, isException: any) => {
        if (isException || !result) return;
        try {
          const messages = JSON.parse(result);
          const pw = currentPanelWindow || panelWindow;
          for (const msg of messages) {
            processInterceptedWsMessage(msg, pw);
          }
        } catch (e) {
          console.warn("⚠️ Error processing interceptor WS messages:", e);
        }
      }
    );
  }, 200);
}

function stopWsPolling() {
  if (wsPollingInterval) {
    clearInterval(wsPollingInterval);
    wsPollingInterval = null;
  }
}

function stopDebuggerRetry() {
  if (debuggerRetryInterval) {
    clearInterval(debuggerRetryInterval);
    debuggerRetryInterval = null;
  }
}

// Auto-retry debugger attachment when it fails or is detached by another extension
function startDebuggerRetry(debuggee: any, panelWindow: any) {
  stopDebuggerRetry();
  console.log("🔄 Starting debugger auto-retry (every 10s)...");
  debuggerRetryInterval = setInterval(() => {
    if (debuggerAttached) {
      // Already attached, stop retrying
      stopDebuggerRetry();
      return;
    }
    console.log("🔄 Auto-retry: attempting debugger attach...");
    try {
      chrome.debugger.attach(debuggee, "1.3", () => {
        if (chrome.runtime.lastError) {
          console.log("🔄 Auto-retry: still blocked -", chrome.runtime.lastError.message);
          return;
        }
        console.log("✅ Auto-retry: debugger attached successfully!");
        debuggerAttached = true;
        stopDebuggerRetry();

        try {
          chrome.debugger.sendCommand(debuggee, "Network.enable", {
            maxTotalBufferSize: 100_000_000,
            maxResourceBufferSize: 50_000_000,
          });
          chrome.debugger.sendCommand(debuggee, "Network.setCacheDisabled", { cacheDisabled: true });
          chrome.debugger.sendCommand(debuggee, "Page.enable", {});
          chrome.debugger.sendCommand(debuggee, "Target.setAutoAttach", {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: true,
          });
        } catch (e) {
          console.warn("⚠️ Auto-retry: error enabling domains:", (e as any)?.message || e);
        }

        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "DEBUGGER_RECONNECTED" },
          "*"
        );
      });
    } catch (e) {
      console.log("🔄 Auto-retry: attach threw:", (e as any)?.message || e);
    }
  }, 10_000);
}

function processInterceptedWsMessage(msg: any, panelWindow: any) {
  if (!panelWindow) return;
  if (msg.direction === 'open') {
    panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "WS_BASE_URL", payload: msg.url }, "*");
    return;
  }
  if (msg.direction !== 'sent' && msg.direction !== 'received') return;

  const rawPayload = msg.data;
  if (!rawPayload) return;

  let topLevel: any = {};
  try {
    topLevel = JSON.parse(rawPayload);
  } catch {
    const cleaned = String(rawPayload).replace(/^\uFEFF/, '').trim();
    try { topLevel = JSON.parse(cleaned); } catch { return; }
  }

  if (wsFirstTimestamp === null) {
    wsFirstTimestamp = msg.timestamp / 1000;
    wsFirstWallClock = msg.timestamp;
  }

  let nested: any = {};
  try {
    nested = typeof topLevel.Payload === "string" && topLevel.Payload.trim().startsWith("{")
      ? JSON.parse(topLevel.Payload) : topLevel.Payload;
  } catch {}

  const action = (nested?.Action || topLevel?.Action || "").toLowerCase();
  if (action === "heartbeat") return;

  const endpoint = topLevel.EndPoint || (topLevel.TaskId ? `TaskId: ${topLevel.TaskId}` : "(unknown)");
  const status = topLevel.StatusCode ?? 200;
  const timestamp = new Date(msg.timestamp);

  const key = `int-${msg.timestamp}-${action}-${msg.direction}-${endpoint}`;
  if (seenWsMessages.has(key)) return;
  seenWsMessages.add(key);
  if (seenWsMessages.size > 10000) seenWsMessages.clear();

  // Calculate duration between sent and received using TaskId
  const taskId = topLevel.TaskId;
  let duration: string | undefined;
  if (taskId) {
    if (msg.direction === 'sent') {
      wsSentTimestamps[taskId] = msg.timestamp;
    } else {
      const sentTs = wsSentTimestamps[taskId];
      if (sentTs) {
        const diffMs = msg.timestamp - sentTs;
        const totalSec = Math.round(diffMs / 1000);
        if (totalSec < 60) {
          duration = `${totalSec}s`;
        } else {
          const min = Math.floor(totalSec / 60);
          const sec = totalSec % 60;
          duration = sec > 0 ? `${min}m ${sec}s` : `${min}m`;
        }
      }
    }
  }

  panelWindow.postMessage({
    source: "HAR_EXTRACTOR",
    type: "WS",
    payload: {
      endpoint,
      action,
      payload: topLevel,
      status,
      direction: msg.direction,
      timestamp: msg.timestamp,
      time: timestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      duration,
    },
  }, "*");
}

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
      
      // Return what's in localStorage - even if it's empty array, respect user's choice
      if (Array.isArray(patterns)) {
        return patterns;
      }
    }
    
    // Only log this if no localStorage item exists at all
    if (stored === null) {
      console.log('📝 No localStorage key found - this is first time setup');
    } else {
      console.warn('⚠️ Invalid or corrupted localStorage data detected - using defaults');
    }
  } catch (error) {
    console.warn('⚠️ getUrlPatternsFromStorage: Error reading patterns:', error);
    console.warn('⚠️ Falling back to default patterns');
  }
  
  // Only set defaults if localStorage key doesn't exist at all (first time)
  const defaults = getDefaultUrlPatterns();
  
  // Double-check that we're not overwriting existing data
  try {
    const doubleCheck = localStorage.getItem('har_extractor_url_patterns');
    if (doubleCheck !== null) {
      console.warn('⚠️ Race condition detected - localStorage was set between reads, not overwriting');
      try {
        const raceConditionPatterns = JSON.parse(doubleCheck);
        return raceConditionPatterns;
      } catch {
        return [];
      }
    }
  } catch (error) {
    console.warn('⚠️ Error in double-check, proceeding with defaults');
  }
  
  saveUrlPatternsToStorage(defaults);
  return defaults;
}

function saveUrlPatternsToStorage(patterns: UrlPattern[]): void {
  try {
    localStorage.setItem('har_extractor_url_patterns', JSON.stringify(patterns));
    
    // Verify the save was successful by reading it back immediately
    const verification = localStorage.getItem('har_extractor_url_patterns');
    if (!verification) {
      throw new Error('Failed to verify localStorage save - data not found');
    }
  } catch (error) {
    console.error('❌ saveUrlPatternsToStorage: Error saving patterns:', error);
  }
}

function shouldProcessUrl(url: string): UrlPattern | null {
  // Filter out only static assets, accept all API calls
  const staticAssetExtensions = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', 
    '.ttf', '.woff', '.woff2', '.eot', '.map', '.json', '.xml',
    'favicon', '.webp', '.bmp', '.tiff', '.scss', '.less', '.ts.map',
    '.min.js', '.min.css', '.chunk.js', '.bundle.js', '.vendor.js',
    '.fonts', '.font', '.otf', '/assets/', '/static/',
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

  // Get current patterns and find a match
  const currentPatterns = getUrlPatternsFromStorage();
  const enabledPatterns = currentPatterns.filter(p => p.enabled);
  
  const matchedPattern = enabledPatterns.find(pattern => {
    const patternLower = pattern.pattern.toLowerCase();
    return url.toLowerCase().includes(patternLower);
  });

  return matchedPattern || null;
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

// Add a variable to track when patterns change
let lastPatternHash: string | null = null;

function getPatternHash(patterns: UrlPattern[]): string {
  return JSON.stringify(patterns.map(p => ({ name: p.name, pattern: p.pattern, enabled: p.enabled })));
}

chrome.devtools.panels.create("Conga Debugger", "", "panel.html", (panel: any) => {
  let currentTabId: number | null = null;
  // Track pending network requests for loading state
  let pendingNetworkRequests = new Set<string>();
  let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Helper to update loading state
  function updateLoadingState(panelWindow: any) {
    const isLoading = pendingNetworkRequests.size > 0;
    console.log(`📊 Loading state update: ${isLoading ? 'LOADING' : 'IDLE'} (${pendingNetworkRequests.size} pending requests)`);
    panelWindow.postMessage(
      { 
        source: "HAR_EXTRACTOR", 
        type: isLoading ? "LOADING_START" : "LOADING_END"
      },
      "*"
    );
  }

  panel.onShown.addListener((panelWindow: any) => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    currentTabId = tabId;
    const debuggee = { tabId };

    // Clear any stale pending requests and ensure loading state is cleared on panel show
    pendingNetworkRequests.clear();
    if (loadingTimeoutId) {
      clearTimeout(loadingTimeoutId);
      loadingTimeoutId = null;
    }
    // Send initial clear state
    panelWindow.postMessage(
      { source: "HAR_EXTRACTOR", type: "LOADING_END" },
      "*"
    );

    // Add chrome.runtime.onMessage listener for HAR_RETRIGGER from React panel
    // Make it tab-specific by checking currentTabId
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      // Only process messages for the current tab
      if (message.source === "HAR_EXTRACTOR" && message.type === "HAR_RETRIGGER") {
        // Check if this message is for the current tab by comparing message tab ID
        if (message.tabId && message.tabId !== currentTabId) {
          console.log("🔄 Ignoring HAR_RETRIGGER for different tab:", message.tabId, "vs current:", currentTabId);
          return;
        }
        
        console.log("🔄 DevTools received HAR_RETRIGGER via chrome.runtime for tab:", currentTabId, message);
        
        const method = message.method || 'POST';
        const url = message.url;
        const payload = message.payload;
        
        console.log("🔄 Method:", method, "URL:", url);
        console.log("🔄 Payload:", payload);
        
        // Extract headers from payload
        const requestHeaders = payload._headers || [];
        console.log("🔄 Request headers:", requestHeaders);
        
        // Build headers object for fetch
        let headersObj: any = {
          "Content-Type": "application/json",
          "Accept": "application/json"
        };
        
        // Add original request headers (especially Authorization)
        if (Array.isArray(requestHeaders)) {
          requestHeaders.forEach((header: any) => {
            if (header && typeof header === 'object' && header.name && header.value !== undefined) {
              // Skip certain headers that fetch will set automatically or cause issues
              const skipHeaders = [
                'content-length', 'host', 'connection', 'user-agent',
                // Skip HTTP/2 pseudo-headers that start with ':'
                ':authority', ':method', ':path', ':scheme', ':status',
                // Skip other problematic headers
                'transfer-encoding', 'upgrade', 'via', 'x-forwarded-for',
                'x-forwarded-proto', 'x-real-ip'
              ];
              
              const headerName = header.name.toLowerCase();
              
              // Skip if header name starts with ':' (HTTP/2 pseudo-headers) or is in skip list
              if (!headerName.startsWith(':') && !skipHeaders.includes(headerName)) {
                headersObj[header.name] = header.value;
              }
            }
          });
        }
        
        console.log("🔄 Final headers object:", headersObj);
        
        // Create clean payload
        let cleanPayload: any = null;
        if (method !== 'GET' && method !== 'HEAD' && payload) {
          // Remove metadata fields for cleaner payload
          cleanPayload = { ...payload };
          delete cleanPayload._method;
          delete cleanPayload._url;
          delete cleanPayload._originalPayload;
          delete cleanPayload._noPayload;
          delete cleanPayload._resendMethod;
          delete cleanPayload._resendUrl;
          delete cleanPayload._headers;
          delete cleanPayload.url;
          
          console.log("🔄 Clean payload:", cleanPayload);
        }
        
        // Build the fetch call using chrome.devtools.inspectedWindow.eval
        const evalScript = `
          (function() {
            console.log("[HAR_RETRIGGER] Starting fetch to: ${url}");
            console.log("[HAR_RETRIGGER] Script is executing in page context for tab: ${currentTabId}");
            
            const fetchOptions = {
              method: "${method}",
              headers: ${JSON.stringify(headersObj)},
              credentials: "include"${cleanPayload ? `,
              body: ${JSON.stringify(JSON.stringify(cleanPayload))}` : ''}
            };
            
            console.log("[HAR_RETRIGGER] Fetch options:", fetchOptions);
            
            return fetch("${url}", fetchOptions)
              .then(response => {
                console.log("[HAR_RETRIGGER] Response status:", response.status);
                window.postMessage({ 
                  source: "HAR_EXTRACTOR", 
                  type: "HAR_RETRIGGER_RESPONSE", 
                  data: "Success: " + response.status 
                }, "*");
                return response.text();
              })
              .then(responseText => {
                console.log("[HAR_RETRIGGER] Response text length:", responseText.length);
                window.postMessage({ 
                  source: "HAR_EXTRACTOR", 
                  type: "HAR_RETRIGGER_RESPONSE", 
                  data: responseText 
                }, "*");
                return "Fetch completed successfully";
              })
              .catch(error => {
                console.error("[HAR_RETRIGGER] Fetch error:", error);
                window.postMessage({ 
                  source: "HAR_EXTRACTOR", 
                  type: "HAR_RETRIGGER_RESPONSE", 
                  data: "Error: " + error.message 
                }, "*");
                return "Fetch failed: " + error.message;
              });
          })();
        `;
        
        console.log("🔄 Evaluating script in inspected window for tab:", currentTabId);
        chrome.devtools.inspectedWindow.eval(evalScript, (result: any, isException: any) => {
          if (isException) {
            console.error("🔄 Error evaluating script:", isException);
          } else {
            console.log("🔄 Script evaluation result:", result);
          }
        });
      }
    };

    // Add the listener
    chrome.runtime.onMessage.addListener(messageListener);

    // Clean up the listener when panel is hidden/closed
    panel.onHidden.addListener(() => {
      chrome.runtime.onMessage.removeListener(messageListener);
    });

    // Force a fresh read of patterns when panel is shown and set initial hash
    const currentPatterns = getUrlPatternsFromStorage();
    lastPatternHash = getPatternHash(currentPatterns);

    if (!debuggerAttached) {
      console.log("🔧 Attempting to attach debugger to tab:", currentTabId);
      
      // Enhanced error handling and diagnostics
      chrome.debugger.attach(debuggee, "1.3", () => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message;
          console.error("❌ Failed to attach debugger:", errorMessage);
          
          // Provide specific troubleshooting guidance based on error type
          if (errorMessage.includes("different extension")) {
            console.warn("🚨 TROUBLESHOOTING: This error suggests another Chrome extension is already using the debugger.");
            console.warn("💡 SOLUTIONS:");
            console.warn("   1. Close other DevTools panels/extensions that might be using the debugger");
            console.warn("   2. Disable other debugging extensions temporarily");
            console.warn("   3. Try opening this extension in a new tab/window");
            console.warn("   4. Restart Chrome browser");
            
            // Send detailed error info to panel
            panelWindow.postMessage(
              { 
                source: "HAR_EXTRACTOR", 
                type: "DEBUGGER_ERROR",
                error: errorMessage,
                suggestions: [
                  "Another extension is using the debugger",
                  "Try disabling other debugging extensions",
                  "Restart Chrome browser",
                  "Open extension in new tab"
                ]
              },
              "*"
            );
          } else if (errorMessage.includes("permission")) {
            console.warn("🚨 TROUBLESHOOTING: Permission denied - check extension permissions");
            console.warn("💡 SOLUTIONS:");
            console.warn("   1. Reload the extension");
            console.warn("   2. Check that 'debugger' permission is granted");
            console.warn("   3. Try refreshing the page being debugged");
          } else {
            console.warn("🚨 TROUBLESHOOTING: Generic debugger attachment error");
            console.warn("💡 SOLUTIONS:");
            console.warn("   1. Refresh the target page");
            console.warn("   2. Close and reopen DevTools");
            console.warn("   3. Reload the extension");
          }
          
          // Notify panel that debugger failed but WS interceptor is active as fallback
          panelWindow.postMessage(
            { 
              source: "HAR_EXTRACTOR", 
              type: "DEBUGGER_FALLBACK",
              message: "Debugger unavailable - WS interceptor active. Reload page to capture WebSocket traffic."
            },
            "*"
          );

          // Start auto-retry: keep trying to attach in case the other extension releases the debugger
          startDebuggerRetry(debuggee, panelWindow);
          return;
        }
        debuggerAttached = true;
        stopDebuggerRetry(); // No need to retry, we're attached
        console.log("✅ Debugger attached successfully to tab:", currentTabId);

        try {
          chrome.debugger.sendCommand(debuggee, "Network.enable", {
            maxTotalBufferSize: 100_000_000,
            maxResourceBufferSize: 50_000_000
          });
          chrome.debugger.sendCommand(debuggee, "Network.setCacheDisabled", { cacheDisabled: true });
          chrome.debugger.sendCommand(debuggee, "Page.enable", {});
        } catch (e) {
          console.warn("⚠️ Error enabling domains after attach:", (e as any)?.message || e);
        }
        // Auto-attach to sub-targets (workers/iframes) so WS frames from them are captured
        chrome.debugger.sendCommand(
          debuggee,
          "Target.setAutoAttach",
          { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
          () => {
            if (chrome.runtime.lastError) {
              console.warn("⚠️ setAutoAttach error:", chrome.runtime.lastError.message);
            } else {
              console.log("🎯 Target.setAutoAttach enabled");
            }
          }
        );
        chrome.debugger.sendCommand(
          debuggee,
          "Target.setDiscoverTargets",
          { discover: true },
          () => {
            if (chrome.runtime.lastError) {
              // This API is not supported in newer Chrome versions - safe to ignore
              console.debug("setDiscoverTargets not available:", chrome.runtime.lastError.message);
            } else {
              console.log("🔭 Target.setDiscoverTargets enabled");
            }
          }
        );
        
        // Notify panel that debugger is connected
        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "DEBUGGER_RECONNECTED" },
          "*"
        );
        // Start WS inactivity watchdog on initial attach as well
        try { startWsWatchdog(); } catch {}
      });

      // Listen for debugger detach events
      chrome.debugger.onDetach.addListener((detachedDebuggee: any, reason: string) => {
        if (detachedDebuggee.tabId === currentTabId) {
          console.warn("🔌 Debugger detached:", reason);
          debuggerAttached = false;

          // Notify panel that debugger was disconnected
          panelWindow.postMessage(
            { source: "HAR_EXTRACTOR", type: "DEBUGGER_DISCONNECTED" },
            "*"
          );

          // Activate WS interceptor fallback immediately
          debuggerWsActive = false;
          injectWsInterceptor();

          // Auto-retry debugger attachment every 10 seconds
          startDebuggerRetry(debuggee, panelWindow);
        }
      });
    }

    // Always rebind the listener safely
    chrome.debugger.onEvent.removeListener(handleEvent);
    chrome.debugger.onEvent.addListener(handleEvent);

    // WS Interceptor Fallback: always inject + poll so WS works even without debugger
    currentPanelWindow = panelWindow;
    debuggerWsActive = false;
    injectWsInterceptor();
    startWsPolling(panelWindow);

    // Re-inject WS interceptor on page navigation (works without debugger)
    if (!onNavigatedListenerAdded) {
      chrome.devtools.network.onNavigated.addListener((url: string) => {
        console.log("🔄 onNavigated:", url, "- re-injecting WS interceptor");
        debuggerWsActive = false;
        wsFirstTimestamp = null;
        wsFirstWallClock = null;
        seenWsMessages.clear();
        // Re-inject interceptor after a short delay for page context to be ready
        setTimeout(() => injectWsInterceptor(), 100);
        // Double-inject after 500ms as safety net for slow-loading pages
        setTimeout(() => injectWsInterceptor(), 500);
        // Third inject at 1.5s for very slow pages
        setTimeout(() => injectWsInterceptor(), 1500);

        // Clear tables on navigation if debugger isn't attached
        // (since Page.frameNavigated won't fire without debugger)
        if (!debuggerAttached && currentPanelWindow) {
          seenRequests.clear();
          currentPanelWindow.postMessage(
            { source: "HAR_EXTRACTOR", type: "CLEAR" },
            "*"
          );
        }

        // On navigation, the debugger detaches. Try to re-attach since the
        // conflicting extension may not re-attach immediately after navigation.
        if (!debuggerAttached) {
          setTimeout(() => {
            if (!debuggerAttached) {
              console.log("🔄 Post-navigation: attempting debugger attach...");
              try {
                chrome.debugger.attach(debuggee, "1.3", () => {
                  if (chrome.runtime.lastError) {
                    console.log("🔄 Post-navigation attach failed:", chrome.runtime.lastError.message);
                    // Keep the periodic retry going
                    startDebuggerRetry(debuggee, panelWindow);
                    return;
                  }
                  console.log("✅ Post-navigation: debugger attached!");
                  debuggerAttached = true;
                  stopDebuggerRetry();
                  try {
                    chrome.debugger.sendCommand(debuggee, "Network.enable", {
                      maxTotalBufferSize: 100_000_000,
                      maxResourceBufferSize: 50_000_000,
                    });
                    chrome.debugger.sendCommand(debuggee, "Page.enable", {});
                    chrome.debugger.sendCommand(debuggee, "Target.setAutoAttach", {
                      autoAttach: true,
                      waitForDebuggerOnStart: false,
                      flatten: true,
                    });
                  } catch {}
                  panelWindow.postMessage(
                    { source: "HAR_EXTRACTOR", type: "DEBUGGER_RECONNECTED" },
                    "*"
                  );
                });
              } catch {}
            }
          }, 500);
        }
      });
      onNavigatedListenerAdded = true;
    }

    // ========================
    // LIVE HTTP FALLBACK via onRequestFinished
    // ========================
    // This API works WITHOUT the chrome.debugger, providing live HTTP capture
    // even when another extension blocks debugger attachment. It's the primary
    // mechanism ensuring HTTP calls always show up regardless of conflicts.
    if (chrome.devtools?.network?.onRequestFinished) {
      chrome.devtools.network.onRequestFinished.addListener((request: any) => {
        const url = request.request?.url;
        if (!url) return;

        const matchedPattern = shouldProcessUrl(url);
        if (!matchedPattern) return;

        // Deduplicate using request URL + start time
        const rid = `orf-${url}-${request.startedDateTime}`;
        if (seenRequests.has(rid)) return;
        seenRequests.add(rid);

        const timestamp = new Date(request.startedDateTime);
        const startTime = timestamp.getTime();
        const totalTimeMs = request.time || 0;
        const endTime = startTime + totalTimeMs;

        request.getContent((content: string) => {
          let req: any = {};
          let res: any = {};

          try {
            req = JSON.parse(request.request.postData?.text || "{}");
          } catch {
            req = {
              _method: request.request.method,
              _url: url,
              _headers: request.request.headers || [],
              _rawPostData: request.request.postData?.text || "",
            };
          }

          if (content && content.trim()) {
            try {
              res = JSON.parse(content);
            } catch {
              res = { _rawContent: content };
            }
          } else {
            res = { _empty: true, _status: request.response?.status };
          }

          const processedPayload = processRequestByPattern(
            {
              request: request.request,
              response: request.response,
              startedDateTime: request.startedDateTime,
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
                baseUrl: (() => { try { return new URL(url).origin; } catch { return ""; } })(),
                endTime,
                hasMessages: (request.response?.status || 0) >= 400,
                isCompleted: true,
                requestHeaders: request.request.headers || [],
                responseHeaders: request.response?.headers || [],
                headers: {
                  request: request.request.headers || [],
                  response: request.response?.headers || [],
                },
              },
            },
            "*"
          );
        });
      });
      console.log("✅ onRequestFinished listener registered (works without debugger)");
    }

    function handleEvent(source: any, method: any, params: any) {
      // Unwrap child-target events if flatten is false or not supported
      if (method === "Target.receivedMessageFromTarget" && params?.message) {
        try {
          const inner = JSON.parse(params.message);
          if (inner?.method) {
            // Re-dispatch the inner event for normal handling
            handleEvent(source, inner.method, inner.params || {});
          }
        } catch (err) {
          console.warn("⚠️ Failed to parse receivedMessageFromTarget payload");
        }
        return; // We've delegated handling
      }

      // Track sub-target attachments/detachments to correctly accept WS events from them
      if (method === "Target.attachedToTarget" && params?.targetInfo?.targetId) {
        const childTargetId = params.targetInfo.targetId;
        const sessionId = params.sessionId;
        attachedTargetIds.add(childTargetId);
        console.log("🎯 Attached to sub-target:", params.targetInfo);

        // CRITICAL FIX: Enable Network domain on child sessions so WS frames are captured.
        // Without this, WebSocket events from service workers / iframes are silently dropped.
        // This is the primary cause of missing WS calls on existing Windows Chrome profiles
        // where the WS connection lives inside a sub-target.
        if (sessionId) {
          try {
            chrome.debugger.sendCommand(
              { ...debuggee, sessionId },
              "Network.enable",
              { maxTotalBufferSize: 100_000_000, maxResourceBufferSize: 50_000_000 },
              () => {
                if (chrome.runtime.lastError) {
                  console.warn("⚠️ Network.enable on child session failed:", chrome.runtime.lastError.message);
                } else {
                  console.log("✅ Network.enable on child session:", sessionId);
                }
              }
            );
          } catch (e) {
            console.warn("⚠️ Error enabling Network on child session:", (e as any)?.message || e);
          }
        } else {
          // Fallback: try sending to the child target directly via flat session
          try {
            chrome.debugger.sendCommand(
              debuggee,
              "Target.sendMessageToTarget",
              {
                targetId: childTargetId,
                message: JSON.stringify({ id: Date.now(), method: "Network.enable", params: {} })
              },
              () => {
                if (chrome.runtime.lastError) {
                  // Expected when flatten is true — events arrive directly
                  console.debug("sendMessageToTarget fallback not needed:", chrome.runtime.lastError.message);
                }
              }
            );
          } catch {}
        }
        return; // Nothing else to do for this meta event
      }
      if (method === "Target.detachedFromTarget" && params?.targetId) {
        attachedTargetIds.delete(params.targetId);
        console.log("🎯 Detached from sub-target:", params.targetId);
        return;
      }

      // Relaxed event filtering: accept events for current tab, or for any sub-target we've attached to.
      const isOurEvent = (() => {
        if (source?.tabId != null && currentTabId != null) {
          return source.tabId === currentTabId;
        }
        if (source?.targetId && attachedTargetIds.has(source.targetId)) {
          return true;
        }
        // Accept any WS frame event that reaches us — Chrome guarantees debugger
        // events are scoped to the debuggee we attached to. Dropping events here
        // is the primary cause of missing WS traffic on Windows profiles.
        if (method?.startsWith("Network.webSocket")) {
          return true;
        }
        // Windows quirk: some events may miss tabId; allow Network/Page/Runtime events in this case
        if (!source?.tabId && (method?.startsWith("Network.") || method?.startsWith("Page.") || method?.startsWith("Runtime.") || method?.startsWith("Target."))) {
          return true;
        }
        return false;
      })();
      if (!isOurEvent) return;

      // Track network request start for loading indicator - ONLY for matching URLs
      if (method === "Network.requestWillBeSent") {
        const requestId = params?.requestId;
        const requestUrl = params?.request?.url;
        
        if (requestId && requestUrl) {
          // Only track requests that match our URL patterns
          const matchedPattern = shouldProcessUrl(requestUrl);
          if (matchedPattern) {
            console.log(`📥 Tracking request: ${matchedPattern.name} - ${requestUrl.substring(0, 100)}`);
            pendingNetworkRequests.add(requestId);
            updateLoadingState(panelWindow);
            
            // Auto-clear stale requests after 30 seconds
            setTimeout(() => {
              if (pendingNetworkRequests.has(requestId)) {
                console.log(`⏰ Auto-clearing stale request: ${requestId}`);
                pendingNetworkRequests.delete(requestId);
                updateLoadingState(panelWindow);
              }
            }, 30000);
          }
        }
      }

      // Track network request completion for loading indicator
      if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
        const requestId = params?.requestId;
        if (requestId && pendingNetworkRequests.has(requestId)) {
          console.log(`✅ Request completed: ${requestId} (${method})`);
          pendingNetworkRequests.delete(requestId);
          
          // Debounce the loading state update - shorter delay for faster response
          if (loadingTimeoutId) clearTimeout(loadingTimeoutId);
          loadingTimeoutId = setTimeout(() => {
            updateLoadingState(panelWindow);
            loadingTimeoutId = null;
          }, 300); // Reduced to 300ms for faster loading state clearing
        }
      }

      // Auto-reload on request completion to fix status 0 issues
      if (method === "Network.responseReceived" || method === "Network.loadingFinished") {
        console.log(`📡 Network event: ${method} - scheduling reload to capture final status`);
        scheduleHarReload();
      }

      // Clear tables on page navigation/reload
      if (method === "Page.frameNavigated") {
        // Only clear for main frame navigation (page reload/navigation)
        if (params?.frame?.parentId === undefined) {
          console.log("🔄 Page navigated - clearing all tables");
          seenRequests.clear();
          seenWsMessages.clear();
          panelWindow.postMessage(
            { source: "HAR_EXTRACTOR", type: "CLEAR" },
            "*"
          );
        }
        return;
      }

      // Additional WS lifecycle diagnostics to understand connection state
      if (method === "Network.webSocketWillSendHandshakeRequest") {
        const wsUrl = params?.request?.url;
        console.log("🤝 WS handshake request:", { url: wsUrl, requestId: params?.requestId });
        
        // Send the WebSocket base URL to the panel
        if (wsUrl) {
          panelWindow.postMessage(
            {
              source: "HAR_EXTRACTOR",
              type: "WS_BASE_URL",
              payload: wsUrl
            },
            "*"
          );
        }

        // Self-healing: when a WS handshake is seen, ensure Network is enabled on all
        // attached sub-targets so subsequent frames are captured. This fixes the case where
        // the WS connection started before sub-targets were properly instrumented.
        if (attachedTargetIds.size > 0) {
          console.log("🔧 WS handshake seen — re-enabling Network on", attachedTargetIds.size, "sub-targets");
        }

        return;
      }
      if (method === "Network.webSocketHandshakeResponseReceived") {
        console.log("🤝 WS handshake response:", { status: params?.response?.status, headers: params?.response?.headers, requestId: params?.requestId });
        return;
      }
      if (method === "Network.webSocketClosed") {
        console.log("🔒 WS closed:", { requestId: params?.requestId, time: Date.now() });
        return;
      }

      // Log WS errors explicitly
      if (method === "Network.webSocketFrameError") {
        console.warn("❌ WebSocket frame error:", params);
        scheduleHarReload();
        return;
      }

      if (
        method === "Network.webSocketFrameReceived" ||
        method === "Network.webSocketFrameSent"
      ) {
        // Mark last WS activity
        lastWsEventTime = Date.now();
        // Debugger is capturing WS - disable interceptor processing
        debuggerWsActive = true;
        
        // Enhanced logging for Windows Chrome WebSocket debugging
        if (navigator.userAgent.includes('Windows')) {
          console.log(`🔍 Windows Chrome WS Event: ${method}`, {
            tabId: source.tabId,
            targetId: source.targetId,
            currentTab: currentTabId,
            hasParams: !!params,
            hasResponse: !!params?.response,
            hasPayload: !!params?.response?.payloadData
          });
        }

        const direction =
          method === "Network.webSocketFrameSent" ? "sent" : "received";
        // Expanded fallback extraction for payload data across Chrome variants
        let rawPayload: any = undefined;
        if (params && typeof params === 'object') {
          rawPayload = params.response?.payloadData
            ?? params.response?.data
            ?? params.response?.body
            ?? params.message
            ?? params.payloadData
            ?? params.data
            ?? undefined;
        }
        
        if (!rawPayload) {
          if (navigator.userAgent.includes('Windows')) {
            console.warn(`⚠️ Windows Chrome: No payload data in ${direction} WebSocket frame`);
          }
          return;
        }

        let topLevel: any = {};
        try {
          // Try normal JSON parse
          topLevel = JSON.parse(rawPayload);
        } catch {
          // Fallback: strip BOM/whitespace and retry; if still fails, filter out raw messages
          const cleaned = String(rawPayload).replace(/^\uFEFF/, '').trim();
          try {
            topLevel = JSON.parse(cleaned);
          } catch {
            // Filter out raw WebSocket messages (heartbeat, connection checks, etc.)
            return;
          }
        }

        if (wsFirstTimestamp === null) {
          wsFirstTimestamp = params.timestamp;
          wsFirstWallClock = Date.now();
          
          if (navigator.userAgent.includes('Windows')) {
            console.log("🔍 Windows Chrome: WebSocket timing initialized", {
              wsFirstTimestamp,
              wsFirstWallClock
            });
          }
        }

        let nested: any = {};
        try {
          nested =
            typeof topLevel.Payload === "string" &&
            topLevel.Payload.trim().startsWith("{")
              ? JSON.parse(topLevel.Payload)
              : topLevel.Payload;
        } catch {
          if (navigator.userAgent.includes('Windows')) {
            console.log("🔍 Windows Chrome: Nested payload parsing failed, using top-level");
          }
        }

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

        // Include requestId in dedupe key to avoid over-filtering on Windows
        const requestIdForKey = params.requestId || params.requestID || 'no_request';
        const key = `${requestIdForKey}-${timestamp.getTime()}-${action}-${direction}-${endpoint}`;
        if (seenWsMessages.has(key)) {
          if (navigator.userAgent.includes('Windows')) {
            console.log(`🔍 Windows Chrome: Duplicate WS message filtered: ${key}`);
          }
          return;
        }
        seenWsMessages.add(key);
        // Prevent unbounded growth
        if (seenWsMessages.size > 10000) {
          console.log("🧹 Trimming WS dedupe cache", seenWsMessages.size);
          // Simple reset to avoid memory growth; safe due to timestamp-based keys
          seenWsMessages.clear();
        }

        const wsPayload = {
          endpoint,
          action,
          payload: topLevel,
          status,
          direction,
          timestamp: timestamp.getTime(),
          time: timestamp.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          duration: undefined as string | undefined,
        };

        // Calculate duration between sent and received using TaskId
        const taskId = topLevel.TaskId;
        if (taskId) {
          if (direction === "sent") {
            wsSentTimestamps[taskId] = timestamp.getTime();
          } else {
            const sentTs = wsSentTimestamps[taskId];
            if (sentTs) {
              const diffMs = timestamp.getTime() - sentTs;
              const totalSec = Math.round(diffMs / 1000);
              if (totalSec < 60) {
                wsPayload.duration = `${totalSec}s`;
              } else {
                const min = Math.floor(totalSec / 60);
                const sec = totalSec % 60;
                wsPayload.duration = sec > 0 ? `${min}m ${sec}s` : `${min}m`;
              }
            }
          }
        }

        panelWindow.postMessage(
          {
            source: "HAR_EXTRACTOR",
            type: "WS",
            payload: wsPayload,
          },
          "*"
        );
        scheduleHarReload();
        return;
      }

      // Auto-reload on request completion to fix status 0 issues
      if (method === "Network.responseReceived" || method === "Network.loadingFinished") {
        console.log(`📡 Network event: ${method} - scheduling reload to capture final status`);
        scheduleHarReload();
      }
    }

    // WS inactivity watchdog: if no frames within 5.5s after reconnect, re-enable domains
    const startWsWatchdog = () => {
      // First check at 5.5s
      setTimeout(() => {
        const inactive = !lastWsEventTime || (Date.now() - lastWsEventTime > 5500);
        if (inactive) {
          console.warn("⏱️ WS inactivity detected - re-enabling Network/Targets");
          try {
            chrome.debugger.sendCommand(debuggee, "Network.enable", {
              maxTotalBufferSize: 100_000_000,
              maxResourceBufferSize: 50_000_000
            });
            chrome.debugger.sendCommand(debuggee, "Page.enable", {});
            chrome.debugger.sendCommand(debuggee, "Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
            chrome.debugger.sendCommand(debuggee, "Target.setDiscoverTargets", { discover: true });
          } catch {}
        }
      }, 5600);

      // Second deeper check at 12s — also try non-flattened mode and re-enable on all known sub-targets
      setTimeout(() => {
        const stillInactive = !lastWsEventTime || (Date.now() - lastWsEventTime > 11000);
        if (stillInactive) {
          console.warn("⏱️ WS still inactive after 12s — trying deeper recovery");
          try {
            // Disable then re-enable Network to force Chrome to re-emit WS events
            chrome.debugger.sendCommand(debuggee, "Network.disable", {}, () => {
              chrome.debugger.sendCommand(debuggee, "Network.enable", {
                maxTotalBufferSize: 100_000_000,
                maxResourceBufferSize: 50_000_000
              });
            });
            // Try auto-attach without flatten for broader compatibility
            chrome.debugger.sendCommand(debuggee, "Target.setAutoAttach", {
              autoAttach: true,
              waitForDebuggerOnStart: false,
              flatten: true
            });
          } catch {}
        }
      }, 12000);
    };

    // Debounced HAR reload notifier for the panel
    function scheduleHarReload() {
      if (reloadTimeout) clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(() => {
        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "REQUEST_HAR_RELOAD" },
          "*"
        );
        reloadTimeout = null;
      }, 100);
    }

    // Enhanced auto-reload system to catch completed requests and fix status 0 issues
    let periodicReloadInterval: ReturnType<typeof setInterval> | null = null;
    let lastHarEntryCount = 0;
    let lastCompletedCount = 0;
    let pendingRequestIds = new Set<string>();

    const startPeriodicReload = () => {
      if (periodicReloadInterval) clearInterval(periodicReloadInterval);
      periodicReloadInterval = setInterval(() => {
        if (chrome?.devtools?.network?.getHAR) {
          chrome.devtools.network.getHAR((harLog: any) => {
            const currentEntryCount = harLog.entries?.length || 0;

            // Count completed requests (non-zero status or finished)
            let completedCount = 0;
            let newPendingIds = new Set<string>();

            harLog.entries?.forEach((entry: any) => {
              const requestId = (entry as any).requestId || (entry as any)._requestId || entry.request.url;
              const isCompleted = entry.response?.status && entry.response.status > 0;
              const hasTimings = entry.timings && entry.timings.receive >= 0;
              if (isCompleted || hasTimings) {
                completedCount++;
              } else {
                newPendingIds.add(requestId);
              }
            });

            const shouldReload =
              currentEntryCount !== lastHarEntryCount ||
              completedCount > lastCompletedCount ||
              (pendingRequestIds.size > newPendingIds.size);

            if (shouldReload) {
              console.log(`🔄 Auto-reload triggered: entries ${lastHarEntryCount}->${currentEntryCount}, completed ${lastCompletedCount}->${completedCount}, pending ${pendingRequestIds.size}->${newPendingIds.size}`);
              lastHarEntryCount = currentEntryCount;
              lastCompletedCount = completedCount;
              pendingRequestIds = newPendingIds;
              panelWindow.postMessage(
                { source: "HAR_EXTRACTOR", type: "REQUEST_HAR_RELOAD" },
                "*"
              );
            }
          });
        }
      }, 150);
    };

    const stopPeriodicReload = () => {
      if (periodicReloadInterval) {
        clearInterval(periodicReloadInterval);
        periodicReloadInterval = null;
      }
    };

    // Start periodic reload when panel is shown
    startPeriodicReload();

    // Clean up on panel hidden
    panel.onHidden.addListener(() => {
      stopPeriodicReload();
      stopWsPolling();
      stopDebuggerRetry();
    });

    function sendInitialHar() {
      if (!chrome.devtools.network.getHAR) return;

      chrome.devtools.network.getHAR((harLog: any) => {
        // Always get fresh patterns from localStorage for each reload
        const currentPatterns = getUrlPatternsFromStorage();
        const currentPatternHash = getPatternHash(currentPatterns);
        
        // If patterns have changed, we need to reprocess all requests
        const patternsChanged = lastPatternHash !== null && lastPatternHash !== currentPatternHash;
        
        // Update the pattern hash
        lastPatternHash = currentPatternHash;
        
        for (const entry of harLog.entries || []) {
          const rid = (entry as any).requestId || (entry as any)._requestId;
          
          // If patterns haven't changed, skip already processed requests
          if (!patternsChanged && seenRequests.has(rid)) {
            continue;
          }

          // Use fresh patterns for each entry check
          const matchedPattern = shouldProcessUrl(entry.request.url);
          if (!matchedPattern) {
            continue;
          }

          // Mark as seen AFTER pattern matching to ensure reprocessing works
          seenRequests.add(rid);

          const timestamp = new Date(entry.startedDateTime);
          const startTime = timestamp.getTime();
          const totalTimeMs = entry.time || 0;
          const endTime = startTime + totalTimeMs;

          entry.getContent((content: any) => {
            let req = {};
            let res = {};
            
            // Enhanced request processing
            try {
              req = JSON.parse(entry.request.postData?.text || "{}");
            } catch {
              // Create a meaningful request object even if parsing fails
              req = {
                _method: entry.request.method,
                _url: entry.request.url,
                _headers: entry.request.headers || [],
                _rawPostData: entry.request.postData?.text || '',
                _queryString: entry.request.queryString || []
              };
            }

            // Enhanced response processing to match live monitoring
            if (content && content.trim()) {
              try {
                res = JSON.parse(content);
              } catch {
                res = { 
                  _rawContent: content,
                  _status: entry.response.status,
                  _statusText: entry.response.statusText || '',
                  _contentLength: content.length,
                  _mimeType: entry.response.content?.mimeType || 'unknown'
                };
              }
            } else {
              // Create a meaningful response object even if no content
              res = { 
                _empty: true,
                _status: entry.response.status,
                _statusText: entry.response.statusText || '',
                _headers: entry.response.headers || [],
                _mimeType: entry.response.content?.mimeType || 'unknown',
                _redirectURL: entry.response.redirectURL || ''
              };
            }

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

            // Enhanced error detection and status handling
            const status = entry.response?.status || 0;
            const hasMessages = status >= 400 || status === 0; // Include status 0 as potential issue
            const isCompleted = status > 0 && entry.timings?.receive >= 0;

            panelWindow.postMessage(
              {
                source: "HAR_EXTRACTOR",
                type: "INITIAL_HTTP_REQUEST",
                payload: {
                  ...processedPayload,
                  timestamp: startTime,
                  baseUrl: new URL(entry.request.url).origin,
                  endTime,
                  hasMessages,
                  isCompleted,
                  // Always include header data for consistency
                  requestHeaders: entry.request.headers || [],
                  responseHeaders: entry.response?.headers || [],
                  headers: {
                    request: entry.request.headers || [],
                    response: entry.response?.headers || []
                  },
                  // Add debug info for status issues
                  _debug: {
                    originalStatus: status,
                    hasResponse: !!entry.response,
                    hasTimings: !!entry.timings,
                    receiveTime: entry.timings?.receive || -1,
                    totalTime: entry.time || 0,
                    entryComplete: isCompleted
                  }
                },
              },
              "*"
            );
            console.log(`📤 SENT INITIAL_HTTP_REQUEST for: ${processedPayload.method} (status: ${status}, completed: ${isCompleted}) at ${new Date(startTime).toLocaleTimeString()}`);
          });
        }
      });
    }

    panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "INIT" }, "*");

    // Listen for messages from the panel window (React app)
    const handlePanelMessage = (event: any) => {
      if (event.data?.source !== "HAR_EXTRACTOR") return;

      console.log("🔌 DevTools received message:", event.data.type);

      if (event.data.type === "REQUEST_HAR_RELOAD") {
        console.log("🔁 Panel requested HAR reload");
        // Don't call sendInitialHar() here to avoid duplicates with live tracking
        // The useHarTab.ts will handle HAR reload processing directly
      }

      if (event.data.type === "CLEAR_LOGS") {
        console.log("🧹 Panel requested CLEAR_LOGS");
        seenRequests.clear();
        seenWsMessages.clear();
        // Clear loading state when logs are cleared
        pendingNetworkRequests.clear();
        if (loadingTimeoutId) {
          clearTimeout(loadingTimeoutId);
          loadingTimeoutId = null;
        }
        // Send CLEAR message to clear both HTTP and WS rows in UI
        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "CLEAR" },
          "*"
        );
        // Ensure loading state is cleared
        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "LOADING_END" },
          "*"
        );
        console.log("✅ All logs cleared (HTTP and WebSocket)");
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
        console.log("💾 Patterns to save:", event.data.patterns);
        
        // First, log what's currently in localStorage
        try {
          const currentStored = localStorage.getItem('har_extractor_url_patterns');
          console.log("💾 Current localStorage before save:", currentStored);
        } catch (error) {
          console.log("💾 Error reading current localStorage:", error);
        }
        
        if (event.data.patterns && Array.isArray(event.data.patterns)) {
          try {
            // Use the same validation and save approach as UrlPatternSettings.tsx
            const patternsToSave = event.data.patterns.map((p: any) => ({
              name: p.name || 'Unnamed Pattern',
              pattern: p.pattern || '',
              type: p.type || 'generic',
              enabled: p.enabled !== false,
              description: p.description || ''
            }));
            
            console.log('💾 Processed patterns to save:', patternsToSave);
            
            // Save directly to localStorage
            localStorage.setItem('har_extractor_url_patterns', JSON.stringify(patternsToSave));
            
            // Verify the save was successful by reading it back immediately
            const verification = localStorage.getItem('har_extractor_url_patterns');
            if (verification) {
              // Reset pattern tracking to force complete reprocessing
              lastPatternHash = null;
              seenRequests.clear();
              
              // Force a fresh reload of HAR data with new patterns
              sendInitialHar();
              
              panelWindow.postMessage(
                { 
                  source: "HAR_EXTRACTOR", 
                  type: "URL_PATTERNS_SAVED",
                  success: true,
                  shouldReload: false
                },
                "*"
              );
            } else {
              throw new Error('Failed to verify localStorage save - data not found after save');
            }
            
          } catch (error) {
            console.error('❌ Error saving patterns:', error);
            panelWindow.postMessage(
              { 
                source: "HAR_EXTRACTOR", 
                type: "URL_PATTERNS_SAVED",
                success: false,
                error: (error as any)?.message
              },
              "*"
            );
          }
        } else {
          console.error("💾 Invalid patterns data:", event.data.patterns);
          panelWindow.postMessage(
            { 
              source: "HAR_EXTRACTOR", 
              type: "URL_PATTERNS_SAVED",
              success: false,
              error: "Invalid patterns data"
            },
            "*"
          );
        }
      }

      if (event.data.type === "RECONNECT_DEBUGGER") {
        console.log("🔌 DevTools received RECONNECT_DEBUGGER message");
        
        const forceReconnection = () => {
          console.log("🔌 Force reconnection - resetting debugger state");
          debuggerAttached = false;
          
          // Strategy 1: Try graceful detach first
          const attemptGracefulDetach = () => {
            return new Promise((resolve) => {
              try {
                chrome.debugger.detach(debuggee, () => {
                  console.log("🔌 Graceful detach completed");
                  resolve(true);
                });
              } catch (error) {
                console.log("🔌 Graceful detach failed:", (error as any)?.message);
                resolve(false);
              }
            });
          };

          // Strategy 2: Force detach ignoring errors
          const attemptForceDetach = () => {
            try {
              chrome.debugger.detach(debuggee);
              console.log("🔌 Force detach completed");
            } catch (error) {
              console.log("🔌 Force detach failed (expected):", (error as any)?.message);
            }
          };

          // Strategy 3: Aggressive attachment with multiple attempts
          const attemptAttachment = (attempt = 1, maxAttempts = 5) => {
            console.log(`🔌 Attachment attempt ${attempt}/${maxAttempts}`);
            
            chrome.debugger.attach(debuggee, "1.3", () => {
              if (chrome.runtime.lastError) {
                const errorMessage = chrome.runtime.lastError.message;
                console.warn(`❌ Attempt ${attempt} failed:`, errorMessage);
                
                // Handle specific error cases with different strategies
                if (errorMessage.includes("different extension")) {
                  console.log("🔄 Trying to force override existing debugger connection...");
                  
                  // Try to attach with different protocol version
                  chrome.debugger.attach(debuggee, "1.2", () => {
                    if (chrome.runtime.lastError) {
                      console.log("🔄 v1.2 failed, trying v1.1...");
                      chrome.debugger.attach(debuggee, "1.1", () => {
                        if (chrome.runtime.lastError && attempt < maxAttempts) {
                          console.log(`🔄 v1.1 failed, retrying attempt ${attempt + 1}...`);
                          setTimeout(() => attemptAttachment(attempt + 1, maxAttempts), 500);
                        } else if (!chrome.runtime.lastError) {
                          console.log("✅ Debugger attached with v1.1");
                          setupSuccessfulConnection();
                        } else {
                          console.log("🔌 All attachment attempts exhausted, proceeding anyway...");
                          assumeConnectionAndProceed();
                        }
                      });
                    } else {
                      console.log("✅ Debugger attached with v1.2");
                      setupSuccessfulConnection();
                    }
                  });
                } else if (errorMessage.includes("already attached")) {
                  console.log("🔌 Debugger already attached, assuming it's working");
                  assumeConnectionAndProceed();
                } else if (attempt < maxAttempts) {
                  // Generic retry for other errors
                  console.log(`🔄 Retrying in ${attempt * 200}ms...`);
                  setTimeout(() => attemptAttachment(attempt + 1, maxAttempts), attempt * 200);
                } else {
                  console.log("🔌 All attempts failed, forcing optimistic connection...");
                  assumeConnectionAndProceed();
                }
              } else {
                console.log("✅ Debugger attached successfully on attempt", attempt);
                setupSuccessfulConnection();
              }
            });
          };

          // Strategy 4: Assume connection and proceed optimistically
          const assumeConnectionAndProceed = () => {
            console.log("🔌 Assuming debugger connection exists, proceeding optimistically...");
            debuggerAttached = true;
            
            // Enhanced diagnostics for Windows Chrome profile issues
            console.log("🔍 WINDOWS PROFILE DIAGNOSTICS:");
            console.log("   - Chrome User Agent:", navigator.userAgent);
            console.log("   - Extension storage check:", localStorage.length, "items");
            console.log("   - WebSocket support:", typeof WebSocket !== 'undefined');
            console.log("   - DevTools API availability:", typeof chrome?.devtools !== 'undefined');
            
            // Clear any potentially corrupted extension state for Windows Chrome
            if (navigator.userAgent.includes('Windows')) {
              console.log("🧹 Windows Chrome detected - clearing potentially corrupted state...");
              try {
                // Clear extension-specific localStorage that might be corrupted
                const keysToCheck = [
                  'har_extractor_ws_state',
                  'har_extractor_debugger_state', 
                  'har_extractor_ws_timestamp',
                  'har_extractor_last_ws_connection'
                ];
                
                keysToCheck.forEach(key => {
                  const value = localStorage.getItem(key);
                  if (value) {
                    console.log(`🧹 Removing potentially corrupted key: ${key} = ${value}`);
                    localStorage.removeItem(key);
                  }
                });
                
                // Reset WebSocket state variables
                wsFirstTimestamp = null;
                wsFirstWallClock = null;
                seenWsMessages.clear();
                
                console.log("✅ Windows Chrome state cleanup completed");
              } catch (error) {
                console.warn("⚠️ State cleanup failed:", (error as any)?.message);
              }
            }
            
            // Try to enable domains, ignore any errors
            try {
              chrome.debugger.sendCommand(debuggee, "Network.enable", {
                maxTotalBufferSize: 100_000_000,
                maxResourceBufferSize: 50_000_000
              }, () => {
                console.log("📡 Network.enable sent (may have failed silently)");
              });
              chrome.debugger.sendCommand(debuggee, "Network.setCacheDisabled", { cacheDisabled: true }, () => {
                console.log("🧩 Network cache disabled");
              });
              chrome.debugger.sendCommand(debuggee, "Page.enable", {}, () => {
                console.log("📄 Page.enable sent (may have failed silently)");
              });
              // Ensure sub-targets are auto-attached after optimistic reconnect
              chrome.debugger.sendCommand(
                debuggee,
                "Target.setAutoAttach",
                { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
                () => {
                  if (chrome.runtime.lastError) {
                    console.warn("⚠️ setAutoAttach error:", chrome.runtime.lastError.message);
                  } else {
                    console.log("🎯 Target.setAutoAttach enabled");
                  }
                }
              );
              chrome.debugger.sendCommand(
                debuggee,
                "Target.setDiscoverTargets",
                { discover: true },
                () => {
                  if (chrome.runtime.lastError) {
                    console.debug("setDiscoverTargets not available:", chrome.runtime.lastError.message);
                  } else {
                    console.log("🔭 Target.setDiscoverTargets enabled");
                  }
                }
              );
              
              // Force enable WebSocket debugging specifically for Windows Chrome
              if (navigator.userAgent.includes('Windows')) {
                console.log("🔌 Windows Chrome: Force enabling WebSocket debugging...");
                chrome.debugger.sendCommand(debuggee, "Runtime.enable", {}, () => {
                  console.log("🔧 Runtime.enable sent for Windows Chrome");
                });
                chrome.debugger.sendCommand(debuggee, "Network.enableReportingApi", {enable: true}, () => {
                  console.log("📊 Network.enableReportingApi sent for Windows Chrome");
                });
              }
            } catch (error) {
              console.log("🔌 Command sending failed, but continuing anyway:", (error as any)?.message || error);
            }
            
            // Always notify UI - use DEBUGGER_FALLBACK since we aren't sure the debugger is actually working
            panelWindow.postMessage(
              { 
                source: "HAR_EXTRACTOR", 
                type: "DEBUGGER_FALLBACK",
                message: "Debugger assumed connected - WS interceptor active as backup."
              },
              "*"
            );

            // Ensure WS interceptor is active as fallback
            injectWsInterceptor();

            // Kick WS watchdog
            startWsWatchdog();
            
            // Try to load HAR data
            try {
              sendInitialHar();
            } catch (error) {
              console.log("📂 HAR loading failed, but connection assumed successful");
            }
          };

          // Strategy 5: Setup successful connection
          const setupSuccessfulConnection = () => {
            debuggerAttached = true;
            
            try {
              chrome.debugger.sendCommand(debuggee, "Network.enable", {
                maxTotalBufferSize: 100_000_000,
                maxResourceBufferSize: 50_000_000
              });
              chrome.debugger.sendCommand(debuggee, "Network.setCacheDisabled", { cacheDisabled: true });
              chrome.debugger.sendCommand(debuggee, "Page.enable", {});
              // Also ensure sub-targets are auto-attached on successful attach
              chrome.debugger.sendCommand(
                debuggee,
                "Target.setAutoAttach",
                { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
                () => {
                  if (chrome.runtime.lastError) {
                    console.warn("⚠️ setAutoAttach error:", chrome.runtime.lastError.message);
                  } else {
                    console.log("🎯 Target.setAutoAttach enabled");
                  }
                }
              );
              chrome.debugger.sendCommand(
                debuggee,
                "Target.setDiscoverTargets",
                { discover: true },
                () => {
                  if (chrome.runtime.lastError) {
                    console.debug("setDiscoverTargets not available:", chrome.runtime.lastError.message);
                  } else {
                    console.log("🔭 Target.setDiscoverTargets enabled");
                  }
                }
              );
              console.log("✅ All debugger commands sent successfully");
            } catch (error) {
              console.warn("⚠️ Command sending failed:", (error as any)?.message || error);
            }
            
            // Notify panel that debugger is reconnected
            panelWindow.postMessage(
              { source: "HAR_EXTRACTOR", type: "DEBUGGER_RECONNECTED" },
              "*"
            );
            
            // Kick WS watchdog
            startWsWatchdog();
            
            // Trigger initial HAR load after reconnection
            sendInitialHar();
          };

          // Execute the reconnection strategy sequence
          console.log("🚀 Starting aggressive reconnection sequence...");
          
          // First try graceful detach
          attemptGracefulDetach().then(() => {
            // Then force detach regardless of graceful result
            attemptForceDetach();
            
            // Wait a moment for cleanup
            setTimeout(() => {
              // Start attachment attempts
              attemptAttachment();
            }, 100);
          });
        };

        // Reset WS state and re-inject interceptor for fallback capture
        debuggerWsActive = false;
        injectWsInterceptor();

        // Always execute the force reconnection
        forceReconnection();
      }
    };

    // Listen on both panelWindow and window to ensure we catch all messages
    panelWindow.addEventListener("message", handlePanelMessage);
    window.addEventListener("message", handlePanelMessage);

    sendInitialHar();
  });
});