import { z } from 'zod';
import { getText, putJson } from '../lib/api.mjs';

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Löscht einen Eintrag (Bullet, Absatz oder Zeile) aus einer ## Sektion.
 *
 * Strategie:
 * - Bullet-Eintrag (beginnt mit "- " oder "* "): löscht den kompletten Block
 *   inkl. Folgezeilen die zur selben Einrückungsebene gehören
 * - Normaler Absatz: löscht den Absatz der den match-Text enthält
 * - Fallback: löscht jede Zeile die den match-Text enthält
 */
function deleteFromSection(md, section, match) {
  md = md.replace(/\r\n/g, '\n').trimEnd();

  const sectionRe = new RegExp(
    `(## ${escapeRe(section)}[ \\t]*\\n)([\\s\\S]*?)(?=\\n## |$)`
  );
  const sectionMatch = md.match(sectionRe);
  if (!sectionMatch) {
    return { updated: md, deleted: false, reason: `Sektion "${section}" nicht gefunden.` };
  }

  const sectionBody = sectionMatch[2];
  if (!sectionBody.includes(match)) {
    return { updated: md, deleted: false, reason: `Kein Eintrag mit "${match}" in Sektion "${section}" gefunden.` };
  }

  const lines = sectionBody.split('\n');
  const matchLower = match.toLowerCase();

  // Zeilen-Index des Treffers finden
  const hitIdx = lines.findIndex(l => l.toLowerCase().includes(matchLower));
  if (hitIdx === -1) {
    return { updated: md, deleted: false, reason: `Eintrag nicht gefunden.` };
  }

  const hitLine = lines[hitIdx];
  const isBullet = /^(\s*[-*]\s)/.test(hitLine);

  let removeFrom = hitIdx;
  let removeTo   = hitIdx;

  if (isBullet) {
    // Bullet-Block: alles löschen bis zur nächsten gleichwertigen oder höheren Zeile
    const indent = hitLine.match(/^(\s*)/)[1].length;
    for (let i = hitIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === '') { removeTo = i; continue; }          // Leerzeile zum Block
      const nextIndent = l.match(/^(\s*)/)[1].length;
      if (/^(\s*[-*]\s)/.test(l) && nextIndent <= indent) break; // nächstes Bullet
      if (nextIndent <= indent && l.trim() !== '') break;         // Inhalt gleicher Ebene
      removeTo = i;
    }
    // Trailing-Leerzeile nicht mitnehmen wenn sie nicht zum Block gehört
    while (removeTo > hitIdx && lines[removeTo].trim() === '') removeTo--;
  } else {
    // Absatz-Modus: löscht zusammenhängenden Nicht-Leerzeilen-Block
    for (let i = hitIdx - 1; i >= 0; i--) {
      if (lines[i].trim() === '') break;
      removeFrom = i;
    }
    for (let i = hitIdx + 1; i < lines.length; i++) {
      if (lines[i].trim() === '') break;
      removeTo = i;
    }
  }

  // Entfernen + übrige Leerzeilen normalisieren
  const before = lines.slice(0, removeFrom);
  const after  = lines.slice(removeTo + 1);

  // Eine Leerzeile zwischen before und after sicherstellen wenn beide non-empty
  const merged = [...before];
  if (before.length > 0 && before[before.length - 1].trim() !== '' &&
      after.length > 0  && after[0].trim() !== '') {
    merged.push('');
  }
  merged.push(...after);

  const newBody = merged.join('\n');
  const replacement = `## ${section}\n${newBody.trim()}\n`;
  const updated = md.replace(sectionRe, () => replacement + '\n');

  return { updated, deleted: true, reason: null };
}

export function register(server, token) {
  server.tool(
    'soul_delete',
    [
      'Löscht einen Eintrag aus einer ## Sektion der sys.md.',
      'Findet den Bullet-Block, Absatz oder die Zeile die den match-Text enthält und entfernt ihn vollständig.',
      'Anwendungsfälle:',
      '- Alten Session-Log-Eintrag löschen → section="Session Log (compressed)", match="2026-05-01"',
      '- Falschen Eintrag entfernen → match=erkennbarer Textschnipsel aus dem Eintrag',
      'Liest zuerst die aktuelle sys.md, löscht den Eintrag, schreibt zurück.',
    ].join('\n'),
    {
      section: z.string().min(1).max(200).regex(/^[^\n\r]+$/).describe(
        'Name der ## Sektion ohne "##", z.B. "Session Log (compressed)"'
      ),
      match: z.string().min(2).max(200).describe(
        'Eindeutiger Textschnipsel aus dem zu löschenden Eintrag, z.B. ein Datum "2026-05-01" oder ein Schlüsselwort'
      ),
    },
    async ({ section, match }) => {
      try {
        const current = await getText('/api/soul', token);
        const { updated, deleted, reason } = deleteFromSection(current, section, match);

        if (!deleted) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ ok: false, message: reason }) }],
          };
        }

        const result = await putJson('/api/context', token, { soul_content: updated });
        if (!result?.ok) {
          return {
            content: [{ type: 'text', text: `Fehler beim Schreiben: ${JSON.stringify(result)}` }],
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true,
              section: `## ${section}`,
              match,
              message: `Eintrag mit "${match}" aus Sektion "${section}" gelöscht.`,
            }, null, 2),
          }],
        };
      } catch (err) {
        let msg = err.message;
        try {
          const body = JSON.parse(err.body || '{}');
          if (body.message) msg = body.message;
        } catch { /* ignore */ }
        if (err.status === 401) msg += ' – Token ungültig oder abgelaufen.';
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
    }
  );
}
