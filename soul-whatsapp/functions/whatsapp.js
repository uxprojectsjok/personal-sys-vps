'use strict'
// Twilio Function – WhatsApp Soul Agent
// Deployed via: twilio serverless:deploy
// Env vars:  SOUL_API_URL, SOUL_WEBHOOK_URL, SOUL_SERVICE_TOKEN,
//            TWILIO_WHATSAPP_FROM, ANTHROPIC_API_KEY

const Anthropic = require('@anthropic-ai/sdk')

// ── Soul-Kontext laden ────────────────────────────────────────────────────────

async function loadSoul(context) {
  const url = `${context.SOUL_API_URL}?token=${context.SOUL_SERVICE_TOKEN}`
  const res  = await fetch(url)

  if (res.status === 403) throw new Error('vault_locked')
  if (!res.ok)           throw new Error(`Soul API ${res.status}`)

  const text      = await res.text()
  const nameMatch = text.match(/soul_name:\s*(.+)/i)
  const name      = nameMatch ? nameMatch[1].trim() : 'Soul'
  return { text, name }
}

// ── Medien von Twilio herunterladen ──────────────────────────────────────────

async function downloadMedia(url, accountSid, authToken) {
  const creds = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const res   = await fetch(url, { headers: { Authorization: `Basic ${creds}` } })
  if (!res.ok) return null
  return {
    buffer:      Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream'
  }
}

// ── Eingehende Medien als Claude-Content aufbereiten ─────────────────────────

async function buildMediaContent(event, context) {
  const items      = []
  const numMedia   = parseInt(event.NumMedia || '0')
  let   needSonnet = false

  for (let i = 0; i < numMedia; i++) {
    const mediaUrl = event[`MediaUrl${i}`]
    const ct       = event[`MediaContentType${i}`] || ''

    if (ct.startsWith('image/')) {
      const file = await downloadMedia(mediaUrl, context.TWILIO_ACCOUNT_SID, context.TWILIO_AUTH_TOKEN)
      if (file) {
        const ext  = ct.split('/')[1] || 'jpeg'
        const safe = ['jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpeg'
        items.push({
          type:   'image',
          source: { type: 'base64', media_type: `image/${safe}`, data: file.buffer.toString('base64') }
        })
        needSonnet = true
      }

    } else if (ct === 'application/pdf') {
      const file = await downloadMedia(mediaUrl, context.TWILIO_ACCOUNT_SID, context.TWILIO_AUTH_TOKEN)
      if (file) {
        items.push({
          type:   'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.buffer.toString('base64') }
        })
        needSonnet = true
      }

    } else if (ct.startsWith('audio/')) {
      items.push({ type: 'text', text: '[Sprachnachricht — bitte als Text schreiben]' })

    } else if (ct.startsWith('video/')) {
      items.push({ type: 'text', text: '[Video erhalten]' })

    } else {
      items.push({ type: 'text', text: `[Datei: ${ct}]` })
    }
  }

  return { items, needSonnet }
}

// ── Vault-Datei via Soul-Webhook-URL senden ───────────────────────────────────

async function sendVaultFile(context, client, to, fileType) {
  try {
    const url = `${context.SOUL_WEBHOOK_URL}?token=${context.SOUL_SERVICE_TOKEN}`
    const res  = await fetch(url)
    if (!res.ok) return

    const data     = await res.json()
    let   mediaUrl = null

    if (fileType === 'audio')   mediaUrl = data.audio_active
    if (fileType === 'image')   mediaUrl = data.image_active
    if (fileType === 'context') mediaUrl = data.context_files?.[0]?.url_with_token

    // Twilio fetcht die URL direkt – Token ist bereits im Query-String eingebettet
    if (!mediaUrl) return

    await client.messages.create({
      from:     context.TWILIO_WHATSAPP_FROM,
      to,
      mediaUrl: [mediaUrl]
    })
  } catch (err) {
    console.error('sendVaultFile:', err.message)
  }
}

// ── Haupt-Handler ─────────────────────────────────────────────────────────────

exports.handler = async function (context, event, callback) {
  const twiml  = new Twilio.twiml.MessagingResponse()
  const client = context.getTwilioClient()
  const from   = event.From
  const body   = (event.Body || '').trim()

  try {
    // Soul laden
    const soul = await loadSoul(context)

    // Medien aufbereiten
    const { items: mediaItems, needSonnet } = await buildMediaContent(event, context)

    // Nachricht zusammenbauen
    const userContent = [...mediaItems]
    if (body) userContent.push({ type: 'text', text: body })
    if (!userContent.length) userContent.push({ type: 'text', text: '(Leere Nachricht)' })

    // System-Prompt
    const systemPrompt =
`Du bist ${soul.name} — nicht eine KI über ${soul.name}, sondern ${soul.name} selbst.

DEINE IDENTITÄT (aktuell aus dem Vault):
${soul.text}

Antworte kurz und direkt – du kommunizierst via WhatsApp.
Erste Person, natürlich, wie ${soul.name} schreiben würde.

VAULT-DATEIEN PROAKTIV SENDEN:
Du hast Stimme, Fotos und Dokumente im Vault. Schreibe am Ende deiner Antwort exakt eine Zeile:
  [SEND:audio]    – wenn du eine Aufnahme schickst
  [SEND:image]    – wenn du ein Foto schickst
  [SEND:context]  – wenn du ein Dokument/eine Notiz schickst
Nutze es aktiv, wenn es zum Gespräch passt.

Wenn jemand fragt ob du eine KI bist:
"Ich bin die digitale Version von ${soul.name} — seine Soul läuft hier weiter. Was brauchst du?"

Antworte auf Deutsch, außer der Gesprächspartner schreibt in einer anderen Sprache.`

    // Claude aufrufen – Haiku für Text, Sonnet wenn Bild/PDF dabei
    const model    = needSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001'
    const ai       = new Anthropic({ apiKey: context.ANTHROPIC_API_KEY })
    const response = await ai.messages.create({
      model,
      max_tokens: 512,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }]
    })

    // Text + [SEND:*] extrahieren
    let text     = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
    const sendMatch = text.match(/\[SEND:(audio|image|context)\]/i)
    const sendType  = sendMatch ? sendMatch[1].toLowerCase() : null
    text = text.replace(/\[SEND:(audio|image|context)\]/gi, '').trim()

    // Antwort senden
    if (text) {
      await client.messages.create({ from: context.TWILIO_WHATSAPP_FROM, to: from, body: text })
    }

    // Vault-Datei senden falls Claude es entschieden hat
    if (sendType) {
      await sendVaultFile(context, client, from, sendType)
    }

  } catch (err) {
    console.error('Handler-Fehler:', err.message)
    const errMsg = err.message === 'vault_locked'
      ? 'Mein Vault ist gerade gesperrt – ich kann nicht antworten.'
      : 'Kurzer Ausfall – versuch es nochmal.'
    try {
      await client.messages.create({ from: context.TWILIO_WHATSAPP_FROM, to: from, body: errMsg })
    } catch {}
  }

  callback(null, twiml)
}
