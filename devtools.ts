// devtools.ts - Fully stable with WS reliability and panel re-entry safety + Configurable URL patterns

const seenRequests = new Set<string>();
const seenWsMessages = new Set<string>();
// Track sent WS timestamps by TaskId for duration calculation
const wsSentTimestamps: Record<string, number> = {};
// Track WS connection URL per requestId so generic (non-Conga) messages can show it
const wsUrlsByRequestId: Record<string, string> = {};
// Latest WS connection URL seen (used as fallback for generic messages)
let latestWsBaseUrl: string | null = null;
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
// CDP HELPER: Enable Network with Durable Messages
// ========================
// Calls Network.enable + Network.configureDurableMessages so response bodies
// survive cross-process SPA navigations (common in Salesforce/CPQ apps).
function enableNetworkDomain(target: any, callback?: () => void) {
  chrome.debugger.sendCommand(target, "Network.enable", {
    maxTotalBufferSize: 100_000_000,
    maxResourceBufferSize: 50_000_000,
  }, () => {
    if (chrome.runtime.lastError) {
      console.log("⚠️ Network.enable failed:", chrome.runtime.lastError.message);
    }
    // Configure durable messages to preserve response bodies across navigations
    try {
      chrome.debugger.sendCommand(target, "Network.configureDurableMessages", {
        maxTotalBufferSize: 100_000_000,
        maxResourceBufferSize: 50_000_000,
      }, () => {
        if (chrome.runtime.lastError) {
          // Older Chrome versions don't support this — safe to ignore
          console.debug("Network.configureDurableMessages not available:", chrome.runtime.lastError.message);
        } else {
          console.log("✅ Network.configureDurableMessages enabled");
        }
        if (callback) callback();
      });
    } catch {
      if (callback) callback();
    }
  });
}

