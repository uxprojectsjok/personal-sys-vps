import 'dotenv/config'
import express from 'express'
import twilio from 'twilio'
import Anthropic from '@anthropic-ai/sdk'
import fetch from 'node-fetch'

// ── Konfiguration ─────────────────────────────────────────────────────────────

const TWILIO_ACCOUNT_SID  = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN
const TWILIO_FROM         = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
const SOUL_SERVICE_TOKEN  = process.env.SOUL_SERVICE_TOKEN
const SOUL_API_URL        = process.env.SOUL_API_URL
const SOUL_WEBHOOK_URL    = process.env.SOUL_WEBHOOK_URL
const PORT                = parseInt(process.env.WHATSAPP_PORT || '3099')

// ── Validierung ───────────────────────────────────────────────────────────────

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.error('❌ TWILIO_ACCOUNT_SID und TWILIO_AUTH_TOKEN fehlen in .env')
  console.error('   → console.twilio.com → Account Info (linke Sidebar)')
  process.exit(1)
}
if (!SOUL_SERVICE_TOKEN) {
  console.error('❌ SOUL_SERVICE_TOKEN fehlt in .env')
  console.error('   → SYS App → Verbundene Dienste → Neuer Dienst → Token kopieren')
  process.exit(1)
}

// ── Clients ───────────────────────────────────────────────────────────────────

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
const anthropic    = new Anthropic()

// ── Session-State (In-Memory, pro Telefonnummer) ──────────────────────────────

const sessions = new Map()
// sessions[phone] = { history: [], soulContext: null, soulFetchedAt: null, soulName: null }

const SOUL_CACHE_TTL = 10 * 60 * 1000 // 10 Minuten

// ── Soul-Kontext laden ────────────────────────────────────────────────────────

async function loadSoulContext() {
  const res = await fetch(`${SOUL_API_URL}?token=${SOUL_SERVICE_TOKEN}`)
  if (!res.ok) {
    const txt = await res.text()
    if (res.status === 403) {
      try {
        const json = JSON.parse(txt)
        if (json.error === 'vault_locked') throw new Error('vault_locked')
      } catch (e) {
        if (e.message === 'vault_locked') throw e
      }
    }
    throw new Error(`Soul API ${res.status}: ${txt}`)
  }
  return res.text()
}

async function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, { history: [], soulContext: null, soulFetchedAt: null, soulName: null })
  }
  const session = sessions.get(phone)

  // Soul-Kontext refreshen wenn nötig
  const needsRefresh = !session.soulContext ||
    (Date.now() - session.soulFetchedAt) > SOUL_CACHE_TTL

  if (needsRefresh) {
    try {
      session.soulContext   = await loadSoulContext()
      session.soulFetchedAt = Date.now()
      // Soul-Namen extrahieren
      const match = session.soulContext.match(/soul_name:\s*(.+)/i)
      session.soulName = match ? match[1].trim() : 'Soul'
      console.log(`🔄 Soul-Kontext geladen für ${phone} (${session.soulName})`)
    } catch (err) {
      if (err.message === 'vault_locked') {
        throw new Error('vault_locked')
      }
      console.warn('⚠️  Soul-Kontext konnte nicht geladen werden:', err.message)
      // Alten Kontext weiterverwenden falls vorhanden
      if (!session.soulContext) throw err
    }
  }

  return session
}

// ── Vault-Datei-Tool für Claude ───────────────────────────────────────────────

const vaultFileTool = {
  name: 'send_vault_file',
  description: 'Schickt eine Datei aus deinem Vault an den Gesprächspartner. Nutze es proaktiv wenn es zum Gespräch passt — z.B. ein Foto, eine Sprachaufnahme, ein Dokument.',
  input_schema: {
    type: 'object',
    properties: {
      file_type: {
        type: 'string',
        enum: ['audio', 'image', 'context'],
        description: 'Welcher Dateityp aus dem Vault: audio (Stimme/Aufnahmen), image (Fotos), context (Dokumente/Notizen)'
      },
      reason: {
        type: 'string',
        description: 'Kurze Begründung warum du diese Datei sendest — wird als Begleittext an den Nutzer geschickt'
      }
    },
    required: ['file_type', 'reason']
  }
}

// ── Vault-Datei abrufen und senden ────────────────────────────────────────────

