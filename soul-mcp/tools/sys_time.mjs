/**
 * sys_time — Gibt die aktuelle Serverzeit zurück (UTC + Unix-Timestamp +
 * Server-Zeitzone). Kein Scope/Token nötig, überall verfügbar (Owner,
 * Gatekeeper-Bundle) — enthält keine privaten Daten.
 *
 * Zweck: verhindert, dass ein Modell Datum/Uhrzeit aus dem Gesprächskontext
 * schätzt (siehe OWNER_INSTRUCTIONS in server.mjs) — mit unix + Zeitzone kann
 * die aufrufende KI jede gewünschte lokale Zeit selbst korrekt umrechnen,
 * ohne raten zu müssen.
 */

import { z } from 'zod';

export function register(server) {
  server.tool(
    'sys_time',
    'Gibt die aktuelle Serverzeit zurück (ISO 8601 UTC, Unix-Timestamp, Server-Zeitzone). Immer hiermit die aktuelle Zeit abfragen statt sie aus dem Gesprächskontext zu schätzen.',
    {},
    async () => {
      const now = new Date();
      const data = {
        iso_utc: now.toISOString(),
        unix: Math.floor(now.getTime() / 1000),
        weekday_utc: now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        server_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
