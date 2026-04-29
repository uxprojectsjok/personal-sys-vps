import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'image_list',
    'Listet alle Bild-Dateien im Vault auf: Fotos, Gesichtsaufnahmen, Illustrationen. Gibt Namen, MIME-Typ und URL zurück. Bilder können via Claude Vision analysiert werden.',
    {},
    async () => {
      try {
        const data = await getJson('/api/vault/images', token);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: apiErrMsg(err) }], isError: true };
      }
    }
  );
}

function apiErrMsg(err) {
  if (err.status === 403) return 'Vault gesperrt oder Bild-Berechtigung fehlt.';
  return err.message;
}
