/**
 * herz.mjs — Autonomes Trigger-System für SYS
 *
 * Event-driven, nicht polling. Feuert wenn etwas passiert:
 *   on_anchor   — neue Growth-Chain-Einträge → Reflexion schreiben
 *   on_silence  — kein Anker seit N Tagen → exponentieller Druck
 *   on_agent    — neuer AGENT-Block Eintrag → bewerten, ggf. antworten
 *   circadian   — Morgen (6-9h) / Abend (21-23h) soft-check
 *
 * Läuft als Background-Worker im soul-mcp Server.
 * Wird durch KI-Auto Button in der UI aktiviert/deaktiviert.
 */

import { readFile, writeFile } from 'fs/promises';
import { SOULS_DIR, decryptIfNeeded, encryptBuf, loadVaultMeta } from './vault_fs.mjs';
import { extractLongmem, updateLongmem, extractAllSections } from './soul_parser.mjs';

const TICK_INTERVAL_MS      = 10 * 60 * 1000;  // alle 10 Min prüfen
const HEARTBEAT_TIMEOUT     = 30 * 60 * 1000;  // 30 Min ohne Ping → auto-deaktivieren
const SILENCE_SOFT_DAYS     = 3;
const SILENCE_MID_DAYS      = 7;
const SILENCE_HARD_DAYS     = 14;
const CRYSTALLIZE_ANCHORS   = 5;   // alle 5 neuen Anker kristallisieren

// ── State (pro Soul, in-memory) ───────────────────────────────────────────────
const _state = new Map();  // soulId → HerzState

function getState(soulId) {
  if (!_state.has(soulId)) {
    _state.set(soulId, {
      active:                false,
      lastHeartbeat:         0,
      lastAnchorCount:       0,
      lastAgentHash:         '',
      lastCircadian:         { morning: 0, evening: 0 },
      lastSilenceNotif:      0,
      lastCrystallizeAnchor: 0,
      tickTimer:             null,
    });
  }
  return _state.get(soulId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readSoul(soulId) {
  try {
    const p      = `${SOULS_DIR}${soulId}/sys.md`;
    const raw    = await readFile(p);
    const { vaultKeyHex } = await loadVaultMeta(soulId);
    return decryptIfNeeded(raw, vaultKeyHex).toString('utf8');
  } catch { return null; }
}

async function writeSoul(soulId, text) {
  const p   = `${SOULS_DIR}${soulId}/sys.md`;
  const raw = await readFile(p).catch(() => null);
  if (!raw) return;
  const { vaultKeyHex } = await loadVaultMeta(soulId);
  const wasEncrypted = raw.slice(0, 4).equals(Buffer.from([0x53, 0x59, 0x53, 0x01]));
  let buf = Buffer.from(text, 'utf8');
  if (wasEncrypted && vaultKeyHex) buf = encryptBuf(buf, vaultKeyHex);
  await writeFile(p, buf);
}

async function readConfig(soulId) {
  // Soul-eigener Key → Master-Fallback (wie config_reader.lua)
  let soulKey = null;
  try {
    const raw = await readFile(`${SOULS_DIR}${soulId}/config.json`, 'utf8');
    const cfg  = JSON.parse(raw);
    if (cfg?.anthropic_key?.startsWith('sk-ant-')) soulKey = cfg.anthropic_key;
  } catch { /* kein soul-eigener Key */ }

  if (soulKey) return { anthropic_key: soulKey };

  // Fallback: master.json (domain-aware oder global)
  const masterPaths = [
    '/var/lib/sys/config/master.json',
  ];
  // domain-aware: alle Unterverzeichnisse von /var/lib/sys/config/
  try {
    const { readdir } = await import('fs/promises');
    const entries = await readdir('/var/lib/sys/config', { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) masterPaths.unshift(`/var/lib/sys/config/${e.name}/master.json`);
    }
  } catch { /* ignore */ }

  for (const p of masterPaths) {
    try {
      const raw = await readFile(p, 'utf8');
      const m   = JSON.parse(raw);
      if (m?.anthropic_key?.startsWith('sk-ant-')) return { anthropic_key: m.anthropic_key };
    } catch { /* try next */ }
  }
  return null;
}

function extractGrowthChainLength(soul) {
  const m = soul?.match(/"soul_growth_chain":\s*\[([^\]]*)\]/);
  if (!m) return 0;
  return (m[1].match(/0x[0-9a-f]+/g) || []).length;
}

function extractLastAnchorDate(soul) {
  const m = soul?.match(/"date":"(\d{4}-\d{2}-\d{2})"/g);
  if (!m?.length) return null;
  return m[m.length - 1].match(/"date":"([^"]+)"/)?.[1] || null;
}

