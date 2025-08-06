import React, { useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";

interface DebuggerStatusProps {
  isDarkMode: boolean;
}

declare const chrome: any;

export const DebuggerStatus: React.FC<DebuggerStatusProps> = ({ isDarkMode }) => {
  const [debuggerConnected, setDebuggerConnected] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    // Listen for debugger disconnection messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.source === "HAR_EXTRACTOR") {
        if (event.data.type === "DEBUGGER_DISCONNECTED") {
          setDebuggerConnected(false);
          setIsReconnecting(false);
        } else if (event.data.type === "DEBUGGER_RECONNECTED") {
          setDebuggerConnected(true);
          setIsReconnecting(false);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleReconnect = () => {
    setIsReconnecting(true);
    
    // Send reconnection request to devtools
    window.postMessage({
      source: "HAR_EXTRACTOR",
      type: "RECONNECT_DEBUGGER"
    }, "*");

    // Timeout after 5 seconds if reconnection fails
    setTimeout(() => {
      if (isReconnecting) {
        setIsReconnecting(false);
      }
    }, 5000);
  };

  // Show connected status
  if (debuggerConnected) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 bg-green-500 rounded-full"></div>
        <span className={`text-sm font-medium ${isDarkMode ? "text-green-200" : "text-green-800"}`}>
          WS Connected
        </span>
      </div>
    );
  }

  // Show reconnect button when disconnected
  return (
    <button
      onClick={handleReconnect}
      disabled={isReconnecting}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors duration-200 ${
        isDarkMode
          ? "bg-orange-600 hover:bg-orange-700 text-white disabled:bg-orange-800 disabled:opacity-50"
          : "bg-orange-500 hover:bg-orange-600 text-white disabled:bg-orange-300"
      }`}
    >
      <RotateCcw className={`h-3 w-3 ${isReconnecting ? 'animate-spin' : ''}`} />
      {isReconnecting ? "Connecting..." : "Reconnect"}
    </button>
  );
};
