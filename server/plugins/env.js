// server/plugins/env.js
// Lädt .env manuell, da Nuxt/Nitro dotenv intern aufruft bevor process.env gesetzt wird
// und dabei "0 vars injected" liefert wenn die Vars schon leer initialisiert sind.

import { readFileSync, existsSync } from "fs";
import { join } from "path";

export default defineNitroPlugin(() => {
  const envPath = join(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    console.warn("[SYS] .env nicht gefunden unter:", envPath);
    return;
  }

  const content = readFileSync(envPath, "utf8");
  let loaded = 0;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    // Kommentare und leere Zeilen überspringen
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    // Nur setzen wenn noch nicht vorhanden (kein Override)
    if (!process.env[key]) {
      process.env[key] = value;
      loaded++;
    }
  }

  console.log(`[SYS] .env: ${loaded} Variable(n) geladen`);
  console.log(`[SYS] ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "gesetzt ✓" : "FEHLT ✗"}`);
  console.log(`[SYS] SOUL_MASTER_KEY:   ${process.env.SOUL_MASTER_KEY   ? "gesetzt ✓" : "FEHLT ✗"}`);
});
