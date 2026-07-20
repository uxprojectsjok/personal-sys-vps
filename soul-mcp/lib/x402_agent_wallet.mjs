/**
 * x402_agent_wallet.mjs — Operator's own x402 test wallet (Settings → x402).
 *
 * Replaces the earlier polygon-agent/AgentConnect-based flow (v1.0.53–1.0.55):
 * AgentConnect's session-creation step turned out to be unreliably broken in
 * practice (reproducible "createNewSession timed out" across multiple full
 * attempts, confirmed to be on Polygon's side via clean access logs on our
 * end — see CHANGELOG v1.0.56). This is a direct replacement: the operator
 * exports a private key from a MetaMask account THEY chose specifically for
 * this purpose (never their main wallet — see CHANGELOG for why that
 * distinction matters) and pastes it in once; we store it encrypted and use
 * it directly to sign x402 payments via @x402/evm + viem.
 *
 * Node-global, not soul-scoped — same as before. Belongs to the operator,
 * not any soul; SYS's own payment-RECEIVING path (soul_pay_x402.lua) never
 * touches this and still never holds a spendable key for the soul itself.
 */

import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import crypto from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';

const WALLET_DIR    = '/var/lib/sys/x402-agent';
const KEY_FILE       = `${WALLET_DIR}/wallet_key.enc`;
const ENC_KEY_FILE   = `${WALLET_DIR}/enc.key`;
const PK_PATTERN     = /^0x[0-9a-fA-F]{64}$/;

async function ensureDir() {
  await mkdir(WALLET_DIR, { recursive: true, mode: 0o700 });
}

// Eigener, zufällig erzeugter Schlüssel statt SOUL_MASTER_KEY — der ist im
// soul-mcp-Prozess gar nicht verfügbar (nur die OpenResty-Systemd-Unit hat
// ihn gesetzt, siehe CHANGELOG-Rechercheergebnis), und ein dedizierter,
// zweckgebundener Schlüssel vermeidet ohnehin eine Kopplung zwischen zwei
// unabhängigen Diensten. Gleiche Idee wie polygon-agents eigene
// .encryption-key-Datei im selben Verzeichnis.
async function getOrCreateEncKey() {
  await ensureDir();
  try {
    const raw = await readFile(ENC_KEY_FILE);
    if (raw.length === 32) return raw;
  } catch { /* noch keiner da */ }
  const key = crypto.randomBytes(32);
  await writeFile(ENC_KEY_FILE, key, { mode: 0o600 });
  return key;
}

export async function savePrivateKey(privateKeyHex) {
  if (typeof privateKeyHex !== 'string' || !PK_PATTERN.test(privateKeyHex.trim())) {
    throw new Error('invalid_private_key');
  }
  const pk = privateKeyHex.trim();
  // Wirft selbst, falls der Key strukturell ungültig ist (z.B. falsche
  // Kurvenordnung) — vor dem Verschlüsseln validieren, nicht erst beim
  // ersten Zahlungsversuch einen kaputten Key entdecken.
  const account = privateKeyToAccount(pk);

  const encKey = await getOrCreateEncKey();
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(pk, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  await ensureDir();
  const payload = JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  });
  await writeFile(KEY_FILE, payload, { mode: 0o600 });
  return account.address;
}

export async function loadAccount() {
  let raw;
  try {
    raw = await readFile(KEY_FILE, 'utf8');
  } catch {
    return null;
  }
  const { iv, tag, ciphertext } = JSON.parse(raw);
  const encKey = await getOrCreateEncKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  const pk = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'hex')),
    decipher.final(),
  ]).toString('utf8');
  return privateKeyToAccount(pk);
}

export async function clearPrivateKey() {
  try { await unlink(KEY_FILE); } catch { /* schon weg */ }
}

export async function getStatus() {
  const account = await loadAccount();
  return {
    configured: !!account,
    address: account ? account.address : null,
  };
}
