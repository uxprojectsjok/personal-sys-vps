#!/usr/bin/env node
/**
 * Generates a reproducible SHA-256 fingerprint of all source files.
 * Run from the project root: node utils/project-hash.mjs
 * Used to verify a clone matches the official release.
 */
import { createHash } from "crypto";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = new URL("..", import.meta.url).pathname;

const INCLUDE_EXTS = new Set([".vue", ".js", ".mjs", ".lua", ".sh", ".json", ".md"]);
const EXCLUDE_DIRS = new Set([
  "node_modules", ".output", ".nuxt", ".git",
  "soul-whatsapp", "soul-voice-clone", "soul-mcp",
  "browser-extension", "test",
]);
const EXCLUDE_FILES = new Set([
  ".env", ".env.example", "package-lock.json",
  "project-hash.mjs",
]);

function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir).sort()) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, files);
    } else {
      const ext = entry.slice(entry.lastIndexOf("."));
      if (INCLUDE_EXTS.has(ext) && !EXCLUDE_FILES.has(entry)) {
        files.push(full);
      }
    }
  }
  return files;
}

const files = collectFiles(ROOT);
const master = createHash("sha256");

for (const f of files) {
  const rel = relative(ROOT, f);
  const content = readFileSync(f);
  const fileHash = createHash("sha256").update(content).digest("hex");
  master.update(rel + ":" + fileHash + "\n");
}

const fingerprint = master.digest("hex");
const short = fingerprint.slice(0, 16);

console.log(`\nProject Fingerprint`);
console.log(`───────────────────`);
console.log(`Full:  ${fingerprint}`);
console.log(`Short: ${short}`);
console.log(`Files: ${files.length} source files\n`);
