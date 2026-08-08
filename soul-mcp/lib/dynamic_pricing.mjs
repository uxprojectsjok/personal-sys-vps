/**
 * dynamic_pricing.mjs — Node-Zwilling von soul_pay_x402.lua's dynamic_usdc_price()
 * (identische Formel wie soul_preview.lua). Bewusst dupliziert statt aus Lua
 * importiert — Cross-Runtime, gleiches Isolationsprinzip wie an anderen
 * x402-Stellen (siehe soul_pay_x402.lua Kopfkommentar). Beide Seiten MÜSSEN
 * dieselbe Formel/Rundung verwenden: eine Abweichung hier ist genau der Bug,
 * der dazu führte, dass accept_digital_content_terms einen anderen Preis
 * zeigte als soul_pay_x402.lua tatsächlich abgebucht hat (live gefunden,
 * 2026-08-08 — Rechnung zeigte 0.50 USDC, abgebucht wurden 0.760856 USDC).
 */

import { readFile } from 'fs/promises';
import { SOULS_DIR } from './vault_fs.mjs';

const DEFAULT_COEFFS = { anchor_coeff: 0.1, age_coeff: 0.01, demand_coeff: 0.05 };

async function readJsonSafe(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

// Gleiche Formel wie soul_pay.lua/soul_preview.lua/soul_pay_x402.lua:
// price = base × (1 + anchors×A + age_days×G + buyers_30d×D), price = max(base, price).
// Nur aufrufen, wenn amort.dynamic_pricing === true ist (Aufrufer prüft das,
// wie auf der Lua-Seite auch — diese Funktion selbst kennt den Schalter nicht).
export async function computeDynamicUsdcPrice(soulId, basePrice) {
  const base = Number(basePrice) || 0;
  if (base <= 0) return base;

  const coeffs = (await readJsonSafe('/var/lib/sys/config/pricing_params.json')) || {};
  const anchorCoeff = Number(coeffs.anchor_coeff) || DEFAULT_COEFFS.anchor_coeff;
  const ageCoeff    = Number(coeffs.age_coeff)    || DEFAULT_COEFFS.age_coeff;
  const demandCoeff = Number(coeffs.demand_coeff) || DEFAULT_COEFFS.demand_coeff;

  const hist = await readJsonSafe(`${SOULS_DIR}${soulId}/anchor_history.json`);
  if (!Array.isArray(hist) || hist.length === 0) return base;

  const anchorCount = hist.length;
  let chainAgeDays = 0;
  const firstTs = hist[0]?.ts;
  if (typeof firstTs === 'string') {
    const genesis = Date.parse(firstTs);
    if (!Number.isNaN(genesis)) chainAgeDays = (Date.now() - genesis) / 86400000;
  }

  let buyers30d = 0;
  const dlog = await readJsonSafe(`${SOULS_DIR}${soulId}/demand_log.json`);
  if (Array.isArray(dlog)) {
    const cutoff = Date.now() / 1000 - 30 * 86400;
    for (const entry of dlog) {
      if (entry && Number(entry.ts) > cutoff) buyers30d++;
    }
  }

  const multiplier = 1 + (anchorCount * anchorCoeff) + (chainAgeDays * ageCoeff) + (buyers30d * demandCoeff);
  const raw = base * multiplier;
  return Math.max(base, Math.floor(raw * 1e6 + 0.5) / 1e6);
}
