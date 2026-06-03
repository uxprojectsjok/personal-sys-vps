/**
 * sys.md Parser – extrahiert Frontmatter und Sektionen.
 * Standalone, kein Import aus SaveYourSoul.
 */

/** Parst YAML-Frontmatter aus sys.md */
export function parseFrontmatter(md) {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([\w_]+):\s*(.*)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

/** Gibt den Inhalt einer ## Sektion zurück */
export function extractSection(md, heading) {
  const sections = md.split(/^## /m);
  for (const section of sections) {
    const firstLine = section.split('\n')[0].trim();
    if (firstLine === heading) {
      return section.slice(firstLine.length).trim();
    }
  }
  return null;
}

/** Gibt alle ## Sektionen als { heading: content } zurück */
export function extractAllSections(md) {
  const result = {};
  const re = /^## (.+?)\s*\n([\s\S]*?)(?=^## |\z)/gm;
  for (const [, heading, content] of md.matchAll(re)) {
    const trimmed = content.trim();
    if (trimmed) result[heading] = trimmed;
  }
  return result;
}

/** Parst Kalender-Einträge aus dem Kalender-Abschnitt */
export function parseCalendar(md) {
  const raw = extractSection(md, 'Kalender');
  if (!raw) return { entries: [], raw: '' };

  const entries = [];
  for (const line of raw.split('\n')) {
    // Format: - **2026-04-15:** Titel  oder  - 2026-04-15: Titel  oder  - 2026-04-15 Titel
    const m = line.match(/[-*]\s*\*{0,2}(\d{4}-\d{2}-\d{2})\*{0,2}[:\s]+(.+)/);
    if (m) entries.push({ date: m[1], title: m[2].trim() });
  }
  return { entries, raw };
}

// LONGMEM block markers — verwende eindeutige Marker die nicht in Session-Logs auftauchen
const LM_START = '<!-- SYS:LONGMEM:START -->';
const LM_END   = '<!-- SYS:LONGMEM:END -->';

/** Extrahiert den LONGMEM-JSON-Block aus sys.md. */
export function extractLongmem(md) {
  const start = md.lastIndexOf(LM_START);
  if (start === -1) return null;
  const end = md.indexOf(LM_END, start);
  if (end === -1) return null;
  const content = md.slice(start + LM_START.length, end).trim();
  try { return JSON.parse(content); } catch { return null; }
}

/** Schreibt aktualisierten LONGMEM-Block in sys.md — immer direkt nach Frontmatter. */
export function updateLongmem(md, data) {
  const json  = JSON.stringify(data, null, 2);
  const block = `${LM_START}\n${json}\n${LM_END}`;

  // Alten Block überall entfernen (beide Marker-Varianten)
  const oldPattern = /\n?(?:<!--\s*LONGMEM:START\s*-->|<!-- SYS:LONGMEM:START -->)[\s\S]*?(?:<!--\s*LONGMEM:END\s*-->|<!-- SYS:LONGMEM:END -->)\n?/g;
  const stripped = md.replace(oldPattern, '\n');

  // Nach Frontmatter (---\n...\n---) einfügen
  const fmEnd = stripped.indexOf('\n---\n', 3);
  if (fmEnd !== -1) {
    const after = fmEnd + 5; // nach "---\n"
    return stripped.slice(0, after) + '\n' + block + '\n' + stripped.slice(after).replace(/^\n+/, '');
  }
  // Kein Frontmatter → ganz oben
  return block + '\n\n' + stripped.trimStart();
}

/** Formatiert alle LONGMEM-Kategorien als lesbaren Text für KI-Prompts. */
export function formatLongmemForPrompt(longmem) {
  if (!longmem) return '';
  const parts = [];
  if (longmem.facts?.length) {
    const lines = longmem.facts
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map(f => `- [${f.cat}] ${f.text}`)
      .join('\n');
    parts.push(`### Kern-Fakten\n${lines}`);
  }
  if (longmem.memories?.length) {
    const lines = longmem.memories
      .slice(-20)
      .map(m => `- ${m.date ?? ''} ${m.text}`.trim())
      .join('\n');
    parts.push(`### Erinnerungen\n${lines}`);
  }
  if (longmem.ideas?.length) {
    const lines = longmem.ideas
      .filter(i => i.status !== 'done')
      .map(i => `- [${i.status ?? 'idea'}] ${i.title}: ${i.text}`)
      .join('\n');
    if (lines) parts.push(`### Ideen\n${lines}`);
  }
  if (longmem.learnings?.length) {
    const lines = longmem.learnings
      .map(l => `- [${l.cat ?? 'learn'}] ${l.text}`)
      .join('\n');
    parts.push(`### Erkenntnisse\n${lines}`);
  }
  if (!parts.length) return '';
  return `## LONGMEM — Kristallisiertes Langzeitgedächtnis\n${parts.join('\n\n')}`;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
