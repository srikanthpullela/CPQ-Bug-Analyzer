// panel.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import HarMethodsTabPage from "./src/pages/HarMethodsTabPage";

// 1. Ensure container is present
const container = document.getElementById("panelroot");
if (!container) throw new Error("Missing #panelroot");

const earlyMessages: any[] = [];

window.addEventListener("message", (event) => {
  if (event.data?.source === "HAR_EXTRACTOR") {
    earlyMessages.push(event.data);
  }
});

// 2. Create root and render
const root = createRoot(container);
root.render(
  <MemoryRouter initialEntries={["/"]}>
    <HarMethodsTabPage />
  </MemoryRouter>
);

setTimeout(() => {
  for (const msg of earlyMessages) {
    window.postMessage(msg, "*");
  }
}, 100);

// 🔸 Optional: panel may listen to HAR_EXTRACTOR messages, for debug
window.addEventListener("message", (event) => {
  if (event?.data?.source !== "HAR_EXTRACTOR") return;

  const { type, payload } = event.data;
  if (type === "WS") {
    console.log("🟢 WS Payload received:", payload);
  }
});
