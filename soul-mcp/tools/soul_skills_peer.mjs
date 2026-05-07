/**
 * soul_skills — Peer/Paid-Variante.
 * Liest sys.md + Kontext-Dateien direkt vom Dateisystem.
 */

import { readFile } from 'fs/promises';
import { decryptIfNeeded, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';
import { parseFrontmatter, extractAllSections } from '../lib/soul_parser.mjs';

const SKIP_SECTIONS = new Set(['Kalender', 'API', 'Anker', 'Chain', 'Blockchain']);

function toSlug(s) {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function skillFile(slug, sectionSlug, heading, name, content, subtitle = '') {
  return `---\nname: ${slug}-${sectionSlug}\ndescription: ${name}s Expertise: ${heading}\n---\n\n# ${heading}\n*${subtitle || `Aus der Soul von ${name}`}*\n\n${content}\n`;
}

export function register(server, targetSoulId) {
  server.tool(
    'soul_skills',
    'Generiert Claude-Skill-Definitionen aus den Soul-Daten und Vault-Kontext-Dateien.',
    {},
    async () => {
      try {
        const { vaultKeyHex, syncedFiles } = await loadVaultMeta(targetSoulId);

        // sys.md lesen
        let buf = await readFile(`${SOULS_DIR}${targetSoulId}/sys.md`);
        buf = decryptIfNeeded(buf, vaultKeyHex);
        const md = buf.toString('utf8');

        const fm       = parseFrontmatter(md);
        const sections = extractAllSections(md);
        const name     = fm.soul_name ?? fm.name ?? 'Soul';
        const slug     = toSlug(name);
        const skills   = [];

        // Sektionen aus sys.md
        for (const [heading, content] of Object.entries(sections)) {
          if (SKIP_SECTIONS.has(heading) || content.length < 80) continue;
          const sectionSlug = toSlug(heading).substring(0, 40);
          skills.push({
            filename: `${slug}-${sectionSlug}.md`,
            heading,
            source:   'sys.md',
            content:  skillFile(slug, sectionSlug, heading, name, content),
          });
        }

        // Vault-Kontext-Dateien
        const contextFiles = syncedFiles.context || [];
        for (const fname of contextFiles) {
          if (!/\.(md|txt)$/i.test(fname)) continue;
          try {
            const fbuf    = await readFile(`${SOULS_DIR}${targetSoulId}/vault/context/${fname}`);
            const content = decryptIfNeeded(fbuf, vaultKeyHex).toString('utf8');
            if (content.length < 80) continue;
            const docHeading = fname.replace(/\.(md|txt)$/i, '');
            const docSlug    = toSlug(docHeading).substring(0, 40);
            skills.push({
              filename: `${slug}-doc-${docSlug}.md`,
              heading:  docHeading,
              source:   `vault/context/${fname}`,
              content:  skillFile(slug, `doc-${docSlug}`, docHeading, name, content, `Kontext: ${fname}`),
            });
          } catch { /* Datei nicht lesbar */ }
        }

        const skillIndex = skills.map(s => `- \`${s.filename}\` → ${s.heading} (${s.source})`).join('\n');
        skills.unshift({
          filename: `${slug}-sys.md`,
          heading: 'Root (Soul-Kontext)',
          source:  'sys.md',
          content: `---\nname: ${slug}-soul\ndescription: ${name}s Soul-Kontext\n---\n\n# ${name} – Soul-Kontext\n\n## Verfügbare Skills\n\n${skillIndex || '(keine Sektionen)'}\n`,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              soul:        name,
              soul_id:     fm.soul_id ?? targetSoulId,
              skill_count: skills.length,
              skills,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `soul_skills fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
