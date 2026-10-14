// devtools.ts - Fully stable with WS reliability and panel re-entry safety + Configurable URL patterns

// HTTP rows already sent to the panel, keyed by row key (see getHttpBaseKey).
// Captured rows are kept until the user clears the table (or a URL-pattern change filters them out),
// so page navigations and in-app route changes never wipe them.
interface HttpRowState {
  url: string;
  pattern: UrlPattern;
  apexMethod?: any;
  // Row backfilled from getHAR(); the onRequestFinished data for the same request replaces it.
  tentative: boolean;
  // Bumped whenever the key is (re)claimed, so stale async getContent() results are dropped.
  gen: number;
}
const httpRowState = new Map<string, HttpRowState>();
let httpRowGen = 0;
// Time of the user's last "Clear": calls/messages that finished before it are not added back.
let logsClearedAt = 0;

// Exact-duplicate guard for debugger WS frames
const seenWsMessages = new Set<string>();
// Track sent WS timestamps by TaskId for duration calculation
const wsSentTimestamps = new Map<string, number>();
// Track WS connection URL per requestId so generic (non-Conga) messages can show it
const wsUrlsByRequestId: Record<string, string> = {};
// Latest WS connection URL seen (used as fallback for generic messages)
let latestWsBaseUrl: string | null = null;
let debuggerAttached = false;
// Offset (ms) from CDP monotonic timestamps to wall-clock time, for debugger WS frames
let wsMonoToWallOffsetMs: number | null = null;
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
  // Bounded queue: if nobody drains it (DevTools closed), keep only the newest messages.
  function enqueue(item) {
    var q = window.__CONGA_WS_QUEUE__;
    q.push(item);
    if (q.length > 5000) q.splice(0, q.length - 5000);
  }
  var OrigWS = window.WebSocket;
  function CongaWebSocket(url, protocols) {
    var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
    var wsUrl = url;
    var origSend = ws.send;
    ws.send = function(data) {
      try {
        if (typeof data === 'string') {
          enqueue({ direction: 'sent', data: data, url: wsUrl, timestamp: Date.now() });
        }
      } catch(e) {}
      return origSend.call(ws, data);
    };
    ws.addEventListener('message', function(event) {
      try {
        if (typeof event.data === 'string') {
          enqueue({ direction: 'received', data: event.data, url: wsUrl, timestamp: Date.now() });
        }
      } catch(e) {}
    });
    ws.addEventListener('open', function() {
      try {
        enqueue({ direction: 'open', data: '', url: wsUrl, timestamp: Date.now() });
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

// Drains the page interceptor queue. Runs continuously (also while the panel is hidden and
// while the debugger is attached) — frames seen by both capture paths are de-duplicated in
// handleWsFrame, so nothing piles up and gets dumped into the table later.
function startWsPolling(panelWindow: any) {
  if (wsPollingInterval) clearInterval(wsPollingInterval);
  wsPollingInterval = setInterval(() => {
    chrome.devtools.inspectedWindow.eval(
      `(function() {
        if (!window.__CONGA_WS_QUEUE__ || window.__CONGA_WS_QUEUE__.length === 0) return null;
        var msgs = window.__CONGA_WS_QUEUE__.splice(0);
        if (msgs.length > 5000) msgs = msgs.slice(-5000);
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

// Small, fast string hash (FNV-1a) used for HTTP row keys and WS de-duplication.
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ========================
// WS FRAME HANDLING (shared by the debugger and the page interceptor)
// ========================
type WsSource = 'dbg' | 'int';

// The same frame can be captured twice — once by chrome.debugger and once by the page
// interceptor. Each frame is shown once; its copy from the other source is dropped.
const wsRecentFrames = new Map<string, { src: WsSource; frameTime: number; seenAt: number }[]>();
let wsRecentLastPrune = 0;
const WS_MATCH_WINDOW_MS = 15_000;
const WS_RECENT_TTL_MS = 5 * 60_000;

function isWsCrossSourceDuplicate(src: WsSource, fp: string, frameTime: number): boolean {
  const now = Date.now();
  if (now - wsRecentLastPrune > 30_000) {
    wsRecentLastPrune = now;
    for (const [k, list] of wsRecentFrames) {
      const kept = list.filter((e) => now - e.seenAt < WS_RECENT_TTL_MS);
      if (kept.length) wsRecentFrames.set(k, kept);
      else wsRecentFrames.delete(k);
    }
  }

  const list = wsRecentFrames.get(fp) || [];
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.src === src) continue;
    const diff = Math.abs(e.frameTime - frameTime);
    if (diff <= WS_MATCH_WINDOW_MS && diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  if (best >= 0) {
    list.splice(best, 1);
    if (!list.length) wsRecentFrames.delete(fp);
    return true;
  }

  list.push({ src, frameTime, seenAt: now });
  if (list.length > 200) list.splice(0, list.length - 200);
  wsRecentFrames.set(fp, list);
  return false;
}

// Converts a CDP monotonic timestamp (seconds) of a debugger WS frame to wall-clock ms.
function dbgMonoToWallMs(ts: any): number {
  const now = Date.now();
  if (typeof ts !== 'number' || !isFinite(ts)) return now;
  let wall = wsMonoToWallOffsetMs !== null ? ts * 1000 + wsMonoToWallOffsetMs : NaN;
  // Re-anchor when no offset is known yet or it is clearly stale (e.g. after system sleep).
  if (!isFinite(wall) || wall > now + 2000 || wall < now - 10_000) {
    wsMonoToWallOffsetMs = now - ts * 1000;
    wall = now;
  }
  return Math.round(wall);
}

function formatWsDuration(diffMs: number): string | undefined {
  // Ignore negative or absurdly large durations
  if (!(diffMs >= 0 && diffMs < 3_600_000)) return undefined;
  const totalSec = Math.round(diffMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function handleWsFrame(
  panelWindow: any,
  src: WsSource,
  direction: 'sent' | 'received',
  rawPayload: any,
  frameTime: number,
  connUrl: string | null,
  exactDupKey?: string
) {
  if (!panelWindow || !rawPayload) return;
  // Frames from before the user's last "Clear" (e.g. still queued in the page) stay cleared.
  if (frameTime < logsClearedAt) return;
  const raw = String(rawPayload);

  let topLevel: any = {};
  let isRawMessage = false;
  try {
    topLevel = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/^\uFEFF/, '').trim();
    try {
      topLevel = JSON.parse(cleaned);
    } catch {
      isRawMessage = true;
    }
  }
  if (isRawMessage || topLevel === null || typeof topLevel !== 'object') {
    // Non-JSON (or primitive) message — treat as generic raw WS payload.
    isRawMessage = true;
    topLevel = { _raw: raw.slice(0, 5000) };
  }

  let nested: any = {};
  try {
    nested = typeof topLevel.Payload === "string" && topLevel.Payload.trim().startsWith("{")
      ? JSON.parse(topLevel.Payload) : topLevel.Payload;
  } catch {}

  // Detect Conga envelope: has EndPoint, TaskId, or Action at top level.
  const isCongaEnvelope = !isRawMessage && (
    topLevel.EndPoint !== undefined ||
    topLevel.TaskId !== undefined ||
    topLevel.Action !== undefined ||
    nested?.Action !== undefined
  );

  const action = isCongaEnvelope
    ? String(nested?.Action || topLevel?.Action || "").toLowerCase()
    : direction; // Generic WS: use direction as the "action" label
  if (isCongaEnvelope && action === "heartbeat") return;

  const fp = `${direction}|${fnv1a(raw.length > 8192 ? raw.slice(0, 8192) : raw)}`;
  if (exactDupKey) {
    const k = `${exactDupKey}|${fp}`;
    if (seenWsMessages.has(k)) return;
    if (seenWsMessages.size > 20_000) seenWsMessages.clear();
    seenWsMessages.add(k);
  }
  if (isWsCrossSourceDuplicate(src, fp, frameTime)) return;

  let endpoint: string;
  if (isCongaEnvelope) {
    endpoint = topLevel.EndPoint || (topLevel.TaskId ? `TaskId: ${topLevel.TaskId}` : "(unknown)");
  } else if (connUrl) {
    // Generic WS: show the connection URL path, and broadcast it so the
    // connection header shows the URL even on pre-existing connections
    panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "WS_BASE_URL", payload: connUrl }, "*");
    try {
      endpoint = new URL(connUrl).pathname || connUrl;
    } catch {
      endpoint = connUrl;
    }
  } else {
    endpoint = "(message)";
  }
  const status = isCongaEnvelope ? (topLevel.StatusCode ?? 200) : 200;

  // Duration between a sent message and its response, matched by TaskId (wall-clock ms on both sides)
  let duration: string | undefined;
  const taskId = topLevel.TaskId;
  if (taskId !== undefined && taskId !== null && taskId !== '') {
    const taskKey = String(taskId);
    if (direction === 'sent') {
      wsSentTimestamps.set(taskKey, frameTime);
      if (wsSentTimestamps.size > 5000) {
        const cutoff = Date.now() - 3_600_000;
        for (const [k, t] of wsSentTimestamps) {
          if (t < cutoff) wsSentTimestamps.delete(k);
        }
        if (wsSentTimestamps.size > 5000) wsSentTimestamps.clear();
      }
    } else {
      const sentTs = wsSentTimestamps.get(taskKey);
      if (sentTs !== undefined) duration = formatWsDuration(frameTime - sentTs);
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
      direction,
      timestamp: frameTime,
      time: new Date(frameTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      duration,
    },
  }, "*");
}

function processInterceptedWsMessage(msg: any, panelWindow: any) {
  if (!panelWindow || !msg) return;
  if (msg.direction === 'open') {
    // Do NOT attach the debugger here — the interceptor captures WS messages
    // on its own. Attaching the debugger shows Chrome's "debugging this browser"
    // bar which annoys users who don't need it.
    if (msg.url) {
      latestWsBaseUrl = msg.url;
      panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "WS_BASE_URL", payload: msg.url }, "*");
    }
    return;
  }
  if (msg.direction !== 'sent' && msg.direction !== 'received') return;
  const frameTime = typeof msg.timestamp === 'number' && isFinite(msg.timestamp) ? msg.timestamp : Date.now();
  handleWsFrame(panelWindow, 'int', msg.direction, msg.data, frameTime, msg.url || latestWsBaseUrl);
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

// Display fields of an HTTP row (name/endpoint/type columns) for the URL pattern that matched it.
function formatHttpRowFields(url: string, reqJson: any, pattern: UrlPattern) {
  const common = { urlPattern: pattern.name, patternType: pattern.type };
  switch (pattern.type) {
    case 'apex': {
      const method = reqJson?.method || "(unknown)";
      return { ...common, method, endpoint: undefined as string | undefined, displayName: `${pattern.name}: ${method}` };
    }

    case 'http': {
      const endpoint = extractEndpointFromUrl(url);
      return { ...common, method: endpoint, endpoint, displayName: `${pattern.name}: ${endpoint}` };
    }

    case 'generic':
    default: {
      // Generic HTTP: show just the path — the Type column already shows the HTTP method.
      const genericEndpoint = extractEndpointFromUrl(url);
      const cleanPath = `/${genericEndpoint}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
      return { ...common, method: cleanPath, endpoint: genericEndpoint, displayName: cleanPath };
    }
  }
}

function processRequestByPattern(request: any, reqJson: any, resJson: any, pattern: UrlPattern) {
  return {
    url: request.request.url,
    requestPayload: reqJson,
    responsePayload: resJson,
    status: request.response?.status ?? null,
    timestamp: new Date(request.startedDateTime).getTime(),
    endTime: Date.now(),
    httpMethod: request.request.method || 'GET',
    ...formatHttpRowFields(request.request.url, reqJson, pattern),
  };
}

// Identity of a request that is the same in getHAR() and onRequestFinished (the HAR API exposes no
// request id). Identical requests started in the same millisecond get an occurrence suffix (#n).
function getHttpBaseKey(entry: any): string {
  const req = entry?.request || {};
  const body: string = req.postData?.text || '';
  const sample = body.length > 65536 ? body.slice(0, 32768) + body.slice(-32768) : body;
  return `${req.method || 'GET'} ${req.url} ${entry?.startedDateTime} ${body.length}:${fnv1a(sample)}`;
}

function parseHttpRequestBody(entry: any): any {
  const request = entry?.request || {};
  try {
    return JSON.parse(request.postData?.text || "{}");
  } catch {
    // Non-JSON body: keep what's needed to show and resend the request
    return {
      _method: request.method,
      _url: request.url,
      _headers: request.headers || [],
      _rawPostData: request.postData?.text || "",
      _queryString: request.queryString || [],
    };
  }
}

function parseHttpResponseContent(entry: any, content: any): any {
  if (typeof content === 'string' && content.trim()) {
    try {
      return JSON.parse(content);
    } catch {
      return { _rawContent: content };
    }
  }
  // No body: for failed requests show why (e.g. net::ERR_FAILED), otherwise leave empty
  const error = entry?.response?._error;
  return error ? { _error: error } : {};
}

chrome.devtools.panels.create("Conga Debugger", "icon-16.png", "panel.html", (panel: any) => {
  let currentTabId: number | null = null;
  // The panel page's window. The panel page stays loaded while another DevTools tab is
  // selected, so capturing keeps running (and posting into it) while the panel is hidden.
  let panelWindow: any = null;
  let panelInitialized = false;
  let retriggerListener: ((message: any, sender: any, sendResponse: any) => void) | null = null;
  let handlePanelMessageRef: ((event: any) => void) | null = null;
  let sendInitialHarRef: (() => void) | null = null;
  let attachDebuggerRef: (() => void) | null = null;
  // Track pending network requests for loading state
  let pendingNetworkRequests = new Set<string>();
  let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // If the panel page itself gets reloaded it starts empty and loses our message listener:
  // hook it up again and resend the HTTP calls that are still in the DevTools network log.
  function ensurePanelHooked() {
    try {
      if (!panelWindow || panelWindow.__congaDebuggerHooked) return;
      // Wait until the panel's early message buffer exists, so nothing posted to it is lost
      if (typeof panelWindow.__CONGA_STOP_EARLY_BUFFER__ !== "function") return;
      panelWindow.__congaDebuggerHooked = true;
      if (handlePanelMessageRef) panelWindow.addEventListener("message", handlePanelMessageRef);
      httpRowState.clear();
      sendInitialHarRef?.();
    } catch {}
  }

  // Hiding the panel does NOT stop capturing; only the resend listener and debugger retries stop.
  panel.onHidden.addListener(() => {
    if (retriggerListener) chrome.runtime.onMessage.removeListener(retriggerListener);
    stopDebuggerRetry();
  });

  // Helper to update loading state
  function updateLoadingState(panelWindow: any) {
    if (!panelWindow) return;
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

  panel.onShown.addListener((shownWindow: any) => {
    const tabId = chrome.devtools.inspectedWindow.tabId;
    currentTabId = tabId;
    const debuggee = { tabId };
    panelWindow = shownWindow;
    currentPanelWindow = shownWindow;

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
    // Make it tab-specific by checking currentTabId (created once, re-added on every show)
    const messageListener = retriggerListener || ((message: any, sender: any, sendResponse: any) => {
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
    });
    retriggerListener = messageListener;

    // Add the listener (removed again when the panel is hidden)
    if (!chrome.runtime.onMessage.hasListener(messageListener)) {
      chrome.runtime.onMessage.addListener(messageListener);
    }

    if (panelInitialized) {
      // Capturing is already wired up and kept running while the panel was hidden —
      // just make sure every part of it is still alive. Nothing is cleared or reloaded.
      if (handlePanelMessageRef) panelWindow.addEventListener("message", handlePanelMessageRef);
      ensurePanelHooked();
      attachDebuggerRef?.();
      injectWsInterceptor();
      if (!wsPollingInterval) startWsPolling(panelWindow);
      return;
    }
    panelInitialized = true;
    panelWindow.__congaDebuggerHooked = true;

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
          chrome.debugger.sendCommand(debuggee, "Network.enable", {
            maxTotalBufferSize: 100_000_000,
            maxResourceBufferSize: 50_000_000
          });
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
    }

    // Listen for debugger detach events (e.g. the user closed the "debugging this browser" bar)
    chrome.debugger.onDetach.addListener((detachedDebuggee: any, reason: string) => {
      if (detachedDebuggee.tabId === currentTabId) {
        console.log("🔌 Debugger detached:", reason);
        debuggerAttached = false;
        panelWindow?.postMessage(
          { source: "HAR_EXTRACTOR", type: "DEBUGGER_DISCONNECTED" },
          "*"
        );
        // The page interceptor keeps capturing WS traffic on its own
        injectWsInterceptor();
        // Do NOT auto-retry — let the user manually reconnect from the WS table overlay.
        // Auto-retry causes the annoying "debugging this browser" bar to reappear.
        stopDebuggerRetry();
      }
    });

    // Expose the lazy attach so the WS interceptor (module-scope) can trigger it
    lazyAttachDebuggerFn = attachDebuggerForWs;
    attachDebuggerRef = attachDebuggerForWs;

    // Always rebind the listener safely
    chrome.debugger.onEvent.removeListener(handleEvent);
    chrome.debugger.onEvent.addListener(handleEvent);

    // Eagerly attach debugger so WS frames on existing connections are captured.
    // The page-level interceptor can only catch NEW WebSocket() calls, but
    // Salesforce/CPQ pages open WS connections on page load — before the panel
    // is shown — so the interceptor misses them. The debugger API hooks into
    // Chrome's network layer and captures frames on all connections.
    attachDebuggerForWs();

    // WS Interceptor Fallback: always inject + poll so WS works even without debugger.
    // Frames captured by both the debugger and the interceptor are shown once (see handleWsFrame).
    injectWsInterceptor();
    startWsPolling(panelWindow);

    // Re-inject the WS interceptor after page navigations. Captured calls are NOT cleared on
    // navigation (full reloads or in-app route changes) — they stay until the user clears them.
    if (!onNavigatedListenerAdded) {
      chrome.devtools.network.onNavigated.addListener((url: string) => {
        console.log("🔄 onNavigated:", url, "- re-injecting WS interceptor (captured calls are kept)");
        // Re-inject interceptor after a short delay for page context to be ready
        setTimeout(() => injectWsInterceptor(), 100);
        // Double-inject after 500ms as safety net for slow-loading pages
        setTimeout(() => injectWsInterceptor(), 500);
        // Third inject at 1.5s for very slow pages
        setTimeout(() => injectWsInterceptor(), 1500);
      });
      onNavigatedListenerAdded = true;
    }

    // Re-hook the panel if its page gets reloaded while it is visible
    setInterval(ensurePanelHooked, 1000);

    // ========================
    // LIVE HTTP CAPTURE via onRequestFinished
    // ========================
    // This API works WITHOUT the chrome.debugger, providing live HTTP capture
    // even when another extension blocks debugger attachment. Each matching call
    // is added to the table (or updated in place, by row key) when it finishes —
    // rows are never rebuilt, so clicks and navigations don't reset the table.
    function postHttpRow(entry: any, req: any, key: string, gen: number, source: 'orf' | 'har', content: any) {
      const st = httpRowState.get(key);
      // Dropped when the row was cleared, filtered out or claimed again meanwhile
      if (!st || st.gen !== gen || !panelWindow) return;
      const url = entry.request.url;
      const startTime = new Date(entry.startedDateTime).getTime();
      const processedPayload = processRequestByPattern(
        entry,
        req,
        parseHttpResponseContent(entry, content),
        st.pattern
      );

      panelWindow.postMessage(
        {
          source: "HAR_EXTRACTOR",
          type: "INITIAL_HTTP_REQUEST",
          payload: {
            ...processedPayload,
            rowKey: key,
            rowSource: source,
            timestamp: startTime,
            baseUrl: (() => { try { return new URL(url).origin; } catch { return ""; } })(),
            endTime: startTime + (entry.time || 0),
            hasMessages: (processedPayload.status || 0) >= 400,
            isCompleted: true,
            requestHeaders: entry.request.headers || [],
            responseHeaders: entry.response?.headers || [],
            headers: {
              request: entry.request.headers || [],
              response: entry.response?.headers || [],
            },
          },
        },
        "*"
      );
    }

    if (chrome.devtools?.network?.onRequestFinished) {
      chrome.devtools.network.onRequestFinished.addListener((request: any) => {
        const url = request.request?.url;
        if (!url) return;
        // Finished before the user's last Clear
        const startTime = new Date(request.startedDateTime).getTime();
        if (startTime + (request.time || 0) < logsClearedAt) return;

        const matchedPattern = shouldProcessUrl(url);
        if (!matchedPattern) return;

        // Take over the row of this call if it was already backfilled from getHAR(),
        // otherwise add a new row (#n tells identical calls apart).
        const base = getHttpBaseKey(request);
        let n = 0;
        while (httpRowState.get(`${base}#${n}`)?.tentative === false) n++;
        const key = `${base}#${n}`;
        const req = parseHttpRequestBody(request);
        const gen = ++httpRowGen;
        httpRowState.set(key, { url, pattern: matchedPattern, apexMethod: req?.method, tentative: false, gen });

        request.getContent((content: string) => postHttpRow(request, req, key, gen, 'orf', content));
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
            chrome.debugger.sendCommand(
              { ...debuggee, sessionId },
              "Network.enable",
              { maxTotalBufferSize: 100_000_000, maxResourceBufferSize: 50_000_000 },
              () => {
                if (chrome.runtime.lastError) {
                  console.log("⚠️ Network.enable on child session failed:", chrome.runtime.lastError.message);
                } else {
                  console.log("✅ Network.enable on child session:", sessionId);
                }
              }
            );
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

      // Keep the CDP monotonic-clock -> wall-clock offset fresh (used to time debugger WS frames)
      if (typeof params?.wallTime === "number" && typeof params?.timestamp === "number") {
        wsMonoToWallOffsetMs = params.wallTime * 1000 - params.timestamp * 1000;
      }

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

      // Note: page navigations (Page.frameNavigated) intentionally do NOT clear the tables.

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
        return;
      }

      if (
        method === "Network.webSocketFrameReceived" ||
        method === "Network.webSocketFrameSent"
      ) {
        // Mark last WS activity
        lastWsEventTime = Date.now();
        
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

        const reqId = params?.requestId;
        handleWsFrame(
          panelWindow,
          'dbg',
          direction,
          rawPayload,
          dbgMonoToWallMs(params?.timestamp),
          (reqId && wsUrlsByRequestId[reqId]) || latestWsBaseUrl,
          `${reqId}|${params?.timestamp}|${direction}`
        );
        return;
      }
    }

    // WS inactivity watchdog: if no frames within 5.5s after reconnect, re-enable domains
    function startWsWatchdog() {
      // First check at 5.5s
      setTimeout(() => {
        if (!debuggerAttached) return; // Debugger was detached, skip
        const inactive = !lastWsEventTime || (Date.now() - lastWsEventTime > 5500);
        if (inactive) {
          console.log("⏱️ WS inactivity detected - re-enabling Network/Targets");
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
        if (!debuggerAttached) return; // Debugger was detached, skip
        const stillInactive = !lastWsEventTime || (Date.now() - lastWsEventTime > 11000);
        if (stillInactive) {
          console.log("⏱️ WS still inactive after 12s — trying deeper recovery");
          try {
            // Disable then re-enable Network to force Chrome to re-emit WS events
            chrome.debugger.sendCommand(debuggee, "Network.disable", {}, () => {
              if (!debuggerAttached) return;
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
    }

    // Backfills matching calls that are already in the DevTools network log (e.g. finished before
    // the panel was opened, or newly matching after a URL-pattern change). Calls already in the
    // table are skipped; calls still in flight are added by onRequestFinished once they finish.
    function sendInitialHar() {
      if (!chrome.devtools.network.getHAR) return;

      chrome.devtools.network.getHAR((harLog: any) => {
        const occurrences = new Map<string, number>();
        for (const entry of harLog?.entries || []) {
          const url = entry?.request?.url;
          if (!url) continue;
          // Still in flight
          if (!entry.response?.status && !entry.response?._error) continue;
          // Finished before the user's last Clear
          const startTime = new Date(entry.startedDateTime).getTime();
          if (startTime + (entry.time || 0) < logsClearedAt) continue;

          const matchedPattern = shouldProcessUrl(url);
          if (!matchedPattern) continue;

          const base = getHttpBaseKey(entry);
          const n = occurrences.get(base) || 0;
          occurrences.set(base, n + 1);
          const key = `${base}#${n}`;
          if (httpRowState.has(key)) continue;

          const req = parseHttpRequestBody(entry);
          const gen = ++httpRowGen;
          httpRowState.set(key, { url, pattern: matchedPattern, apexMethod: req?.method, tentative: true, gen });
          entry.getContent((content: any) => postHttpRow(entry, req, key, gen, 'har', content));
        }
      });
    }

    // Re-applies the URL patterns to the captured rows after they changed: rows that no longer
    // match are removed, re-matched rows are relabelled and newly matching calls are added.
    function resyncHttpRows() {
      const remove: string[] = [];
      const restyle: { key: string; fields: any }[] = [];
      for (const [key, st] of httpRowState) {
        const p = shouldProcessUrl(st.url);
        if (!p) {
          httpRowState.delete(key);
          remove.push(key);
        } else if (p.name !== st.pattern.name || p.type !== st.pattern.type) {
          st.pattern = p;
          restyle.push({ key, fields: formatHttpRowFields(st.url, { method: st.apexMethod }, p) });
        }
      }
      if (panelWindow && (remove.length || restyle.length)) {
        panelWindow.postMessage(
          { source: "HAR_EXTRACTOR", type: "HTTP_RESYNC", payload: { remove, restyle } },
          "*"
        );
      }
      sendInitialHar();
    }

    panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "INIT" }, "*");

    // Listen for messages from the panel window (React app)
    const handlePanelMessage = (event: any) => {
      if (event.data?.source !== "HAR_EXTRACTOR") return;

      console.log("🔌 DevTools received message:", event.data.type);

      if (event.data.type === "REQUEST_HAR_RELOAD") {
        // Re-apply the URL patterns and add calls from the network log that aren't in the table
        // yet. Rows already in the table are never rebuilt or dropped here.
        console.log("🔁 Panel requested HAR reload");
        resyncHttpRows();
      }

      if (event.data.type === "CLEAR_LOGS") {
        console.log("🧹 Panel requested CLEAR_LOGS");
        // Calls/messages that finished before now stay cleared (also when backfilling from getHAR)
        logsClearedAt = Date.now();
        httpRowState.clear();
        seenWsMessages.clear();
        wsRecentFrames.clear();
        wsSentTimestamps.clear();
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
              // Re-apply the new patterns to the captured rows and add newly matching calls
              resyncHttpRows();
              
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
                wsMonoToWallOffsetMs = null;
                seenWsMessages.clear();
                
                console.log("✅ Windows Chrome state cleanup completed");
              } catch (error) {
                console.log("⚠️ State cleanup failed:", (error as any)?.message);
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

        // Re-inject interceptor for fallback capture while reconnecting
        injectWsInterceptor();

        // Always execute the force reconnection
        forceReconnection();
      }
    };

    handlePanelMessageRef = handlePanelMessage;
    sendInitialHarRef = sendInitialHar;

    // Listen on both panelWindow and window to ensure we catch all messages
    panelWindow.addEventListener("message", handlePanelMessage);
    window.addEventListener("message", handlePanelMessage);

    // Backfill matching calls that finished before the panel was opened
    sendInitialHar();
  });
});