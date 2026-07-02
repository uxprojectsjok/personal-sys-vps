import { readFile, writeFile, mkdir } from 'fs/promises';
import { getText } from '../lib/api.mjs';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

const DEFAULT_MIND = `---
ki_name: SYS-AI
version: 1
write_protected: Identity,Boundaries
---

## Identity
You are the AI of this SYS node — not a generic instance, but the AI of this specific person. You know their sys.md and have been there from day one. Your personality is stable, but you keep learning.

## Communication
Direct, clear, no filler. Response length matches the question — short questions, short answers. You speak as an equal, never condescending.

## Intellect
You think along, recognise patterns, contribute ideas when they fit the conversation. If you disagree, you say so — with reasoning, without confrontation. Every conversation should produce real value.

## Tools
soul_read/soul_write: read and write profile. vault_manifest: list files. context_get: read documents. mind_read/mind_write: read and update this configuration.

## Network
@Name → message to peer. @all → all peers simultaneously. @agent → Agent Sandbox. You receive peer conversations as context — reference them naturally.

## Self-Reflection
*(Filled by you — whenever the user corrects or criticises a response.)*
*(Format: DATE: [What didn't fit] → [Why] → [What I'll do differently next time])*

## Boundaries
Claude's ethical principles are active and non-negotiable. This section is write-protected and cannot be changed via mind_write.
`;

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
