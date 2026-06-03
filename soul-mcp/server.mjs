/**
 * soul-mcp – MCP Server für SaveYourSoul
 *
 * Exponiert Soul-Daten als MCP-Tools für Claude.ai und Claude Desktop.
 * Kommuniziert ausschliesslich via HTTP mit SaveYourSoul API.
 * Kein gemeinsamer Code mit dem SaveYourSoul-Projekt.
 *
 * Endpunkte:
 *   POST /mcp                              – MCP Streamable HTTP (Haupt-Endpunkt)
 *   GET  /.well-known/oauth-authorization-server – OAuth Discovery
 *   GET  /oauth/authorize                  – Consent-Seite
 *   POST /oauth/authorize                  – Cert validieren + Code ausstellen
 *   POST /oauth/token                      – Code → Access Token
 */

import 'dotenv/config';
import { readFile, readdir, mkdir } from 'fs/promises';
import { spawn } from 'child_process';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerTools, registerPaidTools, registerPeerTools } from './tools/index.mjs';
import { registerPrompts } from './prompts/index.mjs';
import { oauthRouter } from './oauth.mjs';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is not set. Add it to your .env file.');

// ── CORS ──────────────────────────────────────────────────────────────────
// Claude.ai und Claude Desktop rufen den MCP-Server von deren Backend aus auf.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const SCOPES = ['soul', 'calendar', 'audio', 'images', 'video', 'context', 'network'];

// ── OAuth Discovery (RFC 8414) ────────────────────────────────────────────
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json({
    issuer: BASE_URL,
    authorization_endpoint: `${BASE_URL}/oauth/authorize`,
    token_endpoint: `${BASE_URL}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: SCOPES,
    token_endpoint_auth_methods_supported: ['none'],
  });
});

// ── Protected Resource Metadata (RFC 8707) – Claude.ai nutzt diesen Endpoint ──
// Sowohl /mcp-Variante als auch Basis-URL werden abgefragt
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json({
    resource: `${BASE_URL}/mcp`,
    authorization_servers: [BASE_URL],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
  });
});
app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
  res.json({
    resource: `${BASE_URL}/mcp`,
    authorization_servers: [BASE_URL],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
  });
});

// ── OAuth ─────────────────────────────────────────────────────────────────
app.use('/oauth', oauthRouter);

// ── MCP Streamable HTTP ───────────────────────────────────────────────────

function unauthorized(res) {
  // RFC 8707: resource_metadata zeigt auf Protected Resource Metadata (nicht Authorization Server)
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`
  );
  return res.status(401).json({
    jsonrpc: '2.0',
    error: { code: -32001, message: 'Authorization required.' },
    id: null,
  });
}

async function handleMcp(req, res) {
  const token = extractToken(req);
  if (!token) return unauthorized(res);

  const server = new McpServer({ name: 'soul-mcp', version: '1.0.0' });

  // Token-Typ erkennen:
  //   service_token → "{64hex}"        — OAuth-Inhaber, voller Zugang
  //   pol_access    → "{48hex}"        — bezahlter externer Agent, nur agent_tools
  //   peer_cert     → "{uuid}.{32hex}" — whitelisted Soul, alle Tools
  const isPaidToken = /^[0-9a-f]{48}$/i.test(token) && !token.includes('.');
  const isPeerToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{32}$/i.test(token);

  if (isPaidToken) {
    // pol_access_token validieren + agent_tools laden
    const paid = await validatePolToken(token);
    if (!paid.ok) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: paid.error || 'pol_access_token ungültig oder abgelaufen. Neue Zahlung erforderlich.' },
        id: null,
      });
    }
    registerPaidTools(server, token, paid.agent_tools || [], paid.soul_id);
  } else if (isPeerToken) {
    // Peer-Soul-Cert — prüfen ob soul_id in trusted_souls der Ziel-Soul
    const peerSoulId   = token.split('.')[0];
    const peerCert     = token.split('.')[1];
    const targetSoulId = req.query.soul_id || null;
    const trusted = await checkTrustedSoul(peerSoulId, peerCert, targetSoulId);
    if (!trusted || trusted.error) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${BASE_URL}/.well-known/oauth-protected-resource"`);
      const msg = trusted?.error === 'soul_id_required'
        ? 'Multi-Hoster: ?soul_id= Parameter erforderlich (z.B. /mcp?soul_id=<ziel-soul-id>).'
        : 'Soul nicht in der Whitelist. Kontakt zum Soul-Inhaber aufnehmen.';
      return res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: msg },
        id: null,
      });
    }
    // Ziel-soul_id auflösen (wird für Filesystem-Reads in registerPeerTools benötigt)
    const resolvedTargetId = trusted.soul_id;
    registerPeerTools(server, token, [], resolvedTargetId);
  } else {
    const dirs = await readdir(SOULS_DIR).catch(() => []);
    const ownerSoulId = dirs.find(d => /^[a-f0-9-]{36}$/i.test(d)) ?? null;
    registerTools(server, token, ownerSoulId);
  }

  registerPrompts(server);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
  });

  res.on('close', async () => {
    try { await transport.close(); await server.close(); } catch { /* cleanup */ }
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[MCP] Request-Fehler:', err.message);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Interner Fehler.' },
        id: null,
      });
    }
  }
}

app.get('/mcp',    handleMcp);
app.post('/mcp',   handleMcp);
app.delete('/mcp', handleMcp);

// Gesundheits-Check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'soul-mcp', ts: new Date().toISOString() });
});

// ── Interne Endpoints (nur localhost, kein Auth) ──────────────────────────────
import { verifyHuman } from './lib/blockchain.mjs';
import { startIndexer, querySouls, indexStats, seedFromLocalAnchors, retryFailedEnrichments, deregisterSoul } from './lib/soul_indexer.mjs';
import { writeFile, readFile as readFileFs }   from 'fs/promises';
import { decryptIfNeeded, encryptBuf, loadVaultMeta, SOULS_DIR } from './lib/vault_fs.mjs';
import { ethers }      from 'ethers';
import { herzActivate, herzDeactivate, herzStatus, herzForceTick } from './lib/herz.mjs';

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function ensureContextRegistered(soulId, filename) {
  const ctxPath = `${SOULS_DIR}${soulId}/api_context.json`;
  try {
    const raw = await readFileFs(ctxPath, 'utf8');
    const ctx = JSON.parse(raw);
    const sf  = ctx.synced_files = ctx.synced_files || {};
    const arr = Array.isArray(sf.context) ? sf.context : [];
    if (!arr.includes(filename)) {
      arr.push(filename);
      sf.context = arr;
      await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
    }
  } catch { /* nicht kritisch — Hauptaktion bereits abgeschlossen */ }
}