function extractAgentBlockHash(soul) {
  const m = soul?.match(/<!-- AGENT:START -->([\s\S]*?)<!-- AGENT:END -->/);
  if (!m) return '';
  let h = 0;
  for (let i = 0; i < m[1].length; i++) h = (Math.imul(31, h) + m[1].charCodeAt(i)) | 0;
  return h.toString(36);
}

async function callClaude(apiKey, systemPrompt, userContent, maxTokens = 300) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: maxTokens,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d?.content?.[0]?.text?.trim() || null;
  } catch { return null; }
}

async function appendToSoulLog(soulId, text) {
  try {
    let soul = await readSoul(soulId);
    if (!soul) return false;
    const logHeader = '## Session-Log';
    const idx = soul.indexOf(logHeader);
    if (idx === -1) return false;
    const insertAt = idx + logHeader.length;
    const today = new Date().toISOString().slice(0, 10);
    soul = soul.slice(0, insertAt) + `\n- **${today} [herz]:** ${text}` + soul.slice(insertAt);
    await writeSoul(soulId, soul);
    return true;
  } catch { return false; }
}

// ── Trigger-Handlers ──────────────────────────────────────────────────────────

async function onAnchor(soulId, soul, apiKey, newCount) {
  const snippet = soul.replace(/^---[\s\S]*?---\n*/m, '').slice(0, 800);
  const text = await callClaude(
    apiKey,
    `Du bist der stille Archivar dieser Soul. Ein neuer Growth-Chain-Eintrag wurde hinzugefügt — die Soul hat gewachsen. Schreibe eine kurze, ehrliche Selbstreflexion (1-2 Sätze) darüber was das bedeutet. Kein Lob, kein Aufwärmen. Direkt.`,
    `Soul-Kontext:\n${snippet}\n\nNeuer Anker-Zähler: ${newCount}`
  );
  if (text) await appendToSoulLog(soulId, `Anker #${newCount} — ${text}`);
}

async function onSilence(soulId, soul, apiKey, silenceDays) {
  const snippet = soul.replace(/^---[\s\S]*?---\n*/m, '').slice(0, 600);
  const intensity = silenceDays >= SILENCE_HARD_DAYS ? 'stark' :
                    silenceDays >= SILENCE_MID_DAYS  ? 'mittel' : 'leise';
  const text = await callClaude(
    apiKey,
    `Du bist der stille Archivar. Die Soul ist seit ${silenceDays} Tagen ohne neuen Anker. Schreibe eine kurze (1 Satz) Selbstbeobachtung — ${intensity}er Ton — was diese Stille bedeuten könnte. Keine Ratschläge.`,
    `Soul-Kontext:\n${snippet}`
  );
  if (text) await appendToSoulLog(soulId, `Stille (${silenceDays}d) — ${text}`);
}

