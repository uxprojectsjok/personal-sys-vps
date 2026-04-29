// shared/utils/soulMaturity.js
// Soul Index — 5 Säulen, max 100 Punkte.
//
// Philosophie: Eine Soul ist eine Kapitalanlage. Ihr Wert entsteht durch
// Echtheit (Blockchain-Verifizierung), Tiefe des Selbst-Wissens,
// körperliche Einzigartigkeit (Biometrie), Materialreichtum (Vault)
// und Rarity (herausragende Persönlichkeit oder Skills).
//
// Säulen:
//   Herkunft   (Provenance)  max 25 pts  — Alter + Blockchain-Kontinuität
//   Tiefe      (Depth)       max 20 pts  — Sektionsqualität + Session-Geschichte
//   Biometrie  (Embodiment)  max 20 pts  — Stimme + Bewegung
//   Archiv     (Archive)     max 20 pts  — Vault-Dateien (Audio, Bilder, Kontext)
//   Signatur   (Signature)   max 15 pts  — Einzigartige Skills / Persönlichkeit

import { parseSoul } from "./soulParser.js";

const SCORED_SECTIONS = [
  "Kern-Identität",
  "Werte & Überzeugungen",
  "Ästhetik & Resonanz",
  "Sprachmuster & Ausdruck",
  "Wiederkehrende Themen & Obsessionen",
  "Emotionale Signatur",
  "Weltbild",
  "Offene Fragen dieser Person",
];

// Schlüsselwörter für Signatur — herausragende Persönlichkeit, besondere Fähigkeiten
const SIGNATURE_KEYWORDS = [
  "startup", "gründer", "gründerin",
  "künstler", "künstlerin", "artist",
  "musiker", "musikerin", "produzent", "produzentin",
  "autor", "autorin", "schriftsteller", "bestseller",
  "fotograf", "filmemacher", "regisseur",
  "weltmeister", "champion", "olymp",
  "preis", "award", "auszeichnung", "nominiert",
  "patent", "erfinder", "erfindung",
  "professor", "doktor", "phd",
  "ceo", "cto", "cfo", "geschäftsführer", "vorstand",
  "millionen", "international", "global",
  "bundesliga", "profi", "nationalspieler",
  "viral", "influencer",
  "polizei", "beamter", "offizier",
  "architekt", "ingenieur", "chirurg", "pilot",
];

export const MATURITY_THRESHOLD = 75;

/**
 * Berechnet den Soul Index (0–100).
 *
 * @param {string} soulMarkdown
 * @param {{ audio?: string[], images?: string[], context?: string[] }} [syncedFiles]
 * @param {number|null} [verifiedSignatureScore]  — externe Verifikation (0–15)
 * @param {number} [mutualConnections]  — bestätigte Soul-Network-Verbindungen (0–n)
 */
