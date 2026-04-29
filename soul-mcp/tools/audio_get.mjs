import { z } from 'zod';
import { fileUrl } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'audio_get',
    'Gibt die abrufbare URL einer einzelnen Audio-Datei zurück. Das Token ist bereits eingebettet, sodass Claude oder externe Dienste die Datei direkt herunterladen können.',
    { filename: z.string().describe('Dateiname, z.B. "stimme.mp3" – aus audio_list bekannt') },
    async ({ filename }) => {
      const url = fileUrl('audio', filename, token);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ filename, url, hint: 'Direkt abrufbar, Token bereits eingebettet.' }),
          },
        ],
      };
    }
  );
}
