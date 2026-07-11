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
import { extractLongmem, updateLongmem, extractAllSections, buildLongmemIndex, updateLongmemIndex, extractLongmemIndex, queryLongmem } from './soul_parser.mjs';

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
      lastHealthCheck:       0,
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

// Stellt sicher dass AGENT:END und SOCIAL:END nicht fehlen.
// Passiert wenn ## Überschriften innerhalb eines Blocks beim Split verloren gehen.
function repairBlockEndTags(md) {
  let out = md;
  // AGENT:START ohne AGENT:END → direkt vor der nächsten ## Sektion NACH AGENT:START einfügen
  if (out.includes('<!-- AGENT:START -->') && !out.includes('<!-- AGENT:END -->')) {
    const startIdx = out.indexOf('<!-- AGENT:START -->') + '<!-- AGENT:START -->'.length;
    const nextSection = out.indexOf('\n## ', startIdx);
    if (nextSection !== -1) {
      out = out.slice(0, nextSection) + '\n<!-- AGENT:END -->' + out.slice(nextSection);
    } else {
      out = out.trimEnd() + '\n<!-- AGENT:END -->\n';
    }
  }
  // SOCIAL:START ohne SOCIAL:END → direkt vor der nächsten ## Sektion NACH SOCIAL:START einfügen
  if (out.includes('<!-- SOCIAL:START -->') && !out.includes('<!-- SOCIAL:END -->')) {
    const startIdx = out.indexOf('<!-- SOCIAL:START -->') + '<!-- SOCIAL:START -->'.length;
    const nextSection = out.indexOf('\n## ', startIdx);
    if (nextSection !== -1) {
      out = out.slice(0, nextSection) + '\n<!-- SOCIAL:END -->' + out.slice(nextSection);
    } else {
      out = out.trimEnd() + '\n<!-- SOCIAL:END -->\n';
    }
  }
  return out;
}

async function appendToSoulLog(soulId, text) {
  try {
    let soul = await readSoul(soulId);
    if (!soul) return false;
    const logHeader = soul.includes('\n## Session Log\n') ? '## Session Log' : '## Session-Log';
    const idx = soul.indexOf(logHeader);
    if (idx === -1) return false;
    const insertAt = idx + logHeader.length;
    const today = new Date().toISOString().slice(0, 10);
    soul = soul.slice(0, insertAt) + `\n- **${today} [herz]:** ${text}` + soul.slice(insertAt);
    await writeSoul(soulId, repairBlockEndTags(soul));
    return true;
  } catch { return false; }
}

// ── Trigger-Handlers ──────────────────────────────────────────────────────────

// Baut den Kontext-Schnipsel für einen Trigger über gezielte LONGMEM-Queries statt
// positionaler Slice (die zufällig im rohen LONGMEM-JSON landen konnte). Fallback
// auf die alte Slice-Logik falls die Soul noch nicht kristallisiert wurde — kein
// Zwang zur Konsistenz für frische Souls.
function buildHerzContext(soul, queryFn, fallbackLen) {
  const longmem = extractLongmem(soul);
  if (!longmem) return soul.replace(/^---[\s\S]*?---\n*/m, '').slice(0, fallbackLen);
  const index = extractLongmemIndex(soul);
  const snippet = queryFn(longmem, index);
  return snippet || soul.replace(/^---[\s\S]*?---\n*/m, '').slice(0, fallbackLen);
}

async function onAnchor(soulId, soul, apiKey, newCount) {
  const snippet = buildHerzContext(soul, (lm, idx) => [
    queryLongmem(lm, idx, { dimension: 'facts', x_minScore: 4, limit: 5 }).formatted,
    queryLongmem(lm, idx, { dimension: 'memories', limit: 2 }).formatted,
  ].filter(Boolean).join('\n'), 800);
  const text = await callClaude(
    apiKey,
    `You are the silent archivist of this soul. A new growth-chain entry has been added — the soul has grown. Write a short, honest self-reflection (1-2 sentences) about what this means. No praise, no warm-up. Direct.`,
    `Soul context:\n${snippet}\n\nNew anchor count: ${newCount}`
  );
  if (text) await appendToSoulLog(soulId, `Anchor #${newCount} — ${text}`);
}

