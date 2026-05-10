// server/api/soul-tool.post.js
// NUR für lokale Entwicklung (nuxt dev).
// In Production leitet OpenResty /api/soul-tool an soul-mcp /internal/run-tool weiter.

import { validateSoulToken } from "../utils/validateSoulToken.js";

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, "authorization");
  if (!validateSoulToken(auth)) {
    throw createError({ statusCode: 401, message: "Ungültiges Soul-Zertifikat." });
  }

  const body = await readBody(event);

  const upstream = await fetch("http://127.0.0.1:3098/internal/run-tool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => upstream.statusText);
    throw createError({ statusCode: upstream.status, message: errText });
  }

  return upstream.json();
});
