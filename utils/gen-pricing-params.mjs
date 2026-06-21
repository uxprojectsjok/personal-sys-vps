#!/usr/bin/env node
/**
 * Generates shared/constants/pricing_params.json from shared/constants/pricing.js
 * Run after changing pricing coefficients:  node utils/gen-pricing-params.mjs
 */
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import params from '../shared/constants/pricing.js'

const root   = dirname(dirname(fileURLToPath(import.meta.url)))
const outPath = join(root, 'shared/constants/pricing_params.json')

const json = JSON.stringify({
  version:       params.version,
  anchor_coeff:  params.anchor_coeff,
  age_coeff:     params.age_coeff,
  quote_ttl_sec: params.quote_ttl_sec,
  _note:         'Generated from shared/constants/pricing.js — do not edit manually. Run: node utils/gen-pricing-params.mjs',
}, null, 2) + '\n'

writeFileSync(outPath, json)
console.log(`pricing_params.json written (v${params.version})`)
console.log(`  anchor_coeff:  ${params.anchor_coeff}`)
console.log(`  age_coeff:     ${params.age_coeff}`)
console.log(`  quote_ttl_sec: ${params.quote_ttl_sec}`)
