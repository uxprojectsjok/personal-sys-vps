import { z } from 'zod';
import { putJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'profile_save',
    'Speichert ein Analyse-Profil dauerhaft im Vault. Aufrufen nachdem Claude ein Bild (→ face), Audio (→ voice) oder Video (→ motion) analysiert hat. Das Profil wird bei soul_skills und zukünftigen Konversationen automatisch einbezogen.\n\nEmpfohlene Datenstruktur:\n- face: { description, features, expression, estimated_age, notes }\n- voice: { tone, pace, energy, style, vocabulary_markers, notes }\n- motion: { energy_level, gesture_style, presence, behavioral_notes }\n- expertise: { domains[], strengths[], experience_level, notes }',
    {
      type: z.enum(['face', 'voice', 'motion', 'expertise']).describe('Profiltyp'),
      data: z.record(z.unknown()).describe('Strukturierte Analyse als JSON-Objekt'),
    },
    async ({ type, data }) => {
      try {
        const result = await putJson(`/api/vault/profile/${type}`, token, data);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...result,
              message: `${type}-Profil gespeichert. Wird bei soul_skills und zukünftigen Konversationen verwendet.`,
            }, null, 2),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
