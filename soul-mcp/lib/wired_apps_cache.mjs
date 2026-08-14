// wired_apps_cache.mjs
// Prozessweiter, In-Memory-Cache: soul_id → Apps-Liste ({name, title,
// description}). Zweck: /mcp/discover/search (server.mjs) kann föderierte
// Suchanfragen mit App-Metadaten beantworten, ohne bei JEDER Suche live
// /api/vault/apps bei jeder verdrahteten Soul abzufragen — das wäre ein
// N+1-Fetch-Problem pro Suchanfrage, unabhängig davon ob gerade überhaupt
// jemand über MCP verbunden ist.
//
// Gefüllt als Nebeneffekt von registerWiredApps() (wired_apps.mjs) — jedes
// Mal, wenn jemand tatsächlich über /mcp/discover verbindet und die eigenen
// wired Souls scannt, aktualisiert das automatisch auch diesen Cache mit.
// Kein eigener Refresh-Scheduler: "eventually warm durch echte Nutzung"
// reicht für v1 — eine Soul, die seit dem letzten Prozessstart nie über
// /mcp/discover erreicht wurde, taucht in der föderierten Suche einfach ohne
// Apps auf (kein Fehler, nur fehlende Anreicherung), bis das erste Mal
// jemand verbindet und den Cache füllt.
const cache = new Map();

export function setWiredAppsForSoul(soulId, apps) {
  cache.set(soulId, apps);
}

export function getWiredAppsForSoul(soulId) {
  return cache.get(soulId) || [];
}
