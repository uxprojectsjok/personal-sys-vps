// server/api/emergency/status.get.js — Dev-Server only
import { readFileSync } from "fs";
import { join } from "path";

export default defineEventHandler(async (event) => {
  const soulId = getHeader(event, "x-soul-id") || "dev";
  const lockPath = join("/var/lib/sys/souls", soulId, "emergency.lock");
  try {
    const raw = readFileSync(lockPath, "utf-8");
    const lock = JSON.parse(raw);
    return { ok: true, active: true, level: lock.level || 1, activated_at: lock.activated_at };
  } catch {
    return { ok: true, active: false, level: 0 };
  }
});
