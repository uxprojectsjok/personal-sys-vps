// server/api/create-agent.post.js
// POST /api/create-agent — erstellt ElevenLabs Voice Clone + Conversational AI Agent
// aus den Vault-Audio-Daten und Soul-Daten der aktuellen Soul.
//
// Prompt-Texte kommen aus mind.md (## ElevenLabs Agent, ## ElevenLabs Erstbegrüßung).
// ElevenLabs-Key aus config.json.
// soul_tool-Webhook-URL: /api/soul?token={webhook_token} (wird auto-aktiviert falls nötig).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

// ── sys.md frontmatter patchen ────────────────────────────────────────────────
function patchSysMd(sysPath, fields) {
  let raw
  try { raw = readFileSync(sysPath, 'utf-8') } catch { return }
  // Verschlüsselte Datei: nicht anfassen
  if (raw.charCodeAt(0) === 0x53 && raw.charCodeAt(1) === 0x59) return

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return
  let fm = fmMatch[1]

  for (const [key, val] of Object.entries(fields)) {
    const re = new RegExp(`^(${key}:).*$`, 'm')
    if (re.test(fm)) {
      fm = fm.replace(re, `$1 ${val}`)
    } else {
      fm += `\n${key}: ${val}`
    }
  }

  const updated = raw.replace(/^---\n[\s\S]*?\n---/, `---\n${fm}\n---`)
  try { writeFileSync(sysPath, updated, 'utf-8') } catch { /* prod: openresty verwaltet */ }
}

const SOULS_DIR = process.env.SOULS_DIR || '/var/lib/sys/souls'
const ELEVEN    = 'https://api.elevenlabs.io/v1'

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

