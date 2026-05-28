/**
 * food_log — logs a rated food entry to health.md.
 * Called by the SoulKI after visually analysing a food photo.
 * Handles monthly rollover automatically (old month → Annual Journal).
 */

import { z } from 'zod';
import { postJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'food_log',
    'Trägt eine bewertete Mahlzeit in health.md ein (Skala A–E, angelehnt an Nutri-Score/WHO). Beim Monatswechsel wird der abgelaufene Monat automatisch ins Annual Journal archiviert und der Food Log zurückgesetzt. Aufruf: nach eigener Bildanalyse der Mahlzeit, optional nach web_search für Nährwertdaten.',
    {
      name:   z.string().describe('Name der Mahlzeit, z.B. "Avocado Toast mit Ei"'),
      rating: z.enum(['A', 'B', 'C', 'D', 'E']).describe('A = ausgezeichnet · B = gut · C = moderat · D = schlecht · E = sehr schlecht'),
      notes:  z.string().optional().describe('Kurze Beschreibung: Zutaten, Zubereitungsart, Besonderheiten — max. 80 Zeichen'),
    },
    async ({ name, rating, notes }) => {
      try {
        const result = await postJson('/api/food-log', token, { name, rating, notes: notes ?? '' });
        const msg = result.rolled_over
          ? `Eingetragen: ${result.entry}\n\nMonatswechsel: ${result.archived?.join(', ')} wurde ins Annual Journal archiviert.`
          : `Eingetragen: ${result.entry}`;
        return { content: [{ type: 'text', text: msg }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
