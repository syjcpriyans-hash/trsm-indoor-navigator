// Make the static export safe for GitHub Pages without relying on the hidden .nojekyll file:
// Jekyll drops folders that start with "_", so rename _next → assets and rewrite references.
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] || "out-pages");
const from = path.join(dir, "_next");
if (fs.existsSync(from)) fs.renameSync(from, path.join(dir, "assets"));
let files = 0, hits = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(html|js|txt|css|json|webmanifest)$/.test(e.name)) {
      const s = fs.readFileSync(p, "utf8");
      if (s.includes("/_next/")) {
        const n = s.split("/_next/").length - 1;
        fs.writeFileSync(p, s.split("/_next/").join("/assets/"));
        files++;
        hits += n;
      }
    }
  }
};
walk(dir);
fs.writeFileSync(path.join(dir, ".nojekyll"), "");
console.log(`rewrote ${hits} references in ${files} files`);
