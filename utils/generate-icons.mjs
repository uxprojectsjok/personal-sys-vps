// utils/generate-icons.mjs
// Regeneriert die PWA-Icons (public/icons/icon-192.png, icon-512.png) aus
// public/logo.png. Teil des Branding-Systems: ein Node-Betreiber ersetzt
// logo.png (+ logo.ico + optional favicon.ico) im Projekt-Root, alles andere
// (Favicon, Apple-Touch-Icon, PWA-Icons, WalletConnect-Icon) übernimmt das
// automatisch — logo.ico/favicon.ico sind statische Dateien und brauchen keine
// Verarbeitung, nur die quadratischen PWA-Icons müssen aus logo.png in den
// richtigen Zielgrößen neu erzeugt werden. Läuft automatisch vor jedem Build
// (siehe package.json "generate"/"build" Scripts).

import sharp from "sharp";
import { existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "..",
);
const LOGO_PATH = path.join(ROOT, "public/logo.png");
const OUT_DIR   = path.join(ROOT, "public/icons");
const FALLBACK_BG = "#161513"; // aus manifest.json background_color/theme_color — nur falls Ecken-Sampling scheitert

const TARGETS = [
  { size: 192, file: "icon-192.png" },
  { size: 512, file: "icon-512.png" },
];

// Padding-Farbe direkt aus der Ecke des Logos ablesen statt eine feste Farbe
// zu raten — ein hartkodiertes manifest.json-Grau (#161513) erzeugte bei einem
// Logo mit reinem Schwarz-Hintergrund (#000) einen sichtbaren Rand/Rahmen ums
// Icon, live bemerkt. Sampling passt sich automatisch an jedes Logo an, egal
// welchen Hintergrund ein Node-Betreiber tatsächlich verwendet.
async function sampleCornerColor(logoPath) {
  try {
    const { data, info } = await sharp(logoPath)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const [r, g, b, a] = data;
    if (info.channels === 4 && a < 250) return FALLBACK_BG; // transparente Ecke — Sampling hilft nicht
    return { r, g, b };
  } catch {
    return FALLBACK_BG;
  }
}

async function main() {
  if (!existsSync(LOGO_PATH)) {
    console.log(
      "[generate-icons] public/logo.png nicht gefunden — überspringe Icon-Generierung, bestehende Icons bleiben unverändert.",
    );
    return;
  }

  const bg = await sampleCornerColor(LOGO_PATH);

  for (const { size, file } of TARGETS) {
    const outPath = path.join(OUT_DIR, file);

    // manifest.json deklariert purpose:"maskable any" — das Betriebssystem darf
    // eine runde/abgerundete Maske über das Icon legen. Inhalt außerhalb der
    // inneren ~80%-Zone kann dabei abgeschnitten werden, daher hier bewusst
    // mit Rand statt randlos auf volle Größe skaliert.
    const inner   = Math.round(size * 0.8);
    const padding = Math.round((size - inner) / 2);

    // resize({fit:'contain'}) liefert bereits exakt inner×inner (füllt intern
    // mit background auf, falls das Seitenverhältnis nicht passt) — extend()
    // ergänzt den äußeren Rand auf exakt size×size. Ein zweiter .resize() danach
    // überschreibt sharps interne Resize-Konfiguration und verzerrt die Maße
    // (erster Versuch produzierte dadurch 230×230 statt 192×192).
    await sharp(LOGO_PATH)
      .resize(inner, inner, { fit: "contain", background: bg })
      .extend({ top: padding, bottom: padding, left: padding, right: padding, background: bg })
      .png()
      .toFile(outPath);

    console.log(`[generate-icons] ${file} (${size}×${size}) aus logo.png erzeugt`);
  }
}

main().catch((e) => {
  console.error("[generate-icons] Fehler:", e.message);
  process.exit(1);
});
