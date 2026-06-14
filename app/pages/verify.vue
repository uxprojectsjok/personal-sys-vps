<template>
  <ClientOnly>
    <div class="vfy">
      <div class="vfy-card">
        <div class="vfy-mark">SYS<span class="dot">.</span></div>
        <div class="vfy-sub">Identitäts-Verifikation</div>

        <!-- Loading -->
        <template v-if="phase === 'loading'">
          <div class="vfy-spinner" />
        </template>

        <!-- No soul / not logged in -->
        <template v-else-if="phase === 'gate'">
          <h1>Anmeldung erforderlich<em>.</em></h1>
          <p class="vfy-desc">Bitte zuerst in der SYS-App anmelden.</p>
          <button class="btn btn-primary btn-lg" @click="goGate">Zur Anmeldung</button>
        </template>

        <!-- Invalid / expired -->
        <template v-else-if="phase === 'invalid'">
          <div class="vfy-ic vfy-ic--err">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
          </div>
          <h1>Ungültige Challenge<em>.</em></h1>
          <p class="vfy-desc">{{ errorMsg || 'Diese Verifikationsanfrage ist abgelaufen oder ungültig.' }}</p>
          <button class="btn btn-primary btn-lg" @click="goBack">Schließen</button>
        </template>

        <!-- ── FINGERPRINT ── -->
        <template v-else-if="method === 'fingerprint'">
          <div class="vfy-ic" :class="icClass">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33"/>
            </svg>
          </div>
          <h1 v-if="phase === 'idle'">Fingerabdruck<em>.</em></h1>
          <h1 v-else-if="phase === 'verifying'">Warte auf Biometrik<em>…</em></h1>
          <h1 v-else-if="phase === 'verified'">Verifiziert<em>.</em></h1>
          <h1 v-else-if="phase === 'failed'">Fehlgeschlagen<em>.</em></h1>
          <p class="vfy-desc">
            <template v-if="phase === 'idle'">Identitäts-Verifikation via Face ID, Touch ID oder Windows Hello.</template>
            <template v-else-if="phase === 'verifying'">Bestätige mit Fingerabdruck oder Gesicht…</template>
            <template v-else-if="phase === 'verified'">Biometrische Verifikation erfolgreich. Du kannst dieses Fenster schließen.</template>
            <template v-else-if="phase === 'failed'">{{ errorMsg || 'Verifikation fehlgeschlagen. Erneut versuchen?' }}</template>
          </p>
          <button v-if="phase === 'idle'" class="btn btn-primary btn-lg" @click="doFingerprint">Jetzt verifizieren</button>
          <button v-else-if="phase === 'failed'" class="btn btn-primary btn-lg" @click="reset">Erneut versuchen</button>
          <button v-if="phase === 'verified'" class="btn btn-ghost btn-lg" @click="goBack">Fertig</button>
        </template>

        <!-- ── FACE ── -->
        <template v-else-if="method === 'face'">
          <template v-if="phase === 'idle' || phase === 'verifying'">
            <div class="vfy-ic" :class="icClass">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M11.25 12.75H12m-.375 0H12m.75 0h-.375M6.75 7.5c0-.69.56-1.25 1.25-1.25h8a1.25 1.25 0 0 1 0 2.5h-8A1.25 1.25 0 0 1 6.75 7.5ZM12 3a9 9 0 1 1 0 18A9 9 0 0 1 12 3Z"/></svg>
            </div>
            <h1>Gesicht<em>.</em></h1>
            <p class="vfy-desc">Kamera-Frame wird mit deinem Vault-Profilbild verglichen.</p>
            <button class="btn btn-primary btn-lg" :disabled="phase === 'verifying'" @click="doFace">
              <span v-if="phase === 'verifying'" class="btn-spinner" />
              {{ phase === 'verifying' ? 'Kamera startet…' : 'Kamera aktivieren' }}
            </button>
          </template>
          <template v-else-if="phase === 'capturing'">
            <div class="vfy-cam-wrap">
              <video ref="faceVideo" autoplay playsinline muted class="vfy-cam" />
              <canvas ref="faceCanvas" style="display:none" />
            </div>
            <p class="vfy-desc">Halte dein Gesicht in die Kamera.</p>
            <button class="btn btn-primary btn-lg" @click="captureFace">Aufnahme</button>
            <button class="btn btn-ghost" @click="stopCamera(); phase = 'idle'">Abbrechen</button>
          </template>
          <template v-else-if="phase === 'comparing'">
            <div class="vfy-ic vfy-ic--spin">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
            </div>
            <h1>Vergleiche<em>…</em></h1>
            <p class="vfy-desc">Claude Vision analysiert dein Gesicht.</p>
          </template>
          <template v-else-if="phase === 'verified'">
            <div class="vfy-ic vfy-ic--ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg></div>
            <h1>Verifiziert<em>.</em></h1>
            <p class="vfy-desc">Gesichtserkennung erfolgreich. Du kannst dieses Fenster schließen.</p>
            <button class="btn btn-ghost btn-lg" @click="goBack">Fertig</button>
          </template>
          <template v-else-if="phase === 'failed'">
            <div class="vfy-ic vfy-ic--err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></div>
            <h1>Kein Match<em>.</em></h1>
            <p class="vfy-desc">{{ errorMsg || 'Gesicht konnte nicht verifiziert werden.' }}</p>
            <button class="btn btn-primary btn-lg" @click="reset">Erneut versuchen</button>
          </template>
        </template>

        <!-- ── VOICE ── -->
        <template v-else-if="method === 'voice'">
          <div class="vfy-ic" :class="icClass">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"/></svg>
          </div>
          <h1 v-if="phase === 'idle'">Stimme<em>.</em></h1>
          <h1 v-else-if="phase === 'verifying'">Lade Vault-Audio<em>…</em></h1>
          <h1 v-else-if="phase === 'recording'">Aufnahme<em>…</em></h1>
          <h1 v-else-if="phase === 'comparing'">Vergleiche<em>…</em></h1>
          <h1 v-else-if="phase === 'verified'">Verifiziert<em>.</em></h1>
          <h1 v-else-if="phase === 'failed'">Kein Match<em>.</em></h1>
          <p class="vfy-desc">
            <template v-if="phase === 'idle'">Deine Stimme wird mit dem Vault-Audio verglichen (FFT-Spektralanalyse).</template>
            <template v-else-if="phase === 'verifying'">Vault-Audio wird geladen…</template>
            <template v-else-if="phase === 'recording'">
              Bitte sprechen — {{ recCountdown }} Sek.
              <span class="vfy-rec-dot" />
            </template>
            <template v-else-if="phase === 'comparing'">Spektralanalyse läuft…</template>
            <template v-else-if="phase === 'verified'">Stimm-Verifikation erfolgreich (Score: {{ (voiceScore * 100).toFixed(0) }}%). Du kannst dieses Fenster schließen.</template>
            <template v-else-if="phase === 'failed'">{{ errorMsg || `Kein Stimm-Match (Score: ${(voiceScore * 100).toFixed(0)}%). Erneut versuchen?` }}</template>
          </p>
          <button v-if="phase === 'idle'" class="btn btn-primary btn-lg" @click="doVoice">Aufnahme starten</button>
          <button v-else-if="phase === 'failed'" class="btn btn-primary btn-lg" @click="reset">Erneut versuchen</button>
          <button v-if="phase === 'verified'" class="btn btn-ghost btn-lg" @click="goBack">Fertig</button>
        </template>

        <div class="vfy-foot">
          <span class="live-dot" />
          Lokaler Knoten · privat &amp; verschlüsselt
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'
import { useSoulPasskey } from '~/composables/useSoulPasskey.js'

