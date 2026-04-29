/**
 * OAuth 2.0 Authorization Code Flow
 *
 * Ablauf:
 * 1. GET  /oauth/authorize  → Consent-Seite (HTML)
 * 2. POST /oauth/authorize  → Cert validieren, Service-Token erstellen, Code ausstellen
 * 3. POST /oauth/token      → Code → Access Token (= Service-Token)
 *
 * Der Access Token IST der SaveYourSoul Service-Token.
 * Keine eigene Token-Datenbank nötig.
 */

import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateCert, createServiceToken } from './lib/api.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

// In-Memory Code-Store (Code → {service_token, soul_id, redirect_uri, expires})
// Codes sind 60 Sekunden gültig
const codes = new Map();

function issueCode(data) {
  const code = randomHex(32);
  codes.set(code, { ...data, expires: Date.now() + 300_000 }); // 5 min (PKCE-Flow braucht etwas länger)
  // Cleanup alter Codes
  for (const [k, v] of codes) {
    if (v.expires < Date.now()) codes.delete(k);
  }
  return code;
}

async function verifyPkce(codeVerifier, codeChallenge) {
  if (!codeChallenge || !codeVerifier) return true; // kein PKCE → durchlassen
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(hashBuf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return b64 === codeChallenge;
}

function consumeCode(code) {
  const data = codes.get(code);
  if (!data) return null;
  if (data.expires < Date.now()) { codes.delete(code); return null; }
  codes.delete(code);
  return data;
}

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Scope → SaveYourSoul Permission mapping
const SCOPE_PERMISSIONS = {
  soul:     { soul: true },
  calendar: { soul: true, calendar: true },
  audio:    { audio: true },
  images:   { images: true },
  video:    { video: true },
  context:  { context_files: true },
  network:  { soul: true },
};

const SCOPE_LABELS = {
  soul:     'Soul-Inhalt lesen (Persönlichkeit, Werte, Biografie)',
  calendar: 'Kalender-Einträge einsehen',
  audio:    'Audio-Dateien abspielen (Stimme, Memos)',
  images:   'Bilder anzeigen (Fotos, Gesicht)',
  video:    'Videos abspielen (Bewegung, Aufnahmen)',
  context:  'Text-Dokumente lesen (Notizen, Wissen)',
  network:  'Soul-Netzwerk einsehen (Verbundene Souls)',
};

function scopesToPermissions(scopes = []) {
  const perms = {};
  for (const s of scopes) {
    Object.assign(perms, SCOPE_PERMISSIONS[s] ?? {});
  }
  return perms;
}

export const oauthRouter = Router();
oauthRouter.use((req, _res, next) => { req.body = req.body || {}; next(); });

// ── Consent-Seite ──────────────────────────────────────────────────────────

oauthRouter.get('/authorize', (req, res) => {
  const { client_id, redirect_uri, state, response_type, scope, code_challenge, code_challenge_method } = req.query;

  if (response_type !== 'code') {
    return res.status(400).send('Nur response_type=code wird unterstützt.');
  }

  const scopes = (scope || 'soul').split(/[\s,+]/);
  const scopeList = scopes
    .filter((s) => SCOPE_LABELS[s])
    .map((s) => `<div class="scope">${SCOPE_LABELS[s]}</div>`)
    .join('');

  const html = consentHtml({
    client_id: client_id || 'Claude',
    redirect_uri,
    state,
    response_type,
    scope: scopes.join(' '),
    code_challenge: code_challenge || '',
    code_challenge_method: code_challenge_method || '',
    scopeList,
    error: '',
    cancel_url: redirect_uri ? `${redirect_uri}?error=access_denied&state=${encodeURIComponent(state || '')}` : '/',
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ── Form-Submit: Cert validieren + Token erstellen ─────────────────────────

oauthRouter.post('/authorize', async (req, res) => {
  const { soul_cert, client_id, redirect_uri, state, response_type, scope, code_challenge, code_challenge_method } = req.body;

  if (!soul_cert || !soul_cert.includes('.')) {
    return resConsent(res, req.body, 'Ungültiges Soul-Cert – Format: uuid.32hexchars');
  }

  // Cert gegen SaveYourSoul validieren
  const valid = await validateCert(soul_cert);
  if (!valid) {
    return resConsent(res, req.body, 'Soul-Cert ungültig oder abgelaufen.');
  }

  // Service-Token erstellen (alle angeforderten Scopes)
  const scopes = (scope || 'soul').split(/[\s,+]/);
  const permissions = scopesToPermissions(scopes);

  let tokenData;
  try {
    tokenData = await createServiceToken(
      soul_cert,
      `Claude (${client_id || 'oauth'})`,
      permissions,
      '365d'
    );
  } catch (err) {
    return resConsent(res, req.body, `Token-Erstellung fehlgeschlagen: ${err.message}`);
  }

  // Authorization Code ausstellen (PKCE code_challenge mitspeichern)
  const code = issueCode({
    service_token: tokenData.token,
    soul_id: tokenData.soul_id,
    redirect_uri,
    scopes,
    code_challenge: code_challenge || null,
  });

  const redirect = new URL(redirect_uri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);

  res.redirect(302, redirect.toString());
});

// ── Token-Endpunkt ─────────────────────────────────────────────────────────

oauthRouter.post('/token', async (req, res) => {
  const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  const data = consumeCode(code);
  if (!data) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'Code ungültig oder abgelaufen.' });
  }

  if (redirect_uri && data.redirect_uri !== redirect_uri) {
    return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri stimmt nicht überein.' });
  }

  // PKCE prüfen wenn code_challenge gespeichert wurde
  if (data.code_challenge) {
    const valid = await verifyPkce(code_verifier, data.code_challenge);
    if (!valid) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE code_verifier ungültig.' });
    }
  }

  res.json({
    access_token: data.service_token,
    token_type: 'bearer',
    expires_in: 31536000, // 1 Jahr
    scope: data.scopes.join(' '),
  });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function resConsent(res, body, error) {
  const { client_id, redirect_uri, state, response_type, scope, code_challenge, code_challenge_method } = body;
  const scopes = (scope || 'soul').split(/[\s,+]/);
  const scopeList = scopes
    .filter((s) => SCOPE_LABELS[s])
    .map((s) => `<div class="scope">${SCOPE_LABELS[s]}</div>`)
    .join('');

  const html = consentHtml({
    client_id: client_id || 'Claude',
    redirect_uri,
    state,
    response_type,
    scope: scopes.join(' '),
    code_challenge: code_challenge || '',
    code_challenge_method: code_challenge_method || '',
    scopeList,
    error,
    cancel_url: redirect_uri
      ? `${redirect_uri}?error=access_denied&state=${encodeURIComponent(state || '')}`
      : '/',
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(400).send(html);
}

function consentHtml({ client_id, redirect_uri, state, response_type, scope, code_challenge, code_challenge_method, scopeList, error, cancel_url }) {
  const errorHtml = error
    ? `<div class="error">${escHtml(error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SaveYourSoul – Claude verbinden</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#000;color:#e2e8f0;font-family:'Inter',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
    .card{background:#0a0a0a;border:1px solid rgba(255,255,255,.08);border-radius:1.25rem;padding:2rem;max-width:400px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.6)}
    .logo{display:flex;align-items:center;gap:.625rem;margin-bottom:1.75rem}
    .dot{width:8px;height:8px;background:#8b5cf6;border-radius:50%;box-shadow:0 0 6px #8b5cf6}
    .logo-text{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.35);font-weight:500}
    h1{font-size:1.125rem;font-weight:700;margin-bottom:.375rem;letter-spacing:-.01em}
    .sub{color:rgba(255,255,255,.4);font-size:.8125rem;margin-bottom:1.5rem;line-height:1.5}
    .scopes{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:.75rem;padding:.875rem 1rem;margin-bottom:1.5rem}
    .scope{font-size:.8125rem;color:rgba(255,255,255,.6);padding:.2rem 0;display:flex;align-items:center;gap:.5rem}
    .scope::before{content:'✓';color:#fff;font-size:.625rem;background:#8b5cf6;border-radius:50%;width:14px;height:14px;display:inline-flex;align-items:center;justify-content:center;flex-none;font-weight:700}
    label{display:block;font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.5rem;font-weight:500}
    input{width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:.625rem;padding:.75rem 1rem;color:#e2e8f0;font-size:.8125rem;font-family:monospace;margin-bottom:1.25rem;transition:border-color .15s}
    input:focus{outline:none;border-color:rgba(139,92,246,.6);background:rgba(255,255,255,.06)}
    .btn-connect{width:100%;background:#8b5cf6;color:#fff;border:none;border-radius:3rem;padding:.875rem 1.5rem;font-size:.9375rem;font-weight:700;cursor:pointer;margin-bottom:.875rem;letter-spacing:.01em;transition:background .15s,transform .1s;display:flex;align-items:center;justify-content:center;gap:.5rem}
    .btn-connect:hover{background:#7c3aed;transform:translateY(-1px)}
    .btn-connect:active{transform:translateY(0)}
    .cancel{display:block;text-align:center;color:rgba(255,255,255,.3);font-size:.8125rem;text-decoration:none;padding:.5rem;transition:color .15s}
    .cancel:hover{color:rgba(255,255,255,.6)}
    .error{background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.25);border-radius:.625rem;padding:.75rem 1rem;font-size:.8125rem;color:#fca5a5;margin-bottom:1rem;line-height:1.5}
  </style>
</head>
<body>
<div class="card">
  <div class="logo"><div class="dot"></div><span class="logo-text">SaveYourSoul · KI-Verbindung</span></div>
  <h1>Zugriff gewähren</h1>
  <p class="sub">Der KI-Assistent <strong style="color:#fff">${escHtml(client_id)}</strong> möchte auf deine Soul zugreifen.</p>
  <div class="scopes">${scopeList || '<div class="scope">Soul-Inhalt lesen</div>'}</div>
  ${errorHtml}
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id"     value="${escHtml(client_id)}">
    <input type="hidden" name="redirect_uri"  value="${escHtml(redirect_uri || '')}">
    <input type="hidden" name="state"         value="${escHtml(state || '')}">
    <input type="hidden" name="response_type" value="${escHtml(response_type || 'code')}">
    <input type="hidden" name="scope"                 value="${escHtml(scope || 'soul')}">
    <input type="hidden" name="code_challenge"        value="${escHtml(code_challenge || '')}">
    <input type="hidden" name="code_challenge_method" value="${escHtml(code_challenge_method || '')}">
    <label for="soul_cert">Soul-Cert</label>
    <input type="text" id="soul_cert" name="soul_cert" placeholder="uuid.32hexchars" autocomplete="off" spellcheck="false">
    <button class="btn-connect" type="submit">Verbinden ✓</button>
  </form>
  <a class="cancel" href="${escHtml(cancel_url)}" onclick="event.preventDefault();if(window.opener){window.opener.postMessage('oauth_cancelled','*');window.close();}else if(history.length>1){history.back();}else{location.href=this.href;}">Abbrechen</a>
</div>
</body>
</html>`;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
