// devtools.ts - Fully stable with WS reliability and panel re-entry safety + Configurable URL patterns

// HTTP rows already sent to the panel, keyed by row key (see getHttpBaseKey).
// Like the DevTools Network tab, rows survive in-app route changes, a page (re)load that resets the
// DevTools network log drops the previous page's rows (unless "Preserve log" is on there), and
// Clear drops everything.
interface HttpRowState {
  url: string;
  pattern: UrlPattern;
  apexMethod?: any;
  // Row backfilled from getHAR(); the onRequestFinished data for the same request replaces it.
  tentative: boolean;
  // Bumped whenever the key is (re)claimed, so stale async getContent() results are dropped.
  gen: number;
  // Request start (wall-clock ms) and identity in the DevTools network log (see getHarLooseId)
  startTime: number;
  looseId: string;
}
const httpRowState = new Map<string, HttpRowState>();
let httpRowGen = 0;
// Time of the user's last "Clear": calls/messages that finished before it are not added back.
let logsClearedAt = 0;
// Last page (re)load that reset the tables: start of its main request (ms) and its HAR page id.
// Calls of the previous page that are still finishing are not added back.
let pageResetAt = 0;
let pageResetPageRef: string | null = null;
// WS messages before this time (ms) belong to the previous page and are not added back.
let wsResetCutoff = 0;

// Exact-duplicate guard for debugger WS frames
const seenWsMessages = new Set<string>();
// Track sent WS timestamps by TaskId for duration calculation
const wsSentTimestamps = new Map<string, number>();
// Track WS connection URL per requestId so generic (non-Conga) messages can show it
const wsUrlsByRequestId: Record<string, string> = {};
// Latest WS connection URL seen (used as fallback for generic messages)
let latestWsBaseUrl: string | null = null;
// Connection URL last posted to the panel (WS_BASE_URL), so it isn't re-posted for every message
let postedWsBaseUrl: string | null = null;
let debuggerAttached = false;
// Offset (ms) from CDP monotonic timestamps to wall-clock time, for debugger WS frames
let wsMonoToWallOffsetMs: number | null = null;
// Track most recent WS event to detect stalls
let lastWsEventTime: number | null = null;
// Declare chrome API for TypeScript
declare const chrome: any;

// Track attached sub-targets (workers/iframes) to ensure WS events aren't filtered out
const attachedTargetIds = new Set<string>();

// chrome.debugger connection state, shown in the panel. WS capture also works without the debugger
// (page interceptor + DevTools network log), but only the debugger delivers every frame instantly.
interface DebuggerStatus {
  state: 'attached' | 'unavailable' | 'detached';
  error?: string;
  hint?: string;
}
let debuggerStatus: DebuggerStatus | null = null;
// The user closed Chrome's "started debugging this browser" bar: reattach only when they click Retry
let debuggerCancelledByUser = false;
// The last attach failed because another extension has a frame in the page
let debuggerBlockedByExtensionFrame = false;

// ========================
// WS INTERCEPTOR FALLBACK
// ========================
// Page-level WebSocket interceptor injected via chrome.devtools.inspectedWindow.eval(). It doesn't
// need chrome.debugger, but only sees the top frame's sockets: new ones from the start, and ones
// opened before injection from their next send() on. Sockets inside iframes (and messages from
// before injection) are read from the DevTools network log (see processHarWebSockets).
let wsPollingInterval: ReturnType<typeof setInterval> | null = null;
let onNavigatedListenerAdded = false;
let currentPanelWindow: any = null;
let debuggerRetryInterval: ReturnType<typeof setInterval> | null = null;
// Whether the Conga Debugger panel is the selected DevTools tab
let panelVisible = false;

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
  var proto = OrigWS.prototype;
  var protoSend = proto.send;
  // Listens to a socket's received messages (once per socket)
  function hook(ws) {
    try {
      if (ws.__congaHooked) return;
      Object.defineProperty(ws, '__congaHooked', { value: true });
      ws.addEventListener('message', function(event) {
        try {
          if (typeof event.data === 'string') {
            enqueue({ direction: 'received', data: event.data, url: ws.url, timestamp: Date.now() });
          }
        } catch(e) {}
      });
    } catch(e) {}
  }
  // Sockets opened before injection are picked up at their next send()
  proto.send = function(data) {
    try {
      if (this instanceof OrigWS) {
        hook(this);
        if (typeof data === 'string') {
          enqueue({ direction: 'sent', data: data, url: this.url, timestamp: Date.now() });
        }
      }
    } catch(e) {}
    return protoSend.apply(this, arguments);
  };
  function CongaWebSocket(url, protocols) {
    var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
    hook(ws);
    ws.addEventListener('open', function() {
      try {
        enqueue({ direction: 'open', data: '', url: ws.url, timestamp: Date.now() });
      } catch(e) {}
    });
    return ws;
  }
  CongaWebSocket.CONNECTING = OrigWS.CONNECTING;
  CongaWebSocket.OPEN = OrigWS.OPEN;
  CongaWebSocket.CLOSING = OrigWS.CLOSING;
  CongaWebSocket.CLOSED = OrigWS.CLOSED;
  CongaWebSocket.prototype = proto;
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
          const rows: any[] = [];
          for (const msg of messages) {
            const row = processInterceptedWsMessage(msg, pw);
            if (row) rows.push(row);
          }
          postWsRows(pw, rows);
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

