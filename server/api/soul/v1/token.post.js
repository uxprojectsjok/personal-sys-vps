// server/api/soul/v1/token.post.js
// NUR für lokale Entwicklung (nuxt dev).
// In Production: OpenResty leitet /api/soul/v1/token an den Bun-Microservice weiter.
//
// Validiert soul_cert → gibt signiertes JWT (HS256, 30 Tage) zurück.
// Token-Format Header: "Authorization: Bearer {soul_id}.{cert}"

import { createHmac } from "node:crypto";
import { validateSoulToken } from "../../../utils/validateSoulToken.js";

const JWT_TTL = 60 * 60 * 24 * 30; // 30 Tage in Sekunden

function b64url(str) {
  return Buffer.from(str).toString("base64url");
}

function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = b64url(JSON.stringify(payload));
  const sig    = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${sig}`;
}

export default defineEventHandler(async (event) => {
  // soul_cert validieren
  const auth = getHeader(event, "authorization");
  if (!validateSoulToken(auth)) {
    throw createError({ statusCode: 401, message: "Ungültiges Soul-Zertifikat." });
  }

  const signingKey = process.env.API_SIGNING_KEY;
  if (!signingKey) {
    throw createError({ statusCode: 500, message: "API_SIGNING_KEY nicht gesetzt." });
  }

  // soul_id aus Token extrahieren
  const token   = (auth ?? "").replace(/^Bearer\s+/i, "").trim();
  const soul_id = token.substring(0, token.indexOf("."));

  const now = Math.floor(Date.now() / 1000);
  const jwt = signJwt({ soul_id, iat: now, exp: now + JWT_TTL }, signingKey);

  return { token: jwt, expires_in: JWT_TTL, soul_id };
});
