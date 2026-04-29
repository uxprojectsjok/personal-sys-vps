import { z } from 'zod';
import { getJson } from '../lib/api.mjs';

const PROFILE_HINTS = {
  face:      'Analysiere ein Bild mit image_get + Claude Vision, dann profile_save({type:"face", data:{...}}) aufrufen.',
  voice:     'Analysiere eine Audio-Datei mit audio_get, beschreibe Stimme und Stil, dann profile_save speichern.',
  motion:    'Analysiere ein Video mit video_get, beschreibe Bewegungsmuster und Körpersprache, dann profile_save speichern.',
  expertise: 'Aus sys.md Expertise-Sektionen + context_files destillieren, dann profile_save speichern.',
};

export function register(server, token) {
  server.tool(
    'profile_get',
    'Liest ein gespeichertes Analyse-Profil aus dem Vault. Typen: face (Gesicht/Erscheinung), voice (Stimme/Kommunikation), motion (Bewegung/Körpersprache), expertise (Fachkompetenz). Gibt Erstellungs-Hinweis zurück wenn kein Profil existiert.',
    { type: z.enum(['face', 'voice', 'motion', 'expertise']).describe('Profiltyp') },
    async ({ type }) => {
      try {
        const data = await getJson(`/api/vault/profile/${type}`, token);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        if (err.status === 404) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                exists: false,
                type,
                message: `Kein ${type}-Profil gefunden.`,
                how_to_create: PROFILE_HINTS[type],
              }, null, 2),
            }],
          };
        }
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
