// server/api/soul-update.post.js
// NUR für lokale Entwicklung (nuxt dev).
// In Production leitet OpenResty /api/soul-update direkt an die Anthropic API weiter.
// Der Client baut den vollständigen Anthropic-Payload selbst (useSoul.js).

import { validateSoulToken } from "../utils/validateSoulToken.js";

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, "authorization");
  if (!validateSoulToken(auth)) {
    throw createError({ statusCode: 401, message: "Ungültiges Soul-Zertifikat." });
  }

  const body = await readBody(event);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 500, message: "ANTHROPIC_API_KEY fehlt." });
  }

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
    throw createError({ statusCode: upstream.status, message: errText });
  }

  return upstream.json();
});
