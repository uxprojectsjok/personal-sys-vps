// server/api/chat.post.js
// NUR für lokale Entwicklung (nuxt dev).
// Bei "nuxt generate" wird diese Datei NICHT deployed.
// In Production leitet OpenResty /api/chat direkt an die Anthropic API weiter.
// .env wird via server/plugins/env.js geladen.

import { validateSoulToken } from "../utils/validateSoulToken.js";

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, "authorization");
  if (!validateSoulToken(auth)) {
    throw createError({ statusCode: 401, message: "Ungültiges Soul-Zertifikat." });
  }

  const body = await readBody(event);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw createError({
      statusCode: 500,
      message: "ANTHROPIC_API_KEY nicht gesetzt. .env Datei prüfen."
    });
  }

  // Direkte Weiterleitung an Anthropic API
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => upstream.statusText);
    throw createError({
      statusCode: upstream.status,
      statusMessage: errText
    });
  }

  // SSE-Header setzen
  setHeader(event, "Content-Type", "text/event-stream");
  setHeader(event, "Cache-Control", "no-cache");
  setHeader(event, "Connection", "keep-alive");
  setHeader(event, "X-Accel-Buffering", "no");

  // Web ReadableStream direkt an den Client weiterpumpen
  return sendStream(event, upstream.body);
});