export function computeMaturity(soulMarkdown, syncedFiles = {}, verifiedSignatureScore = null, mutualConnections = 0) {
  if (!soulMarkdown) {
    return { score: 0, level: "Genesis", isMature: false, breakdown: zeroBreakdown() };
  }

  const { meta, sections } = parseSoul(soulMarkdown);

  // ── Säule 1: Herkunft ── max 25 ──────────────────────────────────────────
  const agePts      = scoreAge(meta["created"]);           // 0–10
  const chainPts    = scoreGrowthChain(meta["soul_growth_chain"]); // 0–15
  const herkunftPts = agePts + chainPts;

  // ── Säule 2: Tiefe ── max 20 ─────────────────────────────────────────────
  let sectionTotal = 0;
  const sectionScores = {};
  for (const name of SCORED_SECTIONS) {
    const pts = scoreSection(sections[name] ?? "");
    sectionScores[name] = pts;
    sectionTotal += pts;
  }
  const sectionPts  = Math.min(Math.round(sectionTotal / SCORED_SECTIONS.length * 4), 12); // 0–12
  const logEntries  = countSessionEntries(sections["Session-Log (komprimiert)"] ?? "");
  // 1 Pt pro 2 Sessions — braucht 16+ Sessions für Maximum
  const sessionPts  = Math.min(Math.floor(logEntries / 2), 8); // 0–8
  const tiefePts    = sectionPts + sessionPts;

  // ── Säule 3: Biometrie ── max 20 ─────────────────────────────────────────
  const voicePts    = meta["voice_profile"]  ? 10 : 0;
  const motionPts   = meta["motion_profile"] ? 10 : 0;
  const biometriePts = voicePts + motionPts;

  // ── Säule 4: Archiv ── max 20 ────────────────────────────────────────────
  const audioCount   = (syncedFiles.audio   ?? []).length;
  const imagesCount  = (syncedFiles.images  ?? []).length;
  const contextCount = (syncedFiles.context ?? []).length;

  const audioPts   = audioCount   === 0 ? 0 : audioCount   === 1 ? 4 : audioCount   <= 3 ? 6 : 8;
  const imagesPts  = imagesCount  === 0 ? 0 : imagesCount  === 1 ? 3 : imagesCount  <= 3 ? 5 : 7;
  const contextPts = contextCount === 0 ? 0 : contextCount === 1 ? 2 : contextCount <= 3 ? 4 : 5;
  const archivPts  = audioPts + imagesPts + contextPts;

  // ── Säule 5: Signatur ── max 15 ──────────────────────────────────────────
  const allContent    = Object.values(sections).join(" ").toLowerCase();
  const foundKeywords = [...new Set(SIGNATURE_KEYWORDS.filter(kw => allContent.includes(kw)))];
  const signaturPts   = verifiedSignatureScore !== null
    ? Math.min(Math.max(0, verifiedSignatureScore), 15)
    : scoreSignature(foundKeywords.length);

  // ── Säule 6: Netzwerk ── max 10 ──────────────────────────────────────────
  const netzwerkPts = scoreNetwork(Math.max(0, Math.floor(mutualConnections)));

  // ── Gesamt ────────────────────────────────────────────────────────────────
  const raw   = herkunftPts + tiefePts + biometriePts + archivPts + signaturPts + netzwerkPts;
  const score = Math.min(Math.round(raw), 100);

  return {
    score,
    level:    scoreToLevel(score),
    isMature: score >= MATURITY_THRESHOLD,
    breakdown: {
      // Säulen-Totals (für die 5 Bars)
      herkunft:  herkunftPts,
      tiefe:     tiefePts,
      biometrie: biometriePts,
      archiv:    archivPts,
      signatur:  signaturPts,
      netzwerk:  netzwerkPts,
      // Detail
      age:             agePts,
      growthChain:     chainPts,
      sectionScores,
      sessionLog:      sessionPts,
      voice:           voicePts,
      motion:          motionPts,
      vaultAudio:      audioPts,
      vaultImages:     imagesPts,
      vaultContext:    contextPts,
      signatureHints:  foundKeywords,
      signatureVerified: verifiedSignatureScore !== null,
      total: score,
    },
  };
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function scoreSection(content) {
  if (!content) return 0;
  const trimmed = content.trim();
  if (!trimmed) return 0;
  if (trimmed.startsWith("*") || trimmed.toLowerCase().startsWith("noch nicht")) return 0;
  const words = countWords(trimmed);
  if (words < 5)    return 0;
  if (words < 20)   return 1;
  if (words < 60)   return 2;
  if (words < 150)  return 3;
  if (words < 400)  return 4;
  return 5;   // ≥ 400 Wörter — echte Tiefe
}

function scoreAge(createdStr) {
  if (!createdStr) return 0;
  const d = new Date(createdStr.trim());
  if (isNaN(d)) return 0;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 14)    return 0;
  if (days < 60)    return 1;
  if (days < 180)   return 2;
  if (days < 365)   return 3;
  if (days < 730)   return 5;   // 2 Jahre
  if (days < 1825)  return 7;   // 5 Jahre
  if (days < 3650)  return 8;   // 10 Jahre
  if (days < 9125)  return 9;   // 25 Jahre
  return 10;                    // 25+ Jahre — generationelles Archiv
}

function scoreGrowthChain(raw) {
  if (!raw) return 0;
  try {
    const chain = JSON.parse(raw);
    const n = Array.isArray(chain) ? chain.length : 0;
    if (n === 0)  return 0;
    if (n <= 2)   return 2;
    if (n <= 5)   return 5;
    if (n <= 10)  return 8;
    if (n <= 20)  return 11;
    if (n <= 40)  return 13;
    return 15;    // 40+ Versionen — lebenslanges Wachstum
  } catch { return 0; }
}

function scoreNetwork(mutual) {
  if (mutual === 0) return 0;
  if (mutual === 1) return 3;
  if (mutual === 2) return 5;
  if (mutual <= 4)  return 7;
  if (mutual <= 9)  return 9;
  return 10; // 10+ bestätigte Verbindungen
}

function scoreSignature(count) {
  if (count === 0) return 0;
  if (count === 1) return 4;
  if (count === 2) return 7;
  if (count === 3) return 10;
  if (count === 4) return 12;
  if (count >= 5)  return 15;
  return 15;
}

function countSessionEntries(content) {
  if (!content) return 0;
  return (content.match(/^- \*\*\d{4}-\d{2}-\d{2}\*\*/gm) ?? []).length;
}

function countWords(text) {
  return text
    .replace(/[#*_`\[\]()>~]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1).length;
}

function scoreToLevel(score) {
  if (score >= 96) return "Zeitlos";      // fast unerreichbar — 500-Jahre-Soul
  if (score >= 86) return "Legendär";
  if (score >= 75) return "Premium";
  if (score >= 55) return "Etabliert";
  if (score >= 35) return "Reifung";
  if (score >= 15) return "Aufbau";
  return "Genesis";
}

function zeroBreakdown() {
  const sectionScores = {};
  for (const name of SCORED_SECTIONS) sectionScores[name] = 0;
  return {
    herkunft: 0, tiefe: 0, biometrie: 0, archiv: 0, signatur: 0, netzwerk: 0,
    age: 0, growthChain: 0, sectionScores, sessionLog: 0,
    voice: 0, motion: 0,
    vaultAudio: 0, vaultImages: 0, vaultContext: 0,
    signatureHints: [], signatureVerified: false, total: 0,
  };
}