async function onSilence(soulId, soul, apiKey, silenceDays) {
  const snippet = buildHerzContext(soul, (lm, idx) =>
    queryLongmem(lm, idx, { dimension: 'facts', y_cat: ['identity', 'values'], limit: 6 }).formatted, 600);
  const intensity = silenceDays >= SILENCE_HARD_DAYS ? 'strong' :
                    silenceDays >= SILENCE_MID_DAYS  ? 'moderate' : 'quiet';
  const text = await callClaude(
    apiKey,
    `You are the silent archivist. This soul has had no new anchor for ${silenceDays} days. Write a short (1 sentence) self-observation — ${intensity} tone — about what this silence might mean. No advice.`,
    `Soul context:\n${snippet}`
  );
  if (text) await appendToSoulLog(soulId, `Silence (${silenceDays}d) — ${text}`);
}

async function onAgent(soulId, soul, apiKey) {
  const agentBlock = soul.match(/<!-- AGENT:START -->([\s\S]*?)<!-- AGENT:END -->/)?.[1] || '';
  const msgMatches = [...agentBlock.matchAll(/<!--\s*@msg\s+(\S+)\s+(\S+)\s+(\S+)\s+([\s\S]*?)-->/g)];
  const lastMsg = msgMatches.length ? msgMatches[msgMatches.length - 1][0] : '';
  if (!lastMsg) return;
  const snippet = buildHerzContext(soul, (lm, idx) =>
    queryLongmem(lm, idx, { dimension: 'facts', y_cat: 'project', limit: 5 }).formatted, 0);
  const text = await callClaude(
    apiKey,
    `You are the silent archivist. An external agent has written to the AGENT block. In 1 sentence assess factually what the agent communicated and whether it is relevant to this soul.`,
    `Last agent message:\n${lastMsg.slice(0, 300)}${snippet ? `\n\nRelevant project context:\n${snippet}` : ''}`
  );
  if (text) await appendToSoulLog(soulId, `Agent contact — ${text}`);
}

async function onCircadian(soulId, soul, apiKey, period) {
  const snippet = buildHerzContext(soul, (lm, idx) => [
    queryLongmem(lm, idx, { dimension: 'memories', limit: 1 }).formatted,
    queryLongmem(lm, idx, { dimension: 'ideas', z_status: 'planned', limit: 3 }).formatted,
  ].filter(Boolean).join('\n'), 500);
  const prompt = period === 'morning'
    ? 'Morning begins. Write in 1 sentence what might matter today — based on the soul context. No motivation.'
    : 'Evening. Write in 1 sentence what today was — based on the soul context. No evaluation.';
  const text = await callClaude(apiKey, `You are the silent archivist.`, `${prompt}\n\nSoul context:\n${snippet}`);
  if (text) await appendToSoulLog(soulId, `${period === 'morning' ? 'Morning' : 'Evening'} — ${text}`);
}

