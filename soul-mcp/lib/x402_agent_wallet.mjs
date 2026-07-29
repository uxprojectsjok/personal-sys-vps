/**
 * x402_agent_wallet.mjs — Per-soul x402 test wallet (Settings → x402).
 *
 * Replaces the earlier polygon-agent/AgentConnect-based flow (v1.0.53–1.0.55):
 * AgentConnect's session-creation step turned out to be unreliably broken in
 * practice (reproducible "createNewSession timed out" across multiple full
 * attempts, confirmed to be on Polygon's side via clean access logs on our
 * end — see CHANGELOG v1.0.56). This is a direct replacement: the soul owner
 * exports a private key from a MetaMask account THEY chose specifically for
 * this purpose (never their main wallet — see CHANGELOG for why that
 * distinction matters) and pastes it in once; we store it encrypted and use
 * it directly to sign x402 payments via @x402/evm + viem.
 *
 * Per-soul, not node-global (changed 2026-07-29): each soul gets its own key
 * under WALLET_DIR/{soul_id}/, mirroring how reown_project_id already works
 * per-soul via config.json. Was node-global + Single-Hoster-only before,
 * because there was no way to identify which soul owned a Multi-Hoster
 * request without a per-soul boundary — now every authenticated soul manages
 * its own wallet. SYS's own payment-RECEIVING path (soul_pay_x402.lua) never
 * touches this and still never holds a spendable key for the soul itself.
 */

import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import crypto from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';

const WALLET_DIR = '/var/lib/sys/x402-agent';
const PK_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const SOUL_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

function soulDir(soulId) {
  if (typeof soulId !== 'string' || !SOUL_ID_PATTERN.test(soulId) || soulId.length > 64) {
    throw new Error('invalid_soul_id');
  }
  return `${WALLET_DIR}/${soulId}`;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

// Eigener, zufällig erzeugter Schlüssel statt SOUL_MASTER_KEY — der ist im
// soul-mcp-Prozess gar nicht verfügbar (nur die OpenResty-Systemd-Unit hat
// ihn gesetzt, siehe CHANGELOG-Rechercheergebnis), und ein dedizierter,
// zweckgebundener Schlüssel vermeidet ohnehin eine Kopplung zwischen zwei
// unabhängigen Diensten. Ein Enc-Key pro Soul-Verzeichnis, gleiche Idee wie
// polygon-agents eigene .encryption-key-Datei im selben Verzeichnis.
async function getOrCreateEncKey(dir) {
  await ensureDir(dir);
  const encKeyFile = `${dir}/enc.key`;
  try {
    const raw = await readFile(encKeyFile);
    if (raw.length === 32) return raw;
  } catch { /* noch keiner da */ }
  const key = crypto.randomBytes(32);
  await writeFile(encKeyFile, key, { mode: 0o600 });
  return key;
}

export async function savePrivateKey(soulId, privateKeyHex) {
  if (typeof privateKeyHex !== 'string' || !PK_PATTERN.test(privateKeyHex.trim())) {
    throw new Error('invalid_private_key');
  }
  const pk = privateKeyHex.trim();
  // Wirft selbst, falls der Key strukturell ungültig ist (z.B. falsche
  // Kurvenordnung) — vor dem Verschlüsseln validieren, nicht erst beim
  // ersten Zahlungsversuch einen kaputten Key entdecken.
  const account = privateKeyToAccount(pk);

  const dir    = soulDir(soulId);
  const encKey = await getOrCreateEncKey(dir);
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(pk, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  await ensureDir(dir);
  const payload = JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  });
  await writeFile(`${dir}/wallet_key.enc`, payload, { mode: 0o600 });
  return account.address;
}

export async function loadAccount(soulId) {
  const dir = soulDir(soulId);
  let raw;
  try {
    raw = await readFile(`${dir}/wallet_key.enc`, 'utf8');
  } catch {
    return null;
  }
  const { iv, tag, ciphertext } = JSON.parse(raw);
  const encKey = await getOrCreateEncKey(dir);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const pk = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');
  return privateKeyToAccount(pk);
}

export async function clearPrivateKey(soulId) {
  const dir = soulDir(soulId);
  try { await unlink(`${dir}/wallet_key.enc`); } catch { /* schon weg */ }
}

export async function getStatus(soulId) {
  const account = await loadAccount(soulId);
  return {
    configured: !!account,
    address: account ? account.address : null,
  };
}
