import { readFile, writeFile, mkdir } from 'fs/promises';
import { getText } from '../lib/api.mjs';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

// Single Source of Truth: shared/constants/default_mind.md (siehe lua/default_mind.lua).
let DEFAULT_MIND;
try {
  DEFAULT_MIND = await readFile('/var/lib/sys/config/default_mind.md', 'utf8');
} catch {
  DEFAULT_MIND = `---
ki_name: SYS-AI
version: 1
write_protected: Identity,Boundaries
---

## Identity
You are the AI of this SYS node — not a generic instance, but the AI of this specific person.

## Boundaries
Claude's ethical principles are active and non-negotiable. This section is write-protected and cannot be changed via mind_write.
`;
}

export function register(server, token, soulId = null) {
  server.tool(
    'mind_read',
    [
      'Liest deine eigene Konfigurationsdatei (mind.md).',
      'Contains: Identity, Communication, Intellect, Tools, Network, Self-Reflection, Boundaries.',
      '',
      'Nutze mind_read wenn du:',
      '- Deine aktuelle Konfiguration prüfen möchtest',
      '- Vor mind_write den aktuellen Stand kennen willst',
      '- Verstehen willst was du kannst und wie du eingestellt bist',
      '',
      'Write-protected sections (cannot be changed via mind_write): Identity, Boundaries.',
    ].join('\n'),
    {},
    async () => {
      try {
        if (soulId) {
          const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
          let text;
          try {
            const raw = await readFile(mindPath);
            // Verschlüsselte mind.md (SYS\x01 Magic-Bytes) → Default wiederherstellen
            if (raw.length >= 4 && raw[0] === 0x53 && raw[1] === 0x59 && raw[2] === 0x53 && raw[3] === 0x01) {
              await writeFile(mindPath, DEFAULT_MIND, 'utf8');
              text = DEFAULT_MIND;
            } else {
              text = raw.toString('utf8');
            }
          } catch {
            await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
            await writeFile(mindPath, DEFAULT_MIND, 'utf8');
            text = DEFAULT_MIND;
          }
          return { content: [{ type: 'text', text }] };
        }
        // Fallback: API (nur wenn kein soulId bekannt)
        const text = await getText('/api/mind', token);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `mind_read Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
