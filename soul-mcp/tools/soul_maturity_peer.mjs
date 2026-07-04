/**
 * soul_maturity — Peer-Variante.
 * Liest sys.md direkt vom Dateisystem. Berechnet Score ohne API-Calls.
 * Archiv- und Netzwerk-Säulen werden übersprungen (kein Vault-Zugriff für Peers).
 */

import { readFile } from 'fs/promises';
import crypto from 'crypto';
import { parseFrontmatter, extractAllSections, extractLongmem, scoreLongmemDepth } from '../lib/soul_parser.mjs';

const SOULS_DIR   = '/var/lib/sys/souls/';
const MAGIC       = Buffer.from([0x53, 0x59, 0x53, 0x01]);

const SCORED_SECTIONS = [
  { en: "Core Identity",                      de: "Kern-Identität" },
  { en: "Values & Beliefs",                   de: "Werte & Überzeugungen" },
  { en: "Aesthetics & Resonance",             de: "Ästhetik & Resonanz" },
  { en: "Language Patterns & Expression",     de: "Sprachmuster & Ausdruck" },
  { en: "Recurring Themes & Obsessions",      de: "Wiederkehrende Themen & Obsessionen" },
  { en: "Emotional Signature",                de: "Emotionale Signatur" },
  { en: "Worldview",                          de: "Weltbild" },
  { en: "Open Questions",                     de: "Offene Fragen dieser Person" },
];

const SIGNATURE_KEYWORDS = [
  "startup", "founder", "gründer", "gründerin", "artist", "künstler", "musician", "musiker",
  "author", "autor", "world champion", "weltmeister", "champion", "prize", "preis", "award",
  "patent", "inventor", "erfinder", "professor", "doctor", "doktor", "phd", "ceo", "cto",
  "managing director", "geschäftsführer", "millions", "millionen", "international",
  "police", "polizei", "officer", "beamter", "offizier", "architect", "architekt",
  "engineer", "ingenieur", "surgeon", "chirurg", "pilot",
];

