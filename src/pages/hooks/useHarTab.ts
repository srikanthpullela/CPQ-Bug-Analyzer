// src/pages/hooks/useHarTab.ts
import { useEffect, useState } from "react";

export function useLiveHar() {
  const [urlPatterns, setUrlPatterns] = useState<any[]>([]);

  // Load patterns from localStorage - don't apply any additional filtering
  useEffect(() => {
    const loadPatterns = () => {
      try {
        const stored = localStorage.getItem('har_extractor_url_patterns');
        console.log('[useLiveHar] Raw localStorage patterns:', stored);
        
        if (stored) {
          const patterns = JSON.parse(stored);
          console.log('[useLiveHar] Loaded URL patterns:', patterns);
          
          // Use ALL patterns from localStorage - don't filter them
          const enabledPatterns = patterns.filter((p: any) => p.enabled);
          console.log('[useLiveHar] Using patterns for filtering:', enabledPatterns);
          
          setUrlPatterns(enabledPatterns);
        } else {
          console.log('[useLiveHar] No patterns in localStorage, using empty array');
          setUrlPatterns([]);
        }
      } catch (error) {
        console.error('[useLiveHar] Error loading patterns:', error);
        setUrlPatterns([]);
      }
    };

    loadPatterns();
    
    // Listen for pattern updates from devtools
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === "HAR_EXTRACTOR") {
        if (event.data.type === "URL_PATTERNS_SAVED") {
          console.log('[useLiveHar] Patterns updated, reloading...');
          loadPatterns();
        }
      }
    };
    
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return { urlPatterns };
}