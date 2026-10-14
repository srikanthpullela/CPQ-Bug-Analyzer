// panel.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import HarMethodsTabPage from "./src/pages/HarMethodsTabPage";

// 1. Ensure container is present
const container = document.getElementById("panelroot");
if (!container) throw new Error("Missing #panelroot");

// Messages devtools sends before the React app is listening are buffered here. useLiveHar takes
// them over (exactly once, in order) through __CONGA_STOP_EARLY_BUFFER__ when it mounts.
// devtools.ts also checks for this function to detect a freshly (re)loaded panel page.
const earlyMessages: any[] = [];

const collectEarly = (event: MessageEvent) => {
  if (event.data?.source === "HAR_EXTRACTOR") {
    earlyMessages.push(event.data);
  }
};
window.addEventListener("message", collectEarly);

(window as any).__CONGA_STOP_EARLY_BUFFER__ = () => {
  window.removeEventListener("message", collectEarly);
  return earlyMessages.splice(0);
};

// Safety net: never keep buffering if the app didn't take the messages over
setTimeout(() => window.removeEventListener("message", collectEarly), 60000);

// 2. Create root and render
const root = createRoot(container);
root.render(
  <MemoryRouter initialEntries={["/"]}>
    <HarMethodsTabPage />
  </MemoryRouter>
);

// 🔸 Optional: panel may listen to HAR_EXTRACTOR messages, for debug
window.addEventListener("message", (event) => {
  if (event?.data?.source !== "HAR_EXTRACTOR") return;

  const { type, payload } = event.data;
  if (type === "WS") {
    console.log("🟢 WS Payload received:", payload);
  }
});