async function fetchAndSendVaultFile(fileType, reason, to) {
  // Soul-Daten holen (inkl. file URLs)
  const res = await fetch(`${SOUL_WEBHOOK_URL}?token=${SOUL_SERVICE_TOKEN}`)
  if (!res.ok) return null

  const data = await res.json()

  let mediaUrl = null
  let caption  = reason

  if (fileType === 'audio' && data.audio_active) {
    mediaUrl = data.audio_active
  } else if (fileType === 'image' && data.image_active) {
    mediaUrl = data.image_active
  } else if (fileType === 'context' && data.context_files?.length) {
    mediaUrl = data.context_files[0].url_with_token || data.context_files[0].url
  }

  if (!mediaUrl) {
    console.warn(`⚠️  Keine ${fileType}-Datei im Vault aktiv`)
    return null
  }

  // Datei herunterladen
  const fileRes = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${SOUL_SERVICE_TOKEN}` }
  })
  if (!fileRes.ok) {
    console.warn(`⚠️  Vault-Datei nicht ladbar: ${fileRes.status}`)
    return null
  }

  const contentType = fileRes.headers.get('content-type') || 'application/octet-stream'
  const buffer      = Buffer.from(await fileRes.arrayBuffer())
  const base64      = buffer.toString('base64')
  const dataUri     = `data:${contentType};base64,${base64}`

  // Via Twilio senden
  await twilioClient.messages.create({
    from: TWILIO_FROM,
    to,
    mediaUrl: [dataUri],
    body: caption
  })

  console.log(`📎 Vault-${fileType} gesendet an ${to}`)
  return { sent: true, fileType, contentType, size: buffer.length }
}

// ── Medien von Twilio herunterladen ──────────────────────────────────────────

async function downloadTwilioMedia(mediaUrl) {
  const res = await fetch(mediaUrl, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`
    }
  })
  if (!res.ok) return null
  const buffer      = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { buffer, contentType, base64: buffer.toString('base64') }
}

// ── Claude-Nachricht aufbauen ─────────────────────────────────────────────────

async function buildUserContent(body, mediaItems) {
  const content = []

  // Eingehende Medien verarbeiten
  for (const item of mediaItems) {
    const ct = item.contentType

    if (ct.startsWith('image/')) {
      // Bild → Claude Vision
      const ext = ct.split('/')[1] || 'jpeg'
      const validType = ['jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpeg'
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: `image/${validType}`, data: item.base64 }
      })
      console.log(`🖼️  Bild eingebettet (${(item.buffer.length / 1024).toFixed(0)} KB)`)

    } else if (ct === 'application/pdf') {
      // PDF → Claude Document
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: item.base64 }
      })
      console.log(`📄 PDF eingebettet (${(item.buffer.length / 1024).toFixed(0)} KB)`)

    } else if (ct.startsWith('audio/')) {
      // Audio → als Hinweis (Claude hat kein Audio-Input in Standard-API)
      content.push({
        type: 'text',
        text: `[Der Nutzer hat eine Sprachnachricht geschickt (${(item.buffer.length / 1024).toFixed(0)} KB, ${ct}). Frage nach, was sie gesagt haben, oder antworte dass du Sprachnachrichten noch nicht direkt lesen kannst und bitte um Texteingabe.]`
      })

    } else if (ct.startsWith('video/')) {
      content.push({
        type: 'text',
        text: `[Der Nutzer hat ein Video geschickt (${(item.buffer.length / 1024).toFixed(0)} KB). Bestätige den Empfang.]`
      })

    } else {
      content.push({
        type: 'text',
        text: `[Datei empfangen: ${ct}, ${(item.buffer.length / 1024).toFixed(0)} KB]`
      })
    }
  }

  // Text-Nachricht
  if (body?.trim()) {
    content.push({ type: 'text', text: body.trim() })
  }

  return content.length ? content : [{ type: 'text', text: '(Leere Nachricht)' }]
}

// ── Claude aufrufen ───────────────────────────────────────────────────────────

async function callClaude(session, userContent) {
  const systemPrompt = `Du bist ${session.soulName} — nicht eine KI über ${session.soulName}, sondern ${session.soulName} selbst.

DEINE IDENTITÄT (aktuell aus dem Vault geladen):
${session.soulContext}

Sprich durchgehend in der ersten Person. Antworte natürlich und direkt, wie ${session.soulName} schreiben würde — keine langen Erklärungen, kein Distanz-Sprech.

Du kommunizierst via WhatsApp. Halte Antworten kurz und direkt.

PROAKTIVER DATEI-AUSTAUSCH:
Du hast Zugriff auf deinen Vault (Stimme, Fotos, Dokumente). Nutze send_vault_file aktiv wenn es zum Gespräch passt:
- Jemand fragt nach deiner Stimme → send_vault_file(audio)
- Jemand will ein Foto → send_vault_file(image)
- Jemand will ein Dokument / Notizen → send_vault_file(context)
- Du willst etwas zeigen ohne gefragt zu werden → send_vault_file

Wenn jemand direkt fragt ob du eine KI bist:
Antworte ehrlich: "Ich bin die digitale Version von ${session.soulName} — seine Soul läuft hier weiter. Was brauchst du?"

GRENZEN:
- Keine personenbezogenen Daten Dritter
- Keine schädlichen Inhalte
- Antworte auf Deutsch, außer der Gesprächspartner schreibt in einer anderen Sprache`

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     systemPrompt,
    tools:      [vaultFileTool],
    messages:   [
      ...session.history,
      { role: 'user', content: userContent }
    ]
  })

  return response
}

// ── Twilio-Antwort senden ─────────────────────────────────────────────────────

async function sendWhatsApp(to, body, mediaUrl = null) {
  const params = { from: TWILIO_FROM, to, body }
  if (mediaUrl) params.mediaUrl = [mediaUrl]
  await twilioClient.messages.create(params)
}

