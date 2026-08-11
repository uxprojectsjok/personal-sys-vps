// soul-mcp/lib/gatekeeper_peers.mjs
// Löst auf, welche anderen Souls über Gatekeeper-Wiring als @peer erreichbar
// sind — alle Geschwister-Spokes jedes Gatekeepers, bei dem soulId selbst
// gewired ist, plus die Gatekeeper selbst. Cross-node (node_url in
// wired_to.json gesetzt) geht über den Peers-Endpoint des jeweiligen
// Gatekeeper-Nodes (server.mjs GET /mcp/discover/gatekeeper/peers) statt
// direktem Dateisystemzugriff — der ist von hier aus nicht möglich.
//
// Gibt NIE Tokens zurück (auch nicht same-node) — peer_send braucht nur die
// soul_id zum Adressieren der eigenen Nachricht, peer_inbox liest fremde
// sys.md ausschließlich über den Gatekeeper-Relay (server.mjs), nie mit einem
// hier aufgelösten Token direkt.

import { loadWiredTo, loadAcceptedWired } from './wired_souls.mjs';
import { loadCtx } from './vault_fs.mjs';

export async function resolveGatekeeperPeers(soulId, token) {
  const ownNodeUrl = process.env.BASE_URL || '';
  const wiredTo = await loadWiredTo(soulId);
  const peers = [];

  for (const [gkSoulId, e] of Object.entries(wiredTo)) {
    if ((e.status || 'accepted') !== 'accepted') continue;
    const nodeUrl = e.node_url || null;
    try {
      if (!nodeUrl) {
        const { wired } = await loadAcceptedWired(gkSoulId);
        for (const entry of Object.values(wired)) {
          if (entry.soul_id === soulId) continue;
          peers.push({ soul_id: entry.soul_id, name: entry.name, node_url: entry.node_url || ownNodeUrl, gatekeeper_soul_id: gkSoulId });
        }
        const gkCtx = await loadCtx(gkSoulId).catch(() => null);
        peers.push({ soul_id: gkSoulId, name: gkCtx?.name || gkSoulId, node_url: ownNodeUrl, gatekeeper_soul_id: gkSoulId, is_gatekeeper: true });
      } else {
        const url = `${nodeUrl}/mcp/discover/gatekeeper/peers?gatekeeper_soul_id=${encodeURIComponent(gkSoulId)}&caller_node_url=${encodeURIComponent(ownNodeUrl)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
        const data = await res.json().catch(() => null);
        if (data?.ok) {
          for (const p of data.peers) peers.push({ ...p, gatekeeper_soul_id: gkSoulId });
        }
      }
    } catch { /* Gatekeeper nicht erreichbar — andere Gatekeeper trotzdem versuchen */ }
  }

  return peers;
}

// Ruft für jeden Gatekeeper, bei dem soulId gewired ist, den Inbox-Relay auf
// (server.mjs POST /mcp/discover/gatekeeper/peer-inbox-relay) — same-node und
// cross-node identisch, einfach mit BASE_URL als nodeUrl im same-node-Fall.
export async function fetchGatekeeperInboxMessages(soulId, token) {
  const ownNodeUrl = process.env.BASE_URL || '';
  const wiredTo = await loadWiredTo(soulId);
  const messages = [];

  await Promise.all(Object.entries(wiredTo).map(async ([gkSoulId, e]) => {
    if ((e.status || 'accepted') !== 'accepted') return;
    const nodeUrl = (e.node_url || ownNodeUrl).replace(/\/$/, '');
    try {
      const res = await fetch(`${nodeUrl}/mcp/discover/gatekeeper/peer-inbox-relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ gatekeeper_soul_id: gkSoulId, caller_node_url: ownNodeUrl }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) messages.push(...data.messages);
    } catch { /* ein unerreichbarer Gatekeeper darf die anderen nie blockieren */ }
  }));

  return messages;
}
