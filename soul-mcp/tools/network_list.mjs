import { getJson } from '../lib/api.mjs';

export function register(server, token) {
  server.tool(
    'network_list',
    'Listet alle verbundenen Souls im Netzwerk auf. Zeigt Alias, gegenseitige Verbindung (mutual), Berechtigungen und ob die verbundene Soul Dateien freigegeben hat.',
    {},
    async () => {
      try {
        const data = await getJson('/api/vault/connections', token);
        const connections = data.connections ?? [];

        // Für jede Verbindung Public-Vault-Manifest vorladen (best effort)
        const enriched = await Promise.all(
          connections.map(async (conn) => {
            const entry = {
              soul_id:     conn.soul_id,
              alias:       conn.alias,
              mutual:      conn.mutual ?? false,
              permissions: conn.permissions ?? [],
              connected_at: conn.connected_at
                ? new Date(conn.connected_at * 1000).toISOString()
                : undefined,
            };
            // Public-Vault-Manifest (kein Auth nötig)
            try {
              const pub = await fetch(
                `${process.env.SYS_API_URL}/api/vault/public/${conn.soul_id}`
              );
              if (pub.ok) {
                const manifest = await pub.json();
                entry.public_vault_enabled = true;
                entry.public_files = manifest.files ?? [];
                entry.hint = entry.public_files.length > 0
                  ? `Nutze network_peer_get(soul_id="${conn.soul_id}") um Dateien zu lesen.`
                  : 'Public Vault aktiv, aber keine Dateien freigegeben.';
              } else {
                entry.public_vault_enabled = false;
              }
            } catch {
              entry.public_vault_enabled = false;
            }
            return entry;
          })
        );

        const result = {
          total: enriched.length,
          connections: enriched,
        };

        if (data.removed_by_peer?.length > 0) {
          result.removed_by_peer = data.removed_by_peer;
        }

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: err.message }], isError: true };
      }
    }
  );
}
