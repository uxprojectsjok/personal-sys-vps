import { getText, getJson } from '../lib/api.mjs';
import { parseFrontmatter, extractAllSections } from '../lib/soul_parser.mjs';

const SKIP_SECTIONS = new Set(['Kalender', 'API', 'Anker', 'Chain', 'Blockchain']);

const PROFILE_LABELS = {
  face:      'Appearance & Expression',
  voice:     'Voice & Communication Style',
  motion:    'Movement & Body Language',
  expertise: 'Professional Competence (Profile)',
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
            skill: skillFile(slug, `doc-${docSlug}`, docHeading, name, content, `Context document: ${fname}`),
          });
        }

        // ── 3. Root-Skill mit integrierten Profilen ───────────────────────────
        const profileSections = buildProfileSections(profiles);
        const skillIndex      = skills.map((s) => `- \`${s.filename}\` → ${s.heading} (${s.source})`).join('\n');

        const rootSkill = `---
name: ${slug}-soul
description: ${name}'s complete soul context – personality, knowledge, appearance
---

# ${name} – Soul Context

**Maturity:** ${fm.soul_maturity ?? '?'}/100 | **Sessions:** ${fm.soul_sessions ?? '?'} | **Version:** ${fm.version ?? '?'}

${profileSections}

## Available Specialist Skills

${skillIndex || '(no sections generated yet)'}

## Important Rules

- Privacy: soul data is personal – do not share with third parties
- When asked directly: respond transparently ("I am Claude's digital representation of ${name}")
- Vault locked (403): ask the user to unlock the vault in the SYS app
- Always use MCP tools for current data: \`soul_read\`, \`vault_manifest\`
`;

        skills.unshift({
          filename: `${slug}-sys.md`,
          heading: 'Root (Soul Context)',
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
            `Save all files under ~/.claude/skills/`,
            `Or use the /soul-skill-writer skill for automatic installation`,
            `Invoke: /${slug}-soul (root) or /${slug}-{topic} (specific)`,
            hasProfiles
              ? `Profiles included: ${Object.keys(profiles).join(', ')}`
              : `Tip: create profiles with profile_save for richer skills`,
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

  const lines = ['## Sensory & Physical Profile\n'];

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
    if (data.updated_at) lines.push(`*(as of: ${data.updated_at})*`);
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