// Retries attaching the debugger every 10s while the panel is visible
function startDebuggerRetry(attach: () => void) {
  if (debuggerRetryInterval) return;
  console.log("🔄 Starting debugger auto-retry (every 10s)...");
  debuggerRetryInterval = setInterval(() => {
    if (debuggerAttached || !panelVisible) {
      stopDebuggerRetry();
      return;
    }
    attach();
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
// WS FRAME HANDLING (shared by the debugger, the page interceptor and the DevTools network log)
// ========================
type WsSource = 'dbg' | 'int' | 'har';
const WS_SOURCE_BIT: Record<WsSource, number> = { dbg: 1, int: 2, har: 4 };

// The same frame can be reported by up to three sources. Each frame is shown once: a report is a
// duplicate when another source already reported a frame with the same content and a close
// timestamp (the mask records which sources reported each frame).
const wsRecentFrames = new Map<string, { mask: number; frameTime: number; seenAt: number }[]>();
let wsRecentCount = 0;
let wsRecentLastPrune = 0;
const WS_MATCH_WINDOW_MS = 15_000;
// Long enough for the network-log poll (at most ~60s apart) to catch up with the live sources
const WS_RECENT_TTL_MS = 10 * 60_000;
const WS_RECENT_MAX = 50_000;

function pruneWsRecentFrames(keep: (e: { frameTime: number; seenAt: number }) => boolean) {
  let count = 0;
  for (const [k, list] of wsRecentFrames) {
    const kept = list.filter(keep);
    if (kept.length) {
      wsRecentFrames.set(k, kept);
      count += kept.length;
    } else {
      wsRecentFrames.delete(k);
    }
  }
  wsRecentCount = count;
}

function clearWsRecentFrames() {
  wsRecentFrames.clear();
  wsRecentCount = 0;
}

function isWsCrossSourceDuplicate(src: WsSource, fp: string, frameTime: number): boolean {
  const now = Date.now();
  if (now - wsRecentLastPrune > 30_000 || wsRecentCount > WS_RECENT_MAX) {
    wsRecentLastPrune = now;
    pruneWsRecentFrames((e) => now - e.seenAt < WS_RECENT_TTL_MS);
    // Extremely chatty socket: keep only the last couple of minutes
    if (wsRecentCount > WS_RECENT_MAX) pruneWsRecentFrames((e) => now - e.seenAt < WS_RECENT_TTL_MS / 5);
    if (wsRecentCount > WS_RECENT_MAX) clearWsRecentFrames();
  }

  const bit = WS_SOURCE_BIT[src];
  let list = wsRecentFrames.get(fp);
  if (list) {
    let best: { mask: number } | null = null;
    let bestDiff = Infinity;
    for (const e of list) {
      if (e.mask & bit) continue;
      const diff = Math.abs(e.frameTime - frameTime);
      if (diff <= WS_MATCH_WINDOW_MS && diff < bestDiff) {
        best = e;
        bestDiff = diff;
      }
    }
    if (best) {
      best.mask |= bit;
      return true;
    }
  } else {
    list = [];
    wsRecentFrames.set(fp, list);
  }

  list.push({ mask: bit, frameTime, seenAt: now });
  wsRecentCount++;
  // Enough for a socket repeating the same message several times a second between log polls
  if (list.length > 1000) {
    wsRecentCount -= list.length - 1000;
    list.splice(0, list.length - 1000);
  }
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

// Announces the WS connection URL shown in the panel's WebSocket header (only when it changes)
function postWsBaseUrl(panelWindow: any, url: string | null | undefined) {
  if (!panelWindow || !url || url === postedWsBaseUrl) return;
  postedWsBaseUrl = url;
  panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "WS_BASE_URL", payload: url }, "*");
}

function postWsRows(panelWindow: any, rows: any[]) {
  if (!panelWindow || !rows.length) return;
  if (rows.length === 1) {
    panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "WS", payload: rows[0] }, "*");
  } else {
    panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "WS_BATCH", payload: rows }, "*");
  }
}

