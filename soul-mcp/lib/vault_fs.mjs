/**
 * vault_fs.mjs — Filesystem-basierter Vault-Zugriff für Peer- und Paid-Agent-Tools.
 * Liest direkt aus /var/lib/sys/souls/{id}/ — bypasses OpenResty-Auth.
 */

import { readFile } from 'fs/promises';
import crypto from 'crypto';

export const SOULS_DIR = '/var/lib/sys/souls/';
const MAGIC = Buffer.from([0x53, 0x59, 0x53, 0x01]); // SYS\x01

export const MIME_MAP = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  md: 'text/plain; charset=utf-8', txt: 'text/plain; charset=utf-8',
  pdf: 'application/pdf',
};

export function getMime(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

/** Liest api_context.json einer Soul */
export async function loadCtx(soulId) {
  const raw = await readFile(`${SOULS_DIR}${soulId}/api_context.json`, 'utf8');
  return JSON.parse(raw);
}

/** Entschlüsselt einen Buffer wenn er mit SYS\x01-Magic beginnt */
export function decryptIfNeeded(buf, vaultKeyHex) {
  if (!buf.slice(0, 4).equals(MAGIC)) return buf;
  if (!vaultKeyHex) throw new Error('Vault ist verschlüsselt — Soul muss einmal im Browser entsperrt werden.');
  const key        = Buffer.from(vaultKeyHex, 'hex');
  const iv         = buf.slice(4, 20);
  const ciphertext = buf.slice(20);
  const decipher   = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Verschlüsselt einen Buffer mit dem vault_key (für soul_write zurückschreiben) */
export function encryptBuf(buf, vaultKeyHex) {
  const key = Buffer.from(vaultKeyHex, 'hex');
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  return Buffer.concat([MAGIC, iv, encrypted]);
}

/** Liest + entschlüsselt eine Vault-Datei */
export async function readVaultFile(soulId, vaultType, filename, vaultKeyHex) {
  const buf = await readFile(`${SOULS_DIR}${soulId}/vault/${vaultType}/${filename}`);
  return decryptIfNeeded(buf, vaultKeyHex);
}

/** Gibt { vaultKeyHex, syncedFiles } aus api_context zurück */
export async function loadVaultMeta(soulId) {
  try {
    const ctx = await loadCtx(soulId);
    return {
      vaultKeyHex:  ctx?.vault_key_hex || '',
      syncedFiles:  ctx?.synced_files  || {},
      activeFiles:  ctx?.active_files  || {},
    };
  } catch {
    return { vaultKeyHex: '', syncedFiles: {}, activeFiles: {} };
  }
}