function countWords(text) {
  return text.replace(/[#*_`\[\]()>~]/g, " ").split(/\s+/).filter(w => w.length > 1).length;
}
function scoreSection(content) {
  if (!content) return 0;
  const t = content.trim();
  if (!t || t.startsWith("*") || t.toLowerCase().startsWith("noch nicht")) return 0;
  const w = countWords(t);
  if (w < 5) return 0; if (w < 20) return 1; if (w < 60) return 2;
  if (w < 150) return 3; if (w < 400) return 4; return 5;
}
function scoreAge(createdStr) {
  if (!createdStr) return 0;
  const days = Math.floor((Date.now() - new Date(createdStr.trim()).getTime()) / 86_400_000);
  if (isNaN(days) || days < 14) return 0;
  if (days < 60)   return 1; if (days < 180) return 2; if (days < 365) return 3;
  if (days < 730)  return 5; if (days < 1825) return 7; if (days < 3650) return 8;
  if (days < 9125) return 9; return 10;
}
function scoreGrowthChain(raw) {
  if (!raw) return { pts: 0, count: 0 };
  try {
    const chain = JSON.parse(raw);
    const n = Array.isArray(chain) ? chain.length : 0;
    let pts = 0;
    if (n > 0) pts = n <= 2 ? 2 : n <= 5 ? 5 : n <= 10 ? 8 : n <= 20 ? 11 : n <= 40 ? 13 : 15;
    return { pts, count: n };
  } catch { return { pts: 0, count: 0 }; }
}
function countSessionEntries(content) {
  return (content?.match(/^- \*\*\d{4}-\d{2}-\d{2}/gm) ?? []).length;
}
function scoreSignature(n) {
  if (n === 0) return 0; if (n === 1) return 4; if (n === 2) return 7;
  if (n === 3) return 10; if (n === 4) return 12; return 15;
}
function scoreToLevel(score) {
  if (score >= 96) return "Timeless";   if (score >= 86) return "Legendary";
  if (score >= 75) return "Premium";    if (score >= 55) return "Established";
  if (score >= 35) return "Maturing";   if (score >= 15) return "Building";
  return "Genesis";
}

export function register(server, targetSoulId) {
  server.tool(
    'soul_maturity',
    'Returns the maturity level of the soul: maturity score (0–100), growth level, and breakdown. (Peer access: archive and network pillars are not scored.)',
    {},
    async () => {
      try {
        // api_context für optionalen Vault-Key laden
        let vaultKeyHex = '';
        try {
          const raw = await readFile(`${SOULS_DIR}${targetSoulId}/api_context.json`, 'utf8');
          const ctx = JSON.parse(raw);
          vaultKeyHex = ctx?.vault_key_hex || '';
        } catch { /* kein Key */ }

        let buf = await readFile(`${SOULS_DIR}${targetSoulId}/sys.md`);

        if (buf.slice(0, 4).equals(MAGIC)) {
          if (!vaultKeyHex) {
            return {
              content: [{ type: 'text', text: 'sys.md ist verschlüsselt — Soul muss einmal im SYS-Browser entsperrt werden.' }],
              isError: true,
            };
          }
          const key        = Buffer.from(vaultKeyHex, 'hex');
          const iv         = buf.slice(4, 20);
          const ciphertext = buf.slice(20);
          const decipher   = crypto.createDecipheriv('aes-256-cbc', key, iv);
          buf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        }

        const md       = buf.toString('utf8');
        const fm       = parseFrontmatter(md);
        const sections = extractAllSections(md);

        const { pts: chainPts, count: sessionCount } = scoreGrowthChain(fm.soul_growth_chain);
        const agePts   = scoreAge(fm.created);
        const herkunft = agePts + chainPts;

        let sectionTotal = 0;
        const sectionScores = {};
        for (const { en, de } of SCORED_SECTIONS) {
          const content = sections[en] ?? sections[de] ?? "";
          const pts = scoreSection(content);
          sectionScores[en] = pts;
          sectionTotal += pts;
        }
        const longmem = extractLongmem(md);
        const { sectionPts: lmSectionPts, sessionBonus } = scoreLongmemDepth(longmem);
        const sectionPts = Math.max(Math.min(Math.round(sectionTotal / SCORED_SECTIONS.length * 4), 12), lmSectionPts);
        const logEntries = countSessionEntries(
          sections["Session Log"] ?? sections["Session-Log"] ??
          sections["Session Log (compressed)"] ?? sections["Session-Log (komprimiert)"] ?? ""
        );
        const sessionPts = Math.min(Math.floor((logEntries + sessionBonus) / 2), 8);
        const tiefe      = sectionPts + sessionPts;

        const voicePts  = fm.voice_profile  ? 10 : 0;
        const motionPts = fm.motion_profile ? 10 : 0;
        const biometrie = voicePts + motionPts;

        const allContent    = Object.values(sections).join(" ").toLowerCase();
        const foundKeywords = [...new Set(SIGNATURE_KEYWORDS.filter(kw => allContent.includes(kw)))];
        const signatur      = scoreSignature(foundKeywords.length);

        const score = Math.min(herkunft + tiefe + biometrie + signatur, 100);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              name:           fm.soul_name ?? fm.name ?? 'Unknown',
              soul_id:        fm.soul_id   ?? targetSoulId,
              maturity_score: score,
              level:          scoreToLevel(score),
              is_mature:      score >= 75,
              sessions:       sessionCount,
              anchored:       !!fm.soul_chain_anchor,
              created:        fm.created       ?? null,
              last_session:   fm.last_session  ?? null,
              note:           'Peer access: archive and network pillars not scored.',
              breakdown:      { herkunft, tiefe, biometrie, archiv: 0, signatur, netzwerk: 0 },
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
