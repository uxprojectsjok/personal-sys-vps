import { getText, getJson } from '../lib/api.mjs';
import { parseFrontmatter, extractAllSections } from '../lib/soul_parser.mjs';

const SKIP_SECTIONS = new Set(['Kalender', 'API', 'Anker', 'Chain', 'Blockchain']);

const PROFILE_LABELS = {
  face:      'Erscheinung & Ausdruck',
  voice:     'Stimme & Kommunikationsstil',
  motion:    'Bewegung & Körpersprache',
  expertise: 'Fachkompetenz (Profil)',
};

export function register(server, token) {
  server.tool(
    'soul_skills',
    'Generiert vollständige Claude-Skill-Definitionen aus ALLEN Soul-Vault-Daten:\n1. sys.md Sektionen → Skill pro Themenbereich\n2. Vault-Kontext-Dateien (.md/.txt) → Skill pro Dokument\n3. Gespeicherte Profile (face/voice/motion/expertise) → im Root-Skill integriert\n\nGibt fertige .md-Dateien zurück – speicherbar unter ~/.claude/skills/.',
    {},
    async () => {
      try {
        const [soulMd, contextFiles, profiles] = await Promise.all([
          getText('/api/soul', token),
          loadContextFiles(token),
          loadProfiles(token),
        ]);

        const fm       = parseFrontmatter(soulMd);
        const sections = extractAllSections(soulMd);
        const name     = fm.name || 'Soul';
        const slug     = toSlug(name);
        const skills   = [];

        // ── 1. Sektionen aus sys.md ──────────────────────────────────────────
        for (const [heading, content] of Object.entries(sections)) {
          if (SKIP_SECTIONS.has(heading) || content.length < 80) continue;
          const sectionSlug = toSlug(heading).substring(0, 40);
          skills.push({
            filename: `${slug}-${sectionSlug}.md`,
            heading,
            source: 'sys.md',
            skill: skillFile(slug, sectionSlug, heading, name, content),
          });
        }

        // ── 2. Vault-Kontext-Dateien ──────────────────────────────────────────
        for (const { name: fname, content } of contextFiles) {
          if (!content || content.length < 80) continue;
          const docHeading  = fname.replace(/\.(md|txt)$/i, '');
          const docSlug     = toSlug(docHeading).substring(0, 40);
          skills.push({
            filename: `${slug}-doc-${docSlug}.md`,
            heading:  docHeading,
            source:   `vault/context/${fname}`,
            skill: skillFile(slug, `doc-${docSlug}`, docHeading, name, content, `Kontext-Dokument: ${fname}`),
          });
        }

        // ── 3. Root-Skill mit integrierten Profilen ───────────────────────────
        const profileSections = buildProfileSections(profiles);
        const skillIndex      = skills.map((s) => `- \`${s.filename}\` → ${s.heading} (${s.source})`).join('\n');

        const rootSkill = `---
name: ${slug}-soul
description: ${name}s vollständiger Soul-Kontext – Persönlichkeit, Wissen, Erscheinung
---

# ${name} – Soul-Kontext

**Maturity:** ${fm.soul_maturity ?? '?'}/100 | **Sessions:** ${fm.soul_sessions ?? '?'} | **Version:** ${fm.version ?? '?'}

${profileSections}

## Verfügbare Spezial-Skills

${skillIndex || '(noch keine Sektionen generiert)'}

## Wichtige Regeln

- Datenschutz: Soul-Daten sind personenbezogen – nicht an Dritte weitergeben
- Bei direkter KI-Frage: transparent antworten ("Ich bin Claudes digitale Repräsentation von ${name}")
- Vault gesperrt (403): User bitten Vault in der SYS App zu entsperren
- Für aktuelle Daten immer MCP-Tools nutzen: \`soul_read\`, \`vault_manifest\`
`;

        skills.unshift({
          filename: `${slug}-sys.md`,
          heading: 'Root (Soul-Kontext)',
          source: 'sys.md + profile',
          skill: rootSkill,
        });

        // ── Rückgabe ──────────────────────────────────────────────────────────
        const hasProfiles = Object.keys(profiles).length > 0;
        const output = {
          soul:          name,
          soul_id:       fm.soul_id ?? null,
          skill_count:   skills.length,
          sources: {
            soul_sections:    Object.keys(sections).filter((h) => !SKIP_SECTIONS.has(h)).length,
            context_files:    contextFiles.length,
            profiles_loaded:  Object.keys(profiles),
          },
          install_path: '~/.claude/skills/',
          skills: skills.map((s) => ({
            filename: s.filename,
            heading:  s.heading,
            source:   s.source,
            content:  s.skill,
          })),
          instructions: [
            `Speichere alle Dateien unter ~/.claude/skills/`,
            `Oder nutze den /soul-skill-writer Skill für automatische Installation`,
            `Aufruf: /${slug}-soul (Root) oder /${slug}-{thema} (spezifisch)`,
            hasProfiles
              ? `Profile eingebunden: ${Object.keys(profiles).join(', ')}`
              : `Tipp: Erstelle Profile mit profile_save für noch reichere Skills`,
          ],
        };

        return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadContextFiles(token) {
  try {
    const data = await getJson('/api/vault/context', token);
    const files = data?.files ?? [];
    const results = [];
    for (const f of files) {
      if (!f.name) continue;
      try {
        const content = await getText(
          `/api/vault/context/${encodeURIComponent(f.name)}`,
          token
        );
        results.push({ name: f.name, content });
      } catch { /* Datei nicht lesbar – überspringen */ }
    }
    return results;
  } catch {
    return [];
  }
}

async function loadProfiles(token) {
  const profiles = {};
  for (const type of ['face', 'voice', 'motion', 'expertise']) {
    try {
      const data = await getJson(`/api/vault/profile/${type}`, token);
      profiles[type] = data;
    } catch { /* kein Profil vorhanden */ }
  }
  return profiles;
}

function buildProfileSections(profiles) {
  if (!Object.keys(profiles).length) return '';

  const lines = ['## Sensorisches & Physisches Profil\n'];

  for (const [type, data] of Object.entries(profiles)) {
    lines.push(`### ${PROFILE_LABELS[type] ?? type}`);
    // Top-level Felder als lesbaren Text ausgeben
    for (const [k, v] of Object.entries(data)) {
      if (['soul_id', 'type', 'updated_at'].includes(k)) continue;
      if (typeof v === 'string' || typeof v === 'number') {
        lines.push(`- **${k}:** ${v}`);
      } else if (Array.isArray(v)) {
        lines.push(`- **${k}:** ${v.join(', ')}`);
      }
    }
    if (data.updated_at) lines.push(`*(Stand: ${data.updated_at})*`);
    lines.push('');
  }

  return lines.join('\n');
}

function skillFile(slug, sectionSlug, heading, name, content, subtitle = '') {
  return `---
name: ${slug}-${sectionSlug}
description: ${name}s Expertise und Perspektive: ${heading}
---

# ${heading}
*${subtitle || `Aus der Soul von ${name}`}*

${content}

---
Wende dieses Wissen an wenn du Aufgaben zu "${heading.toLowerCase()}" bearbeitest.
`;
}

function toSlug(s) {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
