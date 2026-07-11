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

/**
 * Aggregat-Tiefe aus LONGMEM für Scoring-Zwecke (soul_maturity, soul_skills).
 * Bewusst kein Rück-Mapping auf einzelne Sektionen — facts.cat kennt nur
 * identity/values/personality/project, nicht die ursprüngliche Sektion.
 */
export function scoreLongmemDepth(longmem) {
  if (!longmem) return { sectionPts: 0, sessionBonus: 0 };
  const facts    = longmem.facts    ?? [];
  const memories = longmem.memories ?? [];
  const sectionPts   = Math.min(Math.round(facts.length * 0.7 + memories.length * 0.2), 12);
  const sessionBonus = memories.length;
  return { sectionPts, sessionBonus };
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

// MINDIDX block markers — persistenter 3D-Index (Y=Kategorie, X=Score, Z=Status/Rezenz) über LONGMEM
const MI_START = '<!-- SYS:MINDIDX:START -->';
const MI_END   = '<!-- SYS:MINDIDX:END -->';

/** Baut den 3D-Index aus LONGMEM: Y=Kategorie (facts/learnings), X=Score (facts), Z=Status/Rezenz (ideas/memories). */
export function buildLongmemIndex(longmem) {
  if (!longmem) return null;
  const byCat = (arr) => (arr ?? []).reduce((acc, item, i) => {
    (acc[item.cat] ??= []).push(i);
    return acc;
  }, {});
  const byStatus = (arr) => (arr ?? []).reduce((acc, item, i) => {
    (acc[item.status ?? 'idea'] ??= []).push(i);
    return acc;
  }, {});
  const factsByScoreDesc = (longmem.facts ?? [])
    .map((_, i) => i)
    .sort((a, b) => (longmem.facts[b].score ?? 0) - (longmem.facts[a].score ?? 0));
  const memsByDateDesc = (longmem.memories ?? [])
    .map((_, i) => i)
    .sort((a, b) => (longmem.memories[b].date ?? '').localeCompare(longmem.memories[a].date ?? ''));

  return {
    _v: 1,
    based_on_updated: longmem.updated ?? null,
    facts:     { y_cat: byCat(longmem.facts), x_score_desc: factsByScoreDesc },
    memories:  { z_recent: memsByDateDesc },
    ideas:     { z_status: byStatus(longmem.ideas) },
    learnings: { y_cat: byCat(longmem.learnings) },
  };
}

/** Persistiert den MINDIDX-Block direkt nach dem LONGMEM-Block. */
export function updateLongmemIndex(md, index) {
  const json  = JSON.stringify(index, null, 2);
  const block = `${MI_START}\n${json}\n${MI_END}`;

  // Alten Block überall entfernen
  const oldPattern = /\n?<!-- SYS:MINDIDX:START -->[\s\S]*?<!-- SYS:MINDIDX:END -->\n?/g;
  const stripped = md.replace(oldPattern, '\n');

  // Direkt nach dem LONGMEM-Block einfügen — Index folgt den Daten, die er beschreibt
  const lmEndIdx = stripped.indexOf(LM_END);
  if (lmEndIdx !== -1) {
    const after = lmEndIdx + LM_END.length;
    return stripped.slice(0, after) + '\n' + block + stripped.slice(after);
  }
  // Kein LONGMEM vorhanden → Index ohne Daten ergibt keinen Sinn, nicht einfügen
  return stripped;
}

/** Extrahiert den MINDIDX-Block aus sys.md. */
export function extractLongmemIndex(md) {
  const start = md.lastIndexOf(MI_START);
  if (start === -1) return null;
  const end = md.indexOf(MI_END, start);
  if (end === -1) return null;
  const content = md.slice(start + MI_START.length, end).trim();
  try { return JSON.parse(content); } catch { return null; }
}

/**
 * Fragt LONGMEM über den 3D-Index ab (Y ∩ X ∩ Z → Indizes → Klartext).
 * Baut bei fehlendem/veraltetem Index transparent im Speicher neu — der Index ist
 * ein Fast-Path, kein Muss (analog zu "Erinnerungen haben auch Lücken").
 * Gibt immer lesbare Bullet-Zeilen zurück, nie rohes JSON.
 */
export function queryLongmem(longmem, index, { dimension = 'facts', y_cat, x_minScore, z_status, exclude_cat, limit = 5 } = {}) {
  if (!longmem) return { formatted: '', updated: null };
  const idx   = (index && index.based_on_updated === longmem.updated) ? index : buildLongmemIndex(longmem);
  const items = longmem[dimension] ?? [];
  if (!items.length) return { formatted: '', updated: longmem.updated ?? null };

  const dimIdx = idx?.[dimension] ?? {};
  const candidateSets = [];
  if (y_cat != null) {
    const cats = Array.isArray(y_cat) ? y_cat : [y_cat];
    candidateSets.push(new Set(cats.flatMap(c => dimIdx.y_cat?.[c] ?? [])));
  }
  if (z_status != null) {
    candidateSets.push(new Set(dimIdx.z_status?.[z_status] ?? []));
  }

  let indices = candidateSets.length
    ? candidateSets.reduce((a, b) => new Set([...a].filter(i => b.has(i))))
    : new Set(items.map((_, i) => i));

  if (x_minScore != null) {
    indices = new Set([...indices].filter(i => (items[i].score ?? 0) >= x_minScore));
  }

  if (exclude_cat != null) {
    const excluded = Array.isArray(exclude_cat) ? exclude_cat : [exclude_cat];
    indices = new Set([...indices].filter(i => !excluded.includes(items[i].cat)));
  }

  // Reihenfolge: facts nach Score absteigend, memories nach Rezenz, sonst Array-Reihenfolge
  const order   = dimIdx.x_score_desc ?? dimIdx.z_recent ?? items.map((_, i) => i);
  const ordered = order.filter(i => indices.has(i)).slice(0, limit);

  const formatted = ordered
    .map(i => `- ${items[i].cat ? `[${items[i].cat}] ` : ''}${items[i].text ?? items[i].title ?? ''}`)
    .join('\n');

  return { formatted, updated: longmem.updated ?? null };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
