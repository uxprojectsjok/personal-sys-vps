// remove-csp-meta.js
import fs from "fs";
import path from "path";

const distDir = "../.output/public"; // oder .output/public, je nach deinem Build
const metaCspRegex = /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi;

function cleanMetaCsp(filePath) {
  console.log("lösche csp aus Datei", filePath);
  const content = fs.readFileSync(filePath, "utf-8");
  const updated = content.replace(metaCspRegex, "");
  fs.writeFileSync(filePath, updated, "utf-8");
}

function walk(dir) {
  fs.readdirSync(dir).forEach((file) => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith(".html")) {
      cleanMetaCsp(full);
    }
  });
}

walk(distDir);
console.log("✔️ Meta-CSP entfernt.");
