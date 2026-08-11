// soul-mcp/lib/peer_messages.mjs
// Gemeinsamer Parser für <!-- @msg ts from to text --> Einträge im SOCIAL-Block
// einer sys.md — genutzt von peer_inbox.mjs (liest über Connections-Tokens)
// und server.mjs (Gatekeeper-Relay, liest über die eigenen wired_souls.json-
// Tokens). War vorher in peer_inbox.mjs dupliziert, jetzt eine Quelle.

const SOCIAL_START = '<!-- SOCIAL:START -->';
const SOCIAL_END   = '<!-- SOCIAL:END -->';
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