// ========================
// MCP THIRD-PARTY TOOLS
// ========================
// Registers Conga Debugger data as MCP tools via the Chrome DevTools MCP server.
// When the MCP server dispatches a 'devtoolstooldiscovery' event, our injected
// script responds with tools that let AI agents query captured HTTP/WS data.
// Requires --categoryExperimentalThirdParty=true on the MCP server.
const MCP_TOOLS_SCRIPT = `
(function() {
  if (window.__CONGA_MCP_REGISTERED__) return 'already_registered';
  window.__CONGA_MCP_REGISTERED__ = true;

  // Shared data store populated by the extension via postMessage
  if (!window.__CONGA_CAPTURED_DATA__) {
    window.__CONGA_CAPTURED_DATA__ = { httpRequests: [], wsMessages: [], sseEvents: [] };
  }
  var store = window.__CONGA_CAPTURED_DATA__;

  // Listen for data pushed from the extension's devtools script
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.source !== 'CONGA_MCP_DATA') return;
    var type = event.data.type;
    var payload = event.data.payload;
    if (type === 'HTTP') {
      store.httpRequests.push(payload);
      if (store.httpRequests.length > 5000) store.httpRequests = store.httpRequests.slice(-3000);
    } else if (type === 'WS') {
      store.wsMessages.push(payload);
      if (store.wsMessages.length > 10000) store.wsMessages = store.wsMessages.slice(-5000);
    } else if (type === 'SSE') {
      store.sseEvents.push(payload);
      if (store.sseEvents.length > 5000) store.sseEvents = store.sseEvents.slice(-3000);
    } else if (type === 'CLEAR') {
      store.httpRequests = [];
      store.wsMessages = [];
      store.sseEvents = [];
    }
  });

  // Register MCP tools when the DevTools MCP server discovers tools
  window.addEventListener('devtoolstooldiscovery', function(event) {
    if (typeof event.respondWith !== 'function') return;

    event.respondWith({
      name: 'Conga CPQ Debugger',
      description: 'Provides captured Conga CPQ network traffic, WebSocket messages, and SSE events for debugging',
      tools: [
        {
          name: 'get_captured_http_requests',
          description: 'Returns captured HTTP/API requests with optional filtering by URL pattern, status code, or method',
          inputSchema: {
            type: 'object',
            properties: {
              urlFilter: { type: 'string', description: 'Filter requests by URL substring (case-insensitive)' },
              statusFilter: { type: 'number', description: 'Filter by exact HTTP status code' },
              methodFilter: { type: 'string', description: 'Filter by HTTP method (GET, POST, etc.)' },
              failedOnly: { type: 'boolean', description: 'If true, return only failed requests (status >= 400 or 0)' },
              limit: { type: 'number', description: 'Max number of results (default 50)' }
            }
          },
          execute: function(args) {
            var results = store.httpRequests;
            if (args.urlFilter) {
              var f = args.urlFilter.toLowerCase();
              results = results.filter(function(r) { return (r.url || r.endpoint || '').toLowerCase().includes(f); });
            }
            if (args.statusFilter !== undefined) {
              results = results.filter(function(r) { return r.status === args.statusFilter; });
            }
            if (args.methodFilter) {
              var m = args.methodFilter.toUpperCase();
              results = results.filter(function(r) { return (r.httpMethod || '').toUpperCase() === m; });
            }
            if (args.failedOnly) {
              results = results.filter(function(r) { return r.status >= 400 || r.status === 0; });
            }
            var limit = args.limit || 50;
            return { total: results.length, requests: results.slice(-limit) };
          }
        },
        {
          name: 'get_captured_ws_messages',
          description: 'Returns captured WebSocket messages with optional filtering by endpoint, action, or direction',
          inputSchema: {
            type: 'object',
            properties: {
              endpointFilter: { type: 'string', description: 'Filter by endpoint/TaskId substring' },
              actionFilter: { type: 'string', description: 'Filter by action name substring' },
              direction: { type: 'string', description: 'Filter by direction: sent or received' },
              limit: { type: 'number', description: 'Max number of results (default 100)' }
            }
          },
          execute: function(args) {
            var results = store.wsMessages;
            if (args.endpointFilter) {
              var f = args.endpointFilter.toLowerCase();
              results = results.filter(function(m) { return (m.endpoint || '').toLowerCase().includes(f); });
            }
            if (args.actionFilter) {
              var f2 = args.actionFilter.toLowerCase();
              results = results.filter(function(m) { return (m.action || '').toLowerCase().includes(f2); });
            }
            if (args.direction) {
              results = results.filter(function(m) { return m.direction === args.direction; });
            }
            var limit = args.limit || 100;
            return { total: results.length, messages: results.slice(-limit) };
          }
        },
        {
          name: 'get_failed_requests',
          description: 'Returns all failed HTTP requests (status >= 400 or status 0) and WebSocket errors',
          inputSchema: { type: 'object', properties: {} },
          execute: function() {
            var failedHttp = store.httpRequests.filter(function(r) { return r.status >= 400 || r.status === 0; });
            var failedWs = store.wsMessages.filter(function(m) {
              return (m.status && m.status >= 400) || (m.payload && m.payload.StatusCode && m.payload.StatusCode >= 400);
            });
            return { failedHttp: failedHttp, failedWs: failedWs, totalFailed: failedHttp.length + failedWs.length };
          }
        },
        {
          name: 'get_request_timeline',
          description: 'Returns a chronological timeline of all captured HTTP and WS events, useful for understanding request ordering',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Max events to return (default 100)' }
            }
          },
          execute: function(args) {
            var limit = args.limit || 100;
            var timeline = [];
            store.httpRequests.forEach(function(r) {
              timeline.push({ type: 'HTTP', timestamp: r.timestamp, endpoint: r.endpoint || r.url, method: r.httpMethod, status: r.status, duration: r.endTime ? (r.endTime - r.timestamp) + 'ms' : undefined });
            });
            store.wsMessages.forEach(function(m) {
              timeline.push({ type: 'WS', timestamp: m.timestamp, endpoint: m.endpoint, action: m.action, direction: m.direction, status: m.status, duration: m.duration });
            });
            timeline.sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
            return { total: timeline.length, events: timeline.slice(-limit) };
          }
        },
        {
          name: 'search_requests',
          description: 'Full-text search across all captured request and response data',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search term to look for in request/response payloads' }
            },
            required: ['query']
          },
          execute: function(args) {
            var q = (args.query || '').toLowerCase();
            if (!q) return { results: [] };
            var results = [];
            store.httpRequests.forEach(function(r) {
              var str = JSON.stringify(r).toLowerCase();
              if (str.includes(q)) {
                results.push({ type: 'HTTP', endpoint: r.endpoint || r.url, status: r.status, timestamp: r.timestamp });
              }
            });
            store.wsMessages.forEach(function(m) {
              var str = JSON.stringify(m).toLowerCase();
              if (str.includes(q)) {
                results.push({ type: 'WS', endpoint: m.endpoint, action: m.action, direction: m.direction, timestamp: m.timestamp });
              }
            });
            return { total: results.length, results: results.slice(0, 50) };
          }
        }
      ]
    });
  });

  return 'registered';
})();
`;