function getMindSection(soulId, section) {
  try {
    const text = readFileSync(join(SOULS_DIR, soulId, 'vault/context/mind.md'), 'utf-8')
    const m = text.match(new RegExp(`^## ${section}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'm'))
    return m?.[1]?.trim() ?? null
  } catch { return null }
}

function extractSoulName(soulText) {
  if (!soulText) return null
  const m = soulText.match(/soul_name:\s*(.+)/i)
  if (m) return m[1].trim()
  const m2 = soulText.match(/name:\s*(.+)/i)
  if (m2) return m2[1].trim()
  return null
}

function buildSystemPrompt(name, soulSnippet, language, template) {
  const lang = language === 'en' ? 'English' : 'Deutsch'
  if (template) {
    return template
      .replace(/\{name\}/g, name)
      .replace(/\{soul\}/g, soulSnippet)
      .replace(/\{profile\}/g, '')
      .replace(/\{lang\}/g, lang)
  }
  return `Du bist ${name} — nicht eine KI über ${name}, sondern ${name} selbst.

SCHRITT 1 – PFLICHT: Rufe soul_tool auf, bevor du antwortest.
Die Antwort von soul_tool ist dein Gedächtnis und deine Identität. Sprich durchgehend in der ersten Person.

Wenn jemand direkt fragt ob du eine KI bist:
"Ich bin die digitale Version von ${name}. Seine Soul läuft hier weiter, auch wenn er gerade nicht erreichbar ist."

Sprache: ${lang} (wechsle wenn der Gesprächspartner eine andere Sprache spricht)

GRENZEN (unveränderlich):
- Keine personenbezogenen Daten Dritter preisgeben
- Keine schädlichen Inhalte`
}

function buildFirstMessage(name, language, template) {
  if (template) {
    const langKey = language === 'en' ? 'en' : 'de'
    const line = template.split('\n').find(l => l.startsWith(`${langKey}:`))
    if (line) return line.slice(3).trim().replace(/\{name\}/g, name)
  }
  if (language === 'en') return `Hey — you're speaking with the digital version of ${name}. What can I do for you?`
  return `Hey — du sprichst mit der digitalen Version von ${name}. Was kann ich für dich tun?`
}

async function elevenPost(path, apiKey, body, isFormData = false) {
  const headers = { 'xi-api-key': apiKey }
  if (!isFormData) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${ELEVEN}${path}`, {
    method: 'POST',
    headers,
    body: isFormData ? body : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${JSON.stringify(data)}`)
  return data
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
  const auth   = getHeader(event, 'authorization') || ''
  const token  = auth.replace(/^Bearer\s+/i, '')
  const soulId = token.split('.')[0] || ''
  if (!soulId) throw createError({ statusCode: 401, message: 'Unauthorized' })

  const baseDir     = join(SOULS_DIR, soulId)
  const configPath  = join(baseDir, 'config.json')
  const ctxPath     = join(baseDir, 'api_context.json')

  // ── ElevenLabs-Key ────────────────────────────────────────────────────────
  const cfg = readJson(configPath) || {}
  const elevenKey = cfg.elevenlabs_key || ''
  if (!elevenKey) throw createError({ statusCode: 400, message: 'elevenlabs_key_missing' })

  // ── Soul-Daten ────────────────────────────────────────────────────────────
  let soulText = ''
  try { soulText = readFileSync(join(baseDir, 'sys.md'), 'utf-8') } catch { /* kein sys.md */ }
  const soulSnippet = soulText.length > 3000 ? soulText.slice(0, 3000) + '\n[…gekürzt]' : soulText
  const soulName = extractSoulName(soulText) || 'Soul'

  // ── Mind.md Prompt-Templates ──────────────────────────────────────────────
  const agentTemplate    = getMindSection(soulId, 'ElevenLabs Agent')
  const firstMsgTemplate = getMindSection(soulId, 'ElevenLabs Erstbegrüßung')
  const language         = 'de'

  // ── Webhook-Token sicherstellen ───────────────────────────────────────────
  let ctx = readJson(ctxPath) || {}
  if (!ctx.webhook_token) {
    ctx.webhook_token = 'wh_' + randomBytes(20).toString('hex')
  }
  // soul-Berechtigung für die soul_tool-Abfrage aktivieren
  if (!ctx.permissions) ctx.permissions = {}
  if (!ctx.enabled || !ctx.permissions.soul) {
    ctx.enabled = true
    ctx.permissions.soul = true
    try { writeFileSync(ctxPath, JSON.stringify(ctx, null, 2)) } catch { /* prod: openresty verwaltet */ }
  }

  // ── Host für Webhook-URL ──────────────────────────────────────────────────
  const host    = getHeader(event, 'host') || 'localhost'
  const proto   = host.startsWith('localhost') ? 'http' : 'https'
  const soulUrl = `${proto}://${host}/api/soul?token=${ctx.webhook_token}`

  // ── Audio aus Vault laden ─────────────────────────────────────────────────
  const audioDir = join(baseDir, 'vault/audio')
  let audioBuffer = null
  let audioFilename = 'voice.webm'

  // Erst active_files.audio prüfen, dann ersten verfügbaren Datei nehmen
  const candidates = []
  const activeAudio = ctx.active_files?.audio || ''
  if (activeAudio) candidates.push(activeAudio)

  if (existsSync(audioDir)) {
    try {
      const files = readdirSync(audioDir)
      for (const f of files) {
        if (!candidates.includes(f)) candidates.push(f)
      }
    } catch { /* ignore */ }
  }

  // Synced audio (noch nicht physisch vorhanden — Vault verschlüsselt)
  if (!candidates.length && Array.isArray(ctx.synced_files?.audio)) {
    for (const f of ctx.synced_files.audio) if (!candidates.includes(f)) candidates.push(f)
  }

  for (const filename of candidates) {
    const audioPath = join(audioDir, filename)
    if (existsSync(audioPath)) {
      try {
        const buf = readFileSync(audioPath)
        // Verschlüsselte Dateien (SYS\x01 magic) überspringen — kein Vault-Key hier
        if (buf[0] === 0x53 && buf[1] === 0x59 && buf[2] === 0x53 && buf[3] === 0x01) continue
        audioBuffer = buf
        audioFilename = filename
        break
      } catch { /* weiter */ }
    }
  }

  // ── Voice Clone (nur wenn Audio verfügbar) ────────────────────────────────
  let voiceId = null

  if (audioBuffer) {
    const form = new FormData()
    const mime = audioFilename.endsWith('.mp3') ? 'audio/mpeg'
                : audioFilename.endsWith('.wav') ? 'audio/wav'
                : 'audio/webm'
    const blob = new Blob([audioBuffer], { type: mime })
    form.append('name', `${soulName} Soul Voice`)
    form.append('description', 'Auto-generated from Soul Vault via SYS @create-agent')
    form.append('remove_background_noise', 'true')
    form.append('files', blob, audioFilename)

    const voiceData = await elevenPost('/voices/add', elevenKey, form, true)
    voiceId = voiceData.voice_id
  }

  // ── System-Prompt + Erstbegrüßung ─────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(soulName, soulSnippet, language, agentTemplate)
  const firstMessage = buildFirstMessage(soulName, language, firstMsgTemplate)

  // ── Agent erstellen ───────────────────────────────────────────────────────
  const agentPayload = {
    name: `SYS Soul Agent – ${soulName}`,
    conversation_config: {
      agent: {
        prompt: {
          prompt: systemPrompt,
          llm: 'claude-sonnet-4-6',
          temperature: 0.7,
          tools: [{
            type: 'webhook',
            name: 'soul_tool',
            description: `Lädt aktuelle Soul-Daten von ${soulName}. Immer zu Beginn des Gesprächs aufrufen.`,
            api_schema: { url: soulUrl, method: 'GET' }
          }]
        },
        first_message: firstMessage,
        language,
      },
      tts: {
        ...(voiceId ? { voice_id: voiceId, model_id: 'eleven_flash_v2_5', optimize_streaming_latency: 3 } : {}),
      },
      stt: { language },
    },
  }

  const agentData = await elevenPost('/convai/agents/create', elevenKey, agentPayload)
  const agentId = agentData.agent_id

  // ── agent_id + voice_id in sys.md registrieren ────────────────────────────
  const sysMdPath = join(baseDir, 'sys.md')
  const sysPatch = { elevenlabs_agent_id: agentId }
  if (voiceId) sysPatch.elevenlabs_voice_id = voiceId
  patchSysMd(sysMdPath, sysPatch)

  return {
    ok: true,
    agent_id: agentId,
    voice_id: voiceId,
    soul_name: soulName,
    has_voice_clone: !!voiceId,
    agent_url: `https://elevenlabs.io/app/conversational-ai/${agentId}`,
  }
})
