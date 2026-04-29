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

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
