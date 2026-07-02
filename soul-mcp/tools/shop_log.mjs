/**
 * shop_log — Trägt eigene Käufe und Wunschliste in shopping.md ein.
 * Nur für den Soul-Inhaber (nicht für externe Agenten — dafür gibt es shop_write_read).
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { z } from 'zod';
import { SOULS_DIR } from '../lib/vault_fs.mjs';

const VALID_CATS = ['Electronics', 'Kleidung', 'Sport', 'Wohnen', 'Bücher', 'Lebensmittel', 'Sonstiges'];

async function ensureContextRegistered(soulId, filename) {
  const ctxPath = `${SOULS_DIR}${soulId}/api_context.json`;
  try {
    const raw = await readFile(ctxPath, 'utf8');
    const ctx = JSON.parse(raw);
    const sf  = ctx.synced_files = ctx.synced_files || {};
    const arr = Array.isArray(sf.context) ? sf.context : [];
    if (!arr.includes(filename)) {
      arr.push(filename);
      sf.context = arr;
      await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
    }
  } catch { /* nicht kritisch */ }
}

export function register(server, soulId) {
  server.tool(
    'shop_log',
    'Trägt einen eigenen Kauf oder Wunschlisteneintrag in shopping.md ein. Für @product-Anfragen. Pflegt Monatszusammenfassung und Jahreskategorien automatisch.',
    {
      name:     z.string().min(1).max(200).describe('Produktname, z.B. "Nike Air Max 270"'),
      category: z.enum(['Electronics', 'Kleidung', 'Sport', 'Wohnen', 'Bücher', 'Lebensmittel', 'Sonstiges']).optional().describe('Kategorie (default: Sonstiges)'),
      price:    z.number().optional().describe('Preis in Euro, z.B. 129.99'),
      status:   z.enum(['purchased', 'wishlist']).optional().describe('purchased (Kauf) oder wishlist (Wunschliste) — default: purchased'),
      notes:    z.string().max(200).optional().describe('Optionale Notiz, z.B. "Größe 42, rot"'),
    },
    async ({ name, category = 'Sonstiges', price, status = 'purchased', notes = '' }) => {
      try {
        const cat       = VALID_CATS.includes(category) ? category : 'Sonstiges';
        const st        = status === 'wishlist' ? 'wishlist' : 'purchased';
        const today     = new Date().toISOString().slice(0, 10);
        const curMonth  = today.slice(0, 7);
        const curYear   = today.slice(0, 4);
        const priceStr  = (price != null && price !== '') ? ` | €${Number(price).toFixed(2)}` : '';
        const cleanNote = (notes || '').replace(/[\n\r]/g, ' ').trim();
        const newEntry  = cleanNote
          ? `- ${today} | ${st} | ${cat}${priceStr} | ${name} — ${cleanNote}`
          : `- ${today} | ${st} | ${cat}${priceStr} | ${name}`;

        const shopPath = `${SOULS_DIR}${soulId}/vault/context/shopping.md`;
        await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
        const content = await readFile(shopPath, 'utf8').catch(() => '');

        let head = '', wishlistLines = [], purchaseLines = [], zone = 'head';
        for (const line of (content + '\n').split('\n').slice(0, -1)) {
          if      (line === '## Wishlist')                  zone = 'wishlist';
          else if (line === '## Recent Purchases')          zone = 'purchases';
          else if (line.startsWith('## Monthly Summary') || line.startsWith('## Annual Categories')) zone = 'skip';
          else if (zone === 'head')      head += line + '\n';
          else if (zone === 'wishlist')  wishlistLines.push(line);
          else if (zone === 'purchases') purchaseLines.push(line);
        }
        head = head.replace(/last_updated:.*\n/, `last_updated: ${today}\n`);
        if (!head.includes('last_updated')) head = head.trimEnd() + `\nlast_updated: ${today}\n`;

        if (st === 'wishlist') {
          wishlistLines.unshift(newEntry);
        } else {
          wishlistLines = wishlistLines.filter(l => !l.toLowerCase().includes(name.toLowerCase()));
          purchaseLines.unshift(newEntry);
          purchaseLines = purchaseLines.filter(l => l.trim()).slice(0, 60);
        }

        const moPurch = purchaseLines.filter(l => l.match(new RegExp(`^- ${curMonth}`)) && l.includes('| purchased |'));
        let monthlyContent = '_No entries yet._';
        if (moPurch.length > 0) {
          const cc = {}; let tot = 0, pc = 0;
          for (const l of moPurch) {
            const cm = l.match(/\| purchased \| (\w+)/); if (cm) cc[cm[1]] = (cc[cm[1]] || 0) + 1;
            const pm = l.match(/€([\d.]+)/); if (pm) { tot += parseFloat(pm[1]); pc++; }
          }
          monthlyContent = Object.entries(cc).map(([c, n]) => `- ${c}: ${n}`).join('\n');
          if (pc > 0) monthlyContent += `\n- Total: €${tot.toFixed(2)}`;
        }

        const yrPurch = purchaseLines.filter(l => l.match(new RegExp(`^- ${curYear}`)) && l.includes('| purchased |'));
        let annualContent = '_No entries yet._';
        if (yrPurch.length > 0) {
          const yc = {};
          for (const l of yrPurch) { const cm = l.match(/\| purchased \| (\w+)/); if (cm) yc[cm[1]] = (yc[cm[1]] || 0) + 1; }
          annualContent = Object.entries(yc).map(([c, n]) => `- ${c}: ${n}`).join('\n');
        }

        let out = head.trimEnd() + '\n\n## Wishlist\n' + (wishlistLines.filter(l => l.trim()).join('\n') || '_Empty._');
        out += '\n\n## Recent Purchases\n' + (purchaseLines.filter(l => l.trim()).join('\n') || '_No entries yet._');
        out += `\n\n## Monthly Summary (${curMonth})\n${monthlyContent}`;
        out += `\n\n## Annual Categories (${curYear})\n${annualContent}\n`;

        await writeFile(shopPath, out, 'utf8');
        await ensureContextRegistered(soulId, 'shopping.md');

        return { content: [{ type: 'text', text: `Eingetragen: ${newEntry}` }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