definePageMeta({ layout: false })

const route  = useRoute()
const router = useRouter()
const { hasSoul, soulToken } = useSoul()
const { authenticatePasskey } = useSoulPasskey()

const challengeId = route.query.id  || ''
const method      = route.query.m   || 'fingerprint'
const phase       = ref('loading')
const errorMsg    = ref('')
const faceVideo   = ref(null)
const faceCanvas  = ref(null)
const recCountdown = ref(3)
const voiceScore   = ref(0)
let faceCamStream  = null

const icClass = computed(() => ({
  'vfy-ic--ok':   phase.value === 'verified',
  'vfy-ic--err':  phase.value === 'failed',
  'vfy-ic--spin': ['verifying','capturing','recording','comparing'].includes(phase.value),
}))

function authHeaders() {
  return { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' }
}

function goGate() {
  const next = encodeURIComponent(route.fullPath)
  window.location.href = `/gate?next=${next}`
}
function goBack() { window.close() || router.push('/verbindung') }

onMounted(async () => {
  if (!challengeId || challengeId.length !== 32) {
    errorMsg.value = 'Fehlende oder ungültige Challenge-ID.'
    phase.value = 'invalid'
    return
  }
  // Wait for soul to hydrate (max 1.5s)
  for (let i = 0; i < 15; i++) {
    if (hasSoul.value) break
    await new Promise(r => setTimeout(r, 100))
  }
  if (!hasSoul.value) { phase.value = 'gate'; return }
  phase.value = 'idle'
})

onUnmounted(() => { stopCamera() })

function reset() { errorMsg.value = ''; phase.value = 'idle'; stopCamera(); voiceScore.value = 0 }

async function submitResult(verified) {
  try {
    await fetch('/api/verify/complete', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ challenge_id: challengeId, method, verified }),
    })
  } catch (_) {}
}

