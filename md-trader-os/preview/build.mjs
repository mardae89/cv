// Builds the single-file preview: `node preview/build.mjs [out.html]`.
//
// The app's real pages, components and engine are bundled with esbuild. The
// few modules that only make sense on a server — the JSON-file store, cookies,
// node:crypto — and the Next.js runtime pieces the pages import are swapped
// for the small stand-ins in preview/shims. Tailwind compiles the same
// globals.css the app uses. Everything is inlined into one HTML file.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const out = path.resolve(process.argv[2] ?? path.join(here, "dist", "md-trader-os.html"));
const shim = (f) => path.join(here, "shims", f);

const REDIRECT = {
  "next/link": shim("link.tsx"),
  "next/navigation": shim("navigation.ts"),
  "next/image": shim("image.tsx"),
  "next/server": shim("server.ts"),
  "next/headers": shim("headers.ts"),
  "node:crypto": shim("crypto.ts"),
  "@/lib/db/store": shim("store.ts"),
};

const shims = {
  name: "preview-shims",
  setup(b) {
    b.onResolve({ filter: /^(next\/(link|navigation|image|server|headers)|node:crypto|@\/lib\/db\/store)$/ }, (args) => ({
      path: REDIRECT[args.path],
    }));
  },
};

const js = await build({
  entryPoints: [path.join(here, "main.tsx")],
  absWorkingDir: root,
  tsconfig: path.join(root, "tsconfig.json"),
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  legalComments: "none",
  jsx: "automatic",
  loader: { ".png": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"' },
  // Server config is read from process.env; in the browser every key is unset,
  // which is exactly the app's demo mode.
  banner: { js: "var process={env:{NODE_ENV:'production'}};" },
  plugins: [shims],
  logLevel: "warning",
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const cssIn = path.join(here, "preview.css");
const css = (await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(fs.readFileSync(cssIn, "utf8"), { from: cssIn })).css;

// The artifact viewer wraps this file in its own document, pads the root by
// the phone's safe areas and starts at a 14px body; these keep the app's own
// look inside that frame.
const frame = `
:root{color-scheme:dark}
body{background:var(--color-void);color:var(--color-bone);font-size:16px}
.sticky.top-0{top:env(safe-area-inset-top,0px)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:70;background:var(--color-ink)}
nav.fixed.bottom-0{padding-bottom:env(safe-area-inset-bottom,0px)}
`;

const html = `<title>MD Trader OS</title>
<meta name="description" content="Market direction for forex and futures, with the trade journal, plan and mindset tools to become the trader.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&family=Open+Sans:wght@400;500;600&display=swap">
<style>${css}</style>
<style>${frame}</style>
<div id="root"></div>
<script>${script}</script>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