// Dual-language helpers: try English first, fall back to German (legacy souls)
function resolveHeading(md, enHeading, deHeading) {
  if (extractSectionFull(md, enHeading) !== null) return enHeading;
  if (deHeading && extractSectionFull(md, deHeading) !== null) return deHeading;
  return enHeading;
}
function extractDual(md, enHeading, deHeading) {
  return extractSectionFull(md, enHeading) ?? (deHeading ? extractSectionFull(md, deHeading) : null);
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

// Entfernt eine ## Sektion vollständig aus dem Dokument
function removeSection(md, heading) {
  const prefix = `## ${heading}`;
  return md.split(/\n(?=## )/).filter(part => {
    return !(part.startsWith(prefix + '\n') || part.startsWith(prefix + '\r\n') || part.trim() === prefix);
  }).join('\n');
}

// Ersetzt den Inhalt einer ## Sektion — entfernt Duplikate und setzt Inhalt einmalig.
// HTML-Kommentare (<!-- ... -->) direkt unter der Überschrift werden immer erhalten.
function replaceSection(md, heading, newContent) {
  const prefix = `## ${heading}`;
  const parts = md.split(/\n(?=## )/);
  let insertIdx = -1;
  let headerComment = '';
  const kept = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isMatch = part.startsWith(prefix + '\n') || part.startsWith(prefix + '\r\n') || part.trim() === prefix;
    if (isMatch) {
      if (insertIdx === -1) {
        insertIdx = kept.length;
        // preserve leading <!-- comment --> lines so the Archivar never strips them
        const body = part.slice(prefix.length).replace(/^\r?\n/, '');
        const commentLines = [];
        for (const line of body.split('\n')) {
          if (line.trim().startsWith('<!--')) commentLines.push(line);
          else break;
        }
        if (commentLines.length) headerComment = commentLines.join('\n') + '\n';
      }
      // alle weiteren Duplikate überspringen
    } else {
      kept.push(part);
    }
  }
  const newPart = `## ${heading}\n${headerComment}\n${newContent.trim()}\n`;
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
  const EMPTY_SECTION = '*Not yet described.*';

  const existingFacts    = existing.facts    ?? [];
  const existingMemories = existing.memories ?? [];
  const existingIdeas    = existing.ideas    ?? [];
  const existingLearnings = existing.learnings ?? [];

  // ── 1. Kern-Sektionen komprimieren + strukturieren ───────────────────────────
  const CORE_SECTIONS = [
    { en: 'Core Identity',                  de: 'Kern-Identität' },
    { en: 'Values & Beliefs',               de: 'Werte & Überzeugungen' },
    { en: 'Aesthetics & Resonance',         de: 'Ästhetik & Resonanz' },
    { en: 'Worldview',                      de: 'Weltbild' },
    { en: 'Recurring Themes & Obsessions',  de: 'Wiederkehrende Themen & Obsessionen' },
    { en: 'Emotional Signature',            de: 'Emotionale Signatur' },
    { en: 'Language Patterns & Expression', de: 'Sprachmuster & Ausdruck' },
  ];
  const sectionParts = [];

  for (const { en, de } of CORE_SECTIONS) {
    const h = resolveHeading(current, en, de);
    const c = extractSectionFull(current, h);
    if (!c || c.trim().length < 20) continue;
    // Komprimieren wenn Sektion > 300 Zeichen
    if (c.length > 300) {
      // strip HTML comments before sending to Claude — they are structural metadata, not content
      const cForClaude = c.replace(/<!--[\s\S]*?-->\n?/g, '').trim();
      const compressed = await callClaude(apiKey,
        'Compress this soul section. Reply ONLY with the compressed content, no intro.',
        `Section ## ${h}:\n\n${cForClaude}\n\nRules:\n- Same facts, fewer words\n- Clear sentences, no redundancy\n- Max. 60% of original length\n- No Markdown overhead`, 400);
      if (compressed?.trim() && compressed.length < cForClaude.length) {
        current = replaceSection(current, h, compressed.trim());
        changed = true;
      }
    }
    const final = extractSectionFull(current, h);
    // strip comments before passing to fact extraction prompt
    const finalForPrompt = final ? final.replace(/<!--[\s\S]*?-->\n?/g, '').trim() : null;
    if (finalForPrompt) sectionParts.push(`### ${h}\n${finalForPrompt}`);
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
      // Nur wenn Extraktion erfolgreich → verarbeitete Sektionen zurücksetzen
      for (const h of CORE_SECTIONS) {
        const c = extractSectionFull(current, h);
        if (c && c.trim().length >= 20 && !c.includes('Noch nicht beschrieben')) {
          current = replaceSection(current, h, EMPTY_SECTION);
        }
      }
    }
  }

  // ── 2b. Fakten deduplizieren wenn zu viele akkumuliert ───────────────────────
  const factsNow = existing.facts ?? [];
  if (factsNow.length > 18) {
    const raw2b = await callClaude(apiKey,
      'Antworte NUR mit reinem JSON-Array, kein Markdown.',
      `Konsolidiere diese LONGMEM-Facts: merze inhaltliche Duplikate (gleiche Bedeutung → einer), behalte höchsten Score. Ziel: max. 15 Einträge, keine Informationen verlieren.

${JSON.stringify(factsNow, null, 2).slice(0, 3000)}

Format: [{"id":"...","cat":"identity|values|personality|project","text":"...","score":N,"since":"YYYY-MM-DD"}]`, 2000);
    const parsed2b = parseJson(raw2b);
    if (Array.isArray(parsed2b) && parsed2b.length > 0 && parsed2b.length < factsNow.length) {
      existing.facts = parsed2b;
      changed = true;
    }
  }

  // ── 3. memories — Session-Log destillieren und Log kürzen ────────────────────
  const logHeading  = resolveHeading(current, 'Session Log', 'Session-Log');
  const logContent  = extractSectionFull(current, logHeading);
  if (logContent) {
    const allLines = logContent.split('\n').filter(l => l.startsWith('- '));
    // Agent-Einträge (z.B. [herz], [agent:xxx]) sind geschützt — nie anfassen
    const agentLines   = allLines.filter(l => /\*\*[^*]+\[[^\]]+\][^*]*\*\*/.test(l));
    const regularLines = allLines.filter(l => !/\*\*[^*]+\[[^\]]+\][^*]*\*\*/.test(l));
    // Neueste reguläre Einträge oben → erste 5 behalten, Rest destillieren
    const toDistill = regularLines.slice(5);
    if (toDistill.length > 0) {
      const raw = await callClaude(apiKey,
        'Reply ONLY with a pure JSON array, no Markdown.',
        `Distill these session log entries into compact memories.
Only what says something about the person (no pure tech operations).

Log entries:
${toDistill.join('\n')}

Format: [{"id":"mem_YYYYMMDD_slug","date":"YYYY-MM-DD","text":"Compact memory"}]`, 1000);
      const parsed = parseJson(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        existing.memories = deduplicateById(existingMemories, parsed, today);
      }
      const kept = [...agentLines, ...regularLines.slice(0, 5)];
      current = replaceSection(current, logHeading, kept.join('\n'));
      changed = true;
    } else if (agentLines.length > 0 && agentLines.length !== allLines.length) {
      const kept = [...agentLines, ...regularLines];
      current = replaceSection(current, logHeading, kept.join('\n'));
      changed = true;
    }
  }

  // ── 4. ideas — Feature-Ideen destillieren und Sektion leeren ─────────────────
  const ideasContent = extractSectionFull(current, 'Zukünftige Feature-Ideen für SYS');
  const ideasHasContent = ideasContent && !ideasContent.includes('Destilliert') && ideasContent.trim().length > 50;
  if (ideasHasContent) {
    const raw = await callClaude(apiKey,
      'Antworte NUR mit reinem JSON-Array, kein Markdown.',
      `Destilliere diese Feature-Ideen in kompakte JSON-Einträge. Nur Kernideen.

Inhalt:
${ideasContent.slice(0, 2000)}

Format: [{"id":"idea_slug","title":"Kurztitel","text":"Kernidee in 1-2 Sätzen","status":"idea|planned|done"}]`, 800);
    const parsed = parseJson(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      existing.ideas = deduplicateById(existingIdeas, parsed, today);
      current = replaceSection(current, 'Zukünftige Feature-Ideen für SYS', EMPTY_SECTION);
      changed = true;
    }
  }

  // ── 5. learnings — Offene Fragen / Erkenntnisse destillieren ─────────────────
  const learningsContent = extractSectionFull(current, 'Offene Fragen dieser Person');
  const learningsHasContent = learningsContent && !learningsContent.includes('Destilliert') && learningsContent.trim().length > 50;
  if (learningsHasContent) {
    const raw = await callClaude(apiKey,
      'Antworte NUR mit reinem JSON-Array, kein Markdown.',
      `Destilliere diese Erkenntnisse in kompakte Lerneinträge.

Inhalt:
${learningsContent.slice(0, 2000)}

Format: [{"id":"learn_slug","date":"YYYY-MM-DD","cat":"tech|arch|personal","text":"Erkenntnis"}]`, 800);
    const parsed = parseJson(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      existing.learnings = deduplicateById(existingLearnings, parsed, today);
      current = replaceSection(current, 'Offene Fragen dieser Person', EMPTY_SECTION);
      changed = true;
    }
  }

  // ── 6b. Food Log → health.md verschieben, Standort → LONGMEM Fact ──────────
  // Food Log: Einträge in vault/context/health.md anhängen, dann entfernen
  const foodContent = extractSectionFull(current, 'Food Log');
  if (foodContent && foodContent.trim().length > 0) {
    try {
      const healthPath = `${SOULS_DIR}${soulId}/vault/context/health.md`;
      let healthMd = await readFile(healthPath, 'utf8').catch(() => null);
      if (healthMd) {
        const foodLines = foodContent.split('\n').filter(l => l.trim());
        const foodIdx = healthMd.indexOf('\n## Food Log');
        if (foodIdx !== -1) {
          const insertAt = foodIdx + '\n## Food Log'.length;
          healthMd = healthMd.slice(0, insertAt) + '\n' + foodLines.join('\n') + healthMd.slice(insertAt);
        } else {
          healthMd += '\n\n## Food Log\n' + foodLines.join('\n') + '\n';
        }
        await writeFile(healthPath, healthMd, 'utf8');
        current = removeSection(current, 'Food Log');
        changed = true;
      }
    } catch { /* health.md nicht erreichbar → Food Log behalten */ }
  }

  // Standort / Wohnort → als location-Fact in LONGMEM, dann entfernen
  for (const h of ['Standort', 'Wohnort']) {
    const c = extractSectionFull(current, h);
    if (!c || c.trim().length === 0) continue;
    const existingLoc = (existing.facts ?? []).find(f => f.id === 'location');
    if (!existingLoc) {
      existing.facts = [...(existing.facts ?? []), {
        id: 'location', cat: 'identity',
        text: c.trim(),
        score: 4, since: today,
      }];
    }
    current = removeSection(current, h);
    changed = true;
  }

  // ── 6c. Dynamische Sektionen — unbekannte Sektionen mit Inhalt → Facts + entfernen
  const HANDLED = new Set([
    // Template sections (English)
    'Core Identity', 'Values & Beliefs', 'Aesthetics & Resonance', 'Worldview',
    'Recurring Themes & Obsessions', 'Emotional Signature', 'Language Patterns & Expression',
    'Open Questions', 'Future Feature Ideas for SYS',
    'Session Log', 'Session Log (compressed)',
    // Template sections (German legacy)
    'Kern-Identität', 'Werte & Überzeugungen', 'Ästhetik & Resonanz', 'Weltbild',
    'Wiederkehrende Themen & Obsessionen', 'Emotionale Signatur', 'Sprachmuster & Ausdruck',
    'Offene Fragen dieser Person', 'Zukünftige Feature-Ideen für SYS',
    'Session-Log', 'Session-Log (komprimiert)',
    // Preserved blocks — never touch
    'Sozialsphäre', 'Social Sphere', 'Agent-Sandbox', 'Agent Sandbox', 'Vault',
    // Already handled
    'Food Log', 'Standort', 'Wohnort',
  ]);
  for (const part of current.split(/\n(?=## )/)) {
    const hm = part.match(/^## (.+)\n/);
    if (!hm) continue;
    const fullHeading = hm[1].trim();
    const baseHeading = fullHeading.split(' — ')[0].trim().split(' (')[0].trim();
    if (HANDLED.has(fullHeading) || HANDLED.has(baseHeading)) continue;
    const content = part.slice(hm[0].length).trim();
    if (!content || content.includes('Noch nicht beschrieben') || content.length < 60) continue;
    const existingIds = (existing.facts ?? []).map(f => `${f.id}: "${f.text.slice(0, 50)}"`).join('\n');
    const rawDyn = await callClaude(apiKey,
      'Antworte NUR mit reinem JSON-Array, kein Markdown.',
      `Extrahiere stabile Fakten aus dieser Soul-Sektion. Nur zurückgeben was wirklich neu ist.
Bestehende Fakten (IDs wiederverwenden): ${existingIds || '—'}

## ${fullHeading}
${content.slice(0, 1500)}

Format: [{"id":"slug","cat":"identity|values|personality|project","text":"Fakt","score":5}]
Leeres Array [] wenn nichts Neues.`, 800);
    const parsedDyn = parseJson(rawDyn);
    if (parsedDyn === null) continue; // Claude-Call fehlgeschlagen → Sektion behalten
    if (Array.isArray(parsedDyn) && parsedDyn.length > 0) {
      existing.facts = deduplicateById(existing.facts ?? [], parsedDyn, today);
    }
    // Claude hat geantwortet (auch leeres Array = "nichts Neues") → Sektion entfernen
    current = removeSection(current, fullHeading);
    changed = true;
  }

  if (!changed) return;

  existing.v       = 1;
  existing.updated = today;

  const withLongmem = repairBlockEndTags(updateLongmem(current, existing));
  // MINDIDX direkt nach LONGMEM persistieren — einziger Ort, der den Index baut
  // (lazy/fehlertolerant: alle anderen Leser bauen bei Bedarf transparent neu)
  const withIndex = updateLongmemIndex(withLongmem, buildLongmemIndex(existing));
  await writeSoul(soulId, withIndex);

  const total = (existing.facts?.length ?? 0) + (existing.memories?.length ?? 0) +
                (existing.ideas?.length ?? 0) + (existing.learnings?.length ?? 0);
  await appendToSoulLog(soulId,
    `Kristallisation — ${total} Einträge im LONGMEM (${existing.facts?.length ?? 0} Fakten, ` +
    `${existing.memories?.length ?? 0} Erinnerungen, ${existing.ideas?.length ?? 0} Ideen, ` +
    `${existing.learnings?.length ?? 0} Erkenntnisse).`);
}

// ── Soul Health Check ─────────────────────────────────────────────────────────
// Läuft nur wenn KI-Auto aktiv + Heartbeat frisch (= User eingeloggt).
// Bewertet Unordnung und löst Kristallisation aus wenn nötig.

async function onSoulHealthCheck(soulId, soul, apiKey, state, chainLen) {
  const findings = [];

  // Session-Log: zu viele Einträge?
  const slHeading = resolveHeading(soul, 'Session Log', 'Session-Log');
  const slContent = extractSectionFull(soul, slHeading);
  const logLines  = slContent ? slContent.split('\n').filter(l => l.startsWith('- ')).length : 0;
  if (logLines > 8) findings.push(`${slHeading} (${logLines} entries)`);

  // LONGMEM Alter: letzte Kristallisation > 7 Tage?
  const lm = extractLongmem(soul);
  if (lm?.updated) {
    const ageDays = Math.floor((Date.now() - new Date(lm.updated).getTime()) / 86400000);
    if (ageDays > 7) findings.push(`LONGMEM (${ageDays} days old)`);
  } else if (!lm) {
    findings.push('LONGMEM missing');
  }

  // Kern-Sektionen: einzelne Sektion > 600 Zeichen?
  const CORE_SECTIONS_CHECK = [
    { en: 'Core Identity',                 de: 'Kern-Identität' },
    { en: 'Values & Beliefs',              de: 'Werte & Überzeugungen' },
    { en: 'Worldview',                     de: 'Weltbild' },
    { en: 'Recurring Themes & Obsessions', de: 'Wiederkehrende Themen & Obsessionen' },
  ];
  for (const { en, de } of CORE_SECTIONS_CHECK) {
    const h = resolveHeading(soul, en, de);
    const c = extractSectionFull(soul, h);
    if (c && c.length > 600) findings.push(`${h} (${c.length} chars)`);
  }

  // Offene Fragen / Feature-Ideen noch nicht destilliert?
  for (const [en, de] of [['Open Questions', 'Offene Fragen dieser Person'], ['Future Feature Ideas for SYS', 'Zukünftige Feature-Ideen für SYS']]) {
    const h = resolveHeading(soul, en, de);
    const c = extractSectionFull(soul, h);
    if (c && c.trim().length > 100 && !c.includes('Distilled') && !c.includes('Destilliert')) {
      findings.push(`${h} (not distilled)`);
    }
  }

  // LONGMEM Facts: zu viele Einträge?
  if ((lm?.facts?.length ?? 0) > 18) findings.push(`LONGMEM Facts (${lm.facts.length} — Dedup fällig)`);

  // Food Log in sys.md (gehört nach health.md)?
  const foodCheck = extractSectionFull(soul, 'Food Log');
  if (foodCheck && foodCheck.trim().length > 10) findings.push('Food Log (gehört nach health.md)');

  // Standort mit Inhalt (sollte nach LONGMEM)?
  for (const h of ['Standort', 'Wohnort']) {
    const c = extractSectionFull(soul, h);
    if (c && c.trim().length > 5) findings.push(`${h} (nicht nach LONGMEM übernommen)`);
  }

  // Unbekannte Sektionen mit Inhalt?
  const KNOWN_SECTIONS = new Set([
    // English
    'Core Identity', 'Values & Beliefs', 'Aesthetics & Resonance', 'Worldview',
    'Recurring Themes & Obsessions', 'Emotional Signature', 'Language Patterns & Expression',
    'Open Questions', 'Future Feature Ideas for SYS',
    'Session Log', 'Session Log (compressed)',
    // German legacy
    'Kern-Identität', 'Werte & Überzeugungen', 'Ästhetik & Resonanz', 'Weltbild',
    'Wiederkehrende Themen & Obsessionen', 'Emotionale Signatur', 'Sprachmuster & Ausdruck',
    'Offene Fragen dieser Person', 'Zukünftige Feature-Ideen für SYS',
    'Session-Log', 'Session-Log (komprimiert)',
    // Preserved
    'Sozialsphäre', 'Social Sphere', 'Agent-Sandbox', 'Agent Sandbox', 'Vault',
    'Food Log', 'Standort', 'Wohnort',
  ]);
  for (const part of soul.split(/\n(?=## )/)) {
    const hm = part.match(/^## (.+)\n/);
    if (!hm) continue;
    const fullH = hm[1].trim();
    const baseH = fullH.split(' — ')[0].trim().split(' (')[0].trim();
    if (KNOWN_SECTIONS.has(fullH) || KNOWN_SECTIONS.has(baseH)) continue;
    const content = part.slice(hm[0].length).trim();
    if (content && !content.includes('Destilliert') && content.length > 60) {
      findings.push(`Unknown section: "${fullH}"`);
    }
  }

  if (findings.length === 0) return;

  // Kristallisation noch nicht kürzlich gelaufen?
  const anchorsSince = chainLen - state.lastCrystallizeAnchor;
  const lmAge = lm?.updated
    ? Math.floor((Date.now() - new Date(lm.updated).getTime()) / 86400000)
    : 999;
  if (anchorsSince < 2 && lmAge < 2) return; // frisch genug, kein Handlungsbedarf

  const reason = findings.join(', ');
  await appendToSoulLog(soulId, `Health-Check: ${reason} → Kristallisation ausgelöst.`);
  await onCrystallize(soulId, soul, apiKey);
  state.lastCrystallizeAnchor = chainLen;
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

  // ── soul health check — max. 1× pro Stunde ───────────────────────────────────
  const HEALTH_CHECK_INTERVAL = 60 * 60 * 1000;
  if (now - state.lastHealthCheck > HEALTH_CHECK_INTERVAL) {
    state.lastHealthCheck = now;
    await onSoulHealthCheck(soulId, soul, apiKey, state, chainLen);
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

export async function herzEnsureAgentSocialBlocks(soulId) {
  const soul = await readSoul(soulId);
  if (!soul) return { ok: false, error: 'soul nicht lesbar' };

  function addSectionIfMissing(md, heading, content) {
    const re = new RegExp(`## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \t]*\n`);
    if (re.test(md)) return md;
    return md.trimEnd() + `\n\n## ${heading}\n${content}\n`;
  }

  let updated = soul;
  if (!updated.includes('<!-- SOCIAL:START -->')) {
    updated = addSectionIfMissing(updated, 'Sozialsphäre', '<!-- SOCIAL:START -->\n<!-- SOCIAL:END -->');
  }
  if (!updated.includes('<!-- AGENT:START -->')) {
    updated = addSectionIfMissing(updated, 'Agent-Sandbox', '<!-- AGENT:START -->\n<!-- AGENT:END -->');
  }

  if (updated === soul) return { ok: true, changed: false };
  await writeSoul(soulId, updated);
  return { ok: true, changed: true };
}
