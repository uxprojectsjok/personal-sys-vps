#!/usr/bin/env node
/**
 * Generates a reproducible SHA-256 fingerprint of all source files.
 * Run from the project root: node utils/project-hash.mjs
 * Used to verify a clone matches the official release.
 *
 * File list comes from `git ls-files` — not a raw filesystem walk — so local,
 * untracked files (a private-repo init.sh copy, gitignored notes, stray
 * instance configs, …) never silently end up in the hash. Only what a fresh
 * `git clone` actually receives is fingerprinted.
 */
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { execFileSync } from "child_process";

const ROOT = new URL("..", import.meta.url).pathname;

const INCLUDE_EXTS = new Set([".vue", ".js", ".mjs", ".lua", ".sh", ".json", ".md", ".template", ".css"]);
const EXCLUDE_FILES = new Set([
  ".env", ".env.example", "package-lock.json",
  "project-hash.mjs",
  "README.md",        // enthält den Fingerprint selbst — zirkulär
  "me.uxprojects-jok.com",  // generierte Instanz-Datei, nicht Template
]);

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const files = tracked
  .filter((rel) => {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const ext = base.slice(base.lastIndexOf("."));
    return INCLUDE_EXTS.has(ext) && !EXCLUDE_FILES.has(base);
  })
  .sort();

const master = createHash("sha256");

for (const rel of files) {
  const content = readFileSync(ROOT + rel);
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