// Turns a WS frame into a table row; null when the frame is filtered out or was already shown.
function handleWsFrame(
  panelWindow: any,
  src: WsSource,
  direction: 'sent' | 'received',
  rawPayload: any,
  frameTime: number,
  connUrl: string | null,
  exactDupKey?: string
): any | null {
  if (!panelWindow || !rawPayload) return null;
  // Frames from before the user's last "Clear" or the last page (re)load are not added back.
  if (frameTime < Math.max(logsClearedAt, wsResetCutoff)) return null;
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
  if (isCongaEnvelope && action === "heartbeat") return null;

  const fp = `${direction}|${fnv1a(raw.length > 8192 ? raw.slice(0, 8192) : raw)}`;
  if (exactDupKey) {
    const k = `${exactDupKey}|${fp}`;
    if (seenWsMessages.has(k)) return null;
    if (seenWsMessages.size > 20_000) seenWsMessages.clear();
    seenWsMessages.add(k);
  }
  if (isWsCrossSourceDuplicate(src, fp, frameTime)) return null;

  let endpoint: string;
  if (isCongaEnvelope) {
    endpoint = topLevel.EndPoint || (topLevel.TaskId ? `TaskId: ${topLevel.TaskId}` : "(unknown)");
  } else if (connUrl) {
    // Generic WS: show the connection URL path, and announce it so the
    // connection header shows the URL even on pre-existing connections
    postWsBaseUrl(panelWindow, connUrl);
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

  return {
    endpoint,
    action,
    payload: topLevel,
    status,
    direction,
    timestamp: frameTime,
    time: new Date(frameTime).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    duration,
  };
}

function processInterceptedWsMessage(msg: any, panelWindow: any): any | null {
  if (!panelWindow || !msg) return null;
  if (msg.direction === 'open') {
    if (msg.url) {
      latestWsBaseUrl = msg.url;
      postWsBaseUrl(panelWindow, msg.url);
    }
    return null;
  }
  if (msg.direction !== 'sent' && msg.direction !== 'received') return null;
  const frameTime = typeof msg.timestamp === 'number' && isFinite(msg.timestamp) ? msg.timestamp : Date.now();
  const row = handleWsFrame(panelWindow, 'int', msg.direction, msg.data, frameTime, msg.url || latestWsBaseUrl);
  // Sockets opened before the interceptor was injected have no 'open' message
  if (msg.url && !latestWsBaseUrl && frameTime >= Math.max(logsClearedAt, wsResetCutoff)) {
    latestWsBaseUrl = msg.url;
    postWsBaseUrl(panelWindow, msg.url);
  }
  return row;
}

// ========================
// DEVTOOLS NETWORK LOG (chrome.devtools.network.getHAR)
// ========================
// The DevTools network log doesn't need chrome.debugger and has the WebSockets of every frame
// (also iframes) with their messages, including sockets opened before the interceptor was injected.

// Identity of a request in the DevTools network log, to tell whether a row is still listed there
function getHarLooseId(entry: any): string {
  return `${entry?.request?.method || 'GET'} ${entry?.request?.url} ${entry?.startedDateTime}`;
}

function getHarStartMs(entry: any): number {
  return new Date(entry?.startedDateTime).getTime();
}

// getHAR() copies the whole log (every request and WS message), so only one call runs at a time.
// Jobs queued meanwhile share the next call, which reflects the log as it is after they were queued.
let harInFlight = false;
const harQueue: ((har: any | null) => void)[] = [];
let harRttMs = 300;
// Highest DevTools page load id ("page_N", only grows) seen in a getHAR() result
let maxPageIdSeen = -1;
let harBaselineKnown = false;

function getHarPageId(ref: any): number {
  const m = /^page_(\d+)$/.exec(String(ref ?? ''));
  return m ? Number(m[1]) : -1;
}

function noteHarPages(har: any) {
  for (const p of har?.pages || []) maxPageIdSeen = Math.max(maxPageIdSeen, getHarPageId(p?.id));
  harBaselineKnown = true;
}

function withHar(job: (har: any | null) => void) {
  harQueue.push(job);
  runHarQueue();
}

function runHarQueue() {
  if (harInFlight || !harQueue.length) return;
  const jobs = harQueue.splice(0);
  const startedAt = Date.now();
  let done = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const finish = (har: any | null) => {
    if (done) return;
    done = true;
    if (watchdog) clearTimeout(watchdog);
    harInFlight = false;
    harRttMs = Math.max(1, Date.now() - startedAt);
    if (har) noteHarPages(har);
    for (const job of jobs) {
      try {
        job(har);
      } catch (e) {
        console.log("⚠️ Error processing the DevTools network log:", e);
      }
    }
    runHarQueue();
  };
  if (!chrome.devtools?.network?.getHAR) {
    finish(null);
    return;
  }
  harInFlight = true;
  // The callback isn't guaranteed to run
  watchdog = setTimeout(() => finish(null), 30_000);
  try {
    chrome.devtools.network.getHAR((har: any) => finish(har || null));
  } catch {
    finish(null);
  }
}

// Messages already processed per WebSocket in the network log (key: see getHarWsKey)
const harWsProgress = new Map<string, number>();

function getHarWsKey(entry: any): string {
  return `${entry?.request?.url}|${entry?.startedDateTime}`;
}

// Adds the WS messages of the network log that the live capture didn't show (sockets in iframes or
// opened before the interceptor was injected, or everything while chrome.debugger isn't attached).
function processHarWebSockets(panelWindow: any, har: any, forceBaseUrl = false) {
  if (!panelWindow || !har) return;
  const inLog = new Set<string>();
  const rows: any[] = [];
  let newest: { url: string; start: number } | null = null;
  let newestNew: { url: string; start: number } | null = null;

  for (const entry of har.entries || []) {
    const messages = entry?._webSocketMessages;
    if (entry?._resourceType !== 'websocket' && !Array.isArray(messages)) continue;
    const url: string | undefined = entry?.request?.url;
    if (!url) continue;
    const key = getHarWsKey(entry);
    inLog.add(key);
    const start = getHarStartMs(entry) || 0;
    if (!newest || start >= newest.start) newest = { url, start };
    if (!harWsProgress.has(key) && (!newestNew || start >= newestNew.start)) newestNew = { url, start };

    const list: any[] = Array.isArray(messages) ? messages : [];
    let done = harWsProgress.get(key) || 0;
    if (done > list.length) done = 0;
    for (let i = done; i < list.length; i++) {
      const m = list[i];
      if (!m || (m.type !== 'send' && m.type !== 'receive')) continue;
      if (typeof m.time !== 'number' || !isFinite(m.time)) continue;
      const row = handleWsFrame(panelWindow, 'har', m.type === 'send' ? 'sent' : 'received', m.data, Math.round(m.time * 1000), url);
      if (row) rows.push(row);
    }
    harWsProgress.set(key, list.length);
  }
  for (const key of [...harWsProgress.keys()]) {
    if (!inLog.has(key)) harWsProgress.delete(key);
  }

  const base = forceBaseUrl ? newest : newestNew;
  if (base) {
    latestWsBaseUrl = base.url;
    postWsBaseUrl(panelWindow, base.url);
  }
  postWsRows(panelWindow, rows);
}

// Polls the network log for new WS messages: often while chrome.debugger isn't attached, rarely
// while it is (then only sockets the debugger can't see add anything). Adapts to getHAR()'s cost.
let harPollTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleHarPoll(delay?: number) {
  if (harPollTimer) clearTimeout(harPollTimer);
  if (delay === undefined) {
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    if (!debuggerAttached) {
      delay = panelVisible ? clamp(10 * harRttMs, 1500, 15_000) : clamp(10 * harRttMs, 5000, 60_000);
    } else {
      delay = panelVisible ? clamp(20 * harRttMs, 15_000, 60_000) : 60_000;
    }
  }
  harPollTimer = setTimeout(() => {
    harPollTimer = null;
    withHar((har) => {
      processHarWebSockets(currentPanelWindow, har);
      if (!harPollTimer) scheduleHarPoll();
    });
  }, delay);
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
  let refreshFromHarRef: (() => void) | null = null;
  let attachDebuggerRef: (() => void) | null = null;
  // Track pending network requests for loading state
  let pendingNetworkRequests = new Set<string>();
  let loadingTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function postDebuggerStatus() {
    if (!panelWindow || !debuggerStatus) return;
    panelWindow.postMessage({ source: "HAR_EXTRACTOR", type: "DEBUGGER_STATUS", payload: debuggerStatus }, "*");
  }

  // Posts the status when it changed (or when forced, so a Retry click always gets an answer)
  function setDebuggerStatus(status: DebuggerStatus, force = false): boolean {
    const prev = debuggerStatus;
    debuggerStatus = status;
    const changed = !prev || prev.state !== status.state || prev.error !== status.error || prev.hint !== status.hint;
    if (changed || force) postDebuggerStatus();
    return changed;
  }

  // If the panel page itself gets reloaded it starts empty and loses our message listener:
  // hook it up again and resend everything that is still in the DevTools network log.
  function ensurePanelHooked() {
    try {
      if (!panelWindow || panelWindow.__congaDebuggerHooked) return;
      // Wait until the panel's early message buffer exists, so nothing posted to it is lost
      if (typeof panelWindow.__CONGA_STOP_EARLY_BUFFER__ !== "function") return;
      panelWindow.__congaDebuggerHooked = true;
      if (handlePanelMessageRef) panelWindow.addEventListener("message", handlePanelMessageRef);
      httpRowState.clear();
      clearWsRecentFrames();
      harWsProgress.clear();
      wsSentTimestamps.clear();
      latestWsBaseUrl = null;
      postedWsBaseUrl = null;
      postDebuggerStatus();
      refreshFromHarRef?.();
    } catch {}
  }

  // Hiding the panel does NOT stop capturing; only the resend listener and debugger retries stop.
  panel.onHidden.addListener(() => {
    panelVisible = false;
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
    panelVisible = true;

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
      if (!debuggerAttached && !debuggerCancelledByUser) attachDebuggerRef?.();
      injectWsInterceptor();
      if (!wsPollingInterval) startWsPolling(panelWindow);
      scheduleHarPoll(0);
      return;
    }
    panelInitialized = true;
    panelWindow.__congaDebuggerHooked = true;

    // ── chrome.debugger ───────────────────────────────────────────────
    // Attached when the panel is first shown, so WS frames of every connection (also ones opened
    // before the panel was shown) arrive instantly; Chrome then shows its "started debugging this
    // browser" bar. When Chrome refuses (e.g. another extension has a frame in the page, or a
    // policy blocks it) the panel shows why, and WS messages still come from the page interceptor
    // and the DevTools network log.
    let attachInFlight = false;
    // The user clicked Retry: report the outcome even if the status didn't change
    let manualRetryPending = false;

    // Always passes a callback: without one, sendCommand returns a promise, and a failed command
    // then shows up as an "Uncaught (in promise)" error of the extension in chrome://extensions.
    function sendDebuggerCommand(method: string, params: any, onDone?: () => void) {
      try {
        chrome.debugger.sendCommand(debuggee, method, params, () => {
          const err = chrome.runtime.lastError?.message;
          if (err) console.log(`⚠️ ${method} failed:`, err);
          onDone?.();
        });
      } catch (e) {
        console.log(`⚠️ ${method} failed:`, (e as any)?.message || e);
      }
    }

    // Target.setDiscoverTargets isn't sent: Chrome always answers "Not allowed" to extensions
    function enableDebuggerDomains() {
      sendDebuggerCommand("Network.enable", { maxTotalBufferSize: 100_000_000, maxResourceBufferSize: 50_000_000 });
      sendDebuggerCommand("Network.setCacheDisabled", { cacheDisabled: true });
      sendDebuggerCommand("Page.enable", {});
      sendDebuggerCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    }

    function onDebuggerAttached() {
      console.log("✅ Debugger attached to tab:", currentTabId);
      debuggerAttached = true;
      debuggerCancelledByUser = false;
      debuggerBlockedByExtensionFrame = false;
      stopDebuggerRetry();
      enableDebuggerDomains();
      setDebuggerStatus({ state: 'attached' }, manualRetryPending);
      manualRetryPending = false;
      try { startWsWatchdog(); } catch {}
      scheduleHarPoll();
    }

    function onDebuggerAttachFailed(error: string) {
      console.log("❌ Failed to attach debugger:", error);
      debuggerBlockedByExtensionFrame = /chrome-extension:|different extension/i.test(error);
      let hint = "";
      let retry = true;
      if (debuggerBlockedByExtensionFrame) {
        hint = "Another extension has a frame in this page (e.g. a password manager or Salesforce Inspector). Disable it for this site, then click Retry.";
      } else if (/policy|restricted on this target/i.test(error)) {
        hint = "Your organization's Chrome policy blocks debugging this page.";
        retry = false;
      } else if (/chrome:\/\/|Cannot access contents|cannot be scripted|Cannot attach to this target|file URL/i.test(error)) {
        hint = "Chrome doesn't allow debugging this page.";
        retry = false;
      }
      const changed = setDebuggerStatus({ state: 'unavailable', error, hint }, manualRetryPending);
      manualRetryPending = false;
      if (retry && panelVisible) startDebuggerRetry(attachDebuggerForWs);
      // Read the network log more often now that the debugger isn't delivering frames
      if (changed) scheduleHarPoll(0);
    }

    function attachDebuggerForWs() {
      if (debuggerAttached || attachInFlight) return;
      attachInFlight = true;
      console.log("🔧 Attaching debugger to tab:", currentTabId);
      try {
        chrome.debugger.attach(debuggee, "1.3", () => {
          attachInFlight = false;
          const error: string | undefined = chrome.runtime.lastError?.message;
          // "Already attached" is this extension's own earlier attachment (it outlives DevTools)
          if (error && !/already attached/i.test(error)) onDebuggerAttachFailed(error);
          else onDebuggerAttached();
        });
      } catch (e) {
        attachInFlight = false;
        onDebuggerAttachFailed((e as any)?.message || String(e));
      }
    }

    chrome.debugger.onDetach.addListener((detachedDebuggee: any, reason: string) => {
      if (detachedDebuggee.tabId !== currentTabId) return;
      console.log("🔌 Debugger detached:", reason);
      debuggerAttached = false;
      attachedTargetIds.clear();
      if (reason === "canceled_by_user") {
        // The user closed Chrome's debugging bar: only reattach when they click Retry
        debuggerCancelledByUser = true;
        stopDebuggerRetry();
        setDebuggerStatus({
          state: 'detached',
          error: "Chrome's \"started debugging this browser\" bar was closed",
          hint: "Click Retry to reattach.",
        });
      } else {
        // Chrome also detaches when a frame of another extension is added to the page
        debuggerBlockedByExtensionFrame = reason === "target_closed";
        setDebuggerStatus({
          state: 'detached',
          error: `Chrome detached the debugger (${reason})`,
          hint: reason === "target_closed"
            ? "This usually means another extension added a frame to the page (e.g. a password manager or Salesforce Inspector). Disable it for this site, then click Retry."
            : "",
        });
        if (panelVisible) startDebuggerRetry(attachDebuggerForWs);
      }
      // The page interceptor and the network log keep capturing WS traffic on their own
      injectWsInterceptor();
      scheduleHarPoll(0);
    });

    attachDebuggerRef = attachDebuggerForWs;

    // Always rebind the listener safely
    chrome.debugger.onEvent.removeListener(handleEvent);
    chrome.debugger.onEvent.addListener(handleEvent);

    attachDebuggerForWs();

    // The page interceptor works without the debugger. Frames captured more than once
    // (debugger, interceptor, network log) are shown once (see isWsCrossSourceDuplicate).
    injectWsInterceptor();
    startWsPolling(panelWindow);

    // ── Page navigations ──────────────────────────────────────────────
    // Like the DevTools Network tab: a page (re)load that resets the DevTools network log also
    // resets the tables, while in-app route changes and DevTools' "Preserve log" keep the rows.
    // A navigation counts as a (re)load when the network log has a new page load (HAR pages) and
    // no longer lists any request that started before it.
    let pendingNav: { pageIdBefore: number | null; navTimes: number[]; firstAt: number } | null = null;
    let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
    let finalPassTimer: ReturnType<typeof setTimeout> | null = null;
    let navAttachTimer: ReturnType<typeof setTimeout> | null = null;
    // Highest page load id seen by the last navigation check
    let lastReconciledPageId = -1;

    function reconcileAfterNavigation() {
      reconcileTimer = null;
      const nav = pendingNav;
      pendingNav = null;
      if (!nav) return;
      const snapshot = [...httpRowState].map(([key, st]) => [key, st.looseId] as [string, string]);
      withHar((har) => {
        if (!har) return;
        const pages: any[] = har.pages || [];
        const before = Math.max(nav.pageIdBefore ?? -1, lastReconciledPageId);
        let page: any = null;
        let pageId = before;
        let maxId = -1;
        for (const p of pages) {
          const id = getHarPageId(p?.id);
          maxId = Math.max(maxId, id);
          if (id > pageId) {
            page = p;
            pageId = id;
          }
        }
        lastReconciledPageId = Math.max(lastReconciledPageId, maxId);

        const boundary = page ? getHarStartMs(page) : NaN;
        let reset = !!page && isFinite(boundary);
        // The log wasn't read before this navigation: the new page load must be recent
        if (reset && nav.pageIdBefore === null && boundary < nav.navTimes[0] - 60_000) reset = false;
        // Requests older than the new page are still listed: "Preserve log" is on
        if (reset && (har.entries || []).some((e: any) => getHarStartMs(e) < boundary - 1000)) reset = false;

        if (reset) resetForNewPage(har, page, boundary, nav.navTimes, snapshot);
        backfillHttpFromHar(har);
        processHarWebSockets(panelWindow, har, reset);
      });
    }

    function resetForNewPage(har: any, page: any, boundary: number, navTimes: number[], snapshot: [string, string][]) {
      pageResetAt = boundary;
      pageResetPageRef = page.id;
      // WS messages from before the new page committed belong to the previous page
      const committedAt = navTimes.find((t) => t >= boundary) ?? boundary;
      wsResetCutoff = Math.max(boundary, committedAt - 300);
      pruneWsRecentFrames((e) => e.frameTime >= wsResetCutoff);

      // Rows of calls the network log no longer lists (they belonged to the previous page)
      const inLog = new Set<string>((har.entries || []).map(getHarLooseId));
      const remove = new Set<string>();
      for (const [key, looseId] of snapshot) {
        if (!inLog.has(looseId)) remove.add(key);
      }
      for (const [key, st] of httpRowState) {
        if (st.startTime < boundary && !inLog.has(st.looseId)) remove.add(key);
      }
      for (const key of remove) httpRowState.delete(key);

      latestWsBaseUrl = null;
      postedWsBaseUrl = null;
      for (const [taskId, t] of wsSentTimestamps) {
        if (t < wsResetCutoff) wsSentTimestamps.delete(taskId);
      }
      console.log(`🔄 Page (re)loaded — showing the new page's calls only (${remove.size} HTTP rows removed)`);
      panelWindow?.postMessage(
        { source: "HAR_EXTRACTOR", type: "PAGE_RESET", payload: { before: wsResetCutoff, removeHttpKeys: [...remove] } },
        "*"
      );

      // Calls of the previous page that were still finishing during the reload can arrive a bit
      // later: drop the rows the network log doesn't list once things have settled.
      if (finalPassTimer) clearTimeout(finalPassTimer);
      const pageRef = page.id;
      finalPassTimer = setTimeout(() => {
        finalPassTimer = null;
        const snap = [...httpRowState].map(([key, st]) => [key, st.looseId] as [string, string]);
        withHar((h) => {
          if (!h || pageResetPageRef !== pageRef || !(h.pages || []).some((p: any) => p?.id === pageRef)) return;
          const ids = new Set<string>((h.entries || []).map(getHarLooseId));
          const stale = snap.filter(([key, looseId]) => !ids.has(looseId) && httpRowState.has(key)).map(([key]) => key);
          if (!stale.length) return;
          for (const key of stale) httpRowState.delete(key);
          panelWindow?.postMessage(
            { source: "HAR_EXTRACTOR", type: "HTTP_RESYNC", payload: { remove: stale, restyle: [] } },
            "*"
          );
        });
      }, 2500);
    }

    if (!onNavigatedListenerAdded) {
      chrome.devtools.network.onNavigated.addListener((url: string) => {
        console.log("🔄 onNavigated:", url);
        // Re-inject the interceptor once the new page's context is ready (retried for slow pages)
        setTimeout(() => injectWsInterceptor(), 100);
        setTimeout(() => injectWsInterceptor(), 500);
        setTimeout(() => injectWsInterceptor(), 1500);

        // Check (once navigations settle) whether this was a page (re)load
        const now = Date.now();
        if (!pendingNav) {
          pendingNav = { pageIdBefore: harBaselineKnown ? maxPageIdSeen : null, navTimes: [], firstAt: now };
        }
        pendingNav.navTimes.push(now);
        if (reconcileTimer) clearTimeout(reconcileTimer);
        reconcileTimer = setTimeout(reconcileAfterNavigation, Math.max(0, Math.min(300, pendingNav.firstAt + 1500 - now)));

        // The new page may allow attaching (e.g. after leaving a chrome:// page). When another
        // extension's frame blocked it, wait until that frame is back so the attach fails cleanly
        // instead of flashing Chrome's debugging bar.
        if (!debuggerAttached && !debuggerCancelledByUser) {
          if (navAttachTimer) clearTimeout(navAttachTimer);
          navAttachTimer = setTimeout(() => {
            navAttachTimer = null;
            attachDebuggerForWs();
          }, debuggerBlockedByExtensionFrame ? 3000 : 0);
        }
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
        const startTime = getHarStartMs(request);
        // Finished before the user's last Clear
        if (startTime + (request.time || 0) < logsClearedAt) return;
        // A call of the page that was there before the last page (re)load
        if (startTime < pageResetAt && request.pageref !== pageResetPageRef) return;

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
        httpRowState.set(key, {
          url,
          pattern: matchedPattern,
          apexMethod: req?.method,
          tentative: false,
          gen,
          startTime,
          looseId: getHarLooseId(request),
        });

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
          postWsBaseUrl(panelWindow, wsUrl);
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
        postWsBaseUrl(panelWindow, wsUrl);

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
        const row = handleWsFrame(
          panelWindow,
          'dbg',
          direction,
          rawPayload,
          dbgMonoToWallMs(params?.timestamp),
          (reqId && wsUrlsByRequestId[reqId]) || latestWsBaseUrl,
          `${reqId}|${params?.timestamp}|${direction}`
        );
        if (row) postWsRows(panelWindow, [row]);
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
          sendDebuggerCommand("Network.enable", {
            maxTotalBufferSize: 100_000_000,
            maxResourceBufferSize: 50_000_000
          });
          sendDebuggerCommand("Page.enable", {});
          sendDebuggerCommand("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
        }
      }, 5600);

      // Second deeper check at 12s — also try non-flattened mode and re-enable on all known sub-targets
      setTimeout(() => {
        if (!debuggerAttached) return; // Debugger was detached, skip
        const stillInactive = !lastWsEventTime || (Date.now() - lastWsEventTime > 11000);
        if (stillInactive) {
          console.log("⏱️ WS still inactive after 12s — trying deeper recovery");
          // Disable then re-enable Network to force Chrome to re-emit WS events
          sendDebuggerCommand("Network.disable", {}, () => {
            if (!debuggerAttached) return;
            sendDebuggerCommand("Network.enable", {
              maxTotalBufferSize: 100_000_000,
              maxResourceBufferSize: 50_000_000
            });
          });
          // Try auto-attach without flatten for broader compatibility
          sendDebuggerCommand("Target.setAutoAttach", {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: true
          });
        }
      }, 12000);
    }

    // Backfills matching calls that are already in the DevTools network log (e.g. finished before
    // the panel was opened, or newly matching after a URL-pattern change). Calls already in the
    // table are skipped; calls still in flight are added by onRequestFinished once they finish.
    function backfillHttpFromHar(harLog: any) {
      if (!harLog) return;
      const occurrences = new Map<string, number>();
      for (const entry of harLog.entries || []) {
        const url = entry?.request?.url;
        if (!url) continue;
        // Still in flight
        if (!entry.response?.status && !entry.response?._error) continue;
        const startTime = getHarStartMs(entry);
        // Finished before the user's last Clear
        if (startTime + (entry.time || 0) < logsClearedAt) continue;
        // A call of the page that was there before the last page (re)load
        if (startTime < pageResetAt && entry.pageref !== pageResetPageRef) continue;

        const matchedPattern = shouldProcessUrl(url);
        if (!matchedPattern) continue;

        const base = getHttpBaseKey(entry);
        const n = occurrences.get(base) || 0;
        occurrences.set(base, n + 1);
        const key = `${base}#${n}`;
        if (httpRowState.has(key)) continue;

        const req = parseHttpRequestBody(entry);
        const gen = ++httpRowGen;
        httpRowState.set(key, {
          url,
          pattern: matchedPattern,
          apexMethod: req?.method,
          tentative: true,
          gen,
          startTime,
          looseId: getHarLooseId(entry),
        });
        entry.getContent((content: any) => postHttpRow(entry, req, key, gen, 'har', content));
      }
    }

    // Adds what's in the DevTools network log but not in the tables yet (HTTP calls and WS messages)
    function refreshFromHar() {
      withHar((har) => {
        backfillHttpFromHar(har);
        processHarWebSockets(panelWindow, har);
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
      refreshFromHar();
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
        clearWsRecentFrames();
        wsSentTimestamps.clear();
        postedWsBaseUrl = null;
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
        // Retry button in the panel: (re)attach now, also after the user closed Chrome's debugging bar
        console.log("🔌 Panel requested a debugger reconnect");
        debuggerCancelledByUser = false;
        manualRetryPending = true;
        stopDebuggerRetry();
        if (debuggerAttached) {
          enableDebuggerDomains();
          setDebuggerStatus({ state: 'attached' }, true);
          manualRetryPending = false;
        } else {
          attachDebuggerForWs();
        }
        injectWsInterceptor();
        refreshFromHar();
      }
    };

    handlePanelMessageRef = handlePanelMessage;
    refreshFromHarRef = refreshFromHar;

    // Listen on both panelWindow and window to ensure we catch all messages
    panelWindow.addEventListener("message", handlePanelMessage);
    window.addEventListener("message", handlePanelMessage);

    // Backfill the calls and WS messages that are already in the DevTools network log, then keep
    // reading new WS messages from it
    refreshFromHar();
    scheduleHarPoll();
  });
});