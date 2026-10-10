import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import fs from "node:fs";
import path from "node:path";

/**
 * `vite build --mode page` makes one self-contained HTML file (JS, CSS and fonts
 * inlined, no requests at all). scripts/build-artifact.mjs runs it and writes the
 * two deployable files into dist-page/.
 */
const PAGE_OUT = "node_modules/.page-build";

/** In the single-file build, drop links to files that won't exist and inline the icon. */
function pageHead(): Plugin {
  const icon = fs.readFileSync(path.resolve(__dirname, "public/icon.svg"), "utf8");
  const iconUri = `data:image/svg+xml,${encodeURIComponent(icon)}`;
  return {
    name: "becoming-page-head",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html
          .replace(/\s*<link rel="(manifest|apple-touch-icon)"[^>]*>/g, "")
          .replace(/<link rel="icon" href="[^"]*"/, `<link rel="icon" href="${iconUri}"`),
    },
  };
}

export default defineConfig(({ mode }) => {
  const page = mode === "page";
  return {
    base: page ? "./" : "/",
    plugins: page ? [react(), pageHead(), viteSingleFile()] : [react()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: { port: 8080 },
    publicDir: page ? false : "public",
    build: page
      ? {
          outDir: PAGE_OUT,
          emptyOutDir: true,
          // Everything, including every font, becomes a data URI.
          assetsInlineLimit: () => true,
          cssCodeSplit: false,
          // There is only one chunk, so the preload polyfill (which uses fetch) has nothing to do.
          modulePreload: { polyfill: false },
          chunkSizeWarningLimit: 4096,
          reportCompressedSize: false,
        }
      : undefined,
    test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
  };
});
