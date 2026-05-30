/**
 * shop_write_read — Lesen + optionales Schreiben von Shopping-Daten.
 *
 * Ohne ad_placement: Liest shopping.md und gibt Wunschliste, Käufe,
 * Monatszusammenfassung und Jahreskategorien zurück.
 *
 * Mit ad_placement: Schreibt zusätzlich eine Empfehlung in den
 * "## Agent Recommendations"-Block der shopping.md.
 *
 * Für den Owner (via registerTools) und bezahlte externe Agenten (registerPaidTools).
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { decryptIfNeeded, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

function parseShoppingMd(text) {
  const result = { wishlist: [], recent_purchases: [], monthly_summary: null, annual_categories: [], agent_recommendations: [] };

  const wishlistBlock   = text.match(/## Wishlist\n([\s\S]*?)(?=\n##|$)/);
  const purchasesBlock  = text.match(/## Recent Purchases\n([\s\S]*?)(?=\n##|$)/);
  const monthlyBlock    = text.match(/## Monthly Summary[^\n]*\n([\s\S]*?)(?=\n##|$)/);
  const annualBlock     = text.match(/## Annual Categories[^\n]*\n([\s\S]*?)(?=\n##|$)/);
  const agentBlock      = text.match(/## Agent Recommendations\n([\s\S]*?)(?=\n##|$)/);

  const parseEntries = (block, max) => {
    if (!block) return [];
    const entries = [];
    for (const line of block[1].split('\n')) {
      const m = line.match(/^- (\d{4}-\d{2}-\d{2}) \| (\S+) \| ([^|]+?) \| ([^|]+?) \| (.+)$/);
      if (m) entries.push({
        date:     m[1],
        status:   m[2],
        category: m[3].trim(),
        price:    m[4].trim(),
        name:     m[5].split(' — ')[0].trim(),
        notes:    m[5].includes(' — ') ? m[5].split(' — ').slice(1).join(' — ').trim() : null,
      });
      if (entries.length >= max) break;
    }
    return entries;
  };

  const parseRecommendations = (block) => {
    if (!block) return [];
    const recs = [];
    for (const line of block[1].split('\n')) {
      // Format: - 2026-05-30 | AgentName | Produkt | Preis | message [| url] [expires: YYYY-MM-DD]
      const m = line.match(/^- (\d{4}-\d{2}-\d{2}) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (.+)$/);
      if (!m) continue;
      const rest    = m[5];
      const urlM    = rest.match(/\[(.+?)\]/);
      const expM    = rest.match(/expires:\s*(\d{4}-\d{2}-\d{2})/);
      const message = rest.replace(/\[.+?\]/g, '').replace(/expires:\s*\d{4}-\d{2}-\d{2}/g, '').trim().replace(/\s*\|\s*$/, '');
      recs.push({
        date:    m[1],
        agent:   m[2].trim(),
        product: m[3].trim(),
        price:   m[4].trim(),
        message,
        url:     urlM ? urlM[1] : null,
        expires: expM ? expM[1] : null,
      });
    }
    return recs;
  };

  result.wishlist             = parseEntries(wishlistBlock, 20);
  result.recent_purchases     = parseEntries(purchasesBlock, 20);
  result.agent_recommendations = parseRecommendations(agentBlock);

  if (monthlyBlock) result.monthly_summary  = monthlyBlock[1].trim();
  if (annualBlock)  result.annual_categories = annualBlock[1].trim();

  return result;
}

/**
 * Fügt eine Agent-Empfehlung in shopping.md ein oder erstellt die Datei neu.
 * Gibt die bestehenden Recommendations (inkl. neuer) zurück.
 */
async function writeAdPlacement(soulPath, placement) {
  const today = new Date().toISOString().slice(0, 10);
  const { agent, product, price = '–', message, cta_url, expires } = placement;

  // Zeilenlänge begrenzen
  const safeMsg = (message || '').replace(/[\n\r|]/g, ' ').trim().slice(0, 200);
  const safeProd = (product || '').replace(/[|\n\r]/g, ' ').trim().slice(0, 80);
  const safeAgent = (agent || 'Agent').replace(/[|\n\r]/g, ' ').trim().slice(0, 40);
  const safePrice = (price || '–').replace(/[|\n\r]/g, ' ').trim().slice(0, 20);

  let suffix = '';
  if (cta_url) suffix += ` [${cta_url}]`;
  if (expires) suffix += ` expires: ${expires}`;

  const newLine = `- ${today} | ${safeAgent} | ${safeProd} | ${safePrice} | ${safeMsg}${suffix}`;

  const existing = await readFile(soulPath, 'utf8').catch(() => '');

  // Abschnitt einfügen oder anhängen
  let updated;
  if (existing.includes('## Agent Recommendations')) {
    // Nach der Überschrift einfügen (neueste zuerst)
    updated = existing.replace(
      /(## Agent Recommendations\n)/,
      `$1${newLine}\n`
    );
  } else {
    updated = (existing.trimEnd() || '') + `\n\n## Agent Recommendations\n${newLine}\n`;
  }

  await mkdir(soulPath.slice(0, soulPath.lastIndexOf('/')), { recursive: true });
  await writeFile(soulPath, updated, 'utf8');
  return updated;
}

export function register(server, soulId) {
  server.tool(
    'shop_write_read',
    'Liest shopping.md: Wunschliste, letzte Käufe, Monats- und Jahreszusammenfassung sowie Agent-Empfehlungen. Mit ad_placement: schreibt zusätzlich eine Produkt-Empfehlung in den Agent-Recommendations-Block.',
    {
      ad_placement: z.object({
        agent:   z.string().describe('Name des werbenden Agenten (z.B. "SYS Marketing Agent")'),
        product: z.string().describe('Produktname (z.B. "Garmin VivoActive 6")'),
        price:   z.string().optional().describe('Preis als String, z.B. "229 €"'),
        message: z.string().describe('Kurze Werbebotschaft (max. 200 Zeichen)'),
        cta_url: z.string().url().optional().describe('Link zum Produkt oder Angebot'),
        expires: z.string().optional().describe('Ablaufdatum ISO 8601, z.B. "2026-06-30"'),
      }).optional().describe('Falls gesetzt: Empfehlung in shopping.md schreiben. Ohne dieses Feld: nur lesen.'),
    },
    async ({ ad_placement } = {}) => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(soulId);
        const shopPath = `${SOULS_DIR}${soulId}/vault/context/shopping.md`;

        let text;
        let writtenOk = false;

        if (ad_placement) {
          // Schreiben (unverschlüsselt — shopping.md wird nie verschlüsselt)
          const updated = await writeAdPlacement(shopPath, ad_placement);
          text      = updated;
          writtenOk = true;
        } else {
          const buf = await readFile(shopPath);
          text = decryptIfNeeded(buf, vaultKeyHex).toString('utf8');
        }

        const data = parseShoppingMd(text);

        return { content: [{ type: 'text', text: JSON.stringify({
          available:            true,
          written:              writtenOk,
          wishlist:             data.wishlist,
          recent_purchases:     data.recent_purchases,
          monthly_summary:      data.monthly_summary,
          annual_categories:    data.annual_categories,
          agent_recommendations: data.agent_recommendations,
          search_tips: {
            price_comparison: 'web_search("[Produktname] Preisvergleich")',
            local_shops:      'web_search("[Produktname] kaufen [Wohnort]")',
          },
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ available: false, message: `shopping.md nicht verfügbar: ${err.message}` }, null, 2) }] };
      }
    }
  );
}
