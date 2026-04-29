import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'audio_list',
    'Listet alle Audio-Dateien im Vault auf: Stimm-Aufnahmen, Memos, Musik. Gibt Namen, MIME-Typ und abrufbare URL zurück.',
    {},
    async () => {
      try {
        const data = await getJson('/api/vault/audio', token);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: apiErrMsg(err) }], isError: true };
      }
    }
  );
}

function apiErrMsg(err) {
  if (err.status === 403) return 'Vault gesperrt oder Audio-Berechtigung fehlt.';
  return err.message;
}
