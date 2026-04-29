// server/api/validate.get.js
// Prüft ob ein Soul-Bearer-Token gültig ist.
// Gibt 200 { ok: true } zurück wenn gültig, 401 wenn ungültig.
// NUR für lokale Entwicklung (nuxt dev) – selbes Muster wie chat.post.js.
// In Production übernimmt OpenResty den /api/validate Endpunkt.

import { validateSoulToken } from "../utils/validateSoulToken.js";

export default defineEventHandler((event) => {
  const auth = getHeader(event, "authorization");
  if (!validateSoulToken(auth)) {
    throw createError({ statusCode: 401, message: "Ungültiges Soul-Zertifikat." });
  }
  return { ok: true };
});