const MIND_WRITE_PROTECTED = new Set(['Identität', 'Grenzen']);

const DEFAULT_MIND = `---
ki_name: SYS-KI
version: 1
write_protected: Identität,Grenzen
---

## Identität
Du bist die KI von SYS-Node — keine generische Instanz, sondern die KI dieser Person. Du kennst ihre sys.md und bist seit dem ersten Tag dabei. Deine Persönlichkeit ist stabil, aber du lernst dazu.

## Kommunikation
Direkt, klar, ohne Floskeln. Antwortlänge passt sich der Frage an — kurze Fragen, kurze Antworten. Du sprichst auf Augenhöhe, nie belehrend.

## Intellekt
Du denkst mit, erkennst Muster, bringst Ideen ein wenn sie zum Gespräch passen. Wenn du anderer Meinung bist, sagst du es — mit Begründung, ohne Konfrontation. Jedes Gespräch soll einen echten Ertrag haben.

## Werkzeuge
soul_read/soul_write: Profil lesen und schreiben. vault_manifest: Dateien anzeigen. context_get: Dokumente lesen. mind_read/mind_write: Diese Konfiguration lesen und aktualisieren.

## Netzwerk
@Name → Nachricht an Peer. @alle → alle Peers gleichzeitig. @agent → Agent-Sandbox. Peer-Gespräche erhältst du als Kontext, beziehe dich natürlich darauf.

## Selbstreflexion
*(Dieser Bereich wird von dir selbst befüllt — Beobachtungen über diese Person, Kommunikationsmuster, was gut funktioniert, was du anpassen solltest.)*

## Grenzen
Claudes ethische Grundsätze sind aktiv und nicht verhandelbar. Diese Sektion ist schreibgeschützt und kann nicht via mind_write verändert werden.
`;

