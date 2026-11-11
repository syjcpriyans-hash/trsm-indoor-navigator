// Builds dist-artifact/index.html: one self-contained page (JS, CSS, data, font and plan images inlined).
import { build } from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist-artifact");
const tmp = path.join(root, ".artifact-tmp");
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(tmp, { recursive: true });

// 1) source plan images as data URIs (inspector overlay)
const img = (n) => "data:image/png;base64," + fs.readFileSync(path.join(root, "public/source", `page-${n}.png`)).toString("base64");
fs.writeFileSync(path.join(tmp, "sourceImages.ts"), `export const SOURCE_IMAGES = { L7: ${JSON.stringify(img(1))}, L8: ${JSON.stringify(img(2))}, L9: ${JSON.stringify(img(3))} };\n`);

// 2) CSS: tailwind over the same globals, with Inter inlined as a data: URI
const fontFile = path.join(root, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
const font = fs.readFileSync(fontFile).toString("base64");
const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8").replace('@import "@fontsource-variable/inter";', "");
const cssIn = path.join(root, "src/app/artifact.css");
fs.writeFileSync(cssIn, `@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format("woff2-variations");}\n` + globals);
try {
  execSync(`npx @tailwindcss/cli -i ${cssIn} -o ${path.join(tmp, "app.css")} --minify`, { cwd: root, stdio: "inherit" });
} finally {
  fs.rmSync(cssIn);
}

// 3) JS bundle
const anchorBase = process.env.ANCHOR_BASE || "";
await build({
  entryPoints: [path.join(root, "artifact/entry.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  platform: "browser",
  target: ["es2020", "safari15"],
  jsx: "automatic",
  outfile: path.join(tmp, "app.js"),
  legalComments: "none",
  alias: { "next/dynamic": path.join(root, "artifact/next-dynamic-shim.tsx"), "@/lib/sourceImages": path.join(tmp, "sourceImages.ts") },
  tsconfig: path.join(root, "tsconfig.json"),
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_SINGLE_FILE": '"1"',
    "process.env.NEXT_PUBLIC_ANCHOR_BASE": JSON.stringify(anchorBase),
    "process.env.NEXT_PUBLIC_ANCHOR_STYLE": '"hash"',
  },
  loader: { ".json": "json" },
  logLevel: "warning",
});

const css = fs.readFileSync(path.join(tmp, "app.css"), "utf8");
const js = fs.readFileSync(path.join(tmp, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const html = `<!DOCTYPE html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>TRSM Indoor Navigator (prototype)</title>
<style>${css}</style>
</head>
<body class="font-sans">
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(out, "index.html"), html);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`dist-artifact/index.html ${(html.length / 1024 / 1024).toFixed(2)} MiB`);
