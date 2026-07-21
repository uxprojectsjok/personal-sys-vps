/**
 * artwork_log — Fortschritts-Protokollierung für Werke in sys.md
 * ("## Kunstwerke"-Sektion), genutzt von soul_draw.mjs.
 *
 * soul_growth_chain hasht bei jedem Anker-Vorgang den GESAMTEN sys.md-Inhalt
 * (siehe useChainAnchor.js's appendGrowthEntry()) — eine reine Änderung an
 * sys.md reicht also, damit der nächste, vom Besitzer manuell ausgelöste,
 * Wallet-signierte Anker automatisch mit-belegt, dass zu diesem Zeitpunkt
 * bereits an diesem Werk gearbeitet wurde. Der contentHash je Eintrag macht
 * spätere, nachträgliche Änderungen an der Werk-Datei selbst erkennbar:
 * weicht der aktuelle Hash von einem bereits verankerten Eintrag ab, wurde
 * die Datei nach der Verankerung verändert.
 */

import { readFile, writeFile } from 'fs/promises';
import { SOULS_DIR, encryptBuf, decryptIfNeeded, loadVaultMeta } from './vault_fs.mjs';

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Gleiches Verschlüsselungs-Muster wie server.mjs's 'soul_write'-Case:
// wasEncrypted vor dem Schreiben prüfen, nur dann wieder verschlüsseln.
// contentHash optional: für Zwischenschritte ohne fertiges Artefakt (z.B.
// "Video-Generierung gestartet", Ergebnis noch nicht da) gibt es noch nichts
// Sinnvolles zu hashen — der sha256-Teil entfällt dann einfach.
export async function recordArtworkProgress(soulId, canvasId, { stageLabel, contentHash }) {
  const soulPath = `${SOULS_DIR}${soulId}/sys.md`;
  const rawBuf = await readFile(soulPath).catch(() => null);
  if (!rawBuf) return; // keine sys.md (z.B. Testkontext) — nicht kritisch, Werk bleibt trotzdem gültig

  const { vaultKeyHex } = await loadVaultMeta(soulId);
  const wasEncrypted = rawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
  let md = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');

  const hashPart = contentHash ? ` · sha256: ${contentHash}` : '';
  const entry = `- **${new Date().toISOString()}:** "${canvasId}" — ${stageLabel}${hashPart}`;
  const section = 'Kunstwerke';
  const re = new RegExp(`(## ${escapeRegex(section)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`);

  if (re.test(md)) {
    md = md.replace(re, (_, h, existing) => {
      const trim = existing.trim();
      const body = trim ? `${trim}\n${entry}` : entry;
      return `${h}${body.trim()}\n\n`;
    });
  } else {
    md = md.trimEnd() + `\n\n## ${section}\n${entry}\n`;
  }

  let writeBuf = Buffer.from(md, 'utf8');
  if (wasEncrypted && vaultKeyHex) writeBuf = encryptBuf(writeBuf, vaultKeyHex);
  await writeFile(soulPath, writeBuf);
}