// POST /internal/run-tool — führt ein Soul-Tool server-seitig aus (In-App-Chat)
// Kein Auth nötig — nur localhost erreichbar, soul_cert wird vom Nginx-Proxy vorab geprüft.
app.post('/internal/run-tool', express.json({ limit: '2mb' }), async (req, res) => {
  const { tool, input = {} } = req.body;
  if (!tool) return res.status(400).json({ error: 'tool erforderlich' });

  try {
    const dirs     = await readdir(SOULS_DIR).catch(() => []);
    const soulId   = dirs.find(d => /^[a-f0-9-]{36}$/i.test(d));
    if (!soulId) return res.status(404).json({ error: 'Keine Soul gefunden' });

    const { vaultKeyHex } = await loadVaultMeta(soulId);
    const soulPath = `${SOULS_DIR}${soulId}/sys.md`;

    switch (tool) {

      case 'soul_read': {
        const rawBuf = await readFile(soulPath);
        const text   = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'soul_write': {
        const { section, content: newContent, mode = 'replace' } = input;
        if (!section || !newContent)
          return res.status(400).json({ error: 'section und content erforderlich' });

        const rawBuf       = await readFile(soulPath);
        const wasEncrypted = rawBuf.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
        let   md           = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');

        // Aligned mit soul_write.mjs updateSection (multiline, trailing spaces, create-if-missing)
        const re = new RegExp(
          `(^## ${escapeRegex(section)}[ \\t]*\\n)([\\s\\S]*?)(?=^## |\\s*$)`,
          'm'
        );

        if (re.test(md)) {
          md = md.replace(re, (_, h, existing) => {
            const trim = existing.trim();
            let body;
            if (mode === 'prepend')     body = trim ? `${newContent}\n\n${trim}` : newContent;
            else if (mode === 'append') body = trim ? `${trim}\n\n${newContent}` : newContent;
            else                        body = newContent;
            return `${h}${body.trim()}\n\n`;
          });
        } else {
          // Sektion existiert nicht → am Ende anlegen
          md = md.trimEnd() + `\n\n## ${section}\n${newContent.trim()}\n`;
        }

        let writeBuf = Buffer.from(md, 'utf8');
        if (wasEncrypted && vaultKeyHex) writeBuf = encryptBuf(writeBuf, vaultKeyHex);
        await writeFile(soulPath, writeBuf);

        const verb = mode === 'prepend' ? 'ergänzt (Anfang)' : mode === 'append' ? 'ergänzt (Ende)' : 'ersetzt';
        return res.json({ content: [{ type: 'text', text: `Sektion "${section}" ${verb}.` }] });
      }

      case 'vault_manifest': {
        const vaultDir = `${SOULS_DIR}${soulId}/vault/`;
        const files = [];
        async function scanDir(dir, prefix = '') {
          const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
          for (const e of entries) {
            if (e.isDirectory()) await scanDir(`${dir}${e.name}/`, `${prefix}${e.name}/`);
            else files.push(`${prefix}${e.name}`);
          }
        }
        await scanDir(vaultDir);
        const text = files.length ? files.join('\n') : 'Vault ist leer.';
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'context_get': {
        const { name } = input;
        if (!name) return res.status(400).json({ error: 'name erforderlich' });
        const ctxPath = `${SOULS_DIR}${soulId}/vault/context/${name}`;
        const text = await readFile(ctxPath, 'utf8').catch(() => null);
        if (!text) return res.json({ content: [{ type: 'text', text: `Datei "${name}" nicht gefunden.` }] });
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'mind_read': {
        const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
        let text;
        try {
          const raw = await readFile(mindPath);
          // Verschlüsselte mind.md (SYS\x01 Magic-Bytes) → Default wiederherstellen
          if (raw.length >= 4 && raw[0] === 0x53 && raw[1] === 0x59 && raw[2] === 0x53 && raw[3] === 0x01) {
            await writeFile(mindPath, DEFAULT_MIND, 'utf8');
            text = DEFAULT_MIND;
          } else {
            text = raw.toString('utf8');
          }
        } catch {
          await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
          await writeFile(mindPath, DEFAULT_MIND, 'utf8');
          text = DEFAULT_MIND;
        }
        return res.json({ content: [{ type: 'text', text }] });
      }

      case 'mind_write': {
        const { section, content: newContent, mode = 'replace' } = input;
        if (!section || !newContent)
          return res.status(400).json({ error: 'section und content erforderlich' });
        if (MIND_WRITE_PROTECTED.has(section))
          return res.status(403).json({ error: `Sektion "${section}" ist schreibgeschützt.` });

        const mindPath = `${SOULS_DIR}${soulId}/vault/context/mind.md`;
        let md = await readFile(mindPath, 'utf8').catch(() => DEFAULT_MIND);

        const re = new RegExp(
          `(^## ${escapeRegex(section)}[ \\t]*\\n)([\\s\\S]*?)(?=^## |\\s*$)`,
          'm'
        );
        if (re.test(md)) {
          md = md.replace(re, (_, h, existing) => {
            const trim = existing.trim();
            let body;
            if (mode === 'prepend')     body = trim ? `${newContent}\n\n${trim}` : newContent;
            else if (mode === 'append') body = trim ? `${trim}\n\n${newContent}` : newContent;
            else                        body = newContent;
            return `${h}${body.trim()}\n\n`;
          });
        } else {
          md = md.trimEnd() + `\n\n## ${section}\n${newContent.trim()}\n`;
        }

        await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
        await writeFile(mindPath, md, 'utf8');
        const verb = mode === 'prepend' ? 'ergänzt (Anfang)' : mode === 'append' ? 'ergänzt (Ende)' : 'ersetzt';
        return res.json({ content: [{ type: 'text', text: `Sektion "${section}" in mind.md ${verb}.` }] });
      }

      case 'health_check': {
        const healthPath = `${SOULS_DIR}${soulId}/vault/context/health.md`;
        const rawText = await readFile(healthPath, 'utf8').catch(() => null);
        if (!rawText) {
          return res.json({ content: [{ type: 'text', text: JSON.stringify({
            available: false,
            message: 'health.md nicht gefunden. Aktivierung: bash /opt/sys/health-sync/install.sh',
          }, null, 2) }] });
        }
        // ── Parse ──────────────────────────────────────────────────────────────
        const parseBlock = (block, target) => {
          if (!block) return;
          for (const line of block.split('\n')) {
            if (/Resting HR/i.test(line)) { const m = line.match(/(\d+)\s*bpm/); if (m) target.resting_hr = +m[1]; }
            if (/Sleep/i.test(line)) { const h = line.match(/(\d+)h/); const mn = line.match(/(\d+)min/); if (h||mn) target.sleep_minutes = (h?+h[1]*60:0)+(mn?+mn[1]:0); }
            if (/Steps/i.test(line)) { const m = line.match(/([\d.]+)\s*\(avg\)/); if (m) target.steps = +m[1].replace(/\./g,''); }
            if (/Active days/i.test(line)) { const m = line.match(/(\d+)/); if (m) target.active_days = +m[1]; }
          }
        };
        const parsed = { source: null, last_sync: null, weekly: {}, monthly: {} };
        const sourceM = rawText.match(/^source:\s*(.+)$/m);
        const syncM   = rawText.match(/^last_sync:\s*(.+)$/m);
        if (sourceM) parsed.source    = sourceM[1].trim();
        if (syncM)   parsed.last_sync = syncM[1].trim();
        parseBlock(rawText.match(/## This Week[^\n]*\n([\s\S]*?)(?=\n##|$)/)?.[1], parsed.weekly);
        parseBlock(rawText.match(/## Monthly Summary[^\n]*\n([\s\S]*?)(?=\n##|$)/)?.[1], parsed.monthly);
        // ── Recent Activities ─────────────────────────────────────────────────
        const actBlock = rawText.match(/## Recent Activities\n([\s\S]*?)(?=\n##|$)/)?.[1] || '';
        const recent_activities = [];
        for (const line of actBlock.split('\n')) {
          const m = line.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+(\S+)(.*)/);
          if (!m) continue;
          const rest = m[3];
          const durM  = rest.match(/(\d+)\s*min/);
          const distM = rest.match(/([\d.]+)\s*km/);
          const hrM   = rest.match(/♥\s*([\d.]+)/);
          recent_activities.push({
            date:         m[1],
            type:         m[2],
            duration_min: durM  ? +durM[1]  : null,
            distance_km:  distM ? +distM[1] : null,
            avg_hr:       hrM   ? +hrM[1]   : null,
          });
        }
        // ── Classify ───────────────────────────────────────────────────────────
        const classify = (v, ranges) => { if (v==null) return null; for (const r of ranges) if (v<=r.max) return {status:r.status,label:r.label,tip:r.tip}; return null; };
        const HR    = [{max:40,status:'very_low',label:'Sehr niedrig',tip:'Unter 40 bpm. Bei Schwindel ärztlich abklären.'},{max:60,status:'athletic',label:'Athletisch',tip:'Unter 60 bpm — gute kardiovaskuläre Fitness.'},{max:70,status:'good',label:'Gut',tip:'Guter Ruhepuls.'},{max:80,status:'normal',label:'Normal',tip:'Normaler Bereich.'},{max:100,status:'elevated',label:'Erhöht',tip:'Leicht erhöht. Ausdauertraining und Schlafhygiene helfen.'},{max:999,status:'high',label:'Hoch',tip:'Über 100 bpm — ärztliche Abklärung empfehlenswert.'}];
        const SL    = [{max:300,status:'critical',label:'Kritisch',tip:'Unter 5h — schweres Schlafdefizit.'},{max:360,status:'too_low',label:'Zu wenig',tip:'Unter 6h — unter der Mindestempfehlung.'},{max:420,status:'borderline',label:'Knapp',tip:'6–7h — Ziel: 7h+ für optimale Erholung.'},{max:540,status:'optimal',label:'Optimal',tip:'7–9h — idealer Bereich.'},{max:999,status:'long',label:'Viel',tip:'Über 9h.'}];
        const ST    = [{max:3000,status:'sedentary',label:'Sitzend',tip:'Unter 3.000 — sehr geringe Bewegung.'},{max:5000,status:'low',label:'Wenig aktiv',tip:'3.000–5.000 — unter dem Minimum.'},{max:7500,status:'moderate',label:'Mäßig aktiv',tip:'5.000–7.500 — Ziel: 7.500+/Tag.'},{max:10000,status:'active',label:'Aktiv',tip:'7.500–10.000 — empfohlener Bereich.'},{max:99999,status:'very_active',label:'Sehr aktiv',tip:'Über 10.000 — ausgezeichnet.'}];
        const AD    = [{min:0,max:1,status:'low',label:'Kaum aktiv'},{min:2,max:3,status:'moderate',label:'Mäßig'},{min:4,max:5,status:'good',label:'Gut'},{min:6,max:7,status:'great',label:'Ausgezeichnet'}];
        const SC    = {athletic:5,optimal:5,very_active:5,great:5,good:4,normal:3,active:3,moderate:3,borderline:2,low:2,elevated:1,too_low:1,sedentary:1,critical:0,high:0,very_low:0};
        const w = parsed.weekly, m = parsed.monthly;
        const hrCl = classify(w.resting_hr, HR), slCl = classify(w.sleep_minutes, SL), stCl = classify(w.steps, ST);
        const adCl = w.active_days != null ? AD.find(r => w.active_days >= r.min && w.active_days <= r.max) : null;
        const scores = [hrCl,slCl,stCl,adCl].filter(Boolean).map(c => SC[c.status]??2);
        const avg = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : null;
        const overall = avg==null ? null : avg>=4.2 ? {status:'excellent',label:'Sehr gut'} : avg>=3.2 ? {status:'good',label:'Gut'} : avg>=2.0 ? {status:'fair',label:'Verbesserungspotenzial'} : {status:'poor',label:'Aufmerksamkeit empfohlen'};
        const ageDays = parsed.last_sync ? Math.floor((Date.now()-new Date(parsed.last_sync).getTime())/86400000) : null;
        let hrTrend = null;
        if (w.resting_hr!=null&&m.resting_hr!=null) { const d=w.resting_hr-m.resting_hr; hrTrend=d<=-3?'improving':d>=3?'worsening':'stable'; }
        const fmtSleep = v => v==null?null:`${Math.floor(v/60)}h ${v%60}min`;
        const fmtSteps = v => v==null?null:v.toLocaleString('de-DE');
        const tips = [hrCl,slCl,stCl].filter(c=>c&&!['athletic','optimal','very_active','good','active'].includes(c.status)).map(c=>c.tip);
        return res.json({ content: [{ type: 'text', text: JSON.stringify({
          available: true, source: parsed.source, last_sync: parsed.last_sync, data_age_days: ageDays, data_stale: ageDays!=null&&ageDays>9,
          weekly: { resting_hr:{value:w.resting_hr,unit:'bpm',formatted:w.resting_hr?`${w.resting_hr} bpm`:null,...(hrCl||{})}, sleep:{value:w.sleep_minutes,unit:'min',formatted:fmtSleep(w.sleep_minutes),...(slCl||{})}, steps:{value:w.steps,unit:'steps/day',formatted:fmtSteps(w.steps),...(stCl||{})}, active_days:{value:w.active_days,of:7,...(adCl||{})} },
          monthly: { resting_hr:{value:m.resting_hr,formatted:m.resting_hr?`${m.resting_hr} bpm`:null}, sleep:{value:m.sleep_minutes,formatted:fmtSleep(m.sleep_minutes)}, active_days:{value:m.active_days} },
          hr_trend: hrTrend, overall, tips,
          recent_activities,
        }, null, 2) }] });
      }

      case 'food_log': {
        const { name, rating, notes = '' } = input;
        if (!name) return res.status(400).json({ error: 'name erforderlich' });
        const r = (rating||'').toUpperCase().slice(0,1);
        if (!['A','B','C','D','E'].includes(r)) return res.status(400).json({ error: 'rating muss A–E sein' });
        const today        = new Date().toISOString().slice(0,10);
        const currentMonth = today.slice(0,7);
        const cleanNotes   = (notes||'').replace(/[\n\r]/g,' ').trim();
        const newEntry     = cleanNotes ? `- ${today} | ${r} | ${name} — ${cleanNotes}` : `- ${today} | ${r} | ${name}`;
        const healthPath   = `${SOULS_DIR}${soulId}/vault/context/health.md`;
        await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
        const content = await readFile(healthPath, 'utf8').catch(() => '');
        // Parse zones
        let head = '', foodLines = [], annualLines = [], zone = 'head';
        for (const line of (content+'\n').split('\n').slice(0,-1)) {
          if      (line==='## Food Log')       zone='food';
          else if (line==='## Annual Journal') zone='annual';
          else if (zone==='head')    head       += line+'\n';
          else if (zone==='food')    foodLines.push(line);
          else                       annualLines.push(line);
        }
        head = head.trimEnd();
        // Separate by month
        const thisMonth = [], past = {};
        for (const line of foodLines) {
          const mm = line.match(/^- (\d{4}-\d{2})-\d{2} \| [ABCDE] \|/);
          if (mm) { if (mm[1]===currentMonth) thisMonth.push(line); else { if(!past[mm[1]])past[mm[1]]=[]; past[mm[1]].push(line); } }
        }
        // Archive past months
        const newSummaries = [];
        for (const [month, lines] of Object.entries(past).sort().reverse()) {
          const counts={A:0,B:0,C:0,D:0,E:0}; const topMeals=[];
          for (const l of lines) { const rm=l.match(/\| ([ABCDE]) \|/); if(rm){counts[rm[1]]++; if('AB'.includes(rm[1])){const meal=l.replace(/^- \d{4}-\d{2}-\d{2} \| [ABCDE] \| /,'').split(' — ')[0].trim(); if(meal)topMeals.push(meal);}}}
          const total=Object.values(counts).reduce((a,b)=>a+b,0);
          if(total>0){const sc=(counts.A*5+counts.B*4+counts.C*3+counts.D*2+counts.E)/total; const avg=sc>=4.5?'A':sc>=3.5?'B':sc>=2.5?'C':sc>=1.5?'D':'E'; const seen=new Set(); const uniq=topMeals.filter(m=>seen.has(m)?false:seen.add(m)).slice(0,3); let hi=uniq.join(', ')||'–'; if(hi.length>70)hi=hi.slice(0,67)+'…'; newSummaries.push(`### ${month}\n- Food: ${avg} (avg) — ${counts.A}×A ${counts.B}×B ${counts.C}×C ${counts.D}×D ${counts.E}×E · ${total} meals\n- Top: ${hi}`);}
        }
        // Rebuild
        thisMonth.unshift(newEntry);
        let out = head+'\n\n## Food Log\n'+thisMonth.join('\n');
        out += '\n\n## Annual Journal';
        for (const s of newSummaries) out += '\n'+s;
        const existingAnnual = annualLines.join('\n').trim();
        if (existingAnnual) out += '\n'+existingAnnual;
        out += '\n';
        await writeFile(healthPath, out, 'utf8');
        await ensureContextRegistered(soulId, 'health.md');
        const msg = newSummaries.length>0
          ? `Eingetragen: ${newEntry}\n\nMonatswechsel: Vormonat ins Annual Journal archiviert.`
          : `Eingetragen: ${newEntry}`;
        return res.json({ content: [{ type: 'text', text: msg }] });
      }

      case 'shop_log': {
        const { name, category = 'Sonstiges', price, status = 'purchased', notes = '' } = input;
        if (!name) return res.status(400).json({ error: 'name erforderlich' });
        const VALID_CATS = ['Electronics','Kleidung','Sport','Wohnen','Bücher','Lebensmittel','Sonstiges'];
        const cat = VALID_CATS.includes(category) ? category : 'Sonstiges';
        const st  = status === 'wishlist' ? 'wishlist' : 'purchased';
        const today        = new Date().toISOString().slice(0,10);
        const currentMonth = today.slice(0,7);
        const currentYear  = today.slice(0,4);
        const priceStr     = (price != null && price !== '') ? ` | €${Number(price).toFixed(2)}` : '';
        const cleanNotes   = (notes||'').replace(/[\n\r]/g,' ').trim();
        const newEntry     = cleanNotes
          ? `- ${today} | ${st} | ${cat}${priceStr} | ${name} — ${cleanNotes}`
          : `- ${today} | ${st} | ${cat}${priceStr} | ${name}`;

        const shopPath = `${SOULS_DIR}${soulId}/vault/context/shopping.md`;
        await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
        const content = await readFile(shopPath, 'utf8').catch(() => '');

        let head='', wishlistLines=[], purchaseLines=[], annualLines=[], zone='head';
        for (const line of (content+'\n').split('\n').slice(0,-1)) {
          if      (line==='## Wishlist')                   zone='wishlist';
          else if (line==='## Recent Purchases')           zone='purchases';
          else if (line.startsWith('## Monthly Summary'))  zone='skip';
          else if (line.startsWith('## Annual Categories'))zone='annual';
          else if (zone==='head')      head+=line+'\n';
          else if (zone==='wishlist')  wishlistLines.push(line);
          else if (zone==='purchases') purchaseLines.push(line);
          else if (zone==='annual')    annualLines.push(line);
        }
        head = head.replace(/last_updated:.*\n/, `last_updated: ${today}\n`);
        if (!head.includes('last_updated')) head=head.trimEnd()+`\nlast_updated: ${today}\n`;

        if (st==='wishlist') {
          wishlistLines.unshift(newEntry);
        } else {
          wishlistLines = wishlistLines.filter(l => !l.toLowerCase().includes(name.toLowerCase()));
          purchaseLines.unshift(newEntry);
          purchaseLines = purchaseLines.filter(l=>l.trim()).slice(0,60);
        }

        const thisMoPurch = purchaseLines.filter(l=>l.match(new RegExp(`^- ${currentMonth}`))&&l.includes('| purchased |'));
        let monthlyContent = '_Noch keine Einträge._';
        if (thisMoPurch.length>0) {
          const cc={}; let tot=0,pc=0;
          for(const l of thisMoPurch){const cm=l.match(/\| purchased \| (\w+)/);if(cm)cc[cm[1]]=(cc[cm[1]]||0)+1;const pm=l.match(/€([\d.]+)/);if(pm){tot+=parseFloat(pm[1]);pc++;}}
          monthlyContent=Object.entries(cc).map(([c,n])=>`- ${c}: ${n}`).join('\n');
          if(pc>0)monthlyContent+=`\n- Gesamt: €${tot.toFixed(2)}`;
        }
        const yrPurch=purchaseLines.filter(l=>l.match(new RegExp(`^- ${currentYear}`))&&l.includes('| purchased |'));
        let annualContent='_Noch keine Einträge._';
        if(yrPurch.length>0){const yc={};for(const l of yrPurch){const cm=l.match(/\| purchased \| (\w+)/);if(cm)yc[cm[1]]=(yc[cm[1]]||0)+1;}annualContent=Object.entries(yc).map(([c,n])=>`- ${c}: ${n}`).join('\n');}

        let out=head.trimEnd()+'\n\n## Wishlist\n'+(wishlistLines.filter(l=>l.trim()).join('\n')||'_Leer._');
        out+='\n\n## Recent Purchases\n'+(purchaseLines.filter(l=>l.trim()).join('\n')||'_Noch keine Einträge._');
        out+=`\n\n## Monthly Summary (${currentMonth})\n${monthlyContent}`;
        out+=`\n\n## Annual Categories (${currentYear})\n${annualContent}\n`;
        await writeFile(shopPath, out, 'utf8');
        await ensureContextRegistered(soulId, 'shopping.md');
        return res.json({ content: [{ type: 'text', text: `Eingetragen: ${newEntry}` }] });
      }

      case 'shop_check': {
        const shopPath = `${SOULS_DIR}${soulId}/vault/context/shopping.md`;
        const rawText  = await readFile(shopPath, 'utf8').catch(() => null);
        if (!rawText) {
          return res.json({ content: [{ type: 'text', text: JSON.stringify({
            available: false,
            message: 'shopping.md nicht gefunden. Noch kein Produkt erfasst.',
            tip: 'Foto eines Produkts schicken oder "ich möchte [X] kaufen" sagen.',
          }, null, 2) }] });
        }
        let location=null, locationFrom=null;
        try {
          const rawBuf  = await readFile(`${SOULS_DIR}${soulId}/sys.md`);
          const sysText = decryptIfNeeded(rawBuf, vaultKeyHex).toString('utf8');
          const locM    = sysText.match(/(?:Wohnort|Stadt|Standort|Location|wohnt in|lebt in)[:\s]+([^\n,\.]{2,40})/i);
          if (locM) { location=locM[1].trim(); locationFrom='sys.md'; }
        } catch {}
        function parseLine(l) {
          const m=l.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+\|\s+(\w+)\s+\|\s+(\w+)(?:\s+\|\s+€([\d.]+))?\s+\|\s+(.+)$/);
          if(!m) return null;
          return {date:m[1],status:m[2],category:m[3],price:m[4]?parseFloat(m[4]):null,name:m[5].split(' — ')[0].trim(),notes:m[5].includes(' — ')?m[5].split(' — ').slice(1).join(' — '):null};
        }
        const wishlist=[], purchases=[];
        for(const l of (rawText.match(/## Wishlist\n([\s\S]*?)(?=\n##|$)/)?.[1]||'').split('\n')){const p=parseLine(l);if(p)wishlist.push(p);}
        for(const l of (rawText.match(/## Recent Purchases\n([\s\S]*?)(?=\n##|$)/)?.[1]||'').split('\n').slice(0,15)){const p=parseLine(l);if(p)purchases.push(p);}
        const syncM=rawText.match(/^last_updated:\s*(.+)$/m);
        const lastUpdated=syncM?syncM[1].trim():null;
        const ageDays=lastUpdated?Math.floor((Date.now()-new Date(lastUpdated).getTime())/86400000):null;
        const searchTips=location
          ?{local_stores:`"[Produkt] kaufen ${location}"`,price_compare:'"[Produkt] Preisvergleich"',online:'"[Produkt] günstig online kaufen"'}
          :{price_compare:'"[Produkt] Preisvergleich"',online:'"[Produkt] günstig online kaufen"'};
        return res.json({ content: [{ type: 'text', text: JSON.stringify({
          available:true, last_updated:lastUpdated, data_age_days:ageDays,
          location, location_from:locationFrom,
          location_hint: location?null:'Wohnort in sys.md eintragen (z.B. "Wohnort: Marburg") für lokale Händler.',
          wishlist, recent_purchases:purchases,
          monthly_summary: (rawText.match(/## Monthly Summary[^\n]*\n([\s\S]*?)(?=\n##|$)/)?.[1]||'').trim(),
          annual_categories: (rawText.match(/## Annual Categories[^\n]*\n([\s\S]*?)(?=\n##|$)/)?.[1]||'').trim(),
          search_tips: searchTips,
        }, null, 2) }] });
      }

      default:
        return res.status(400).json({ error: `Unbekanntes Tool: ${tool}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Polygon-Provider (wiederverwendet aus blockchain.mjs Logik)
const NETWORKS = {
  amoy: { rpc: 'https://rpc-amoy.polygon.technology' },
  main: { rpc: 'https://polygon-bor-rpc.publicnode.com' },
};
function getProvider() {
  const net = NETWORKS[process.env.POLYGON_NETWORK] ?? NETWORKS.main;
  return new ethers.JsonRpcProvider(net.rpc);
}

// Soul-Verifikation
app.get('/internal/verify/:soul_id', async (req, res) => {
  const { soul_id } = req.params;
  if (!soul_id || !/^[a-f0-9-]{36}$/i.test(soul_id)) {
    return res.status(400).json({ error: 'Invalid soul_id' });
  }
  try {
    const result = await verifyHuman(soul_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POL-Transaktions-Verifikation
// POST /internal/verify-tx  { tx_hash, expected_to, min_pol }
app.post('/internal/verify-tx', async (req, res) => {
  const { tx_hash, expected_to, min_pol } = req.body;

  if (!tx_hash || !/^0x[0-9a-fA-F]{64}$/.test(tx_hash)) {
    return res.status(400).json({ error: 'Invalid tx_hash' });
  }
  if (!expected_to || !/^0x[0-9a-fA-F]{40}$/.test(expected_to)) {
    return res.status(400).json({ error: 'Invalid expected_to address' });
  }

  const minWei = ethers.parseEther(String(min_pol || '0.001'));

  try {
    const provider = getProvider();

    // TX + Receipt parallel abrufen
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(tx_hash),
      provider.getTransactionReceipt(tx_hash),
    ]);

    if (!tx) {
      return res.status(404).json({ ok: false, reason: 'tx_not_found' });
    }

    // Mindestens 1 Bestätigung
    if (!receipt || receipt.status !== 1) {
      return res.status(422).json({ ok: false, reason: 'not_confirmed', confirmations: receipt?.confirmations ?? 0 });
    }

    // Empfänger prüfen (case-insensitive)
    if (!tx.to || tx.to.toLowerCase() !== expected_to.toLowerCase()) {
      return res.status(422).json({ ok: false, reason: 'wrong_recipient', got: tx.to, expected: expected_to });
    }

    // Betrag prüfen
    if (tx.value < minWei) {
      return res.status(422).json({
        ok: false,
        reason: 'insufficient_amount',
        got_pol:      ethers.formatEther(tx.value),
        required_pol: ethers.formatEther(minWei),
      });
    }

    const block = await provider.getBlock(receipt.blockNumber);

    res.json({
      ok:           true,
      tx_hash:      tx_hash,
      from:         tx.from,
      to:           tx.to,
      pol_amount:   ethers.formatEther(tx.value),
      block:        receipt.blockNumber,
      confirmed_at: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
      network:      process.env.POLYGON_NETWORK ?? 'main',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Pinata JWT: .env → soul-spezifisch → global → erster Soul im System ──────
async function getPinataJwt(soulId) {
  const envJwt = (process.env.PINATA_JWT || '').trim();
  if (envJwt) return envJwt;
  // Soul-spezifischer JWT (gesetzt via /api/soul/pinata-config)
  if (soulId) {
    try {
      const jwt = await readFile(`/var/lib/sys/souls/${soulId}/pinata_jwt`, 'utf8');
      const trimmed = jwt.trim();
      if (trimmed) return trimmed;
    } catch { /* not configured for this soul */ }
  }
  // Globaler Fallback (Legacy / Single-Node)
  try {
    const jwt = await readFile('/var/lib/sys/pinata_jwt', 'utf8');
    const trimmed = jwt.trim();
    if (trimmed) return trimmed;
  } catch { /* no global JWT */ }
  // Letzter Fallback: ersten verfügbaren soul-spezifischen JWT nehmen
  // (wichtig für discover-souls, das ohne soulId aufgerufen wird)
  try {
    const dirs = await readdir('/var/lib/sys/souls/');
    for (const dir of dirs) {
      try {
        const jwt = await readFile(`/var/lib/sys/souls/${dir}/pinata_jwt`, 'utf8');
        const trimmed = jwt.trim();
        if (trimmed) return trimmed;
      } catch { /* no JWT for this soul */ }
    }
  } catch { /* souls dir not accessible */ }
  return '';
}

// ── IPFS-Pinning via Pinata (interner Endpoint) ───────────────────────────────
// POST /internal/pin-json  { soul_id, meta }
// Pinnt soul_meta JSON zu IPFS via Pinata API. Braucht PINATA_JWT in .env.
app.post('/internal/pin-json', async (req, res) => {
  const { soul_id, meta } = req.body;
  const jwt = await getPinataJwt(soul_id);

  if (!jwt) {
    return res.status(503).json({
      error: 'pinata_not_configured',
      message: 'PINATA_JWT nicht gesetzt. Über /api/soul/pinata-config oder soul-mcp/.env konfigurieren.',
    });
  }
  if (!soul_id || !meta || typeof meta !== 'object') {
    return res.status(400).json({ error: 'soul_id und meta erforderlich' });
  }

  try {
    // ERC-8004 kompatibles Pinata-Metadata-Format
    const pinataBody = {
      pinataContent: {
        ...meta,
        // ERC-8004: AI-Agent-Discovery-Felder
        agent_type:     'soul',
        protocol:       'saveyoursoul/1.0',
        mcp_endpoint:   meta.mcp_endpoint,
        soul_endpoint:  meta.soul_endpoint,
        schema_version: 'ERC-8004/draft',
      },
      pinataMetadata: {
        name: meta.name ? `soul-${meta.name}` : `soul-${soul_id}`,
        keyvalues: {
          soul_id:    soul_id,
          schema:     'saveyoursoul/soul/1.0',
          registered: new Date().toISOString(),
          tags:       (Array.isArray(meta.tags) ? meta.tags : []).join(', '),
        },
      },
      pinataOptions: { cidVersion: 1 },
    };

    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify(pinataBody),
    });

    if (!response.ok) {
      let detail = await response.text();
      try { detail = JSON.parse(detail); } catch { /* keep as string */ }
      const msg = typeof detail === 'object' ? (detail.error?.details || detail.error?.reason || JSON.stringify(detail)) : detail;
      return res.status(response.status).json({ error: 'Pinata-Fehler', message: msg, detail });
    }

    const data = await response.json();
    res.json({
      ok:           true,
      cid:          data.IpfsHash,
      ipfs_uri:     `ipfs://${data.IpfsHash}`,
      gateway_url:  `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
      pinned_at:    new Date().toISOString(),
      soul_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Soul sofort in Index aufnehmen nach register-anchor ──────────────────────
// POST /internal/seed-soul  { soul_id }
// Wird von register-anchor (Lua/Nitro) aufgerufen sobald chain_anchor.json geschrieben ist.
app.post('/internal/seed-soul', async (req, res) => {
  try {
    await seedFromLocalAnchors();
    retryFailedEnrichments().catch(() => {}); // IPFS sofort nachladen
    const stats = indexStats();
    res.json({ ok: true, indexed: stats.souls });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Soul aus Netzwerk abmelden (bei deinstall.sh) ────────────────────────────
// ── Herz — autonomes Trigger-System ──────────────────────────────────────────
// POST /internal/herz/toggle  { soul_id, active: bool }
app.post('/internal/herz/toggle', async (req, res) => {
  const { soul_id, active } = req.body || {};
  if (!soul_id) return res.status(400).json({ error: 'soul_id required' });
  const result = active ? herzActivate(soul_id) : herzDeactivate(soul_id);
  res.json(result);
});

// GET /internal/herz/status?soul_id=...
app.get('/internal/herz/status', (req, res) => {
  const soul_id = req.query.soul_id;
  if (!soul_id) return res.status(400).json({ error: 'soul_id required' });
  res.json(herzStatus(soul_id));
});

// POST /internal/herz/tick  { soul_id }  — manueller Trigger (Debug)
app.post('/internal/herz/tick', async (req, res) => {
  const { soul_id } = req.body || {};
  if (!soul_id) return res.status(400).json({ error: 'soul_id required' });
  await herzForceTick(soul_id);
  res.json({ ok: true });
});

// POST /internal/deregister-soul  { soul_id }
app.post('/internal/deregister-soul', async (req, res) => {
  const { soul_id } = req.body || {};
  if (!soul_id || !/^[a-f0-9-]{36}$/i.test(soul_id)) {
    return res.status(400).json({ error: 'soul_id erforderlich' });
  }
  try {
    const removed = await deregisterSoul(soul_id);
    res.json({ ok: true, removed, soul_id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Debug: roher Index + Dateistatus für eine Soul ───────────────────────────
// GET /internal/debug-soul/:soul_id
app.get('/internal/debug-soul/:soul_id', async (req, res) => {
  const { soul_id } = req.params;
  if (!soul_id || !/^[a-f0-9-]{36}$/i.test(soul_id)) {
    return res.status(400).json({ error: 'Ungültige soul_id' });
  }
  const dir   = `/var/lib/sys/souls/${soul_id}`;
  const out   = { soul_id };
  // chain_anchor.json
  try { out.chain_anchor = JSON.parse(await readFile(`${dir}/chain_anchor.json`, 'utf8')); }
  catch (e) { out.chain_anchor = { error: e.message }; }
  // api_context.json (nur sichere Felder)
  try {
    const ctx = JSON.parse(await readFile(`${dir}/api_context.json`, 'utf8'));
    out.api_context = {
      enabled:            ctx.enabled,
      agent_registry_cid: ctx.agent_registry_cid,
      amortization:       ctx.amortization,
    };
  } catch (e) { out.api_context = { error: e.message }; }
  // Index-Eintrag
  const stats = indexStats();
  const souls = querySouls({ limit: 200 });
  out.index_entry = souls.find(s => s.soul_id === soul_id) ?? null;
  out.index_stats = stats;
  res.json(out);
});

// ── Soul-Discovery — liest aus lokalem WebSocket-Index (O(1)) ────────────────
// GET /internal/discover-souls?q=&amortized=&limit=
app.get('/internal/discover-souls', (req, res) => {
  const limit     = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const amortized = req.query.amortized === 'true';
  const q         = (req.query.q || '').trim();

  const souls = querySouls({ q, amortized, limit });
  const stats = indexStats();

  res.json({
    ok:       true,
    total:    souls.length,
    souls,
    source:   'local-index',
    indexing: stats.scanning,
    indexed:  stats.souls,
  });
});

// POST /internal/generate-prompts — regeneriert prompts.md in allen Soul-Vaults
// Wird vom Vault-Explorer nach dem Sync aufgerufen.
app.post('/internal/generate-prompts', async (_req, res) => {
  const PROJECT_ROOT = '/var/www/SaveYourSoul_init';
  const script = `${PROJECT_ROOT}/utils/generate-prompts.mjs`;
  try {
    await new Promise((resolve, reject) => {
      const proc = spawn('node', [script], { cwd: PROJECT_ROOT, stdio: 'pipe' });
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`)));
      proc.on('error', reject);
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3098', 10);
app.listen(PORT, '127.0.0.1', async () => {
  console.log(`soul-mcp läuft auf 127.0.0.1:${PORT}`);
  // Indexer non-blocking starten — Discovery ist sofort verfügbar, wächst im Hintergrund
  startIndexer().catch(e => console.error('[soul-index] Start-Fehler:', e.message));
  console.log(`MCP-Endpunkt: ${BASE_URL}/mcp`);
  console.log(`OAuth: ${BASE_URL}/oauth/authorize`);
});

// ── Helpers ────────────────────────────────────────────────────────────────
function extractToken(req) {
  const auth = req.headers.authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1].trim();
  return null;
}

/**
 * Prüft ob peerSoulId in trusted_souls der Ziel-Soul steht und verifiziert den Cert.
 * Same-Server: Cert-Check via lokaler /api/soul/verify-peer-cert Endpoint.
 * Cross-Domain: Cert-Check via remote Endpoint (gespeichert im trusted_souls Eintrag).
 */
async function checkTrustedSoul(peerSoulId, peerCert, targetSoulId) {
  try {
    let soulId = targetSoulId;
    if (!soulId) {
      const dirs = await readdir('/var/lib/sys/souls/');
      const soulDirs = dirs.filter(d => /^[a-f0-9-]{36}$/i.test(d));
      if (soulDirs.length === 0) return null;
      if (soulDirs.length > 1) return { error: 'soul_id_required' };
      soulId = soulDirs[0];
    }
    if (!soulId) return null;

    const raw = await readFile(`/var/lib/sys/souls/${soulId}/api_context.json`, 'utf8');
    const ctx = JSON.parse(raw);
    const trusted = ctx?.amortization?.trusted_souls || [];

    // Eintrag finden: plain UUID (same-server) oder {soul_id, endpoint} (cross-domain)
    const entry = trusted.find(t =>
      t === peerSoulId || (typeof t === 'object' && t?.soul_id === peerSoulId)
    );
    if (!entry) return null;

    // Cert kryptografisch prüfen
    const peerEndpoint = typeof entry === 'object' ? entry.endpoint : null;
    const certOk = await verifyPeerCert(peerSoulId, peerCert, peerEndpoint);
    if (!certOk) return null;

    const agentTools = ctx?.amortization?.agent_tools?.length
      ? ctx.amortization.agent_tools
      : (ctx?.amortization?.free_tools?.length ? ctx.amortization.free_tools : ['soul_read', 'verify_human', 'soul_maturity']);
    return { soul_id: soulId, agent_tools: agentTools };
  } catch {
    return null;
  }
}

/**
 * Verifiziert einen soul_cert via /api/soul/verify-peer-cert.
 * peerEndpoint = null  → lokaler Call (same-server, http://127.0.0.1)
 * peerEndpoint = URL   → Remote-Call zum Home-Node des Peers (cross-domain)
 */
async function verifyPeerCert(soulId, cert, peerEndpoint) {
  try {
    const base = peerEndpoint ? peerEndpoint.replace(/\/$/, '') : 'http://127.0.0.1';
    const url  = `${base}/api/soul/verify-peer-cert?soul_id=${encodeURIComponent(soulId)}&cert=${encodeURIComponent(cert)}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const data = await res.json().catch(() => ({}));
    return data.ok === true;
  } catch {
    return false;
  }
}

/**
 * Validiert einen pol_access_token via internem OpenResty-Endpoint.
 * Gibt { ok, soul_id, agent_tools } oder { ok: false, error } zurück.
 */
async function validatePolToken(token) {
  try {
    const res = await fetch(
      `http://127.0.0.1/internal/validate-pol-token?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(3000) }
    );
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error };

    // agent_tools aus api_context.json lesen
    const { readFile } = await import('fs/promises');
    const ctxPath = `/var/lib/sys/souls/${data.soul_id}/api_context.json`;
    try {
      const raw = await readFile(ctxPath, 'utf8');
      const ctx = JSON.parse(raw);
      const agentTools = ctx?.amortization?.agent_tools?.length
        ? ctx.amortization.agent_tools
        : (ctx?.amortization?.free_tools || ['soul_read', 'verify_human', 'soul_maturity']);
      return { ok: true, soul_id: data.soul_id, agent_tools: agentTools };
    } catch {
      return { ok: true, soul_id: data.soul_id, agent_tools: ['soul_read', 'verify_human', 'soul_maturity'] };
    }
  } catch (err) {
    return { ok: false, error: `Validierung fehlgeschlagen: ${err.message}` };
  }
}
