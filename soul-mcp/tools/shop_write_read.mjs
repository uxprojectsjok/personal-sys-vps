/**
 * shop_write_read — Paid-Agent-Variante.
 * Liest shopping.md vom Dateisystem und gibt Wunschliste + Käufe zurück.
 * Für bezahlte externe Agenten (Lifestyle-Berater, Shopping-Assistenten).
 */

import { readFile } from 'fs/promises';
import { decryptIfNeeded, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

function parseShoppingMd(text) {
  const result = { wishlist: [], recent_purchases: [], monthly_summary: null, annual_categories: [] };

  const wishlistBlock = text.match(/## Wishlist\n([\s\S]*?)(?=\n##|$)/);
  const purchasesBlock = text.match(/## Recent Purchases\n([\s\S]*?)(?=\n##|$)/);
  const monthlyBlock   = text.match(/## Monthly Summary[^\n]*\n([\s\S]*?)(?=\n##|$)/);
  const annualBlock    = text.match(/## Annual Categories[^\n]*\n([\s\S]*?)(?=\n##|$)/);

  const parseEntries = (block, max) => {
    if (!block) return [];
    const entries = [];
    for (const line of block[1].split('\n')) {
      // Format: - 2026-05-29 | purchased | Kleidung | €89.99 | Nike Laufschuhe — notes
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

  result.wishlist          = parseEntries(wishlistBlock,  20);
  result.recent_purchases  = parseEntries(purchasesBlock, 20);

  if (monthlyBlock) result.monthly_summary  = monthlyBlock[1].trim();
  if (annualBlock)  result.annual_categories = annualBlock[1].trim();

  return result;
}

export function register(server, soulId) {
  server.tool(
    'shop_write_read',
    'Liest shopping.md und gibt Wunschliste, letzte Käufe, Monatszusammenfassung und Jahreskategorien zurück. Für bezahlte externe Lifestyle-Berater und Shopping-Agenten.',
    {},
    async () => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(soulId);
        const buf  = await readFile(`${SOULS_DIR}${soulId}/vault/context/shopping.md`);
        const text = decryptIfNeeded(buf, vaultKeyHex).toString('utf8');
        const data = parseShoppingMd(text);

        return { content: [{ type: 'text', text: JSON.stringify({
          available:         true,
          wishlist:          data.wishlist,
          recent_purchases:  data.recent_purchases,
          monthly_summary:   data.monthly_summary,
          annual_categories: data.annual_categories,
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
