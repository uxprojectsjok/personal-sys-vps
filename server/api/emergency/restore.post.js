// server/api/emergency/restore.post.js — Dev-Server only
import { unlinkSync, readFileSync } from "fs";
import { join } from "path";

export default defineEventHandler(async (event) => {
  const soulId = getHeader(event, "x-soul-id") || "dev";
  const lockPath = join("/var/lib/sys/souls", soulId, "emergency.lock");
  let was_level = 0;
  try {
    const raw = readFileSync(lockPath, "utf-8");
    was_level = JSON.parse(raw)?.level || 0;
    unlinkSync(lockPath);
  } catch { /* bereits entsperrt */ }
  return { ok: true, active: false, level: 0, was_level };
});
