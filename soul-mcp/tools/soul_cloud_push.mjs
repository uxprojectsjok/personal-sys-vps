import { z } from 'zod';
import { getJson, getRawBytes } from '../lib/api.mjs';

/**
 * soul_cloud_push – lädt die verschlüsselte sys.md auf einen Cloud-Speicher hoch.
 *
 * Sicherheitsprinzip: Es werden AUSSCHLIESSLICH verschlüsselte Bytes hochgeladen.
 * Die sys.md wird nie entschlüsselt — der Server liefert via ?raw=1 den
 * AES-256-CBC Ciphertext (SYSCRYPT01-Format) direkt zurück.
 *
 * Unterstützte Ziele:
 * - Arweave: wallet_key (JWK JSON) + optionale Arweave-Gateway-URL
 * - HTTPS PUT: beliebige URL mit optionalem Bearer-Token (z.B. eigener VPS, R2, S3)
 */

const ARWEAVE_BASE = 'https://arweave.net';

async function uploadToArweave(encryptedBytes, walletKeyJson, gatewayUrl) {
  const gateway = (gatewayUrl || ARWEAVE_BASE).replace(/\/$/, '');

  let jwk;
  try { jwk = JSON.parse(walletKeyJson); } catch {
    throw new Error('arweave_wallet_key ist kein gültiges JSON (JWK)');
  }

  const createRes = await fetch(`${gateway}/tx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      format: 2,
      last_tx: '',
      owner: jwk.n,
      tags: [
        { name: Buffer.from('Content-Type').toString('base64url'),  value: Buffer.from('application/octet-stream').toString('base64url') },
        { name: Buffer.from('App-Name').toString('base64url'),      value: Buffer.from('SaveYourSoul').toString('base64url') },
        { name: Buffer.from('Type').toString('base64url'),          value: Buffer.from('sys.md.enc').toString('base64url') },
        { name: Buffer.from('Encryption').toString('base64url'),    value: Buffer.from('AES-256-CBC').toString('base64url') },
      ],
      data: Buffer.from(encryptedBytes).toString('base64url'),
      quantity: '0',
      reward: '0',
      signature: '',
      id: '',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text().catch(() => '');
    throw new Error(`Arweave TX-Erstellung fehlgeschlagen (${createRes.status}): ${err.slice(0, 200)}`);
  }

  const tx = await createRes.json().catch(() => ({}));
  const txId = tx?.id;
  if (!txId) throw new Error('Arweave hat keine TX-ID zurückgegeben. JWK prüfen.');

  return {
    tx_id: txId,
    url: `${gateway}/${txId}`,
    arweave_url: `https://arweave.net/${txId}`,
  };
}

async function uploadToHttps(encryptedBytes, targetUrl, bearerToken) {
  const headers = { 'Content-Type': 'application/octet-stream' };
  if (bearerToken) headers['Authorization'] = `Bearer ${bearerToken}`;
  const res = await fetch(targetUrl, { method: 'PUT', headers, body: encryptedBytes });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Upload fehlgeschlagen (${res.status}): ${err.slice(0, 200)}`);
  }
  return { url: targetUrl, status: res.status };
}

export function register(server, token) {
  server.tool(
    'soul_cloud_push',
    'Lädt die verschlüsselte sys.md auf einen Cloud-Speicher hoch.\n\nSicherheit: Es werden AUSSCHLIESSLICH AES-256-CBC-verschlüsselte Bytes hochgeladen — niemals Klartext. Die sys.md muss im ciphered-Modus sein, sonst wird der Upload blockiert.\n\nZiele:\n- Arweave: arweave_wallet_key (JWK als JSON-String) → permanente, dezentrale Speicherung\n- HTTPS PUT: target_url + optionaler bearer_token → eigener VPS, R2, S3\n\nNach dem Upload wird die cloud_url als Sync-Quelle gespeichert.',
    {
      target:             z.enum(['arweave', 'https']).describe('Upload-Ziel'),
      arweave_wallet_key: z.string().optional().describe('Arweave JWK-Wallet als JSON-String (nur für target="arweave")'),
      arweave_gateway:    z.string().url().optional().describe('Arweave-Gateway-URL (Standard: https://arweave.net)'),
      target_url:         z.string().url().optional().describe('Ziel-URL für HTTPS-PUT (nur für target="https")'),
      bearer_token:       z.string().optional().describe('Bearer-Token für HTTPS-PUT (optional)'),
    },
    async ({ target, arweave_wallet_key, arweave_gateway, target_url, bearer_token }) => {
      try {
        // Prüfen ob soul verschlüsselt ist
        const ctx = await getJson('/api/context', token);
        if (!ctx || ctx.cipher_mode !== 'ciphered') {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              ok: false,
              error: 'soul_not_encrypted',
              message: 'Cloud-Backup nur für verschlüsselte Souls erlaubt. cipher_mode muss "ciphered" sein.',
              hint: 'Vault öffnen, sys.md synchronisieren (Verschlüsselung aktivieren), dann erneut versuchen.',
            }, null, 2) }],
            isError: true,
          };
        }

        // Verschlüsselte Bytes direkt vom Server holen (kein Entschlüsseln)
        const encryptedBuffer = await getRawBytes('/api/soul?raw=1', token);
        const encryptedBytes  = Buffer.from(encryptedBuffer);

        if (!encryptedBytes || encryptedBytes.length < 20) {
          throw new Error('Keine verschlüsselten Daten erhalten. sys.md zuerst synchronisieren.');
        }

        let result;
        if (target === 'arweave') {
          if (!arweave_wallet_key) throw new Error('arweave_wallet_key fehlt (JWK als JSON-String)');
          result = await uploadToArweave(encryptedBytes, arweave_wallet_key, arweave_gateway);
        } else {
          if (!target_url) throw new Error('target_url fehlt');
          result = await uploadToHttps(encryptedBytes, target_url, bearer_token);
        }

        // cloud_url in api_context speichern
        const cloudUrl = result.arweave_url ?? result.url ?? target_url;
        try {
          await fetch(`${process.env.SYS_API_URL}/api/context`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ external_soul_url: cloudUrl }),
          });
        } catch { /* nicht kritisch */ }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              target,
              encrypted: true,
              size_bytes: encryptedBytes.length,
              ...result,
              cloud_url_saved: cloudUrl,
              message: `Verschlüsselte sys.md (${encryptedBytes.length} Bytes) hochgeladen. cloud_url gespeichert: ${cloudUrl}`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
