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

import { parseSoul, extractLongmem } from "./soulParser.js";

// Beide Sprachvarianten pro Sektion — Englisch (aktuelles Default-Template)
// und Deutsch (Alt-Souls von vor der Umstellung). Spiegelt soul-mcp/tools/
// soul_maturity.mjs's SCORED_SECTIONS — bewusst dupliziert, siehe Kommentar
// bei extractLongmem in soulParser.js.
const SCORED_SECTIONS = [
  { en: "Core Identity",                 de: "Kern-Identität" },
  { en: "Values & Beliefs",              de: "Werte & Überzeugungen" },
  { en: "Aesthetics & Resonance",        de: "Ästhetik & Resonanz" },
  { en: "Language Patterns & Expression", de: "Sprachmuster & Ausdruck" },
  { en: "Recurring Themes & Obsessions", de: "Wiederkehrende Themen & Obsessionen" },
  { en: "Emotional Signature",           de: "Emotionale Signatur" },
  { en: "Worldview",                     de: "Weltbild" },
  { en: "Open Questions",                de: "Offene Fragen dieser Person" },
];

// Schlüsselwörter für Signatur — herausragende Persönlichkeit, besondere Fähigkeiten
// Deutsch + Englisch gemischt (additiv) — Nutzer können in beiden Sprachen schreiben.
const SIGNATURE_KEYWORDS = [
  "startup", "gründer", "gründerin", "founder",
  "künstler", "künstlerin", "artist",
  "musiker", "musikerin", "produzent", "produzentin", "musician", "producer",
  "autor", "autorin", "schriftsteller", "bestseller", "author", "writer",
  "fotograf", "filmemacher", "regisseur", "photographer", "filmmaker", "director",
  "weltmeister", "champion", "olymp", "world champion", "olympic",
  "preis", "award", "auszeichnung", "nominiert", "prize", "nominated",
  "patent", "erfinder", "erfindung", "inventor", "invention",
  "professor", "doktor", "phd", "doctor",
  "ceo", "cto", "cfo", "geschäftsführer", "vorstand", "founder", "executive",
  "millionen", "international", "global", "million",
  "bundesliga", "profi", "nationalspieler", "pro athlete", "national team",
  "viral", "influencer",
  "polizei", "beamter", "offizier", "police", "officer",
  "architekt", "ingenieur", "chirurg", "pilot", "architect", "engineer", "surgeon",
];

export const MATURITY_THRESHOLD = 75;

/**
 * Berechnet den Soul Index (0–100).
 *
 * @param {string} soulMarkdown
 * @param {{ audio?: string[], images?: string[], context?: string[] }} [syncedFiles]
 * @param {number|null} [verifiedSignatureScore]  — externe Verifikation (0–15)
 * @param {number} [mutualConnections]  — bestätigte Soul-Network-Verbindungen (0–n)
 * @param {number|null} [chainCountOverride] — Server-seitiger anchor_count (überschreibt lokalen Parse)
 */
export function computeMaturity(soulMarkdown, syncedFiles = {}, verifiedSignatureScore = null, mutualConnections = 0, chainCountOverride = null) {
  if (!soulMarkdown) {
    return { score: 0, level: "Genesis", isMature: false, breakdown: zeroBreakdown() };
  }

  const { meta, sections } = parseSoul(soulMarkdown);

  // ── Säule 1: Herkunft ── max 25 ──────────────────────────────────────────
  const agePts      = scoreAge(meta["created"]);           // 0–10
  const chainPts    = chainCountOverride != null
    ? scoreGrowthChainFromCount(chainCountOverride)
    : scoreGrowthChain(meta["soul_growth_chain"]); // 0–15
  const herkunftPts = agePts + chainPts;

  // ── Säule 2: Tiefe ── max 20 ─────────────────────────────────────────────
  let sectionTotal = 0;
  const sectionScores = {};
  for (const { en, de } of SCORED_SECTIONS) {
    const pts = scoreSection(sections[en] ?? sections[de] ?? "");
    sectionScores[en] = pts;
    sectionTotal += pts;
  }
  // LONGMEM-Aggregat-Bonus: Herz-Archivar leert Kern-Sektionen nach der
  // Kristallisation ("*Not yet described.*" / Alt-Souls: "*Noch nicht beschrieben.*")
  // — ohne diesen Bonus würde die Tiefe-Säule sinken, je mehr die Soul tatsächlich reift.
  const { sectionPts: lmSectionPts, sessionBonus } = scoreLongmemDepth(extractLongmem(soulMarkdown));
  const sectionPts  = Math.max(Math.min(Math.round(sectionTotal / SCORED_SECTIONS.length * 4), 12), lmSectionPts); // 0–12
  const logEntries  = countSessionEntries(
    sections["Session Log (compressed)"] ?? sections["Session-Log (komprimiert)"] ??
    sections["Session Log"] ?? sections["Session-Log"] ?? ""
  );
  // 1 Pt pro 2 Sessions — braucht 16+ Sessions für Maximum
  const sessionPts  = Math.min(Math.floor((logEntries + sessionBonus) / 2), 8); // 0–8
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
      sessionCount:    logEntries,
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

// Spiegelt soul-mcp/lib/soul_parser.mjs::scoreLongmemDepth — bewusst dupliziert,
// da shared/ und soul-mcp keine gemeinsamen Module teilen. Kein Rück-Mapping auf
// einzelne Sektionen: facts.cat kennt nur identity/values/personality/project,
// nicht die ursprüngliche Sektion.
function scoreLongmemDepth(longmem) {
  if (!longmem) return { sectionPts: 0, sessionBonus: 0 };
  const facts    = longmem.facts    ?? [];
  const memories = longmem.memories ?? [];
  const sectionPts   = Math.min(Math.round(facts.length * 0.7 + memories.length * 0.2), 12);
  const sessionBonus = memories.length;
  return { sectionPts, sessionBonus };
}

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

function scoreGrowthChainFromCount(n) {
  if (!n || n === 0) return 0;
  if (n <= 2)   return 2;
  if (n <= 5)   return 5;
  if (n <= 10)  return 8;
  if (n <= 20)  return 11;
  if (n <= 40)  return 13;
  return 15;
}

function scoreGrowthChain(raw) {
  if (!raw) return 0;
  try {
    const chain = JSON.parse(raw);
    const n = Array.isArray(chain) ? chain.length : 0;
    return scoreGrowthChainFromCount(n);
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
  // Matches both "- **DATE**" and "- **DATE:**" (the colon-before-closing-bold variant)
  return (content.match(/^- \*\*\d{4}-\d{2}-\d{2}/gm) ?? []).length;
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
  for (const { en } of SCORED_SECTIONS) sectionScores[en] = 0;
  return {
    herkunft: 0, tiefe: 0, biometrie: 0, archiv: 0, signatur: 0, netzwerk: 0,
    age: 0, growthChain: 0, sectionScores, sessionLog: 0,
    voice: 0, motion: 0,
    vaultAudio: 0, vaultImages: 0, vaultContext: 0,
    signatureHints: [], signatureVerified: false, total: 0,
  };
}
