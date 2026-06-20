// server/api/soul/chain-metrics.get.js
// NUR für lokale Entwicklung (nuxt dev).
// In Production: OpenResty → soul_chain_metrics.lua

import { readFile } from 'node:fs/promises';
import { validateSoulToken } from '../../utils/validateSoulToken.js';
import { getChainMetrics } from '../../../soul-mcp/lib/blockchain.mjs';

export default defineEventHandler(async (event) => {
  const auth = getHeader(event, 'authorization');
  if (!validateSoulToken(auth)) {
    throw createError({ statusCode: 401, message: 'Unauthorized' });
  }

  const token   = (auth ?? '').replace(/^Bearer\s+/i, '').trim();
  const soul_id = token.substring(0, token.indexOf('.'));

  const histPath = `/var/lib/sys/souls/${soul_id}/anchor_history.json`;
  let history = [];
  try {
    const raw = await readFile(histPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) history = parsed;
  } catch { /* noch keine History */ }

  return getChainMetrics(history);
});
