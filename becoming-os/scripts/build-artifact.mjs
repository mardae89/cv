#!/usr/bin/env node
// Builds the two deployable single-file versions of the app into dist-page/:
//
//   becoming-os.html       a complete HTML document. Open it from disk or any static
//                          host; it runs in device mode (IndexedDB in that browser).
//   becoming-os.page.html  the same app as a claude.ai Artifact page body: no doctype,
//                          html, head or body tags (the host supplies its own skeleton),
//                          just <title>, <style>, <div id="root"> and one inline module script.
//
// Both files make no network requests: JS, CSS and fonts are all inlined.
import { build } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpDir = path.join(root, "node_modules/.page-build");
const outDir = path.join(root, "dist-page");
const MAX_BYTES = 16 * 1024 * 1024;

function fail(msg) {
  console.error(`build-artifact: ${msg}`);
  process.exit(1);
}

await build({ root, mode: "page", logLevel: "warn" });

const html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");

// --- Pull the built document apart -----------------------------------------
const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1].trim();
if (!title) fail("no <title> in the build output");

const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
if (styles.length === 0) fail("no inlined <style> in the build output");

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) fail(`expected exactly one inline script, found ${scripts.length}`);
const [, scriptAttrs, builtJs] = scripts[0];
// lodash (via recharts) finds the global object with `Function("return this")()` when
// `self` is missing. Browsers always have `self`, but the page CSP forbids the
// construct outright, so swap in globalThis and leave nothing for it to flag.
const js = builtJs.replaceAll('Function("return this")()', "globalThis");
if (!/type="module"/.test(scriptAttrs) || /\bsrc=/.test(scriptAttrs)) fail("the script was not inlined");

// Anything still pointing at a file means the inliner missed it.
const leftovers = html.match(/<(?:script|link)\b[^>]*\b(?:src|href)="(?!data:)[^"]*"[^>]*>/g);
if (leftovers) fail(`un-inlined references left:\n  ${leftovers.join("\n  ")}`);

// The head metas worth keeping in the standalone file (charset first).
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";
const metas = [...head.matchAll(/<(?:meta|link)\b[^>]*>/g)].map((m) => m[0].replace(/\s*\/>$/, ">"));

const css = styles.join("\n");
const style = `<style>\n${css}\n</style>`;
const script = `<script type="module">\n${js}\n</script>`;

// --- Write both files -------------------------------------------------------
const standalone = [
  "<!doctype html>",
  '<html lang="en">',
  "<head>",
  ...metas,
  `<title>${title}</title>`,
  style,
  "</head>",
  "<body>",
  '<div id="root"></div>',
  script,
  "</body>",
  "</html>",
  "",
].join("\n");

const pageBody = [`<title>${title}</title>`, style, '<div id="root"></div>', script, ""].join("\n");

fs.mkdirSync(outDir, { recursive: true });
const files = [
  ["becoming-os.html", standalone],
  ["becoming-os.page.html", pageBody],
];
for (const [name, text] of files) {
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_BYTES) fail(`${name} is ${bytes} bytes, over the 16 MB limit`);
  if (Buffer.byteLength(text.slice(0, text.indexOf("</title>"))) > 8192) fail(`${name}: <title> is not in the first 8 KB`);
  fs.writeFileSync(path.join(outDir, name), text);
}
fs.rmSync(tmpDir, { recursive: true, force: true });

// --- Report -----------------------------------------------------------------
// The page's content security policy forbids eval and every network request, so
// say plainly if anything that looks like either made it into the bundle.
const evalHits = (js.match(/\bnew Function\(|[^.\w$]eval\(/g) ?? []).length;
// Pages loaded on demand (React.lazy + Vite's preload helper) failed inside the
// claude.ai viewer in desktop browsers; every page must be part of the one bundle.
if (js.includes("vite:preloadError")) fail("the bundle loads code on demand; import pages directly instead of with lazy()");
const urls = [...new Set(js.match(/https?:\/\/[^\s"'`)\\]+/g) ?? [])].sort();

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
for (const [name, text] of files) console.log(`dist-page/${name}  ${kb(Buffer.byteLength(text))}`);
console.log(`  js ${kb(Buffer.byteLength(js))}, css ${kb(Buffer.byteLength(css))}`);
console.log(`  eval / new Function call sites: ${evalHits}`);
console.log(`  URL strings in the bundle (none are fetched by the app): ${urls.length ? "\n    " + urls.join("\n    ") : "none"}`);
