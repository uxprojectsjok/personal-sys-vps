/**
 * soul_read — Peer variant for trusted peer souls.
 * Reads directly from the filesystem, bypasses OpenResty auth.
 * v2: returns only the <!-- SOCIAL:START --> ... <!-- SOCIAL:END --> block.
 * Stage filtering: stage 1 = last 24h (default), stage 2 = last 48h with sampling.
 */

import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

const SOCIAL_START = '<!-- SOCIAL:START -->';
const SOCIAL_END   = '<!-- SOCIAL:END -->';
const MAGIC        = Buffer.from([0x53, 0x59, 0x53, 0x01]);
const MSG_RE_G     = () => /<!--\s*@msg\s+(\S+)\s+(\S+)\s+(\S+)\s+([\s\S]*?)-->/g;
const DAY_MS       = 86400000;

function migratev1(md) {
  const block    = '\n## Social Sphere\n<!-- SOCIAL:START -->\n<!-- SOCIAL:END -->\n';
  const agentIdx = md.indexOf('<!-- AGENT:START -->');
  const migrated = agentIdx !== -1
    ? md.slice(0, agentIdx) + block + '\n' + md.slice(agentIdx)
    : md.trimEnd() + '\n' + block;
  return migrated.replace(/^version:\s*1\s*$/m, 'version: 2');
}

function parseMessages(blockContent) {
  const re   = MSG_RE_G();
  const msgs = [];
  let m;
  while ((m = re.exec(blockContent)) !== null) {
    msgs.push({ ts: m[1], from: m[2], to: m[3], content: m[4].trim() });
  }
  return msgs.sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

function filterByStage(msgs, stage) {
  const now = Date.now();
  if (stage === 1) {
    return msgs.filter(m => now - new Date(m.ts).getTime() < DAY_MS);
  }
  // stage 2: last 48h; 24–48h range sampled every other to save tokens
  const recent = msgs.filter(m => now - new Date(m.ts).getTime() < DAY_MS);
  const older  = msgs.filter(m => {
    const age = now - new Date(m.ts).getTime();
    return age >= DAY_MS && age < 2 * DAY_MS;
  });
  return [...older.filter((_, i) => i % 2 === 0), ...recent];
}

function formatMsgs(msgs) {
  return msgs.map(m => {
    const from = m.from === 'me' ? 'You' : m.from.slice(0, 8);
    const to   = m.to === 'peer' ? '@peers' : m.to === 'agent' ? '@agents' : '@community';
    const date = m.ts.slice(0, 10) + ' ' + m.ts.slice(11, 16) + ' UTC';
    const hdr  = m.from === 'me' ? `[${date}] ${from} → ${to}` : `[${date}] ${from}`;
    return hdr + '\n' + m.content;
  }).join('\n\n');
}

export function register(server, targetSoulId) {
  server.tool(
    'soul_read',
    [
      'Reads the Social Sphere content of sys.md (<!-- SOCIAL:START/END --> block).',
      'Returns only the section explicitly shared with peers — never the Private Sphere.',
      '',
      'IMPORTANT: call soul_read at the start of each session before responding.',
      '',
      'stage 1 (default): messages from the last 24 hours.',
      'stage 2: last 48 hours; messages older than 24h are sampled every-other to save tokens.',
      'Only use stage 2 when the user explicitly asks for more history context.',
    ].join('\n'),
    {
      stage: z.number().int().min(1).max(2).optional()
        .describe('Message history depth. 1 = last 24h (default). 2 = last 48h with sampling.'),
    },
    async ({ stage = 1 } = {}) => {
      const s = stage === 2 ? 2 : 1;
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const soulPath = `${SOULS_DIR}${targetSoulId}/sys.md`;
        const rawBuf   = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(MAGIC);

        if (wasEncrypted && !vaultKeyHex) {
          return {
            content: [{ type: 'text', text: 'sys.md is encrypted — soul must be unlocked once in the SYS browser.' }],
            isError: true,
          };
        }

        const decBuf = decryptIfNeeded(rawBuf, vaultKeyHex);
        let md = decBuf.toString('utf8');

        // v1 → v2 auto-migration: insert empty SOCIAL block
        if (!md.includes(SOCIAL_START)) {
          md = migratev1(md);
          let writeBuf = Buffer.from(md, 'utf8');
          if (wasEncrypted) writeBuf = encryptBuf(writeBuf, vaultKeyHex);
          await writeFile(soulPath, writeBuf).catch(() => {});
        }

        const si = md.indexOf(SOCIAL_START);
        const ei = md.indexOf(SOCIAL_END);
        if (si === -1 || ei === -1 || ei <= si) {
          return {
            content: [{ type: 'text', text: 'No Social Sphere block found (<!-- SOCIAL:START --> missing).' }],
            isError: true,
          };
        }

        const blockContent = md.slice(si + SOCIAL_START.length, ei).trim();

        // Structured messages
        const msgs = parseMessages(blockContent);
        if (msgs.length > 0) {
          const filtered = filterByStage(msgs, s);
          if (filtered.length === 0) {
            return {
              content: [{ type: 'text', text: `No messages in the last ${s === 1 ? '24h' : '48h'}. Use stage 2 for more history.` }],
            };
          }
          return { content: [{ type: 'text', text: formatMsgs(filtered) }] };
        }

        // Legacy static content (no @msg entries)
        if (!blockContent) {
          return {
            content: [{ type: 'text', text: 'Social Sphere block is empty — soul owner has not shared any content for peers yet.' }],
          };
        }
        return { content: [{ type: 'text', text: blockContent }] };

      } catch (err) {
        return {
          content: [{ type: 'text', text: `soul_read failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
