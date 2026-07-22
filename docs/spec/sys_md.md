# sys.md — Full Specification (v3)

`sys.md` is the single portable soul file: one Markdown document holding
identity, values, session history, and (once crystallized) a structured
long-term memory index. It is the file a user can download, back up, and
re-import on a new host — see [README: Integrity](../../README.md#integrity) for the fingerprint
mechanism used to verify a clone against the official release.

---

## Three layers

`sys.md` carries three structurally different kinds of content. Only the
first is ever indexed (see LONGMEM/MINDIDX below) — the other two are
intentionally left as-is:

| Layer | Content | Role |
|---|---|---|
| **Long-term store** | LONGMEM (facts/memories/ideas/learnings) | machine-readable, crystallized, indexed |
| **Conversation store** | Social Sphere, Agent Sandbox | ongoing message exchange, inherently sequential |
| **Short-term/staging store** | raw `## ` sections (Core Identity, Values & Beliefs, ...) | holding area until the next crystallization folds them into LONGMEM |

## Three-sphere access model

| Sphere | Delimiter | Who reads | Who writes |
|---|---|---|---|
| **Private Sphere** | All `## sections`, LONGMEM, MINDIDX | Owner only | Owner + the Archivist (crystallization) |
| **Social Sphere** | `<!-- SOCIAL:START/END -->` | Owner + trusted peers | Owner + trusted peers |
| **Agent Sandbox** | `<!-- AGENT:START/END -->` | Owner + paid agents | Owner + paid agents (append-only comment via `soul_paid_comment`) |

## Frontmatter

```yaml
---
soul_id: 00000000-0000-0000-0000-000000000000
soul_name: ""
created: YYYY-MM-DD
last_session: YYYY-MM-DD
version: 3
soul_cert: [generated automatically]
vault_hash: ""
storage_tx: ""
elevenlabs_agent_id: ""
elevenlabs_voice_id: ""
---
```

| Field | Type | Description |
|-------|------|-------------|
| `soul_id` | UUID v4 | Global primary key. Basis for all cert calculations. |
| `soul_name` | string | Display name (chosen by the user). |
| `created` | ISO 8601 | Creation date. |
| `last_session` | ISO 8601 | Last session date. |
| `version` | integer | sys.md schema version. `1` = legacy, `2` = three-sphere, `3` = MIND-aware (LONGMEM/MINDIDX lifecycle). |
| `soul_cert` | hex(32) | HMAC-SHA256 cert. Issued by the server, stored in the browser. |
| `vault_hash` | string | SHA-256 of the last vault snapshot. |
| `storage_tx` | string | IPFS/Arweave reference of last cloud push. |
| `elevenlabs_agent_id` / `elevenlabs_voice_id` | string | ElevenLabs conversational agent + voice clone, if created. |

Three more fields exist but are **not** part of a freshly created soul — `buildDefaultSoul()` (`app/composables/useSoul.js`) never writes them; they're added the first time the relevant feature is used:

| Field | Type | Added when |
|-------|------|-------------|
| `cert_version` | integer | First soul_cert rotation (`soul_rotate_cert`) |
| `soul_growth_chain` | array | First session-signing growth entry |
| `soul_chain_anchor` | object | First on-chain anchor transaction |

> [!NOTE]
> `version` is bumped opportunistically, not enforced — a `version: 2` soul is functionally identical to a fresh `version: 3` soul until its first crystallization; nothing needs migrating.

---

## Lifecycle: fresh soul → crystallized soul

A newly created soul (`buildDefaultSoul()` in `app/composables/useSoul.js`)
has only the raw sections, empty:

```markdown
<!-- LONGMEM + MINDIDX (kristallisiertes Langzeitgedächtnis + 3D-Index)
     erscheinen hier automatisch, sobald der Archivar zum ersten Mal
     kristallisiert. Bis dahin: nur die rohen Sektionen unten. -->

## Kern-Identität
<!-- Core Identity — who this person is: age, profession, origin, life situation -->
*Noch nicht beschrieben.*

## Werte & Überzeugungen
...
```

The background "Archivist" (`soul-mcp/lib/herz.mjs` → `onCrystallize`) — running
periodically once a user enables it — compresses these sections into two new
blocks, inserted directly after the frontmatter, and empties the sections it
successfully distilled:

```markdown
---
...
version: 3
---

<!-- SYS:LONGMEM:START -->
{ "v": 1, "updated": "2026-07-04",
  "facts": [ {"id":"...","cat":"identity|values|personality|project","text":"...","score":1-5,"since":"..."} ],
  "memories": [ {"id":"...","date":"...","text":"..."} ],
  "ideas": [ {"id":"...","title":"...","text":"...","status":"idea|planned|done"} ],
  "learnings": [ {"id":"...","date":"...","cat":"...","text":"..."} ] }
<!-- SYS:LONGMEM:END -->
<!-- SYS:MINDIDX:START -->
{ "_v": 1, "based_on_updated": "2026-07-04",
  "facts":     { "y_cat": { "identity": [0,1], "project": [2,7] }, "x_score_desc": [0,1,3,...] },
  "memories":  { "z_recent": [21,22,23,...] },
  "ideas":     { "z_status": { "planned": [...], "idea": [...] } },
  "learnings": { "y_cat": { "arch": [...], "tech": [...] } } }
<!-- SYS:MINDIDX:END -->

## Kern-Identität
*Not yet described.*
```

> [!NOTE]
> Nothing forces this transition — it happens the first time crystallization finds something worth distilling. No batch migration, no version gate: a reader that doesn't find a `MINDIDX` block simply treats the index as absent and falls back to scanning, exactly as it would for a soul that predates this mechanism entirely.

## LONGMEM — the long-term store

Four categories, each a plain array of objects (not the compact tuple form
MIND itself uses for network-scale data — at LONGMEM's scale, ~20-25 entries,
readability won over the extra encode/decode step):

| Category | Fields | Written by |
|---|---|---|
| `facts` | `id, cat, text, score (1-5), since` | fact-extraction pass over compressed core sections |
| `memories` | `id, date, text` | distillation of the Session Log |
| `ideas` | `id, title, text, status (idea/planned/done)` | distillation of the "Future Feature Ideas" section |
| `learnings` | `id, date, cat, text` | distillation of "Open Questions" |

`facts` has a size-bounding consolidation pass once it exceeds ~18 entries
(merges duplicates by meaning). `memories`/`ideas`/`learnings` do not yet —
noted as a known gap, coupled to a future tuple-compaction pass (see
"Open follow-ups" below).

## MINDIDX — the 3D index over LONGMEM

Applies the [MIND](https://github.com/uxprojectsjok/mind) discovery-format
technique one layer down: instead of indexing a network of nodes, it indexes
one person's own crystallized memory.

| Axis | MIND equivalent | LONGMEM field | Purpose |
|---|---|---|---|
| **Y** | `y_tags` | `facts[].cat`, `learnings[].cat` | category → indices, O(1) lookup |
| **X** | `x_price` | `facts[].score` | pre-sorted by relevance |
| **Z** | `z_status` / `z_anchors` | `ideas[].status`, `memories[].date` | status bucket / recency |

Full design rationale, tool test results, and before/after production
evidence: [`case-study-sys-md.md`](https://github.com/uxprojectsjok/mind/blob/main/case-study-sys-md.md)
in the MIND repo.

**Maintenance model:** lazy and fault-tolerant. Only `onCrystallize` builds
and persists `MINDIDX` — no other write path needs to know it exists. Every
reader (`queryLongmem()`) checks `based_on_updated` against `LONGMEM.updated`;
on any mismatch or absence, it transparently rebuilds the index in memory
from the already-current LONGMEM data rather than failing. This mirrors how
a genuinely incomplete memory behaves — a stale or missing index is not an
error state.

**Consumers:**

| Consumer | What it gets |
|---|---|
| `soul_read` (MCP) | full raw `sys.md`, with a compact index digest (top facts + recent memories) prepended |
| `soul_context_query` (MCP, + peer variant) | targeted lookup by category/score/status — for follow-up questions mid-conversation, not a replacement for `soul_read` |
| The four Archivist reflection triggers (`onAnchor`/`onSilence`/`onCircadian`/`onAgent`) | a purpose-matched slice (e.g. identity+values facts for a silence reflection, project facts for an external-agent contact) instead of a positional slice of raw text |
| `beme_chat` (self-chat persona, `lua/beme.lua`) | the full formatted LONGMEM (facts/memories/ideas/learnings), prepended once — not duplicated with the raw block |
| `soul_maturity` / `soul_skills` (self + peer) | an aggregate LONGMEM-depth score/skill-file, crediting crystallized content that emptied sections no longer show |

Query results are always rendered as plain text before reaching a model —
never a raw index structure. An AI directly exposed to raw index JSON tends
to either ignore it (falls back to linear scanning) or misinterpret it
(invents non-existent fields) — documented in MIND's own spec as Issue #1/#2.

---

## Open follow-ups (deliberately not yet implemented)

- **Document-level position index** (`_sections`-style) to avoid repeatedly
  re-splitting the full document during crystallization itself — a
  write-path performance concern, separate from the read-path index
  documented here.
- **Tuple/`_keys` compaction** of `memories`/`ideas`/`learnings` — only
  worthwhile once a size-bounding consolidation pass exists for those arrays
  (mirroring the one `facts` already has).

## v1 → v2 → v3 migration

- **v1 → v2**: auto-migrated on first peer access — the Social Sphere block
  is inserted before the Agent Sandbox block (or at end of file), `version`
  bumped to `2`.
- **v2 → v3**: no migration needed. `version: 3` is only set for newly
  created souls going forward; existing `version: 2` souls gain LONGMEM and
  MINDIDX blocks the same way any soul does — at their next crystallization.
