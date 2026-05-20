// server/api/emergency/isolate.post.js — Dev-Server only
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const level = Number(body?.level);
  if (!level || level < 1 || level > 3) {
    throw createError({ statusCode: 400, message: "level muss 1, 2 oder 3 sein" });
  }
  const soulId = getHeader(event, "x-soul-id") || "dev";
  const dir = join("/var/lib/sys/souls", soulId);
  mkdirSync(dir, { recursive: true });
  const lock = { level, activated_at: new Date().toISOString(), soul_id: soulId };
  writeFileSync(join(dir, "emergency.lock"), JSON.stringify(lock));
  return { ok: true, active: true, level, activated_at: lock.activated_at };
});
