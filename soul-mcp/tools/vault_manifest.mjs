import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'vault_manifest',
    'Gibt eine Übersicht aller verfügbaren Vault-Ressourcen zurück: freigegebene Dateitypen (Audio, Bilder, Video, Kontext), soul_id und aktive Berechtigungen. Nützlich um zu sehen was verfügbar ist, bevor man spezifische Dateien abruft.',
    {},
    async () => {
      try {
        const data = await getJson('/api/vault/manifest', token);
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: apiErrMsg(err) }], isError: true };
      }
    }
  );
}

function apiErrMsg(err) {
  if (err.status === 403) return 'Vault ist gesperrt. Bitte in der SYS App entsperren.';
  if (err.status === 401) return 'Token ungültig oder abgelaufen.';
  return err.message;
}
