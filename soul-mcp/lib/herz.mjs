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

// Ersetzt den Inhalt einer ## Sektion zuverlässig
function replaceSection(md, heading, newContent) {
  const parts = md.split(/\n(?=## )/);
  const prefix = `## ${heading}`;
  const result = parts.map(part => {
    if (part.startsWith(prefix + '\n') || part.startsWith(prefix + '\r\n') || part === prefix) {
      return `## ${heading}\n\n${newContent.trim()}\n`;
    }
    return part;
  });
  return result.join('\n');
}

// Bereinigt Sektionen die rohe Chat-Dumps oder Emoji-Content enthalten
async function onOptimizeSections(soulId, soul, apiKey) {
  const CLEANUP_SECTIONS = [
    'Offene Fragen dieser Person',
    'Zukünftige Feature-Ideen für SYS',
  ];
  let current = soul;
  let changed = false;

  for (const heading of CLEANUP_SECTIONS) {
    const content = extractSectionFull(current, heading);
    if (!content) continue;
    // Prüfe ob Cleanup nötig: Emojis, "SESSION", raw chat indicators
    const needsCleanup = /[\u{1F300}-\u{1FFFF}]|SESSION\n|schreibe das in meine soul|IF action ==|Konkreter Flow|Was du dafür brauchst/u.test(content);
    if (!needsCleanup) continue;

    const cleaned = await callClaude(
      apiKey,
      `Du bist der Archivar. Restrukturiere diesen Soul-Abschnitt in sauberes Markdown.
Regeln:
- Keine Emojis, keine Chat-Fragmente, keine "SESSION"-Blöcke
- Behalte alle inhaltlich relevanten Informationen und Ideen
- Strukturiere als klare Markdown-Liste oder Unterabschnitte (###)
- Entferne rohe KI-Konversationen, behalte nur destillierte Kernaussagen
- Antworte NUR mit dem bereinigten Inhalt, kein Intro, kein Outro`,
      `Abschnitt: ## ${heading}\n\n${content.slice(0, 2500)}`,
      900
    );
    if (!cleaned?.trim()) continue;
    current = replaceSection(current, heading, cleaned);
    changed = true;
  }

  if (changed) {
    await writeSoul(soulId, current);
  }
  return current;
}

async function onCrystallize(soulId, soul, apiKey) {
  // ── Schritt 1: Sektionen bereinigen ──────────────────────────────────────────
  const optimized = await onOptimizeSections(soulId, soul, apiKey);
  const soulForFacts = optimized || soul;

  const sections  = extractAllSections(soulForFacts);
  const existing  = extractLongmem(soulForFacts);
  const existingFacts = existing?.facts ?? [];

  // Relevante Sektionen für Kristallisation (keine Logs, keine technischen Blöcke)
  const CORE_SECTIONS = ['Kern-Identität', 'Werte & Überzeugungen', 'Ästhetik & Resonanz',
    'Weltbild', 'Wiederkehrende Themen & Obsessionen', 'Emotionale Signatur', 'Sprachmuster & Ausdruck'];
  const sectionText = CORE_SECTIONS
    .filter(s => sections[s])
    .map(s => `### ${s}\n${sections[s].slice(0, 600)}`)
    .join('\n\n');

  if (!sectionText.trim()) return;

  // Bestehende IDs explizit übergeben damit Claude sie wiederverwendet
  const existingIds = existingFacts.map(f => `${f.id} → "${f.text.slice(0, 60)}"`).join('\n');
  const existingHint = existingFacts.length
    ? `\nBestehende Fakt-IDs (wiederverwendet wenn Inhalt gleich — keine neuen IDs für bekannte Fakten):\n${existingIds}`
    : '';

  const raw = await callClaude(
    apiKey,
    `Du bist der Archivar. Antworte NUR mit reinem JSON — kein Markdown, keine Code-Blöcke, kein Text davor oder danach.`,
    `Extrahiere max. 12 stabile Kern-Fakten aus diesen Soul-Sektionen.
Nur Fakten die sich kaum ändern (Name, Familie, Werte, Kernprojekte, Persönlichkeit).
Keine Session-Logs, keine temporären Ereignisse.${existingHint}

Soul-Sektionen:
${sectionText}

Gib NUR dieses JSON zurück (kein Markdown):
{"facts":[{"id":"slug","cat":"identity","text":"Faktum","score":5}]}

cat: identity|values|personality|project
score: 5=absoluter Kern, 4=wichtig, 3=relevant`,
    1200
  );

  if (!raw) return;
  const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return;
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch { return; }
  if (!Array.isArray(parsed?.facts)) return;

  // Merge: existierende Fakten behalten, neue hinzufügen / score aktualisieren
  const merged = [...existingFacts];
  for (const newFact of parsed.facts) {
    const byId = merged.find(f => f.id === newFact.id);
    if (byId) {
      byId.score = Math.max(byId.score ?? 1, newFact.score ?? 1);
      byId.text  = newFact.text;
    } else {
      merged.push({ ...newFact, since: new Date().toISOString().slice(0, 10) });
    }
  }

  // Text-basierte Deduplication: gleicher Inhalt → ältere Variante entfernen
  const seen = new Map();
  const deduped = [];
  for (const f of merged) {
    const key = f.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!seen.has(key)) {
      seen.set(key, true);
      deduped.push(f);
    }
    // Duplikat — überspringen, ältere Variante bereits drin
  }

  const kept = deduped.filter(f => (f.score ?? 1) >= 1);

  const current = await readSoul(soulId);
  if (!current) return;

  const updated = updateLongmem(current, {
    v:       1,
    updated: new Date().toISOString().slice(0, 10),
    facts:   kept,
  });
  await writeSoul(soulId, updated);
  await appendToSoulLog(soulId, `Kristallisation — ${kept.length} Fakten im LONGMEM verankert.`);
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
