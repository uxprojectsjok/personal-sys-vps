import { getText, getJson } from '../lib/api.mjs';
import { parseFrontmatter, extractAllSections } from '../lib/soul_parser.mjs';

// ── Scoring (portiert aus shared/utils/soulMaturity.js) ──────────────────────

const SCORED_SECTIONS = [
  "Kern-Identität", "Werte & Überzeugungen", "Ästhetik & Resonanz",
  "Sprachmuster & Ausdruck", "Wiederkehrende Themen & Obsessionen",
  "Emotionale Signatur", "Weltbild", "Offene Fragen dieser Person",
];

const SIGNATURE_KEYWORDS = [
  "startup", "gründer", "gründerin", "künstler", "musiker", "autor",
  "weltmeister", "champion", "preis", "award", "patent", "erfinder",
  "professor", "doktor", "phd", "ceo", "cto", "geschäftsführer",
  "millionen", "international", "polizei", "beamter", "offizier",
  "architekt", "ingenieur", "chirurg", "pilot",
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
    if (n > 0)  pts = n <= 2 ? 2 : n <= 5 ? 5 : n <= 10 ? 8 : n <= 20 ? 11 : n <= 40 ? 13 : 15;
    return { pts, count: n };
  } catch { return { pts: 0, count: 0 }; }
}

function countSessionEntries(content) {
  return (content?.match(/^- \*\*\d{4}-\d{2}-\d{2}/gm) ?? []).length;
}

function scoreSignature(keywords) {
  const n = keywords.length;
  if (n === 0) return 0; if (n === 1) return 4; if (n === 2) return 7;
  if (n === 3) return 10; if (n === 4) return 12; return 15;
}

function scoreNetwork(mutual) {
  if (mutual === 0) return 0; if (mutual === 1) return 3; if (mutual === 2) return 5;
  if (mutual <= 4) return 7; if (mutual <= 9) return 9; return 10;
}

function scoreToLevel(score) {
  if (score >= 96) return "Zeitlos";   if (score >= 86) return "Legendär";
  if (score >= 75) return "Premium";   if (score >= 55) return "Etabliert";
  if (score >= 35) return "Reifung";   if (score >= 15) return "Aufbau";
  return "Genesis";
}

// ─────────────────────────────────────────────────────────────────────────────

export function register(server, token) {
  server.tool(
    'soul_maturity',
    'Gibt den echten Reifegrad der Soul zurück: Maturity-Score (0–100), Wachstumsstufe, Session-Anzahl und Breakdown nach den 5 Säulen (Herkunft, Tiefe, Biometrie, Archiv, Signatur). Zählt echte Growth-Chain-Einträge und bewertet Sektionstiefe.',
    {},
    async () => {
      try {
        const md = await getText('/api/soul', token);
        const fm = parseFrontmatter(md);
        const sections = extractAllSections(md);

        // Growth-Chain: echte Sessions
        const { pts: chainPts, count: sessionCount } = scoreGrowthChain(fm.soul_growth_chain);
        const agePts     = scoreAge(fm.created);
        const herkunft   = agePts + chainPts;

        // Sektionstiefe
        let sectionTotal = 0;
        const sectionScores = {};
        for (const name of SCORED_SECTIONS) {
          const pts = scoreSection(sections[name] ?? "");
          sectionScores[name] = pts;
          sectionTotal += pts;
        }
        const sectionPts = Math.min(Math.round(sectionTotal / SCORED_SECTIONS.length * 4), 12);
        const logEntries = countSessionEntries(sections["Session-Log"] ?? sections["Session-Log (komprimiert)"] ?? "");
        const sessionPts = Math.min(Math.floor(logEntries / 2), 8);
        const tiefe      = sectionPts + sessionPts;

        // Biometrie (Profile-Flags im Frontmatter)
        const voicePts  = fm.voice_profile  ? 10 : 0;
        const motionPts = fm.motion_profile ? 10 : 0;
        const biometrie = voicePts + motionPts;

        // Archiv via /api/context
        let archiv = 0;
        try {
          const ctx = await getJson('/api/context', token);
          const sf = ctx.synced_files ?? {};
          const a = (sf.audio   ?? []).length;
          const i = (sf.images  ?? []).length;
          const c = (sf.context ?? []).length;
          const ap = a === 0 ? 0 : a === 1 ? 4 : a <= 3 ? 6 : 8;
          const ip = i === 0 ? 0 : i === 1 ? 3 : i <= 3 ? 5 : 7;
          const cp = c === 0 ? 0 : c === 1 ? 2 : c <= 3 ? 4 : 5;
          archiv = ap + ip + cp;
        } catch { /* Archiv nicht erreichbar */ }

        // Signatur
        const allContent   = Object.values(sections).join(" ").toLowerCase();
        const foundKeywords = [...new Set(SIGNATURE_KEYWORDS.filter(kw => allContent.includes(kw)))];
        const signatur     = scoreSignature(foundKeywords.length);

        // Netzwerk
        let netzwerk = 0;
        try {
          const net = await getJson('/api/vault/connections', token);
          const mutual = (net.connections ?? []).filter(c => c.status === 'mutual').length;
          netzwerk = scoreNetwork(mutual);
        } catch { /* Netzwerk nicht erreichbar */ }

        const score = Math.min(herkunft + tiefe + biometrie + archiv + signatur + netzwerk, 100);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              name:           fm.soul_name ?? fm.name ?? 'Unbekannt',
              soul_id:        fm.soul_id   ?? null,
              maturity_score: score,
              level:          scoreToLevel(score),
              is_mature:      score >= 75,
              sessions:       sessionCount,
              anchored:       !!fm.soul_chain_anchor,
              created:        fm.created ?? null,
              last_session:   fm.last_session ?? null,
              breakdown: {
                herkunft, tiefe, biometrie, archiv, signatur, netzwerk,
                detail: { agePts, chainPts, sectionPts, sessionLogPts: sessionPts, sectionScores, foundKeywords },
              },
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
