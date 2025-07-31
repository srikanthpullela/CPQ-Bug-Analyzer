import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";

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

      switch (type) {
        case "CLEAR_LOGS":
          setHttpRows([]);
          setWsRows([]);
          setWsBaseUrl("");
          break;

        case "CLEAR":
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
            
            console.log("Pushing HTTP row", payload.method, time);
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
              },
            ]);
          }
          break;

        case "APEXREMOTE":
          if (payload?.method) {
            const rawDate = new Date(payload.timestamp);
            const time = formatTime(rawDate);
            const startTime = rawDate.getTime();
            const endTime = payload.endTime ?? Date.now();
            
            // Detect errors for APEXREMOTE as well
            const hasMessages = payload.status && (payload.status >= 400);
            
            console.log("Pushing legacy APEXREMOTE row", payload.method, time);
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

        case "REQUEST_HAR_RELOAD":
          if (!chrome?.devtools?.network?.getHAR) {
            console.warn("chrome.devtools.network.getHAR is not available");
            return;
          }

          chrome.devtools.network.getHAR((harLog) => {
            // Get URL patterns from localStorage to filter dynamically
            let urlPatterns: any[] = [];
            try {
              const stored = localStorage.getItem('har_extractor_url_patterns');
              urlPatterns = stored ? JSON.parse(stored) : [];
            } catch (error) {
              console.warn('Error reading URL patterns:', error);
              urlPatterns = [
                { pattern: 'apexremote', enabled: true, type: 'apex', name: 'ApexRemote' },
                { pattern: 'congacloud', enabled: true, type: 'http', name: 'CongaCloud' }
              ];
            }

            // Use ALL enabled patterns from localStorage
            const enabledPatterns = urlPatterns.filter(p => p.enabled);
            
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
            
            const entries = (harLog.entries || []).filter(entry => {
              const url = entry.request.url.toLowerCase();
              
              // First check if it's a static asset
              const isStaticAsset = staticAssetExtensions.some(ext => 
                url.includes(ext.toLowerCase())
              );
              
              if (isStaticAsset) {
                return false;
              }
              
              // Then check if it matches any enabled pattern (case-insensitive and more flexible)
              const matchesPattern = enabledPatterns.some(pattern => {
                const patternLower = pattern.pattern.toLowerCase();
                return url.includes(patternLower);
              });
              
              return matchesPattern;
            });

            if (!entries.length) {
              return;
            }

            const freshRows: HttpRow[] = [];
            let completed = 0;
            let failed = 0;

            // Process entries with better error handling
            const processEntry = (entry: any, index: number) => {
              try {
                const start = new Date(entry.startedDateTime);
                const time = formatTime(start);
                const startTime = start.getTime();
                const totalTime = entry.time || 0;
                const endTime = startTime + totalTime;

                // Find which pattern matched this URL
                const matchedPattern = enabledPatterns.find(p => 
                  entry.request.url.toLowerCase().includes(p.pattern.toLowerCase())
                );

                let req = {};
                try {
                  req = JSON.parse(entry.request.postData?.text || "{}");
                } catch (e) {
                  console.debug(`[useLiveHar] Failed to parse request for entry ${index}:`, e);
                }

                // Use a timeout for getContent to avoid hanging
                const timeoutId = setTimeout(() => {
                  console.warn(`[useLiveHar] Timeout getting content for entry ${index}`);
                  failed++;
                  completed++;
                  checkCompletion();
                }, 5000);

                entry.getContent((content: string) => {
                  clearTimeout(timeoutId);
                  
                  let res = {};
                  try {
                    res = JSON.parse(content || "{}");
                  } catch (e) {
                    console.debug(`[useLiveHar] Failed to parse response for entry ${index}:`, e);
                    // For non-JSON responses, store the raw content
                    res = { _rawContent: content };
                  }

                  // Process based on pattern type
                  let method, urlPattern, patternType, httpMethod, endpoint;
                  const requestHttpMethod = entry.request.method || 'GET';
                  
                  if (matchedPattern) {
                    urlPattern = matchedPattern.name || matchedPattern.pattern;
                    patternType = matchedPattern.type || 'generic';
                    httpMethod = requestHttpMethod;
                    
                    if (patternType === 'apex') {
                      method = (req as any).method || "(unknown)";
                    } else if (patternType === 'http') {
                      endpoint = extractEndpointFromUrl(entry.request.url);
                      method = `${endpoint}`;
                    } else {
                      method = (req as any).method || requestHttpMethod || "(unknown)";
                    }
                  } else {
                    method = (req as any).method || requestHttpMethod || "(unknown)";
                    patternType = 'generic';
                    httpMethod = requestHttpMethod;
                  }

                  // Detect errors based on status code when processing HAR entries
                  const hasMessages = entry.response.status && (entry.response.status >= 400);

                  freshRows.push({
                    method,
                    requestPayload: req,
                    responsePayload: res,
                    status: entry.response.status ?? null,
                    time,
                    startTime,
                    endTime,
                    id: uuidv4(),
                    urlPattern,
                    patternType: patternType as 'apex' | 'http' | 'generic',
                    httpMethod,
                    endpoint,
                    hasMessages,
                    // Always include header data for consistency
                    requestHeaders: entry.request.headers || [],
                    responseHeaders: entry.response?.headers || [],
                    headers: {
                      request: entry.request.headers || [],
                      response: entry.response?.headers || []
                    },
                    url: entry.request.url,
                  });

                  completed++;
                  checkCompletion();
                });
              } catch (error) {
                console.error(`[useLiveHar] Error processing entry ${index}:`, error);
                failed++;
                completed++;
                checkCompletion();
              }
            };

            const checkCompletion = () => {
              if (completed === entries.length) {
                console.log(`[useLiveHar] Completed processing: ${freshRows.length} successful, ${failed} failed`);
                // Sort by start time before setting
                freshRows.sort((a, b) => a.startTime - b.startTime);
                setHttpRows(freshRows);
              }
            };

            // Process all entries
            entries.forEach(processEntry);
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
          break;
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