function injectMcpTools() {
  chrome.devtools.inspectedWindow.eval(MCP_TOOLS_SCRIPT, (result: any, isException: any) => {
    if (isException) {
      console.log("⚠️ MCP tools injection failed:", isException);
    } else {
      console.log("🤖 MCP tools:", result);
    }
  });
}

// Forward captured data to the page-level MCP store
function pushToMcpStore(panelWindow: any, type: string, payload: any) {
  chrome.devtools.inspectedWindow.eval(
    `window.postMessage({ source: 'CONGA_MCP_DATA', type: ${JSON.stringify(type)}, payload: ${JSON.stringify(payload)} }, '*')`,
    () => {} // fire-and-forget
  );
}

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

// Lazy debugger attach callback — set by the panel.onShown handler.
// The WS interceptor calls this when it first detects WebSocket traffic,
// so the debugger (and the "debugging" bar) only appears for WS users.
let lazyAttachDebuggerFn: (() => void) | null = null;

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
      console.log("⚠️ WS interceptor injection failed:", isException);
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
          console.log("⚠️ Error processing interceptor WS messages:", e);
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
          enableNetworkDomain(debuggee);
          chrome.debugger.sendCommand(debuggee, "Network.setCacheDisabled", { cacheDisabled: true });
          chrome.debugger.sendCommand(debuggee, "Page.enable", {});
          chrome.debugger.sendCommand(debuggee, "Target.setAutoAttach", {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: true,
          });
        } catch (e) {
          console.log("⚠️ Auto-retry: error enabling domains:", (e as any)?.message || e);
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
    if (msg.url) latestWsBaseUrl = msg.url;
    // Do NOT attach the debugger here — the interceptor captures WS messages
    // on its own. Attaching the debugger shows Chrome's "debugging this browser"
    // bar which annoys users who don't need it.
    return;
  }
  if (msg.direction !== 'sent' && msg.direction !== 'received') return;

  const rawPayload = msg.data;
  if (!rawPayload) return;

  let topLevel: any = {};
  let isRawMessage = false;
  try {
    topLevel = JSON.parse(rawPayload);
  } catch {
    const cleaned = String(rawPayload).replace(/^\uFEFF/, '').trim();
    try {
      topLevel = JSON.parse(cleaned);
    } catch {
      // Non-JSON message — treat as generic raw WS payload.
      isRawMessage = true;
      topLevel = { _raw: String(rawPayload).slice(0, 5000) };
    }
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

  // Detect Conga envelope
  const isCongaEnvelope = !isRawMessage && (
    topLevel.EndPoint !== undefined ||
    topLevel.TaskId !== undefined ||
    topLevel.Action !== undefined ||
    nested?.Action !== undefined
  );

  const action = isCongaEnvelope
    ? (nested?.Action || topLevel?.Action || "").toLowerCase()
    : msg.direction;
  if (isCongaEnvelope && action === "heartbeat") return;

  const endpoint = isCongaEnvelope
    ? (topLevel.EndPoint || (topLevel.TaskId ? `TaskId: ${topLevel.TaskId}` : "(unknown)"))
    : (() => {
        const connUrl = msg.url || latestWsBaseUrl;
        if (connUrl) {
          // Broadcast so the header shows the URL even on pre-existing connections
          panelWindow.postMessage(
            { source: "HAR_EXTRACTOR", type: "WS_BASE_URL", payload: connUrl },
            "*"
          );
          try {
            const u = new URL(connUrl);
            return u.pathname || connUrl;
          } catch { return connUrl; }
        }
        return "(message)";
      })();
  const status = isCongaEnvelope ? (topLevel.StatusCode ?? 200) : 200;
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
        // Sanity check: ignore negative or absurdly large durations
        // (can happen when sent/received come from different capture paths)
        if (diffMs >= 0 && diffMs < 3600000) {
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
  }

  const wsPayloadForInterceptor = {
    endpoint,
    action,
    payload: topLevel,
    status,
    direction: msg.direction,
    timestamp: msg.timestamp,
    time: timestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    duration,
  };

  panelWindow.postMessage({
    source: "HAR_EXTRACTOR",
    type: "WS",
    payload: wsPayloadForInterceptor,
  }, "*");
  // Push to MCP store for AI agent access
  pushToMcpStore(panelWindow, 'WS', wsPayloadForInterceptor);
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
      console.log('⚠️ Invalid or corrupted localStorage data detected - using defaults');
    }
  } catch (error) {
    console.log('⚠️ getUrlPatternsFromStorage: Error reading patterns:', error);
    console.log('⚠️ Falling back to default patterns');
  }
  
  // Only set defaults if localStorage key doesn't exist at all (first time)
  const defaults = getDefaultUrlPatterns();
  
  // Double-check that we're not overwriting existing data
  try {
    const doubleCheck = localStorage.getItem('har_extractor_url_patterns');
    if (doubleCheck !== null) {
      console.log('⚠️ Race condition detected - localStorage was set between reads, not overwriting');
      try {
        const raceConditionPatterns = JSON.parse(doubleCheck);
        return raceConditionPatterns;
      } catch {
        return [];
      }
    }
  } catch (error) {
    console.log('⚠️ Error in double-check, proceeding with defaults');
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
    console.log('❌ saveUrlPatternsToStorage: Error saving patterns:', error);
  }
}

