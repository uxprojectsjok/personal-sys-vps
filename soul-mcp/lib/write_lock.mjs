// soul-mcp/lib/write_lock.mjs
// EIN gemeinsamer Schreib-Lock für ALLE Tools, die potenziell dieselbe
// sys.md verändern (peer_send, soul_write, mind_write, context_write,
// wired_soul_write, wired_peer_send, ...). Schlüssel ist IMMER die
// Ziel-soul_id (+ node_url bei Cross-Node/Föderation), nie der aufrufende
// Token — sonst serialisiert ein Tool nur gegen sich selbst, nicht gegen
// die anderen. Live gefunden: jedes Tool hatte vorher seine eigene,
// isolierte Lock-Map (teils sogar mit unterschiedlichem Key-Schema
// innerhalb derselben Datei) — zwei Tools, die "gleichzeitig" dieselbe
// Soul trafen, blockierten sich nie gegenseitig. Klassisches Lost-Update:
// beide lesen dieselbe "alte" sys.md, beide schreiben zurück, der zweite
// gewinnt und der erste Write verschwindet spurlos — trotz gemeldetem
// Erfolg, weil jeder Write für sich genommen fehlerfrei durchlief.

const _writeQueues = new Map();

export async function withWriteLock(key, fn) {
  const prev = _writeQueues.get(key) ?? Promise.resolve();
  let resolveCurrent;
  const current = new Promise(r => { resolveCurrent = r; });
  _writeQueues.set(key, prev.then(() => current));
  await prev;
  try { return await fn(); } finally { resolveCurrent(); }
}

const BASE_URL = process.env.BASE_URL;

// Kanonischer Schlüssel für "schreibe in soulId's sys.md, auf nodeUrl (oder
// dem eigenen Node, falls nicht angegeben)" — immer diesen Helper nutzen,
// nie den Schlüssel von Hand zusammenbauen (das war genau der Bug).
export function writeLockKey(soulId, nodeUrl = null) {
  return `${soulId}@${nodeUrl || BASE_URL}`;
}