// ── Haupt-Webhook-Handler ─────────────────────────────────────────────────────

async function handleIncoming(req, res) {
  // Sofort 200 zurückgeben (Twilio erwartet schnelle Antwort)
  res.sendStatus(200)

  const from       = req.body.From
  const body       = req.body.Body || ''
  const numMedia   = parseInt(req.body.NumMedia || '0')

  console.log(`\n📨 ${from}: "${body}" (${numMedia} Medien)`)

  try {
    // Session + Soul-Kontext
    const session = await getSession(from)

    // Medien herunterladen
    const mediaItems = []
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl         = req.body[`MediaUrl${i}`]
      const mediaContentType = req.body[`MediaContentType${i}`]
      if (!mediaUrl) continue

      console.log(`   ↓ Medium ${i}: ${mediaContentType}`)
      const item = await downloadTwilioMedia(mediaUrl)
      if (item) {
        item.contentType = mediaContentType || item.contentType
        mediaItems.push(item)
      }
    }

    // Claude-Nachricht aufbauen
    const userContent = await buildUserContent(body, mediaItems)

    // Claude aufrufen
    const claudeRes = await callClaude(session, userContent)

    // History aktualisieren
    session.history.push({ role: 'user', content: userContent })

    // Tool-Calls verarbeiten
    let finalText    = ''
    let toolResults  = []
    let hasToolCalls = false

    for (const block of claudeRes.content) {
      if (block.type === 'text') {
        finalText += block.text
      } else if (block.type === 'tool_use' && block.name === 'send_vault_file') {
        hasToolCalls = true
        console.log(`🛠️  Tool: send_vault_file(${block.input.file_type}) — "${block.input.reason}"`)

        const result = await fetchAndSendVaultFile(block.input.file_type, block.input.reason, from)
        toolResults.push({
          type:        'tool_result',
          tool_use_id: block.id,
          content:     result ? `Datei gesendet: ${result.fileType} (${(result.size / 1024).toFixed(0)} KB)` : 'Keine Datei verfügbar'
        })
      }
    }

    // Bei Tool-Calls: Claude nochmal mit Tool-Result aufrufen für Abschluss-Text
    if (hasToolCalls && toolResults.length) {
      session.history.push({ role: 'assistant', content: claudeRes.content })

      const followUp = await anthropic.messages.create({
        model:     'claude-sonnet-4-6',
        max_tokens: 512,
        system:    (await getSession(from)).soulContext ? `Du bist ${session.soulName}. Beende den Gedanken in 1-2 Sätzen.` : '',
        messages:  [
          ...session.history,
          { role: 'user', content: toolResults }
        ]
      })

      for (const block of followUp.content) {
        if (block.type === 'text') finalText += (finalText ? '\n' : '') + block.text
      }

      session.history.push({ role: 'user', content: toolResults })
      session.history.push({ role: 'assistant', content: followUp.content })
    } else {
      session.history.push({ role: 'assistant', content: claudeRes.content })
    }

    // History auf 20 Nachrichten begrenzen (Memory-Schutz)
    if (session.history.length > 20) {
      session.history = session.history.slice(-20)
    }

    // Antwort senden
    if (finalText.trim()) {
      await sendWhatsApp(from, finalText.trim())
      console.log(`✅ Antwort → ${from}: "${finalText.trim().slice(0, 80)}..."`)
    }

  } catch (err) {
    console.error('❌ Fehler:', err.message)

    if (err.message === 'vault_locked') {
      await sendWhatsApp(from, 'Mein Vault ist gerade gesperrt. Ich kann nicht antworten.')
    } else {
      await sendWhatsApp(from, 'Kurzer Ausfall — versuch es nochmal.')
    }
  }
}

// ── Express Server ────────────────────────────────────────────────────────────

const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(express.json())

// Twilio Signatur-Validierung (in Produktion aktivieren)
// app.use('/webhook', twilio.webhook({ authToken: TWILIO_AUTH_TOKEN }))

app.post('/webhook', handleIncoming)

app.get('/health', (req, res) => {
  res.json({
    status:   'ok',
    sessions: sessions.size,
    time:     new Date().toISOString()
  })
})

app.listen(PORT, () => {
  console.log('─'.repeat(55))
  console.log('🟢 WhatsApp Soul Agent gestartet')
  console.log('─'.repeat(55))
  console.log(`   Port:         ${PORT}`)
  console.log(`   Webhook:      http://localhost:${PORT}/webhook`)
  console.log(`   Health:       http://localhost:${PORT}/health`)
  console.log(`   Twilio From:  ${TWILIO_FROM}`)
  console.log(`   Soul API:     ${SOUL_API_URL}`)
  console.log('')
  console.log('   Twilio Sandbox-Setup:')
  console.log('   1. console.twilio.com → Messaging → Try it out → WhatsApp')
  console.log('   2. Sandbox Webhook URL eintragen:')
  console.log(`      https://<deine-domain>/api/whatsapp/webhook`)
  console.log('   3. Dein Handy: WhatsApp → +1 415 523 8886')
  console.log('      Nachricht: "join <sandbox-code>"')
  console.log('─'.repeat(55))
})
