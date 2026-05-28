import { postJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'health_sync',
    'Startet den Garmin Health Sync im Hintergrund — ruft aktuelle Daten (Ruhepuls, Schlaf, Schritte) von Garmin Connect ab und schreibt sie in health.md. Dauert ca. 30 Sekunden. Danach health_check aufrufen um die neuen Werte zu sehen.',
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
