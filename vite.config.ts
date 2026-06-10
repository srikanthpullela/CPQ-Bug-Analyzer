// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { copyFileSync, mkdirSync, existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-static-files",
      apply: "build",
      closeBundle() {
        const root = __dirname;
        const dist = resolve(root, "dist");
        if (!existsSync(dist)) mkdirSync(dist, { recursive: true });
        copyFileSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
        copyFileSync(resolve(root, "background.js"), resolve(dist, "background.js"));
        copyFileSync(resolve(root, "public/icon-16.png"), resolve(dist, "icon-16.png"));
        copyFileSync(resolve(root, "public/icon-48.png"), resolve(dist, "icon-48.png"));
        copyFileSync(resolve(root, "public/icon-128.png"), resolve(dist, "icon-128.png"));
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
