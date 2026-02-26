import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { readFileSync, copyFileSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        popup: resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
    outDir: "dist",
  },
  plugins: [
    react(),
    {
      name: "copy-extension-files",
      writeBundle() {
        copyFileSync(
          resolve(__dirname, "public/manifest.json"),
          resolve(__dirname, "dist/manifest.json")
        );
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "content.css",
          source: readFileSync(
            resolve(__dirname, "src/content/content.css"),
            "utf-8"
          ),
        });
      },
    },
  ],
});
