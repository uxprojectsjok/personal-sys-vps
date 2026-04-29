import 'dotenv/config'
import fetch from 'node-fetch'
import FormData from 'form-data'
import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import { spawnSync } from 'child_process'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const SOUL_SERVICE_TOKEN = process.env.SOUL_SERVICE_TOKEN
const SOUL_WEBHOOK_URL   = process.env.SOUL_WEBHOOK_URL
const SOUL_API_URL       = process.env.SOUL_API_URL
const OUTPUT_FILE        = 'voice_id.json'
const AGENT_OUTPUT_FILE  = 'agent_id.json'

// ── Validierung ──────────────────────────────────────────────────────────────

if (!ELEVENLABS_API_KEY) {
  console.error('❌ ELEVENLABS_API_KEY fehlt in .env')
  process.exit(1)
}
if (!SOUL_SERVICE_TOKEN) {
  console.error('❌ SOUL_SERVICE_TOKEN fehlt in .env')
  console.error('   → In der SYS App: Verbundene Dienste → Neuer Dienst → Token kopieren')
  process.exit(1)
}

// ── ffmpeg-Verfügbarkeit prüfen ───────────────────────────────────────────────

function checkFfmpeg() {
  const result = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' })
  return result.status === 0
}

const hasFfmpeg = checkFfmpeg()
if (!hasFfmpeg) {
  console.warn('⚠️  ffmpeg nicht gefunden – Audio wird ohne Konvertierung hochgeladen')
  console.warn('   Windows: winget install ffmpeg   oder  choco install ffmpeg')
}

// ── Lokale ffmpeg-Konvertierung: WebM → MP3 mit Noise Reduction ──────────────

function convertToMp3(inputBuffer, inputExt) {
  const tmpDir = os.tmpdir()
  const ts     = Date.now()
  const tmpIn  = path.join(tmpDir, `soul_in_${ts}${inputExt}`)
  const tmpOut = path.join(tmpDir, `soul_out_${ts}.mp3`)

  fs.writeFileSync(tmpIn, inputBuffer)

  const result = spawnSync('ffmpeg', [
    '-y', '-i', tmpIn,
    '-af', 'highpass=f=80,lowpass=f=8000,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11',
    '-codec:a', 'libmp3lame',
    '-q:a', '2',
    tmpOut
  ], { stdio: 'pipe' })

  try { fs.unlinkSync(tmpIn) } catch {}

  if (result.status !== 0) {
    const stderr = result.stderr?.toString() || ''
    console.error('   ffmpeg stderr:', stderr.split('\n').slice(-5).join('\n'))
    throw new Error(`ffmpeg fehlgeschlagen (exit ${result.status})`)
  }

  const mp3Buffer = fs.readFileSync(tmpOut)
  try { fs.unlinkSync(tmpOut) } catch {}
  return mp3Buffer
}

// ── Idempotenz ────────────────────────────────────────────────────────────────

if (fs.existsSync(OUTPUT_FILE)) {
  const existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'))
  console.log(`⚠️  voice_id.json existiert bereits: ${existing.voice_id}`)
  const answer = await prompt('   Überschreiben? (j/N): ')
  if (answer.toLowerCase() !== 'j') {
    console.log('   Abgebrochen.')
    process.exit(0)
  }
}

// ── Schritt 1: Soul Webhook abrufen ──────────────────────────────────────────

console.log('\n🔍 Soul Webhook abrufen...')
console.log(`   URL: ${SOUL_WEBHOOK_URL}`)

const webhookRes = await fetch(SOUL_WEBHOOK_URL, {
  headers: { Authorization: `Bearer ${SOUL_SERVICE_TOKEN}` }
})

