#!/usr/bin/env node
// Kleines CLI-Tool: verifyHuman für Lua-Aufruf via io.popen
// Usage: node check_human.mjs <soul_id>
import { verifyHuman } from './lib/blockchain.mjs'

const soulId = process.argv[2]
if (!soulId || soulId.length < 32) {
  console.log(JSON.stringify({ verified: false, error: 'invalid_soul_id' }))
  process.exit(1)
}

try {
  const result = await verifyHuman(soulId)
  console.log(JSON.stringify(result))
} catch (err) {
  console.log(JSON.stringify({ verified: false, error: err.message }))
}
