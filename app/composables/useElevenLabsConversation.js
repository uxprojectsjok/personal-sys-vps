// app/composables/useElevenLabsConversation.js
// Sendet aufgenommenes Audio an den ElevenLabs Conversational AI Agent
// und liefert userText + agentText + audioBlob zurück.
//
// Protokoll: WSS wss://api.elevenlabs.io/v1/convai/conversation?conversation_token=…
// Input:  PCM 16-bit 16kHz mono (base64-Chunks über user_audio_chunk)
// Output: PCM base64-Chunks (audio_event) → WAV Blob

async function blobToPcm16k(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext({ sampleRate: 16000 })
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer)
    const channelData = decoded.getChannelData(0)
    const pcm = new Int16Array(channelData.length)
    for (let i = 0; i < channelData.length; i++) {
      const s = channelData[i]
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
    }
    return new Uint8Array(pcm.buffer)
  } finally {
    audioCtx.close()
  }
}

function pcmToWavBlob(base64Chunks, sampleRate = 16000) {
  const allBytes = []
  for (const b64 of base64Chunks) {
    const raw = atob(b64)
    for (let i = 0; i < raw.length; i++) allBytes.push(raw.charCodeAt(i))
  }
  const pcm = new Uint8Array(allBytes)
  const hdr = new ArrayBuffer(44)
  const v   = new DataView(hdr)
  const str = (off, s) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true)
  str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, pcm.length, true)
  return new Blob([hdr, pcm], { type: 'audio/wav' })
}

// ── Hauptfunktion ────────────────────────────────────────────────────────────
// blob       — aufgenommenes Audio (WebM/Opus oder MP4)
// soulCert   — Bearer-Token für /api/elevenlabs-token
// onStatus   — optionaler Callback (statusText: string)
// Gibt zurück: { userText, agentText, audioBlob }

export async function sendAudioToAgent(blob, { soulCert, onStatus } = {}) {
  onStatus?.('Verbindung wird hergestellt…')

  const tokenRes = await fetch('/api/elevenlabs-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${soulCert}` },
  })
  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}))
    throw new Error(err.message || 'token_error')
  }
  const { conversation_token } = await tokenRes.json()

  onStatus?.('Audio wird vorbereitet…')
  const pcmBytes = await blobToPcm16k(blob)

  onStatus?.('Agent verbunden…')

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://api.elevenlabs.io/v1/convai/conversation?conversation_token=${conversation_token}`
    )
    let userText    = ''
    let agentText   = ''
    let audioChunks = []
    let outputHz    = 16000
    let timer       = null

    function finish() {
      clearTimeout(timer)
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    }

    ws.onopen = () => {
      onStatus?.('Audio wird übertragen…')
      const CHUNK = 8192
      for (let off = 0; off < pcmBytes.length; off += CHUNK) {
        const slice = pcmBytes.subarray(off, off + CHUNK)
        let bin = ''
        for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i])
        ws.send(JSON.stringify({ user_audio_chunk: btoa(bin) }))
      }
      // Kurze Stille → VAD erkennt Sprechende
      const silence = new Uint8Array(3200) // 100 ms @ 16kHz, 2 bytes/sample
      let silBin = ''
      for (let i = 0; i < silence.length; i++) silBin += String.fromCharCode(silence[i])
      ws.send(JSON.stringify({ user_audio_chunk: btoa(silBin) }))

      // Sicherheits-Timeout 45 s
      timer = setTimeout(() => {
        const audioBlob = audioChunks.length ? pcmToWavBlob(audioChunks, outputHz) : null
        resolve({ userText, agentText, audioBlob })
        finish()
      }, 45000)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', event_id: msg.ping_event?.event_id }))
        } else if (msg.type === 'conversation_initiation_metadata') {
          const fmt = msg.conversation_initiation_metadata_event?.agent_output_audio_format
          if (fmt) { const m = String(fmt).match(/(\d{4,6})/); if (m) outputHz = parseInt(m[1]) }
          onStatus?.('Agent hört zu…')
        } else if (msg.type === 'user_transcript') {
          userText = msg.user_transcription_event?.user_transcript || ''
          onStatus?.(`Erkannt: "${userText}"`)
        } else if (msg.type === 'agent_response') {
          agentText = msg.agent_response_event?.agent_response || ''
          onStatus?.('Agent antwortet…')
        } else if (msg.type === 'audio') {
          if (msg.audio_event?.audio_base_64) {
            audioChunks.push(msg.audio_event.audio_base_64)
            // Nach letztem Audio-Chunk Verbindung kurz halten dann schließen
            clearTimeout(timer)
            timer = setTimeout(finish, 3000)
          }
        }
      } catch { /* ungültige JSON-Nachricht ignorieren */ }
    }

    ws.onerror = () => reject(new Error('Verbindungsfehler zum Agent'))

    ws.onclose = () => {
      clearTimeout(timer)
      const audioBlob = audioChunks.length ? pcmToWavBlob(audioChunks, outputHz) : null
      resolve({ userText, agentText, audioBlob })
    }
  })
}
