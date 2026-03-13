// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { copyFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-static-files",
      apply: "build",
      closeBundle() {
        copyFileSync("manifest.json", "dist/manifest.json");
        copyFileSync("background.js", "dist/background.js");
        copyFileSync("public/icon-16.png", "dist/icon-16.png");
        copyFileSync("public/icon-48.png", "dist/icon-48.png");
        copyFileSync("public/icon-128.png", "dist/icon-128.png");
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        panel: resolve(__dirname, "panel.html"),
        devtools: resolve(__dirname, "devtools.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
});
