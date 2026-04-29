/**
 * SaveYourSoul API Client
 * Kommuniziert ausschliesslich via HTTP – kein gemeinsamer Code mit SaveYourSoul.
 */

const BASE = () => {
  const url = process.env.SYS_API_URL;
  if (!url) throw new Error('SYS_API_URL is not set. Add it to your .env file.');
  return url;
};

export class ApiError extends Error {
  constructor(status, body) {
    super(`SYS API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { token, method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, text);
  }
  return res;
}

export async function getJson(path, token) {
  return (await request(path, { token })).json();
}

export async function getText(path, token) {
  return (await request(path, { token })).text();
}

export async function getRawBytes(path, token) {
  return (await request(path, { token })).arrayBuffer();
}

export async function postJson(path, token, body) {
  return (await request(path, { method: 'POST', token, body })).json();
}

export async function putJson(path, token, body) {
  return (await request(path, { method: 'PUT', token, body })).json();
}

export async function deleteJson(path, token) {
  return (await request(path, { method: 'DELETE', token })).json();
}

/** Prüft ob ein Soul-Cert gültig ist */
export async function validateCert(soulCert) {
  try {
    const res = await fetch(`${BASE()}/api/validate`, {
      headers: { Authorization: `Bearer ${soulCert}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Erstellt einen neuen Service-Token für den OAuth-Flow */
export async function createServiceToken(soulCert, name, permissions, expires = '365d') {
  return postJson('/api/vault/services', soulCert, { name, permissions, expires });
}

/** Gibt die URL einer Vault-Datei mit eingebettetem Token zurück */
export function fileUrl(type, filename, token) {
  return `${BASE()}/api/vault/${type}/${encodeURIComponent(filename)}?token=${token}`;
}
