import { readFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import type { Plugin } from "vite";

const ASSET_URL_PATTERN = /new URL\("(\.{1,2}\/[^"]+)", import\.meta\.url\)/g;
const ASSET_REFERENCE_PATTERN = /__ASSET_URL_(\w+)__/g;

function emitAssetUrls(): Plugin {
  return {
    name: "emit-asset-urls",
    async transform(code, id) {
      if (id.includes("/node_modules/")) {
        return null;
      }
      const matches = [...code.matchAll(ASSET_URL_PATTERN)];
      if (matches.length === 0) {
        return null;
      }
      const files = matches.map(([, path = ""]) => resolve(dirname(id), path));
      const sources = await Promise.all(files.map((file) => readFile(file)));
      let result = code;
      for (const [index, [expression]] of matches.entries()) {
        const referenceId = this.emitFile({
          type: "asset",
          name: basename(files[index]!),
          source: sources[index]!,
        });
        result = result.replace(
          expression,
          `new URL(__ASSET_URL_${referenceId}__, import.meta.url)`,
        );
      }
      return { code: result, map: null };
    },
    renderChunk(code, chunk) {
      if (!code.includes("__ASSET_URL_")) {
        return null;
      }
      return code.replace(ASSET_REFERENCE_PATTERN, (_match, referenceId: string) => {
        const path = relative(dirname(chunk.fileName), this.getFileName(referenceId));
        return JSON.stringify(`./${path}`);
      });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [emitAssetUrls()],
    build: {
      externalizeDeps: { exclude: ["@led-matrix/core"] },
      rolldownOptions: {
        input: {
          index: fileURLToPath(new URL("./src/main/index.ts", import.meta.url)),
          render: fileURLToPath(new URL("./src/main/render.ts", import.meta.url)),
        },
      },
    },
  },
  preload: {
    build: {
      rolldownOptions: {
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src/renderer/src", import.meta.url)),
      },
    },
  },
});