// ── Fingerprint ────────────────────────────────────────────────────────────────
async function doFingerprint() {
  phase.value = 'verifying'
  try {
    const prf = await authenticatePasskey()
    const ok  = !!prf
    phase.value = ok ? 'verified' : 'failed'
    if (!ok) errorMsg.value = 'Biometrische Verifikation abgelehnt.'
    await submitResult(ok)
  } catch (e) {
    errorMsg.value = e?.message || 'Verifikation fehlgeschlagen.'
    phase.value = 'failed'
  }
}

// ── Face ───────────────────────────────────────────────────────────────────────
async function doFace() {
  phase.value = 'verifying'
  try {
    faceCamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    await nextTick()
    if (faceVideo.value) {
      faceVideo.value.srcObject = faceCamStream
      await faceVideo.value.play()
    }
    phase.value = 'capturing'
  } catch (e) {
    errorMsg.value = 'Kamera nicht verfügbar.'
    phase.value = 'failed'
  }
}

async function captureFace() {
  if (!faceVideo.value || !faceCanvas.value) return
  const v = faceVideo.value
  faceCanvas.value.width  = v.videoWidth  || 640
  faceCanvas.value.height = v.videoHeight || 480
  faceCanvas.value.getContext('2d').drawImage(v, 0, 0)
  stopCamera()
  phase.value = 'comparing'
  try {
    const b64 = faceCanvas.value.toDataURL('image/jpeg', 0.85).split(',')[1]
    const r   = await fetch('/api/verify/face-check', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ image_base64: b64, mime: 'image/jpeg' }),
    })
    const d  = await r.json()
    const ok = d.match === true
    phase.value = ok ? 'verified' : 'failed'
    if (!ok) errorMsg.value = d.reason || 'Kein Gesichts-Match.'
    await submitResult(ok)
  } catch (_) {
    errorMsg.value = 'Vergleich fehlgeschlagen.'
    phase.value = 'failed'
  }
}

function stopCamera() {
  if (faceCamStream) { faceCamStream.getTracks().forEach(t => t.stop()); faceCamStream = null }
}

// ── Voice ──────────────────────────────────────────────────────────────────────
function fftMags(samples) {
  let n = 256; while (n < Math.min(samples.length, 4096)) n <<= 1
  const re = new Float32Array(n), im = new Float32Array(n)
  for (let i = 0; i < n; i++) re[i] = (samples[i] || 0) * (0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1))))
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr0 = Math.cos(ang), wi0 = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0
      for (let j = 0; j < (len >> 1); j++) {
        const k = i + j, l = k + (len >> 1), tr = re[l] * wr - im[l] * wi, ti = re[l] * wi + im[l] * wr
        re[l] = re[k] - tr; im[l] = im[k] - ti; re[k] += tr; im[k] += ti
        const nw = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = nw
      }
    }
  }
  const mags = new Float32Array(n >> 1)
  for (let i = 0; i < n >> 1; i++) mags[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i])
  return mags
}

function spectralEnvelope(buf) {
  const s = buf.getChannelData(0), frameSize = 2048, hop = 512
  const env = new Float64Array(frameSize >> 1); let cnt = 0
  for (let start = 0; start + frameSize <= s.length; start += hop, cnt++) {
    const frame = s.slice(start, start + frameSize), mags = fftMags(frame)
    for (let i = 0; i < env.length; i++) env[i] += Math.log1p(mags[i])
  }
  if (cnt > 0) for (let i = 0; i < env.length; i++) env[i] /= cnt
  return env
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na * nb) + 1e-10)
}

function recordAudio(stream, ms) {
  return new Promise((resolve, reject) => {
    const chunks = [], mr = new MediaRecorder(stream)
    mr.ondataavailable = e => e.data.size && chunks.push(e.data)
    mr.onstop = () => new Blob(chunks).arrayBuffer().then(resolve).catch(reject)
    mr.onerror = reject; mr.start(); setTimeout(() => mr.stop(), ms)
  })
}

