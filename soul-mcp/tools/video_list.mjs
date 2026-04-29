import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'video_list',
    'Listet alle Video-Dateien im Vault auf: Bewegungsaufnahmen, Video-Memos, Körpersprache-Aufnahmen. Gibt Namen, MIME-Typ und URL zurück.',
    {},
    async () => {
      try {
        const data = await getJson('/api/vault/video', token);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: apiErrMsg(err) }], isError: true };
      }
    }
  );
}

function apiErrMsg(err) {
  if (err.status === 403) return 'Vault gesperrt oder Video-Berechtigung fehlt.';
  return err.message;
}
