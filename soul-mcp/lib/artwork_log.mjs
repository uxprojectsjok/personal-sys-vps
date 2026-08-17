/**
 * artwork_log — gemeinsame Fortschritts-Protokollierung für Werke in sys.md
 * ("## Kunstwerke"-Sektion). Genutzt von soul_draw.mjs (Striche) und
 * soul_generate.mjs (WaveSpeed-Generierungen) — ein Werk kann über beide
 * Werkzeuge hinweg an derselben canvas_id weiterentwickelt werden.
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

import { readFile, writeFile, mkdir, appendFile } from 'fs/promises';
import { SOULS_DIR, encryptBuf, decryptIfNeeded, loadVaultMeta } from './vault_fs.mjs';

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// vault_shared/{canvas_id}/ — der "Beleg der Arbeit"-Ordner (Entwürfe + finales
// PNG + log.md), von soul_draw.mjs/soul_generate.mjs genutzt statt direkt in
// vault_shared/ zu schreiben. Zentral hier definiert, damit beide Tools und
// die Log-Funktion unten denselben Pfad berechnen.
export function artworkDir(soulId, canvasId) {
  return `${SOULS_DIR}${soulId}/vault_shared/${canvasId}`;
}

// Klartext-Spiegel derselben Fortschritts-Zeile in {artworkDir}/log.md — im
// Gegensatz zu sys.md unverschlüsselt und Teil des vault_shared-Ordners, also
// ohne Entschlüsselung lesbar/downloadbar. sys.md bleibt der eigentliche,
// hash-verankerte Provenienz-Nachweis; log.md ist die portable Kopie davon
// für den vault_shared-Ordner (z.B. Zip/Einzeldownload durch den Besitzer).
async function appendFolderLog(soulId, canvasId, entry) {
  const dir = artworkDir(soulId, canvasId);
  await mkdir(dir, { recursive: true }).catch(() => {});
  const logPath = `${dir}/log.md`;
  const header = `# Kunstwerke-Log: ${canvasId}\n\n`;
  const exists = await readFile(logPath).catch(() => null);
  if (!exists) await writeFile(logPath, header).catch(() => {});
  await appendFile(logPath, `${entry}\n`).catch(() => {});
}

// Rohe Strich-Geometrie pro soul_draw()-Aufruf, JSON Lines (ein Objekt pro
// Zeile, append-only) — für die "Kunstwerk Live"-Wiedergabe (siehe
// shared/apps/kunstwerk-live/, soul_draw_replay.mjs). Getrennt von log.md
// (menschenlesbare Fortschritts-Zeile) und sys.md (Provenienz-Hash): hier
// steht die tatsächliche Punkt-für-Punkt-Geometrie, damit eine App sie
// clientseitig nachanimieren kann, ohne selbst @napi-rs/canvas nachzubauen.
// Nicht kritisch für die eigentliche Werk-Funktion — Fehler hier werden
// verschluckt statt den ganzen soul_draw-Aufruf scheitern zu lassen.
export async function appendStrokeReplayLog(soulId, canvasId, batch) {
  const dir = artworkDir(soulId, canvasId);
  await mkdir(dir, { recursive: true }).catch(() => {});
  const logPath = `${dir}/${canvasId}.strokes.jsonl`;
  await appendFile(logPath, `${JSON.stringify(batch)}\n`).catch(() => {});
}

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

  await appendFolderLog(soulId, canvasId, entry);
}

// Zählt bisherige Log-Einträge für eine canvas_id in sys.md ("## Kunstwerke") —
// genutzt von soul_generate.mjs, um Archiv-Dateinamen ({canvas_id}_stage{n}.png)
// eindeutig und fortlaufend zu vergeben.
export async function countArtworkStages(soulId, canvasId) {
  const soulPath = `${SOULS_DIR}${soulId}/sys.md`;
  const rawBuf = await readFile(soulPath).catch(() => null);
  if (!rawBuf) return 0;

  const { vaultKeyHex } = await loadVaultMeta(soulId);
  const md = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');
  const section = 'Kunstwerke';
  const re = new RegExp(`## ${escapeRegex(section)}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = md.match(re);
  if (!match) return 0;

  const needle = `"${canvasId}"`;
  return match[1].split('\n').filter(line => line.includes(needle)).length;
}
