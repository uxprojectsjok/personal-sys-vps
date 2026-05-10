// server/api/soul/register-anchor.post.js
// NUR für lokale Entwicklung (nuxt dev).
// In Production: OpenResty leitet /api/soul/register-anchor an soul_register_anchor.lua weiter.

import { writeFile, mkdir } from "node:fs/promises";
import { validateSoulToken } from "../../utils/validateSoulToken.js";

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, "authorization");
  if (!validateSoulToken(auth)) {
    throw createError({ statusCode: 401, message: "Ungültiges Soul-Zertifikat." });
  }

  const token  = (auth ?? "").replace(/^Bearer\s+/i, "").trim();
  const soul_id = token.substring(0, token.indexOf("."));

  const body = await readBody(event);
  if (!body?.tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(body.tx_hash)) {
    throw createError({ statusCode: 400, message: "tx_hash (64-hex-string) erforderlich." });
  }

  const anchor = {
    tx:       body.tx_hash,
    date:     body.date     ?? new Date().toISOString().split("T")[0],
    sessions: body.sessions ?? 0,
    tags:     Array.isArray(body.tags) ? body.tags : [],
    name:     body.name     ?? null,
  };

  const dir  = `/var/lib/sys/souls/${soul_id}`;
  const path = `${dir}/chain_anchor.json`;

  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(anchor), "utf8");
  } catch {
    // Dev: soul-Verzeichnis existiert möglicherweise nicht — ignorieren
  }

  return { ok: true, soul_id, tx: body.tx_hash };
});