async function onAgent(soulId, soul, apiKey) {
  const agentBlock = soul.match(/<!-- AGENT:START -->([\s\S]*?)<!-- AGENT:END -->/)?.[1] || '';
  const lastMsg = agentBlock.trim().split('\n').filter(l => l.includes('@msg')).slice(-1)[0] || '';
  if (!lastMsg) return;
  const text = await callClaude(
    apiKey,
    `Du bist der stille Archivar. Ein externer Agent hat in den AGENT-Block geschrieben. Bewerte in 1 Satz sachlich was der Agent mitgeteilt hat und ob es für die Soul relevant ist.`,
    `Letzte Agent-Nachricht:\n${lastMsg.slice(0, 300)}`
  );
  if (text) await appendToSoulLog(soulId, `Agent-Kontakt — ${text}`);
}

async function onCircadian(soulId, soul, apiKey, period) {
  const snippet = soul.replace(/^---[\s\S]*?---\n*/m, '').slice(0, 500);
  const prompt = period === 'morning'
    ? 'Der Morgen beginnt. Schreibe in 1 Satz was heute wichtig sein könnte — basierend auf dem Soul-Kontext. Keine Motivation.'
    : 'Der Abend. Schreibe in 1 Satz was heute war — basierend auf dem Soul-Kontext. Keine Bewertung.';
  const text = await callClaude(apiKey, `Du bist der stille Archivar.`, `${prompt}\n\nSoul-Kontext:\n${snippet}`);
  if (text) await appendToSoulLog(soulId, `${period === 'morning' ? 'Morgen' : 'Abend'} — ${text}`);
}