// Generic fallback pattern used when no user-configured pattern matches.
// Ensures non-Conga HTTP traffic is still captured and displayed.
const GENERIC_HTTP_PATTERN: UrlPattern = {
  name: "Generic",
  pattern: "*",
  type: "generic",
  enabled: true,
  description: "Generic HTTP requests (fallback for non-Conga traffic)"
};

function shouldProcessUrl(url: string): UrlPattern | null {
  // Skip internal / non-network URLs entirely
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  const skipSchemes = ['chrome-extension://', 'chrome://', 'devtools://', 'data:', 'blob:', 'file:', 'about:'];
  if (skipSchemes.some(s => lowerUrl.startsWith(s))) {
    return null;
  }

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

  // Check if "Show All Calls" is enabled — bypass pattern filtering
  try {
    const showAll = localStorage.getItem('har_show_all_calls');
    if (showAll === 'true') {
      // Check if a specific pattern matches for better typing
      const matchedPattern = enabledPatterns.find(pattern => {
        const patternLower = pattern.pattern.toLowerCase();
        return url.toLowerCase().includes(patternLower);
      });
      return matchedPattern || GENERIC_HTTP_PATTERN;
    }
  } catch {}

  // If the user has configured any enabled patterns, filter strictly — only
  // show requests that match one of them. Drop everything else (Conga-style).
  if (enabledPatterns.length > 0) {
    const matchedPattern = enabledPatterns.find(pattern => {
      const patternLower = pattern.pattern.toLowerCase();
      return url.toLowerCase().includes(patternLower);
    });
    return matchedPattern || null;
  }

  // No enabled patterns configured — fall back to the generic pattern so all
  // HTTP traffic is captured (for non-Conga / general debugging use).
  return GENERIC_HTTP_PATTERN;
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
        method: endpoint,
        endpoint,
        displayName: `${pattern.name}: ${endpoint}`
      };
    
    case 'generic':
    default: {
      // Generic HTTP: show just the path — the Type column already shows the HTTP method.
      const genericEndpoint = extractEndpointFromUrl(request.request.url);
      const cleanPath = `/${genericEndpoint}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      return {
        ...basePayload,
        method: cleanPath,
        endpoint: genericEndpoint,
        displayName: cleanPath
      };
    }
  }
}

// Add a variable to track when patterns change
let lastPatternHash: string | null = null;

function getPatternHash(patterns: UrlPattern[]): string {
  return JSON.stringify(patterns.map(p => ({ name: p.name, pattern: p.pattern, enabled: p.enabled })));
}

// ========================
// PERFORMANCE PANEL SYNC (Chrome 129+)
// ========================
// Sync network/WS capture with the DevTools Performance panel recording.
let isPerformanceProfiling = false;
let profilingStartTime: number | null = null;

try {
  if (chrome.devtools?.performance) {
    chrome.devtools.performance.onProfilingStarted.addListener(() => {
      isPerformanceProfiling = true;
      profilingStartTime = Date.now();
      console.log("📊 Performance profiling started — tagging capture window");
      if (currentPanelWindow) {
        currentPanelWindow.postMessage({
          source: "HAR_EXTRACTOR",
          type: "PERF_PROFILING_STARTED",
          payload: { startTime: profilingStartTime }
        }, "*");
      }
    });

    chrome.devtools.performance.onProfilingStopped.addListener(() => {
      const endTime = Date.now();
      console.log("📊 Performance profiling stopped — capture window:",
        profilingStartTime ? `${((endTime - profilingStartTime) / 1000).toFixed(1)}s` : "unknown");
      isPerformanceProfiling = false;
      if (currentPanelWindow) {
        currentPanelWindow.postMessage({
          source: "HAR_EXTRACTOR",
          type: "PERF_PROFILING_STOPPED",
          payload: { startTime: profilingStartTime, endTime }
        }, "*");
      }
      profilingStartTime = null;
    });
    console.log("✅ Performance panel sync registered");
  }
} catch (e) {
  console.debug("chrome.devtools.performance not available (requires Chrome 129+)");
}

chrome.devtools.panels.create("Conga Debugger", "icon-16.png", "panel.html", (panel: any) => {
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
        
        // Try Network.replayXHR first (CDP native replay, preserves exact headers/auth)
        const requestId = message.requestId;
        if (debuggerAttached && requestId) {
          console.log("🔄 Attempting Network.replayXHR with requestId:", requestId);
          try {
            chrome.debugger.sendCommand(debuggee, "Network.replayXHR", {
              requestId: requestId
            }, () => {
              if (chrome.runtime.lastError) {
                console.log("🔄 Network.replayXHR failed, falling back to fetch():", chrome.runtime.lastError.message);
                retriggerViaFetch(message, panelWindow);
              } else {
                console.log("✅ Network.replayXHR succeeded for:", requestId);
              }
            });
            return;
          } catch (e) {
            console.log("🔄 Network.replayXHR threw, falling back to fetch():", (e as any)?.message);
          }
        }
        
        // Fallback: manual fetch injection
        retriggerViaFetch(message, panelWindow);
      }
    };

    function retriggerViaFetch(message: any, panelWindow: any) {
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
        const safeUrl = JSON.stringify(url);
        const safeMethod = JSON.stringify(method);
        const safeHeaders = JSON.stringify(headersObj);
        const safeBody = cleanPayload ? JSON.stringify(JSON.stringify(cleanPayload)) : null;
        const evalScript = `
          (function() {
            var targetUrl = ${safeUrl};
            var targetMethod = ${safeMethod};
            console.log("[HAR_RETRIGGER] Starting fetch to: " + targetUrl);
            
            var fetchOptions = {
              method: targetMethod,
              headers: ${safeHeaders},
              credentials: "include"${cleanPayload ? `,
              body: ${safeBody}` : ''}
            };
            
            console.log("[HAR_RETRIGGER] Fetch options:", fetchOptions);
            
            return fetch(targetUrl, fetchOptions)
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
                console.log("[HAR_RETRIGGER] Fetch error:", error);
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
            console.log("🔄 Error evaluating script:", isException);
          } else {
            console.log("🔄 Script evaluation result:", result);
          }
        });
    }

    // Add the listener
    chrome.runtime.onMessage.addListener(messageListener);

    // Clean up the listener when panel is hidden/closed
    panel.onHidden.addListener(() => {
      chrome.runtime.onMessage.removeListener(messageListener);
    });

    // Force a fresh read of patterns when panel is shown and set initial hash
    const currentPatterns = getUrlPatternsFromStorage();
    lastPatternHash = getPatternHash(currentPatterns);

    // ── Lazy debugger attach ──────────────────────────────────────────
    // The chrome.debugger API triggers a visible "started debugging this
    // browser" bar.  HTTP capture works fine via onRequestFinished (no
    // debugger needed), and WS traffic is initially captured by the
    // injected page-level interceptor.  We only attach the debugger once
    // real WS activity is detected so that users who only look at HTTP
    // calls never see the bar.
    //
    // `attachDebuggerForWs()` can be called multiple times safely — it
    // will attach only once.

    function attachDebuggerForWs() {
      if (debuggerAttached) return;     // already connected
      console.log("🔧 WS activity detected — attaching debugger to tab:", currentTabId);

      chrome.debugger.attach(debuggee, "1.3", () => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message;
          console.log("❌ Failed to attach debugger:", errorMessage);

          if (errorMessage.includes("different extension")) {
            console.log("🚨 Another extension is using the debugger. WS interceptor remains active as fallback.");
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
          }

          panelWindow.postMessage(
            {
              source: "HAR_EXTRACTOR",
              type: "DEBUGGER_FALLBACK",
              message: "Debugger unavailable — WS interceptor active. Reload page to capture WebSocket traffic."
            },
            "*"
          );

          // Keep retrying in the background
          startDebuggerRetry(debuggee, panelWindow);
          return;
        }

        debuggerAttached = true;
        stopDebuggerRetry();
        console.log("✅ Debugger attached successfully to tab:", currentTabId);

        try {
          enableNetworkDomain(debuggee);
          chrome.debugger.sendCommand(debuggee, "Network.setCacheDisabled", { cacheDisabled: true });
          chrome.debugger.sendCommand(debuggee, "Page.enable", {});
        } catch (e) {
          console.log("⚠️ Error enabling domains after attach:", (e as any)?.message || e);
        }

        chrome.debugger.sendCommand(
          debuggee,
          "Target.setAutoAttach",
          { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
          () => {
            if (chrome.runtime.lastError) {
              console.log("⚠️ setAutoAttach error:", chrome.runtime.lastError.message);
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

        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "DEBUGGER_RECONNECTED" },
          "*"
        );
        try { startWsWatchdog(); } catch {}
      });

      // Listen for debugger detach events
      chrome.debugger.onDetach.addListener((detachedDebuggee: any, reason: string) => {
        if (detachedDebuggee.tabId === currentTabId) {
          console.log("🔌 Debugger detached:", reason);
          debuggerAttached = false;
          panelWindow.postMessage(
            { source: "HAR_EXTRACTOR", type: "DEBUGGER_DISCONNECTED" },
            "*"
          );
          debuggerWsActive = false;
          injectWsInterceptor();
          // Do NOT auto-retry — let the user manually reconnect from the WS table overlay.
          // Auto-retry causes the annoying "debugging this browser" bar to reappear.
          stopDebuggerRetry();
        }
      });
    }

    // Expose the lazy attach so the WS interceptor (module-scope) can trigger it
    lazyAttachDebuggerFn = attachDebuggerForWs;

    // Always rebind the listener safely
    chrome.debugger.onEvent.removeListener(handleEvent);
    chrome.debugger.onEvent.addListener(handleEvent);

    // Eagerly attach debugger so WS frames on existing connections are captured.
    // The page-level interceptor can only catch NEW WebSocket() calls, but
    // Salesforce/CPQ pages open WS connections on page load — before the panel
    // is shown — so the interceptor misses them. The debugger API hooks into
    // Chrome's network layer and captures frames on all connections.
    attachDebuggerForWs();

    // WS Interceptor Fallback: always inject + poll so WS works even without debugger
    currentPanelWindow = panelWindow;
    debuggerWsActive = false;
    injectWsInterceptor();
    injectMcpTools();
    startWsPolling(panelWindow);

    // Re-inject WS interceptor on page navigation (works without debugger)
    if (!onNavigatedListenerAdded) {
      chrome.devtools.network.onNavigated.addListener((url: string) => {
        console.log("🔄 onNavigated:", url, "- clearing tables and re-injecting WS interceptor");
        debuggerWsActive = false;
        wsFirstTimestamp = null;
        wsFirstWallClock = null;
        seenWsMessages.clear();
        seenRequests.clear();
        // Clear TaskId duration tracking from previous page
        for (const key in wsSentTimestamps) {
          delete wsSentTimestamps[key];
        }

        // Always clear tables on navigation — this fires for both
        // debugger-attached and non-attached scenarios
        if (currentPanelWindow) {
          currentPanelWindow.postMessage(
            { source: "HAR_EXTRACTOR", type: "CLEAR" },
            "*"
          );
          // Clear MCP data store on navigation
          pushToMcpStore(currentPanelWindow, 'CLEAR', null);
        }

        // Re-inject interceptor after a short delay for page context to be ready
        setTimeout(() => injectWsInterceptor(), 100);
        // Double-inject after 500ms as safety net for slow-loading pages
        setTimeout(() => injectWsInterceptor(), 500);
        // Third inject at 1.5s for very slow pages
        setTimeout(() => injectWsInterceptor(), 1500);
        // Re-inject MCP tools after navigation
        setTimeout(() => injectMcpTools(), 600);

        // After navigation the debugger detaches. We do NOT eagerly re-attach
        // here — the WS interceptor will trigger attachDebuggerForWs() lazily
        // if/when WebSocket traffic is detected on the new page.
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

          // Push to MCP store for AI agent access
          pushToMcpStore(panelWindow, 'HTTP', {
            ...processedPayload,
            timestamp: startTime,
            endTime,
            url,
          });
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
          console.log("⚠️ Failed to parse receivedMessageFromTarget payload");
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
            enableNetworkDomain({ ...debuggee, sessionId });
          } catch (e) {
            console.log("⚠️ Error enabling Network on child session:", (e as any)?.message || e);
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

      // ── Streaming response capture (SSE, chunked JSON) ──────────────
      // When a streaming response is detected, enable real-time chunk capture
      if (method === "Network.responseReceived") {
        const contentType = (params?.response?.headers?.["content-type"] || params?.response?.headers?.["Content-Type"] || "").toLowerCase();
        const isStreaming = contentType.includes("text/event-stream") ||
          contentType.includes("application/x-ndjson") ||
          contentType.includes("application/stream+json");
        if (isStreaming && params?.requestId) {
          console.log("📡 Streaming response detected — enabling streamResourceContent for:", params.requestId);
          try {
            chrome.debugger.sendCommand(debuggee, "Network.streamResourceContent", {
              requestId: params.requestId
            }, (result: any) => {
              if (chrome.runtime.lastError) {
                console.debug("Network.streamResourceContent not available:", chrome.runtime.lastError.message);
              } else {
                console.log("✅ Streaming enabled for request:", params.requestId);
                panelWindow.postMessage({
                  source: "HAR_EXTRACTOR",
                  type: "STREAMING_STARTED",
                  payload: { requestId: params.requestId, contentType }
                }, "*");
              }
            });
          } catch {}
        }
      }

      // Forward streaming data chunks to panel
      if (method === "Network.dataReceived" && params?.data) {
        try {
          const chunk = atob(params.data);
          panelWindow.postMessage({
            source: "HAR_EXTRACTOR",
            type: "STREAMING_CHUNK",
            payload: {
              requestId: params.requestId,
              data: chunk,
              timestamp: Date.now(),
              dataLength: params.dataLength,
              encodedDataLength: params.encodedDataLength
            }
          }, "*");
        } catch {}
      }

      // ── Server-Sent Events (SSE) — pre-parsed by Chrome ────────────
      if (method === "Network.eventSourceMessageReceived") {
        panelWindow.postMessage({
          source: "HAR_EXTRACTOR",
          type: "SSE_EVENT",
          payload: {
            requestId: params?.requestId,
            eventName: params?.eventName || "message",
            eventId: params?.eventId || "",
            data: params?.data || "",
            timestamp: Date.now()
          }
        }, "*");
        return;
      }

      // ── WebTransport lifecycle events (HTTP/3 future-proofing) ─────
      if (method === "Network.webTransportCreated") {
        console.log("🚀 WebTransport created:", { url: params?.url, transportId: params?.transportId });
        panelWindow.postMessage({
          source: "HAR_EXTRACTOR",
          type: "WEBTRANSPORT_CREATED",
          payload: { url: params?.url, transportId: params?.transportId, timestamp: Date.now() }
        }, "*");
        return;
      }
      if (method === "Network.webTransportConnectionEstablished") {
        console.log("✅ WebTransport established:", params?.transportId);
        panelWindow.postMessage({
          source: "HAR_EXTRACTOR",
          type: "WEBTRANSPORT_ESTABLISHED",
          payload: { transportId: params?.transportId, timestamp: Date.now() }
        }, "*");
        return;
      }
      if (method === "Network.webTransportClosed") {
        console.log("🔒 WebTransport closed:", params?.transportId);
        panelWindow.postMessage({
          source: "HAR_EXTRACTOR",
          type: "WEBTRANSPORT_CLOSED",
          payload: { transportId: params?.transportId, timestamp: Date.now() }
        }, "*");
        return;
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
      if (method === "Network.webSocketCreated") {
        const wsUrl = params?.url;
        const reqId = params?.requestId;
        console.log("🔗 WS created:", { url: wsUrl, requestId: reqId });
        if (wsUrl) {
          if (reqId) wsUrlsByRequestId[reqId] = wsUrl;
          latestWsBaseUrl = wsUrl;
          panelWindow.postMessage(
            { source: "HAR_EXTRACTOR", type: "WS_BASE_URL", payload: wsUrl },
            "*"
          );
        }
        return;
      }
      if (method === "Network.webSocketWillSendHandshakeRequest") {
        const wsUrl = params?.request?.url;
        console.log("🤝 WS handshake request:", { url: wsUrl, requestId: params?.requestId });
        
        // Track WS URL per requestId so generic WS messages can show the connection URL
        if (wsUrl && params?.requestId) {
          wsUrlsByRequestId[params.requestId] = wsUrl;
          latestWsBaseUrl = wsUrl;
        }

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
        console.log("❌ WebSocket frame error:", params);
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
            console.log(`⚠️ Windows Chrome: No payload data in ${direction} WebSocket frame`);
          }
          return;
        }

        let topLevel: any = {};
        let isRawMessage = false;
        try {
          // Try normal JSON parse
          topLevel = JSON.parse(rawPayload);
        } catch {
          // Fallback: strip BOM/whitespace and retry
          const cleaned = String(rawPayload).replace(/^\uFEFF/, '').trim();
          try {
            topLevel = JSON.parse(cleaned);
          } catch {
            // Non-JSON message — treat as generic raw WS payload.
            isRawMessage = true;
            topLevel = { _raw: String(rawPayload).slice(0, 5000) };
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

        // Detect Conga envelope: has EndPoint, TaskId, or Action at top level.
        const isCongaEnvelope = !isRawMessage && (
          topLevel.EndPoint !== undefined ||
          topLevel.TaskId !== undefined ||
          topLevel.Action !== undefined ||
          nested?.Action !== undefined
        );

        const action = isCongaEnvelope
          ? (nested?.Action || topLevel?.Action || "").toLowerCase()
          : direction; // Generic WS: use direction as the "action" label
        if (isCongaEnvelope && action === "heartbeat") return;

        const endpoint = isCongaEnvelope
          ? (topLevel.EndPoint ||
             (topLevel.TaskId ? `TaskId: ${topLevel.TaskId}` : "(unknown)"))
          : (() => {
              // Generic WS: show connection URL path
              const connUrl = (params?.requestId && wsUrlsByRequestId[params.requestId]) || latestWsBaseUrl;
              if (connUrl) {
                // Also broadcast as WS_BASE_URL so the connection header shows it
                panelWindow.postMessage(
                  { source: "HAR_EXTRACTOR", type: "WS_BASE_URL", payload: connUrl },
                  "*"
                );
                try {
                  const u = new URL(connUrl);
                  return u.pathname || connUrl;
                } catch { return connUrl; }
              }
              return "(message)";
            })();
        const status = isCongaEnvelope ? (topLevel.StatusCode ?? 200) : 200;

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
        // Always use wall-clock epoch ms so both debugger and interceptor paths
        // store comparable values in wsSentTimestamps.
        const nowMs = Date.now();
        const taskId = topLevel.TaskId;
        if (taskId) {
          if (direction === "sent") {
            wsSentTimestamps[taskId] = nowMs;
          } else {
            const sentTs = wsSentTimestamps[taskId];
            if (sentTs) {
              const diffMs = nowMs - sentTs;
              // Sanity check: ignore negative or absurdly large durations
              if (diffMs >= 0 && diffMs < 3600000) {
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
        }

        panelWindow.postMessage(
          {
            source: "HAR_EXTRACTOR",
            type: "WS",
            payload: wsPayload,
          },
          "*"
        );
        // Push to MCP store for AI agent access
        pushToMcpStore(panelWindow, 'WS', wsPayload);
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
        if (!debuggerAttached) return; // Debugger was detached, skip
        const inactive = !lastWsEventTime || (Date.now() - lastWsEventTime > 5500);
        if (inactive) {
          console.log("⏱️ WS inactivity detected - re-enabling Network/Targets");
          try {
            enableNetworkDomain(debuggee);
            chrome.debugger.sendCommand(debuggee, "Page.enable", {});
            chrome.debugger.sendCommand(debuggee, "Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
            chrome.debugger.sendCommand(debuggee, "Target.setDiscoverTargets", { discover: true });
          } catch {}
        }
      }, 5600);

      // Second deeper check at 12s — also try non-flattened mode and re-enable on all known sub-targets
      setTimeout(() => {
        if (!debuggerAttached) return; // Debugger was detached, skip
        const stillInactive = !lastWsEventTime || (Date.now() - lastWsEventTime > 11000);
        if (stillInactive) {
          console.log("⏱️ WS still inactive after 12s — trying deeper recovery");
          try {
            // Disable then re-enable Network to force Chrome to re-emit WS events
            chrome.debugger.sendCommand(debuggee, "Network.disable", {}, () => {
              if (!debuggerAttached) return;
              enableNetworkDomain(debuggee);
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
            console.log('❌ Error saving patterns:', error);
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
          console.log("💾 Invalid patterns data:", event.data.patterns);
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
                console.log(`❌ Attempt ${attempt} failed:`, errorMessage);
                
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
                console.log("⚠️ State cleanup failed:", (error as any)?.message);
              }
            }
            
            // Try to enable domains, ignore any errors
            try {
              enableNetworkDomain(debuggee, () => {
                console.log("📡 Network domain enabled (may have failed silently)");
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
                    console.log("⚠️ setAutoAttach error:", chrome.runtime.lastError.message);
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
              enableNetworkDomain(debuggee);
              chrome.debugger.sendCommand(debuggee, "Network.setCacheDisabled", { cacheDisabled: true });
              chrome.debugger.sendCommand(debuggee, "Page.enable", {});
              // Also ensure sub-targets are auto-attached on successful attach
              chrome.debugger.sendCommand(
                debuggee,
                "Target.setAutoAttach",
                { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
                () => {
                  if (chrome.runtime.lastError) {
                    console.log("⚠️ setAutoAttach error:", chrome.runtime.lastError.message);
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
              console.log("⚠️ Command sending failed:", (error as any)?.message || error);
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