async function doVoice() {
  phase.value = 'verifying'; voiceScore.value = 0
  try {
    const listRes  = await fetch('/api/vault/audio', { headers: authHeaders() })
    const listData = await listRes.json()
    const refUrl   = listData.active_url || listData.files?.[0]?.url
    if (!refUrl) throw new Error('Keine Stimme im Vault')
    const refBuf = await fetch(refUrl, { headers: authHeaders() }).then(r => r.arrayBuffer())

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    phase.value = 'recording'; recCountdown.value = 3
    const timer = setInterval(() => { recCountdown.value--; if (recCountdown.value <= 0) clearInterval(timer) }, 1000)
    const recBuf = await recordAudio(stream, 3000)
    clearInterval(timer)
    stream.getTracks().forEach(t => t.stop())

    phase.value = 'comparing'
    const ctx = new AudioContext()
    const [refDecoded, recDecoded] = await Promise.all([
      ctx.decodeAudioData(refBuf),
      ctx.decodeAudioData(recBuf),
    ])
    ctx.close()

    const score = cosineSim(spectralEnvelope(refDecoded), spectralEnvelope(recDecoded))
    voiceScore.value = score
    const ok = score > 0.78
    phase.value = ok ? 'verified' : 'failed'
    if (!ok) errorMsg.value = `Stimm-Match zu niedrig (${(score * 100).toFixed(0)}%).`
    await submitResult(ok)
  } catch (e) {
    errorMsg.value = e?.message || 'Stimm-Verifikation fehlgeschlagen.'
    phase.value = 'failed'
  }
}
</script>

<style scoped>
.vfy {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  padding: 24px 16px;
}

.vfy-card {
  width: 100%;
  max-width: 380px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 40px 32px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.vfy-mark {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -.5px;
  color: var(--fg);
  line-height: 1;
}
.vfy-mark .dot { color: var(--accent); }
.vfy-sub { font-size: 12px; color: var(--fg-3); letter-spacing: .06em; text-transform: uppercase; margin-bottom: 12px; }

.vfy-ic {
  width: 64px; height: 64px;
  border-radius: 50%;
  background: var(--bg);
  border: 1.5px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  margin: 12px 0;
  color: var(--fg-2);
  transition: border-color .2s, color .2s;
}
.vfy-ic svg { width: 28px; height: 28px; }
.vfy-ic--ok  { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.vfy-ic--err { border-color: var(--c-err, #e06c75); color: var(--c-err, #e06c75); background: color-mix(in srgb, var(--c-err, #e06c75) 10%, transparent); }
.vfy-ic--spin svg { animation: vfy-spin .9s linear infinite; }
@keyframes vfy-spin { to { transform: rotate(360deg); } }

h1 { font-size: 22px; font-weight: 700; color: var(--fg); margin: 4px 0; line-height: 1.2; }
h1 em { font-style: italic; color: var(--accent-bright, var(--accent)); }

.vfy-desc { font-size: 13px; color: var(--fg-2); line-height: 1.6; margin: 0 0 16px; max-width: 300px; }

.btn { width: 100%; margin-top: 4px; border-radius: 10px; font-size: 15px; font-weight: 600; padding: 14px 20px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .15s, opacity .15s; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-lg { padding: 14px 20px; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-bright, var(--accent)); }
.btn-ghost { background: transparent; color: var(--fg-3); border: 1px solid var(--border); margin-top: 8px; }
.btn-ghost:hover { color: var(--fg); border-color: var(--fg-3); }
.btn-spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: vfy-spin .7s linear infinite; flex-shrink: 0; }

.vfy-cam-wrap { width: 100%; border-radius: 12px; overflow: hidden; background: #000; aspect-ratio: 4/3; margin: 8px 0; }
.vfy-cam { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }

.vfy-rec-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #e06c75; animation: vfy-blink 1s ease-in-out infinite; margin-left: 6px; }
@keyframes vfy-blink { 0%,100%{opacity:1} 50%{opacity:.2} }

.vfy-spinner { width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: vfy-spin .8s linear infinite; margin: 24px auto; }

.vfy-foot { margin-top: 20px; font-size: 11px; color: var(--fg-4, var(--fg-3)); display: flex; align-items: center; gap: 6px; }
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: vfy-blink 2s ease-in-out infinite; flex-shrink: 0; }
</style>