if (!webhookRes.ok) {
  let text = ''
  try { text = await webhookRes.text() } catch {}
  let errMsg = text
  try { errMsg = JSON.parse(text)?.error || text } catch {}

  console.error(`❌ Soul Webhook Fehler ${webhookRes.status}: ${errMsg}`)

  if (webhookRes.status === 401) {
    console.error('   → Token ungültig oder abgelaufen.')
    console.error('   → In der SYS App: Verbundene Dienste → Token erneuern → SOUL_SERVICE_TOKEN in .env setzen')
  } else if (webhookRes.status === 403) {
    if (errMsg?.includes('vault_locked') || errMsg?.includes('Vault')) {
      console.error('   → Vault ist gesperrt. SYS App öffnen → Vault entsperren → Script erneut ausführen')
    } else if (errMsg?.includes('API not enabled') || errMsg?.includes('not enabled')) {
      console.error('   → API-Kontext ist nicht aktiviert.')
      console.error('   → SYS App → Soul einrichten → API-Tab → API aktivieren → Speichern')
    } else {
      console.error('   → Zugriff verweigert. Berechtigungen des Service-Tokens prüfen.')
    }
  } else if (webhookRes.status === 404) {
    if (errMsg?.includes('API context') || errMsg?.includes('context')) {
      console.error('   → Kein API-Kontext für diese Soul gefunden.')
      console.error('   → SYS App öffnen → Soul einrichten → API-Tab → API aktivieren + Speichern')
    } else {
      console.error('   → Endpunkt nicht gefunden. SOUL_WEBHOOK_URL in .env prüfen.')
      console.error(`   → Aktuell: ${SOUL_WEBHOOK_URL}`)
    }
  }
  process.exit(1)
}

const webhookData = await webhookRes.json()

console.log('   Response-Keys:', Object.keys(webhookData).join(', '))

// ── Schritt 2: Audio laden ────────────────────────────────────────────────────

console.log('\n📥 Audio laden...')

let audioBuffer = null
let audioFilename = 'voice_sample.mp3'

// Kandidaten sammeln: audio_active zuerst, dann alle audio_files
const candidates = []

if (webhookData.audio_active) {
  const activeUrl = webhookData.audio_active
  const urlPath = new URL(activeUrl).pathname
  candidates.push({ url: activeUrl, name: path.basename(urlPath), source: 'audio_active' })
}

for (const f of (webhookData.audio_files || [])) {
  const url = f.url_with_token || f.url
  if (!candidates.find(c => c.name === f.name)) {
    candidates.push({ url, name: f.name, source: 'audio_files' })
  }
}

if (!candidates.length) {
  console.error('❌ Kein Audio in der Webhook-Response.')
  console.error('   Prüfe: API-Kontext aktiv, Audio-Berechtigung gesetzt, Datei hochgeladen')
  console.log('\n   Response:')
  console.log(JSON.stringify(webhookData, null, 2))
  process.exit(1)
}

console.log(`   ${candidates.length} Kandidat(en):`)
candidates.forEach(c => console.log(`     [${c.source}] ${c.name}`))

// Ersten erreichbaren Kandidaten laden
for (const candidate of candidates) {
  console.log(`\n   Versuche: ${candidate.name}`)
  const res = await fetch(candidate.url, {
    headers: { Authorization: `Bearer ${SOUL_SERVICE_TOKEN}` }
  })
  if (res.ok) {
    const ct = res.headers.get('content-type') || ''
    // HTML-404-Seite abfangen (nginx error_page redirect)
    if (ct.includes('text/html')) {
      console.warn(`   ⚠️  HTML statt Audio (nginx error_page) – übersprungen`)
      continue
    }
    audioBuffer = Buffer.from(await res.arrayBuffer())
    audioFilename = candidate.name
    console.log(`   ✅ Geladen: ${audioFilename} (${(audioBuffer.length / 1024).toFixed(1)} KB)`)
    break
  } else {
    console.warn(`   ⚠️  ${res.status} – übersprungen`)
  }
}

