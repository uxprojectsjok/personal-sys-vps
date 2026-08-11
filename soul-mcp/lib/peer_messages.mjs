// soul-mcp/lib/peer_messages.mjs
// Gemeinsamer Parser für <!-- @msg ts from to text --> Einträge im SOCIAL-Block
// einer sys.md — genutzt von peer_inbox.mjs (liest über Connections-Tokens)
// und server.mjs (Gatekeeper-Relay, liest über die eigenen wired_souls.json-
// Tokens). War vorher in peer_inbox.mjs dupliziert, jetzt eine Quelle.

export const SOCIAL_START = '<!-- SOCIAL:START -->';
export const SOCIAL_END   = '<!-- SOCIAL:END -->';
export const AGENT_START  = '<!-- AGENT:START -->';
export const AGENT_END    = '<!-- AGENT:END -->';
const MSG_RE_G      = () => /<!--\s*@msg\s+(\S+)\s+(\S+)\s+(\S+)\s+([\s\S]*?)-->/g;

export function parseSocialMessages(md) {
  const si = md.indexOf(SOCIAL_START);
  const ei = md.indexOf(SOCIAL_END);
  if (si === -1 || ei === -1 || ei <= si) return [];
  const block = md.slice(si + SOCIAL_START.length, ei);
  const msgs = [];
  const re = MSG_RE_G();
  let m;
  while ((m = re.exec(block)) !== null) {
    msgs.push({ ts: m[1], from: m[2], to: m[3], content: m[4].trim() });
  }
  return msgs;
}

// Fügt einen @msg-Eintrag in den SOCIAL- (oder AGENT-) Block ein, legt den
// Block an falls er fehlt. Gemeinsam genutzt von peer_send.mjs (eigene Soul)
// und wired_peer_send in gatekeeper_proxy.mjs (im Namen einer verdrahteten Soul).
export function appendToBlock(md, startMarker, endMarker, entry) {
  const s = md.indexOf(startMarker);
  const e = md.indexOf(endMarker);
  if (s !== -1 && e !== -1 && e > s) {
    return md.slice(0, e) + entry + '\n' + md.slice(e);
  }
  return md.trimEnd() + '\n\n' + startMarker + entry + '\n' + endMarker + '\n';
}

// Baut den <!-- @msg --> Eintrag selbst — dieselbe Escaping-Regel (--> im
// Text kaputt machen, damit der Kommentar nicht vorzeitig endet) an beiden
// Aufrufstellen.
export function buildMsgEntry(ts, from, to, content) {
  const safe = content.trim().replace(/-->/g, '-- >');
  return `\n<!-- @msg ${ts} ${from} ${to} ${safe} -->`;
}