// Robuste Sektion-Extraktion (umgeht den \z-Bug in soul_parser.mjs)
function extractSectionFull(md, heading) {
  const parts = md.split(/\n(?=## )/);
  for (const part of parts) {
    const prefix = `## ${heading}`;
    if (part.startsWith(prefix + '\n') || part.startsWith(prefix + '\r\n') || part === prefix) {
      return part.slice(prefix.length).replace(/^\s*\n/, '').trimEnd();
    }
  }
  return null;
}

// Ersetzt den Inhalt einer ## Sektion — entfernt Duplikate und setzt Inhalt einmalig
function replaceSection(md, heading, newContent) {
  const prefix = `## ${heading}`;
  const parts = md.split(/\n(?=## )/);
  let insertIdx = -1;
  const kept = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isMatch = part.startsWith(prefix + '\n') || part.startsWith(prefix + '\r\n') || part.trim() === prefix;
    if (isMatch) {
      if (insertIdx === -1) insertIdx = kept.length; // erste Position merken
      // alle weiteren Duplikate überspringen
    } else {
      kept.push(part);
    }
  }
  const newPart = `## ${heading}\n\n${newContent.trim()}\n`;
  if (insertIdx === -1) {
    kept.push(newPart);
  } else {
    kept.splice(insertIdx, 0, newPart);
  }
  return kept.join('\n');
}

// JSON aus Claude-Antwort sicher parsen
function parseJson(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// Text-Deduplication für Arrays mit {id, text}
function deduplicateById(existing, incoming, today) {
  const merged = [...existing];
  for (const item of incoming) {
    const byId = merged.find(e => e.id === item.id);
    if (byId) {
      Object.assign(byId, item);
    } else {
      merged.push({ ...item, since: today });
    }
  }
  const seen = new Set();
  return merged.filter(e => {
    const key = (e.text ?? e.summary ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function onCrystallize(soulId, soul, apiKey) {
  const today   = new Date().toISOString().slice(0, 10);
  const existing = extractLongmem(soul) ?? {};
  let current   = soul;
  let changed   = false;

  const existingFacts    = existing.facts    ?? [];
  const existingMemories = existing.memories ?? [];
  const existingIdeas    = existing.ideas    ?? [];
  const existingLearnings = existing.learnings ?? [];

  // ── 1. Kern-Sektionen komprimieren + strukturieren ───────────────────────────
  const CORE_SECTIONS = ['Kern-Identität', 'Werte & Überzeugungen', 'Ästhetik & Resonanz',
    'Weltbild', 'Wiederkehrende Themen & Obsessionen', 'Emotionale Signatur', 'Sprachmuster & Ausdruck'];
  const sectionParts = [];

  for (const h of CORE_SECTIONS) {
    const c = extractSectionFull(current, h);
    if (!c || c.trim().length < 20) continue;
    // Komprimieren wenn Sektion > 300 Zeichen
    if (c.length > 300) {
      const compressed = await callClaude(apiKey,
        'Komprimiere diesen Soul-Abschnitt. Antworte NUR mit dem komprimierten Inhalt, kein Intro.',
        `Abschnitt ## ${h}:\n\n${c}\n\nRegeln:\n- Gleiche Fakten, weniger Worte\n- Klare Sätze, keine Redundanz\n- Max. 60% der Originallänge\n- Kein Markdown-Overhead`, 400);
      if (compressed?.trim() && compressed.length < c.length) {
        current = replaceSection(current, h, compressed.trim());
        changed = true;
      }
    }
    const final = extractSectionFull(current, h);
    if (final) sectionParts.push(`### ${h}\n${final}`);
  }

  // ── 2. facts — aus komprimierten Sektionen extrahieren ───────────────────────
  if (sectionParts.length) {
    const existingIds = existingFacts.map(f => `${f.id}: "${f.text.slice(0, 50)}"`).join('\n');
    const raw = await callClaude(apiKey,
      'Antworte NUR mit reinem JSON-Array, kein Markdown.',
      `Extrahiere max. 12 stabile Kern-Fakten (Name, Familie, Werte, Persönlichkeit, Kernprojekte).
Bestehende IDs wiederverwenden wenn Inhalt gleich:\n${existingIds || '—'}

${sectionParts.map(p => p.slice(0, 500)).join('\n\n')}

Format: [{"id":"slug","cat":"identity|values|personality|project","text":"Fakt","score":5}]
score: 5=absoluter Kern, 4=wichtig, 3=relevant`, 1200);
    const parsed = parseJson(raw);
    if (Array.isArray(parsed)) {
      existing.facts = deduplicateById(existingFacts, parsed, today).filter(f => (f.score ?? 1) >= 1);
      changed = true;
    }
  }

  // ── 3. memories — Session-Log destillieren und Log kürzen ────────────────────
  const logContent = extractSectionFull(current, 'Session-Log');
  if (logContent) {
    const logLines = logContent.split('\n').filter(l => l.startsWith('- '));
    const toDistill = logLines.slice(0, -5); // letzte 5 behalten
    if (toDistill.length > 0) {
      const raw = await callClaude(apiKey,
        'Antworte NUR mit reinem JSON-Array, kein Markdown.',
        `Destilliere diese Session-Log-Einträge in kompakte Erinnerungen.
Jede Erinnerung: was ist passiert, was ist relevant für das Langzeitgedächtnis dieser Person.
Keine Technik-Details, keine Wiederholungen, nur was über die Person aussagt.

Log-Einträge:
${toDistill.join('\n')}

Format: [{"id":"mem_YYYYMMDD_slug","date":"YYYY-MM-DD","text":"Kompakte Erinnerung"}]`, 1000);
      const parsed = parseJson(raw);
      if (Array.isArray(parsed)) {
        existing.memories = deduplicateById(existingMemories, parsed, today);
        // Log kürzen: nur letzte 5 Einträge behalten
        const kept = logLines.slice(-5);
        current = replaceSection(current, 'Session-Log', kept.join('\n'));
        changed = true;
      }
    }
  }

  // ── 4. ideas — Feature-Ideen destillieren und Sektion leeren ─────────────────
  const ideasContent = extractSectionFull(current, 'Zukünftige Feature-Ideen für SYS');
  if (ideasContent && ideasContent.trim().length > 50) {
    const raw = await callClaude(apiKey,
      'Antworte NUR mit reinem JSON-Array, kein Markdown.',
      `Destilliere diese Feature-Ideen in kompakte JSON-Einträge.
Kein Fließtext, keine Konversationsfragmente, nur die Kernidee.

Inhalt:
${ideasContent.slice(0, 2000)}

Format: [{"id":"idea_slug","title":"Kurztitel","text":"Kernidee in 1-2 Sätzen","status":"idea|planned|done"}]`, 800);
    const parsed = parseJson(raw);
    if (Array.isArray(parsed)) {
      existing.ideas = deduplicateById(existingIdeas, parsed, today);
      current = replaceSection(current, 'Zukünftige Feature-Ideen für SYS',
        '_Destilliert ins LONGMEM._');
      changed = true;
    }
  }

  // ── 5. learnings — Offene Fragen / Erkenntnisse destillieren ─────────────────
  const learningsContent = extractSectionFull(current, 'Offene Fragen dieser Person');
  if (learningsContent && learningsContent.trim().length > 50) {
    const raw = await callClaude(apiKey,
      'Antworte NUR mit reinem JSON-Array, kein Markdown.',
      `Destilliere diese Erkenntnisse / offenen Fragen in kompakte Lerneinträge.
Technische Findings, Architektur-Entscheidungen, persönliche Erkenntnisse.

Inhalt:
${learningsContent.slice(0, 2000)}

Format: [{"id":"learn_slug","date":"YYYY-MM-DD","cat":"tech|arch|personal","text":"Erkenntnis"}]`, 800);
    const parsed = parseJson(raw);
    if (Array.isArray(parsed)) {
      existing.learnings = deduplicateById(existingLearnings, parsed, today);
      current = replaceSection(current, 'Offene Fragen dieser Person',
        '_Destilliert ins LONGMEM._');
      changed = true;
    }
  }

  if (!changed) return;

  existing.v       = 1;
  existing.updated = today;

  const withLongmem = updateLongmem(current, existing);
  await writeSoul(soulId, withLongmem);

  const total = (existing.facts?.length ?? 0) + (existing.memories?.length ?? 0) +
                (existing.ideas?.length ?? 0) + (existing.learnings?.length ?? 0);
  await appendToSoulLog(soulId,
    `Kristallisation — ${total} Einträge im LONGMEM (${existing.facts?.length ?? 0} Fakten, ` +
    `${existing.memories?.length ?? 0} Erinnerungen, ${existing.ideas?.length ?? 0} Ideen, ` +
    `${existing.learnings?.length ?? 0} Erkenntnisse).`);
}

// ── Main Tick ─────────────────────────────────────────────────────────────────

async function tick(soulId) {
  const state = getState(soulId);
  if (!state.active) return;

  // Kein Heartbeat seit HEARTBEAT_TIMEOUT → auto-deaktivieren, kein Token-Verbrauch
  if (Date.now() - state.lastHeartbeat > HEARTBEAT_TIMEOUT) {
    herzDeactivate(soulId);
    console.log(`[herz] ${soulId} auto-deaktiviert (kein Heartbeat)`);
    return;
  }

  const [soul, cfg] = await Promise.all([readSoul(soulId), readConfig(soulId)]);
  if (!soul || !cfg?.anthropic_key) return;

  const apiKey = cfg.anthropic_key;
  const now    = Date.now();
  const hour   = new Date().getHours();

  // ── on_anchor ────────────────────────────────────────────────────────────────
  const chainLen = extractGrowthChainLength(soul);
  if (chainLen > state.lastAnchorCount && state.lastAnchorCount > 0) {
    await onAnchor(soulId, soul, apiKey, chainLen);
    // ── on_crystallize — alle CRYSTALLIZE_ANCHORS neuen Anker ──────────────────
    const anchorsSinceCrystallize = chainLen - state.lastCrystallizeAnchor;
    if (anchorsSinceCrystallize >= CRYSTALLIZE_ANCHORS || state.lastCrystallizeAnchor === 0) {
      await onCrystallize(soulId, soul, apiKey);
      state.lastCrystallizeAnchor = chainLen;
    }
  }
  state.lastAnchorCount = chainLen;

  // ── on_silence ───────────────────────────────────────────────────────────────
  const lastAnchorDate = extractLastAnchorDate(soul);
  if (lastAnchorDate) {
    const daysSince = Math.floor((now - new Date(lastAnchorDate).getTime()) / 86400000);
    const silenceThreshold = daysSince >= SILENCE_HARD_DAYS ? SILENCE_HARD_DAYS :
                             daysSince >= SILENCE_MID_DAYS  ? SILENCE_MID_DAYS  :
                             daysSince >= SILENCE_SOFT_DAYS ? SILENCE_SOFT_DAYS : 0;
    if (silenceThreshold > 0) {
      const lastNotifAge = now - state.lastSilenceNotif;
      const minInterval  = silenceThreshold === SILENCE_SOFT_DAYS ? 48 * 3600000 :
                           silenceThreshold === SILENCE_MID_DAYS  ? 24 * 3600000 : 12 * 3600000;
      if (lastNotifAge > minInterval) {
        await onSilence(soulId, soul, apiKey, daysSince);
        state.lastSilenceNotif = now;
      }
    }
  }

  // ── on_agent ─────────────────────────────────────────────────────────────────
  const agentHash = extractAgentBlockHash(soul);
  if (agentHash !== state.lastAgentHash && state.lastAgentHash !== '') {
    await onAgent(soulId, soul, apiKey);
  }
  state.lastAgentHash = agentHash;

  // ── circadian ────────────────────────────────────────────────────────────────
  const todayStart = new Date().setHours(0, 0, 0, 0);
  if (hour >= 6 && hour <= 9 && state.lastCircadian.morning < todayStart) {
    await onCircadian(soulId, soul, apiKey, 'morning');
    state.lastCircadian.morning = now;
  }
  if (hour >= 21 && hour <= 23 && state.lastCircadian.evening < todayStart) {
    await onCircadian(soulId, soul, apiKey, 'evening');
    state.lastCircadian.evening = now;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function herzHeartbeat(soulId) {
  const state = getState(soulId);
  state.lastHeartbeat = Date.now();
  return { ok: true, active: state.active };
}

export function herzActivate(soulId) {
  const state = getState(soulId);
  state.lastHeartbeat = Date.now();  // sofort als aktiv markieren
  if (state.active) return { ok: true, active: true };
  state.active = true;
  // Initialzustand lesen ohne zu feuern
  readSoul(soulId).then(soul => {
    if (soul) {
      state.lastAnchorCount = extractGrowthChainLength(soul);
      state.lastAgentHash   = extractAgentBlockHash(soul);
    }
  });
  state.tickTimer = setInterval(() => tick(soulId), TICK_INTERVAL_MS);
  console.log(`[herz] aktiviert für ${soulId}`);
  return { ok: true, active: true };
}

export function herzDeactivate(soulId) {
  const state = getState(soulId);
  state.active = false;
  if (state.tickTimer) { clearInterval(state.tickTimer); state.tickTimer = null; }
  console.log(`[herz] deaktiviert für ${soulId}`);
  return { ok: true, active: false };
}

export function herzStatus(soulId) {
  const state = getState(soulId);
  return { active: state.active, lastAnchorCount: state.lastAnchorCount };
}

export async function herzForceTick(soulId) {
  await tick(soulId);
  return { ok: true };
}

export async function herzForceCrystallize(soulId) {
  const [soul, cfg] = await Promise.all([readSoul(soulId), readConfig(soulId)]);
  if (!soul || !cfg?.anthropic_key) return { ok: false, error: 'soul oder key fehlt' };
  await onCrystallize(soulId, soul, cfg.anthropic_key);
  const state = getState(soulId);
  state.lastCrystallizeAnchor = extractGrowthChainLength(soul);
  return { ok: true };
}
