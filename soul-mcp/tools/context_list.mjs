import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'context_list',
    'Listet alle Text-Kontext-Dateien im Vault auf: Notizen, Dokumente, Wissensbasis (.md, .txt). Gibt Namen und URL zurück.',
    {},
    async () => {
      try {
        const data = await getJson('/api/vault/context', token);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: apiErrMsg(err) }], isError: true };
      }
    }
  );
}

function apiErrMsg(err) {
  if (err.status === 403) return 'Vault gesperrt oder Kontext-Berechtigung fehlt.';
  return err.message;
}