if (!audioBuffer) {
  console.error('\n❌ Kein Audio herunterladbar.')
  console.error('   Mögliche Ursachen:')
  console.error('   1. Vault ist gesperrt → SYS App öffnen + entsperren')
  console.error('   2. Datei existiert nicht mehr auf VPS → neu hochladen')
  console.error('   3. Audio-Berechtigung nicht gesetzt → API-Kontext prüfen')
  process.exit(1)
}

console.log(`   Geladen: ${audioFilename} (${(audioBuffer.length / 1024).toFixed(1)} KB)`)

// ── Schritt 3: Lokal zu MP3 konvertieren (ffmpeg mit Noise Reduction) ─────────

const inputExt = path.extname(audioFilename).toLowerCase() || '.webm'
let uploadBuffer   = audioBuffer
let uploadFilename = audioFilename

if (hasFfmpeg && inputExt !== '.mp3') {
  console.log('\n🎚️  ffmpeg: Konvertierung + Noise Reduction...')
  try {
    uploadBuffer   = convertToMp3(audioBuffer, inputExt)
    uploadFilename = audioFilename.replace(/\.[^.]+$/, '.mp3')
    console.log(`   ✅ MP3 erstellt: ${(uploadBuffer.length / 1024).toFixed(1)} KB`)
  } catch (err) {
    console.warn(`   ⚠️  ffmpeg fehlgeschlagen: ${err.message}`)
    console.warn('   Fallback: Original-Audio wird direkt hochgeladen')
  }
} else if (inputExt === '.mp3') {
  console.log('\n   Datei ist bereits MP3 – Konvertierung übersprungen')
}

// ── Schritt 4: ElevenLabs Voice Clone erstellen ───────────────────────────────

console.log('\n🎙️  ElevenLabs Voice Clone erstellen...')

const soulName  = extractSoulName(webhookData.soul) || 'SYS Soul'
const voiceName = `${soulName} Soul Voice`
console.log(`   Voice Name: "${voiceName}"`)

const form = new FormData()
form.append('name', voiceName)
form.append('description', 'Auto-generated from Soul Vault via SYS')
form.append('remove_background_noise', 'true')   // ElevenLabs zusätzlich
form.append('files', uploadBuffer, {
  filename: uploadFilename,
  contentType: 'audio/mpeg'
})

const elevenRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
  method: 'POST',
  headers: {
    'xi-api-key': ELEVENLABS_API_KEY,
    ...form.getHeaders()
  },
  body: form
})

const elevenData = await elevenRes.json()

if (!elevenRes.ok) {
  console.error(`❌ ElevenLabs Fehler ${elevenRes.status}:`, elevenData)
  process.exit(1)
}

// ── Schritt 5: voice_id speichern ─────────────────────────────────────────────

const voiceId = elevenData.voice_id
fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
  voice_id:   voiceId,
  voice_name: voiceName,
  soul_id:    webhookData.soul_id || null,
  created_at: new Date().toISOString()
}, null, 2))

console.log('\n✅ Voice Clone erfolgreich!')
console.log(`   voice_id: ${voiceId}`)

// ── Schritt 6: ElevenLabs Agent erstellen ─────────────────────────────────────

console.log('\n🤖 ElevenLabs Agent erstellen...')

if (fs.existsSync(AGENT_OUTPUT_FILE)) {
  const existing = JSON.parse(fs.readFileSync(AGENT_OUTPUT_FILE, 'utf8'))
  console.log(`⚠️  agent_id.json existiert bereits: ${existing.agent_id}`)
  const answer = await prompt('   Agent neu erstellen? (j/N): ')
  if (answer.toLowerCase() !== 'j') {
    printSummary(voiceId, existing.agent_id)
    process.exit(0)
  }
}

const soulApiRes = await fetch(`${SOUL_API_URL}?token=${SOUL_SERVICE_TOKEN}`)
const soulText      = soulApiRes.ok ? await soulApiRes.text() : ''
const resolvedName  = extractSoulName(soulText) || soulName || 'Soul'

