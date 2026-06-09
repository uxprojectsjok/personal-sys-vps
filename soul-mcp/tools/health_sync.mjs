import { postJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'health_sync',
    'Führt den Garmin Health Sync aus — ruft aktuelle Daten (Ruhepuls, Schlaf, Schritte) von Garmin Connect ab und schreibt sie in health.md. Wartet auf das Ergebnis (~30 Sek.) und gibt Erfolg oder Fehlermeldung zurück.',
    {},
    async () => {
      let result;
      try {
        result = await postJson('/api/health-sync', token, {});
      } catch (e) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            ok: false,
            error: e.message || 'Health Sync fehlgeschlagen',
          }) }],
        };
      }
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );
}
