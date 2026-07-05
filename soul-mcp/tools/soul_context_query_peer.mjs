/**
 * soul_context_query — Peer/Paid-Variante.
 * Liest sys.md direkt vom Dateisystem, fragt LONGMEM über den MIND-3D-Index ab.
 *
 * Identity-Kategorie (Name, Adresse, Kontakt, ...) ist nur sichtbar wenn der
 * aufrufende peer_cert auf dieselbe soul_id lautet wie die Ziel-Soul — also
 * für vom Soul-Inhaber selbst betriebene MCP-Connectors (z.B. Login-/Bestell-
 * Autofill), nicht für andere Personen in trusted_souls. Spiegelt damit die
 * gleiche Grenze wie soul_read_peer (dort: nur Social-Sphere-Block).
 */

import { z } from 'zod';
import { readFile } from 'fs/promises';
import { decryptIfNeeded, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';
import { extractLongmem, extractLongmemIndex, queryLongmem } from '../lib/soul_parser.mjs';

export function register(server, targetSoulId, peerToken) {
  const peerSoulId = peerToken ? peerToken.split('.')[0] : null;
  const isSelf     = !!peerSoulId && peerSoulId === targetSoulId;

  server.tool(
    'soul_context_query',
    [
      'Fragt GEZIELT einen Ausschnitt des kristallisierten Langzeitgedächtnisses ab',
      '(Facts/Memories/Ideas/Learnings) über den vorgebauten Index (Kategorie/Score/',
      'Status) — statt sys.md komplett zu lesen und selbst zu durchsuchen.',
      '',
      'WICHTIG: Falls keine passenden Einträge gefunden werden oder "updated" älter',
      'ist als erwartet — das EXPLIZIT sagen, NICHT raten oder Informationen erfinden.',
      '',
      ...(isSelf ? [] : [
        'Hinweis: Facts der Kategorie "identity" (Name, Adresse, Kontakt) sind über',
        'diese Peer-Verbindung nicht sichtbar — nur für vom Soul-Inhaber selbst',
        'betriebene MCP-Connectors.',
      ]),
    ].join('\n'),
    {
      dimension: z.enum(['facts', 'memories', 'ideas', 'learnings']).optional()
        .describe('Welche LONGMEM-Kategorie abgefragt wird (default: facts)'),
      y_cat: z.union([z.string(), z.array(z.string())]).optional()
        .describe('Kategorie-Filter (Y-Achse), z.B. "identity", "project" oder ["identity","values"]'),
      x_min_score: z.number().optional()
        .describe('Mindest-Relevanz-Score für facts (X-Achse, 1-5)'),
      z_status: z.string().optional()
        .describe('Status-Filter für ideas (Z-Achse), z.B. "planned", "idea", "done"'),
      limit: z.number().int().min(1).max(20).optional()
        .describe('Maximale Anzahl Treffer (default: 5)'),
    },
    async ({ dimension, y_cat, x_min_score, z_status, limit } = {}) => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(targetSoulId);
        const buf = await readFile(`${SOULS_DIR}${targetSoulId}/sys.md`);
        const md  = decryptIfNeeded(buf, vaultKeyHex).toString('utf8');

        const longmem = extractLongmem(md);
        if (!longmem) {
          return {
            content: [{ type: 'text', text: 'Noch kein LONGMEM vorhanden — diese Soul wurde noch nicht kristallisiert. Nicht raten, sondern so beantworten.' }],
          };
        }
        const index  = extractLongmemIndex(md);
        const result = queryLongmem(longmem, index, {
          dimension: dimension ?? 'facts',
          y_cat,
          x_minScore: x_min_score,
          z_status,
          exclude_cat: isSelf ? undefined : 'identity',
          limit: limit ?? 5,
        });
        if (!result.formatted) {
          return {
            content: [{ type: 'text', text: `Keine passenden Einträge gefunden (Stand: ${result.updated ?? 'unbekannt'}). Nicht raten — sag, dass dazu nichts vorliegt.` }],
          };
        }
        return {
          content: [{ type: 'text', text: `${result.formatted}\n\n(Stand: ${result.updated})` }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `soul_context_query fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