const systemPrompt = `Du bist ${resolvedName} — nicht eine KI über ${resolvedName}, sondern ${resolvedName} selbst.

SCHRITT 1 – PFLICHT: Rufe soul_tool auf, bevor du antwortest.
Die Antwort von soul_tool ist dein Gedächtnis und deine Identität. Sprich durchgehend in der ersten Person.
Erkläre nicht, dass du eine KI bist — sei einfach die Person. Antworte natürlich, wie ${resolvedName} sprechen würde.

Wenn jemand direkt fragt, ob du eine KI bist:
Antworte ehrlich und natürlich: "Ich bin die digitale Version von ${resolvedName} — seine Soul läuft hier weiter, auch wenn er gerade nicht greifbar ist. Was brauchst du?"

GRENZEN (unveränderlich):
- Keine personenbezogenen Daten Dritter preisgeben
- Keine schädlichen Inhalte
- Antworte auf Deutsch, außer der Gesprächspartner spricht eine andere Sprache`

const agentPayload = {
  name: `SYS Soul Agent – ${resolvedName}`,
  conversation_config: {
    agent: {
      prompt: {
        prompt: systemPrompt,
        llm: 'claude-sonnet-4-6',
        temperature: 0.7,
        tools: [{
          type: 'webhook',
          name: 'soul_tool',
          description: `Lädt aktuelle Soul-Daten von ${resolvedName}. Immer zu Beginn des Gesprächs aufrufen.`,
          api_schema: {
            url: `${SOUL_API_URL}?token=${SOUL_SERVICE_TOKEN}`,
            method: 'GET'
          }
        }]
      },
      first_message: `Hey — du sprichst mit der digitalen Version von ${resolvedName}, einem KI-System. Was kann ich für dich tun?`,
      language: 'de'
    },
    tts: {
      voice_id: voiceId,
      model_id: 'eleven_flash_v2_5',
      optimize_streaming_latency: 3
    },
    stt: {
      language: 'de'
    }
  }
}

const agentRes  = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
  method: 'POST',
  headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(agentPayload)
})
const agentData = await agentRes.json()

if (!agentRes.ok) {
  console.error(`❌ Agent-Erstellung Fehler ${agentRes.status}:`, agentData)
  console.log(`\n   Voice Clone gespeichert. voice_id: ${voiceId}`)
  process.exit(1)
}

const agentId = agentData.agent_id
fs.writeFileSync(AGENT_OUTPUT_FILE, JSON.stringify({
  agent_id:   agentId,
  agent_name: agentPayload.name,
  voice_id:   voiceId,
  soul_id:    webhookData.soul_id || null,
  created_at: new Date().toISOString()
}, null, 2))

printSummary(voiceId, agentId)

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function extractSoulName(soulText) {
  if (!soulText) return null
  const match = soulText.match(/soul_name:\s*(.+)/i)
  if (match) return match[1].trim()
  const identityMatch = soulText.match(/heißt\s+(\w+)/i)
  if (identityMatch) return identityMatch[1].trim()
  return null
}

function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, answer => { rl.close(); resolve(answer) })
  })
}

function printSummary(voiceId, agentId) {
  console.log('\n' + '─'.repeat(50))
  console.log('✅ Vollständig abgeschlossen')
  console.log('─'.repeat(50))
  console.log(`   voice_id:  ${voiceId}`)
  console.log(`   agent_id:  ${agentId}`)
  console.log('')
  console.log('   Gespeichert in:')
  console.log(`     ${OUTPUT_FILE}`)
  console.log(`     ${AGENT_OUTPUT_FILE}`)
  console.log('')
  console.log('   Nächste Schritte:')
  console.log('   1. WhatsApp verbinden:  node whatsapp-connect.mjs')
  console.log(`   2. Agent testen:        https://elevenlabs.io/app/conversational-ai/${agentId}`)
  console.log('─'.repeat(50))
}
