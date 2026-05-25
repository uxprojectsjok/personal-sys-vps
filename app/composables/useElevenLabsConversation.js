// app/composables/useElevenLabsConversation.js
// Sendet aufgenommenes Audio an den ElevenLabs Conversational AI Agent
// und liefert userText + agentText + audioBlob zurück.
//
// Protokoll: WSS wss://api.elevenlabs.io/v1/convai/conversation?agent_id=…
// Input:  PCM 16-bit 16kHz mono (base64-Chunks über user_audio_chunk)
// Output: PCM base64-Chunks (audio_event) → WAV Blob

async function blobToPcm16k(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  // Decode at the browser's native sample rate first (more reliable cross-browser)
  const decodeCtx = new AudioContext()
  let decoded
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer)
  } finally {
    decodeCtx.close()
  }
  // Resample to 16kHz via OfflineAudioContext — reliable on iOS/Safari too
  const TARGET_HZ = 16000
  const targetLen = Math.ceil(decoded.duration * TARGET_HZ)
  const offCtx = new OfflineAudioContext(1, targetLen, TARGET_HZ)
  const src = offCtx.createBufferSource()
  src.buffer = decoded
  src.connect(offCtx.destination)
  src.start()
  const resampled = await offCtx.startRendering()
  const channelData = resampled.getChannelData(0)
  const pcm = new Int16Array(channelData.length)
  for (let i = 0; i < channelData.length; i++) {
    const s = channelData[i]
    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(s * 32767)))
  }
  return new Uint8Array(pcm.buffer)
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
  const { signed_url } = await tokenRes.json()

  onStatus?.('Audio wird vorbereitet…')
  const pcmBytes = await blobToPcm16k(blob)

  onStatus?.('Agent verbunden…')

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(signed_url)
    let userText        = ''
    let agentText       = ''
    let audioChunks     = []
    let outputHz        = 16000
    let timer           = null
    let audioSent       = false
    let transcriptReady = false

    function finish() {
      clearTimeout(timer)
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
    }

    function sendPcm() {
      if (audioSent) return
      audioSent = true
      onStatus?.('Audio wird übertragen…')
      // Send at real-time rate: 4096 bytes = 128 ms at 16kHz 16-bit mono.
      // Paced streaming lets the server-side VAD track the speech envelope.
      const CHUNK = 4096
      let off = 0

      function sendNext() {
        if (ws.readyState !== WebSocket.OPEN) return
        if (off < pcmBytes.length) {
          const slice = pcmBytes.subarray(off, off + CHUNK)
          let bin = ''
          for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i])
          ws.send(JSON.stringify({ user_audio_chunk: btoa(bin) }))
          off += CHUNK
          setTimeout(sendNext, 128)
          return
        }
        // Follow with 2 s of silence at real-time rate so VAD detects end-of-speech.
        let silOff = 0
        const SIL_TOTAL = 64000  // 2 s at 16kHz 16-bit
        function sendSil() {
          if (ws.readyState !== WebSocket.OPEN) return
          if (silOff >= SIL_TOTAL) { onStatus?.('Agent hört zu…'); return }
          const len = Math.min(CHUNK, SIL_TOTAL - silOff)
          const sil = new Uint8Array(len)  // zeros = silence
          let silBin = ''
          for (let i = 0; i < len; i++) silBin += String.fromCharCode(0)
          ws.send(JSON.stringify({ user_audio_chunk: btoa(silBin) }))
          silOff += len
          setTimeout(sendSil, 128)
        }
        sendSil()
      }
      sendNext()
    }

    // Safety timeout 45 s
    ws.onopen = () => {
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
          return
        }

        if (msg.type === 'conversation_initiation_metadata') {
          const fmt = msg.conversation_initiation_metadata_event?.agent_output_audio_format
          if (fmt) { const m = String(fmt).match(/(\d{4,6})/); if (m) outputHz = parseInt(m[1]) }
          onStatus?.('Verbunden — sende Audio…')
          // Send immediately (barge-in). ElevenLabs VAD handles overlap with the
          // greeting. Waiting for the greeting to finish risks an inactivity timeout.
          sendPcm()
          return
        }

        if (msg.type === 'user_transcript') {
          userText = msg.user_transcription_event?.user_transcript || ''
          transcriptReady = true
          onStatus?.(`Erkannt: "${userText}"`)
        } else if (msg.type === 'agent_response' && transcriptReady) {
          agentText = msg.agent_response_event?.agent_response || ''
          onStatus?.('Agent antwortet…')
        } else if (msg.type === 'audio' && transcriptReady) {
          if (msg.audio_event?.audio_base_64) {
            audioChunks.push(msg.audio_event.audio_base_64)
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
