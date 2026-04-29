// server/api/soul-sign-session.post.js
// Nur für nuxt dev – in Production übernimmt OpenResty mit Lua (siehe docs/SOUL_AUTHENTICITY.md)
//
// Signiert einen Growth-Chain-Eintrag mit SOUL_MASTER_KEY (HMAC-SHA256).
// Beweist: Dieser Content-Hash ist durch eine echte SYS-Session entstanden.
//
// Request:  POST { soul_id, content_hash, date }
// Response: { signature }  – 32-Zeichen HMAC (konsistent mit soul_cert Format)

import { createHmac } from "node:crypto";

export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { soul_id, content_hash, date } = body ?? {};

  if (!soul_id || !content_hash || !date) {
    throw createError({
      statusCode:    400,
      statusMessage: "soul_id, content_hash und date sind erforderlich"
    });
  }

  const masterKey = process.env.SOUL_MASTER_KEY;
  if (!masterKey) {
    throw createError({
      statusCode:    500,
      statusMessage: "SOUL_MASTER_KEY nicht konfiguriert"
    });
  }

  // Nachricht: soul_id + session_date + content_hash (Reihenfolge unveränderlich)
  const message   = `${soul_id}:${date}:${content_hash}`;
  const signature = createHmac("sha256", masterKey)
    .update(message)
    .digest("hex")
    .substring(0, 32);

  return { signature };
});
