// whatsapp-connect.mjs – Phase 3
// Verbindet die Meta WhatsApp-Nummer mit dem ElevenLabs Agent aus agent_id.json

import 'dotenv/config'
import fetch from 'node-fetch'
import fs from 'fs'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const META_PHONE_NUMBER_ID            = process.env.META_PHONE_NUMBER_ID
const META_WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID
const META_PERMANENT_TOKEN            = process.env.META_PERMANENT_TOKEN

// ── Validierung ───────────────────────────────────────────────────────────────

if (!ELEVENLABS_API_KEY) { console.error('❌ ELEVENLABS_API_KEY fehlt'); process.exit(1) }
if (!META_PHONE_NUMBER_ID) { console.error('❌ META_PHONE_NUMBER_ID fehlt in .env'); process.exit(1) }
if (!META_WHATSAPP_BUSINESS_ACCOUNT_ID) { console.error('❌ META_WHATSAPP_BUSINESS_ACCOUNT_ID fehlt in .env'); process.exit(1) }
if (!META_PERMANENT_TOKEN) { console.error('❌ META_PERMANENT_TOKEN fehlt in .env'); process.exit(1) }

if (!fs.existsSync('agent_id.json')) {
  console.error('❌ agent_id.json nicht gefunden.')
  console.error('   Zuerst ausführen: node clone-voice.mjs')
  process.exit(1)
}

const { agent_id, agent_name } = JSON.parse(fs.readFileSync('agent_id.json', 'utf8'))
console.log(`\n📱 WhatsApp verbinden mit Agent: ${agent_name}`)
console.log(`   agent_id: ${agent_id}`)

// ── WhatsApp-Nummer verbinden ─────────────────────────────────────────────────

console.log('\n🔗 Verbinde WhatsApp-Nummer...')

const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agent_id}/add-phone-number`, {
  method: 'POST',
  headers: {
    'xi-api-key': ELEVENLABS_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'whatsapp',
    phone_number_id: META_PHONE_NUMBER_ID,
    business_account_id: META_WHATSAPP_BUSINESS_ACCOUNT_ID,
    access_token: META_PERMANENT_TOKEN
  })
})

const data = await res.json()

if (!res.ok) {
  console.error(`❌ Fehler ${res.status}:`, JSON.stringify(data, null, 2))
  process.exit(1)
}

console.log('\n✅ WhatsApp erfolgreich verbunden!')
console.log('')
console.log('─'.repeat(50))
console.log('   Jetzt testen:')
console.log('   → Sprachnachricht an die Prepaid-Nummer schicken')
console.log('   → Agent antwortet mit geklonter Stimme')
console.log('')
console.log('   Agent verwalten:')
console.log(`   → https://elevenlabs.io/app/conversational-ai/${agent_id}`)
console.log('─'.repeat(50))
