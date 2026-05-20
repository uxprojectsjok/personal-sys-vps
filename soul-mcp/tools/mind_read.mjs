import { getText } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'mind_read',
    [
      'Liest deine eigene Konfigurationsdatei (mind.md).',
      'Enthält: Identität, Kommunikation, Intellekt, Werkzeuge, Netzwerk, Selbstreflexion, Grenzen.',
      '',
      'Nutze mind_read wenn du:',
      '- Deine aktuelle Konfiguration prüfen möchtest',
      '- Vor mind_write den aktuellen Stand kennen willst',
      '- Verstehen willst was du kannst und wie du eingestellt bist',
      '',
      'Schreibgeschützte Sektionen (via mind_write nicht änderbar): Identität, Grenzen.',
    ].join('\n'),
    {},
    async () => {
      try {
        const text = await getText('/api/mind', token);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `mind_read Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
