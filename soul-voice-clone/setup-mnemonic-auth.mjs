// setup-mnemonic-auth.mjs
// Einmalig ausführen: Berechnet webhook_token aus 12 Wörtern + soul_id
// und speichert ihn in api_context.json auf dem VPS.
//
// Danach funktioniert node clone-voice.mjs vollautomatisch ohne Browser.

import 'dotenv/config'
import crypto from 'crypto'
import fetch from 'node-fetch'

const SOUL_ID       = process.env.SOUL_ID
const SOUL_MNEMONIC = process.env.SOUL_MNEMONIC
const SOUL_AUTH_TOKEN = process.env.SOUL_AUTH_TOKEN
const API_CONTEXT_URL = process.env.SOUL_API_BASE_URL + '/api/context'

// ── Validierung ───────────────────────────────────────────────────────────────

if (!SOUL_ID)         { console.error('❌ SOUL_ID fehlt in .env');        process.exit(1) }
if (!SOUL_MNEMONIC)   { console.error('❌ SOUL_MNEMONIC fehlt in .env');  process.exit(1) }
if (!SOUL_AUTH_TOKEN) { console.error('❌ SOUL_AUTH_TOKEN fehlt in .env'); process.exit(1) }

const words = SOUL_MNEMONIC.trim().split(/\s+/)
if (words.length !== 12) {
  console.error(`❌ SOUL_MNEMONIC muss genau 12 Wörter haben (gefunden: ${words.length})`)
  process.exit(1)
}

console.log('\n🔑 Mnemonic-Auth Setup')
console.log(`   soul_id:  ${SOUL_ID}`)
console.log(`   Wörter:   ${words.length} ✓`)

// ── vault_key: PBKDF2(mnemonic, soul_id, 100000, SHA-256, 32 Byte) ───────────
// Identisch zu webhook_mnemonic.lua auf dem VPS

console.log('\n⏳ PBKDF2 Key-Derivation (dauert ~1s)...')

const mnemonic  = words.join(' ').toLowerCase()
const vaultKey  = crypto.pbkdf2Sync(mnemonic, SOUL_ID, 100_000, 32, 'sha256')

console.log('   vault_key abgeleitet ✓')

// ── webhook_token: HMAC-SHA256(vault_key, soul_id) → hex ─────────────────────

const webhookToken = crypto.createHmac('sha256', vaultKey)
  .update(SOUL_ID)
  .digest('hex')

console.log(`   webhook_token: ${webhookToken.substring(0, 16)}...`)

// ── Aktuellen API-Kontext laden ───────────────────────────────────────────────

console.log('\n📡 API-Kontext laden...')

const getRes = await fetch(API_CONTEXT_URL, {
  headers: { Authorization: `Bearer ${SOUL_AUTH_TOKEN}` }
})

if (!getRes.ok) {
  const txt = await getRes.text()
  console.error(`❌ GET /api/context fehlgeschlagen (${getRes.status}): ${txt}`)
  process.exit(1)
}

const ctx = await getRes.json()
console.log('   Aktueller cipher_mode:', ctx.cipher_mode || 'open')

// ── webhook_token + cipher_mode speichern ─────────────────────────────────────

const updated = {
  ...ctx,
  webhook_token: webhookToken,
  cipher_mode:   'ciphered',   // Mnemonic-Auth erfordert ciphered mode
}

console.log('\n💾 webhook_token auf VPS speichern...')

const putRes = await fetch(API_CONTEXT_URL, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${SOUL_AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(updated),
})

if (!putRes.ok) {
  const txt = await putRes.text()
  console.error(`❌ PUT /api/context fehlgeschlagen (${putRes.status}): ${txt}`)
  process.exit(1)
}

console.log('\n' + '─'.repeat(50))
console.log('✅ Mnemonic-Auth eingerichtet!')
console.log('─'.repeat(50))
console.log('')
console.log('   webhook_token ist jetzt in api_context.json gesetzt.')
console.log('   Vault-Session läuft 24h nach jedem Aufruf von clone-voice.mjs.')
console.log('')
console.log('   Jetzt ausführen:')
console.log('   node clone-voice.mjs')
console.log('─'.repeat(50))
