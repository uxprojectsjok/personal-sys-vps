<template>
  <div class="docs-page">

    <!-- Sticky Top-Nav -->
    <header class="docs-nav">
      <div class="docs-nav-inner">
        <div class="docs-lockup">
          <span class="docs-mark">SYS<span class="docs-dot">.</span></span>
          <span class="docs-slash hidden sm:inline">/</span>
          <span class="docs-title hidden sm:inline">Dev-Docs</span>
        </div>

        <div class="docs-nav-right">
          <a
            href="https://github.com/uxprojectsjok/SaveYourSoul_SYS"
            target="_blank"
            rel="noopener"
            class="docs-github hidden sm:flex"
            aria-label="GitHub Repository"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            GitHub
          </a>
          <NuxtLink to="/" class="docs-back" aria-label="Zurück zur App">← Zurück</NuxtLink>
          <button class="docs-menu-btn md:hidden" @click="sidebarOpen = !sidebarOpen" aria-label="Navigation">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path v-if="sidebarOpen" stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <div class="max-w-screen-xl mx-auto flex">

      <!-- Sidebar -->
      <aside
        class="fixed md:sticky top-14 h-[calc(100vh-3.5rem)] w-64 flex-none overflow-y-auto border-r border-[var(--sys-border)] bg-[var(--sys-bg)] transition-transform duration-200 z-30"
        :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'"
      >
        <nav class="p-4 space-y-1">
          <template v-for="group in nav" :key="group.id">
            <div class="pt-3 first:pt-0">
              <p class="text-xs tracking-[0.18em] uppercase font-semibold text-[var(--sys-fg-dim)] mb-1.5 px-3">{{ group.title }}</p>
              <button
                v-for="item in group.items"
                :key="item.id"
                class="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors"
                :class="activeSection === item.id
                  ? 'bg-[rgba(255,255,255,0.08)] text-white'
                  : 'text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:bg-[var(--sys-bg-surface)]'"
                @click="scrollTo(item.id)"
              >{{ item.title }}</button>
            </div>
          </template>
        </nav>
      </aside>

      <!-- Mobile overlay -->
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 bg-black/60 z-20 md:hidden"
        @click="sidebarOpen = false"
      />

      <!-- Main Content -->
      <main class="font-content flex-1 min-w-0 px-6 md:px-10 lg:px-16 py-10 md:py-12">

        <!-- Hero -->
        <div class="doc-hero">
          <span class="doc-hero-kicker">Developer Documentation</span>
          <h1 class="doc-hero-title">SYS Proto<em>col.</em></h1>
          <p class="doc-hero-sub">SYS is a distributed, file-based, AI-accessible identity protocol with MCP-compatible tool interfaces and optional cryptographic anchoring.</p>
        </div>

        <!-- ═══ OVERVIEW ═══ -->
        <section id="overview" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="Overview">What SYS is</DocHeading>
          <p class="doc-lead">A portable, user-controlled identity layer for AI systems. The core unit is sys.md — a plain Markdown file that encodes identity, grows with each session, and serves as persistent context for AI systems.</p>

          <div class="doc-info-box my-6 font-mono text-xs text-[var(--sys-fg-dim)] leading-relaxed">
            <div>sys.md  →  localStorage (browser)           never leaves without user action</div>
            <div class="ml-9">→  VPS (AES-256-CBC, optional)     user-initiated</div>
            <div class="ml-9">→  AI context (Anthropic Claude)   transient, user-initiated</div>
            <div class="ml-9">→  MCP tools (soul_read/write)     authorized per service-token</div>
            <div class="ml-9">→  Blockchain anchor (Polygon)     optional, hash only</div>
          </div>

          <DocHeading level="2">Design Principles</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Principle</th><th>Implementation</th></tr></thead>
              <tbody>
                <tr v-for="p in principles" :key="p.p"><td class="font-semibold">{{ p.p }}</td><td>{{ p.impl }}</td></tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">Key Concepts</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Term</th><th>Definition</th></tr></thead>
              <tbody>
                <tr v-for="c in concepts" :key="c.term">
                  <td><code class="doc-code">{{ c.term }}</code></td>
                  <td class="text-[var(--sys-fg-dim)]">{{ c.def }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">Compatibility Notes</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Standard</th><th>Relation</th></tr></thead>
              <tbody>
                <tr v-for="s in standards" :key="s.std"><td>{{ s.std }}</td><td class="text-[var(--sys-fg-dim)]">{{ s.rel }}</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ═══ QUICKSTART ═══ -->
        <section id="quickstart" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="Getting Started">Quickstart</DocHeading>
          <div class="doc-warning-box mb-6">
            <p class="text-xs font-semibold text-[var(--sys-amber)] mb-1">Closed beta — internal access only.</p>
            <p class="text-xs text-[var(--sys-fg-dim)]">Self-hosted instance. See docs/self-hosting.md to get started.
          </div>

          <DocHeading level="2">1. Minimum valid sys.md</DocHeading>
          <DocCode lang="yaml">---
soul_id: 00000000-0000-0000-0000-000000000000  # UUID v4 — REQUIRED
soul_name: "Your Name"
created: 2026-01-01
last_session: 2026-01-01
version: 1
soul_cert: ""          # filled in after step 2
vault_hash: ""
soul_growth_chain: []
soul_chain_anchor: null
storage_tx: ""
---

## Core Identity

One sentence describing who you are.</DocCode>

          <DocHeading level="2">2. Get a soul_cert</DocHeading>
          <DocCode lang="http">POST /api/soul-cert
Content-Type: application/json

{ "soul_id": "your-uuid-v4" }</DocCode>
          <DocCode lang="json">{ "cert": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5" }</DocCode>
          <p class="doc-p">Write the cert into your sys.md frontmatter. All subsequent requests use:</p>
          <DocCode>Authorization: Bearer {soul_id}.{cert}</DocCode>

          <DocHeading level="2">3. Validate</DocHeading>
          <DocCode lang="http">GET /api/validate
Authorization: Bearer {soul_id}.{cert}</DocCode>
          <p class="doc-p">Returns <code class="doc-code">200 OK</code> on success, <code class="doc-code">401</code> otherwise.</p>

          <DocHeading level="2">4. Upload sys.md</DocHeading>
          <DocCode lang="http">PUT /api/context
Authorization: Bearer {soul_id}.{cert}
Content-Type: application/json

{
  "enabled": true,
  "cipher_mode": "ciphered",
  "soul_content_encrypted": "&lt;base64 AES-256-CBC ciphertext&gt;",
  "permissions": { "soul": true, "audio": false }
}</DocCode>

          <DocHeading level="2">5. Unlock vault (for encrypted souls)</DocHeading>
          <DocCode lang="http">POST /api/vault/unlock
Authorization: Bearer {soul_id}.{cert}

{ "duration": "12h", "vault_key": "64-hex-char AES-256 key" }</DocCode>
          <p class="doc-p">Allowed durations: <code class="doc-code">1h</code> <code class="doc-code">12h</code> <code class="doc-code">1d</code> <code class="doc-code">30d</code> <code class="doc-code">182d</code> <code class="doc-code">365d</code> <code class="doc-code">unlimited</code></p>

          <DocHeading level="2">6. Connect via MCP</DocHeading>
          <p class="doc-p">MCP endpoint: <code class="doc-code">https://YOUR_DOMAIN/mcp</code> — OAuth 2.0 + PKCE. The consent page at <code class="doc-code">/oauth/authorize</code> issues a service-token scoped to granted permissions.</p>
        </section>

        <!-- ═══ SOUL.MD SPEC ═══ -->
        <section id="soul-md" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="Spec">sys.md Format</DocHeading>
          <p class="doc-lead">A plain UTF-8 Markdown file. YAML frontmatter carries protocol metadata. The body is human-readable identity content consumable by AI systems.</p>

          <DocHeading level="2">Frontmatter Fields</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Field</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
              <tbody>
                <tr v-for="f in frontmatterFields" :key="f.field">
                  <td><code class="doc-code">{{ f.field }}</code></td>
                  <td class="text-[var(--sys-fg-dim)] text-xs">{{ f.type }}</td>
                  <td class="text-xs font-mono" :class="f.req === 'MUST' ? 'text-[var(--sys-accent)]' : 'text-[var(--sys-fg-dim)]'">{{ f.req }}</td>
                  <td class="text-[var(--sys-fg-dim)]">{{ f.desc }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">Standard Body Sections</DocHeading>
          <p class="doc-p">All sections are OPTIONAL. Parsers MUST handle missing sections gracefully. Additional <code class="doc-code">##</code> sections are valid and MUST be preserved.</p>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Section</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr v-for="s in bodySections" :key="s.s">
                  <td><code class="doc-code">{{ s.s }}</code></td>
                  <td class="text-[var(--sys-fg-dim)]">{{ s.p }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">Growth Chain</DocHeading>
          <p class="doc-p">The <code class="doc-code">soul_growth_chain</code> is an append-only array of session records. The signature proves the session occurred on a specific SYS instance. Entries MUST NOT be modified after insertion.</p>
          <DocCode lang="json">[
  {
    "date": "2026-04-10",
    "hash": "sha256-of-soul-content-on-that-date",
    "signature": "hmac-sha256-signed-by-server"
  }
]</DocCode>

          <DocHeading level="2">Encoding &amp; Limits</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Property</th><th>Value</th></tr></thead>
              <tbody>
                <tr><td>Encoding</td><td class="text-[var(--sys-fg-dim)]">UTF-8, no BOM</td></tr>
                <tr><td>Max size (unencrypted)</td><td class="text-[var(--sys-fg-dim)]">2 MB</td></tr>
                <tr><td>Line endings</td><td class="text-[var(--sys-fg-dim)]">LF preferred, CRLF tolerated</td></tr>
                <tr><td>Null bytes</td><td class="text-[var(--sys-fg-dim)]">MUST NOT be present</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ═══ AUTH ═══ -->
        <section id="auth" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="Spec">Authentication Model</DocHeading>

          <DocHeading level="2">Trust Model</DocHeading>
          <DocCode>SOUL_MASTER_KEY  (secret, server-side only)
    └── soul_cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id)[0:32]
            └── All owner API access validated against this cert
                    └── vault_key (AES-256) — encrypts content
                            └── service-token — scoped external access</DocCode>
          <div class="doc-table-wrapper mt-4">
            <table class="doc-table">
              <thead><tr><th>Identity</th><th>Key Material</th><th>Trust Level</th><th>Scope</th></tr></thead>
              <tbody>
                <tr v-for="t in trustModel" :key="t.id">
                  <td class="font-semibold">{{ t.id }}</td>
                  <td><code class="doc-code">{{ t.key }}</code></td>
                  <td class="text-[var(--sys-fg-dim)]">{{ t.level }}</td>
                  <td class="text-[var(--sys-fg-dim)]">{{ t.scope }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">soul_cert — Owner Authentication</DocHeading>
          <DocCode># cert_version = 0 (default, backwards compatible)
cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id).hex()[0:32]

# cert_version ≥ 1 (after rotation)
cert = HMAC-SHA256(SOUL_MASTER_KEY, soul_id + ":" + cert_version).hex()[0:32]</DocCode>
          <p class="doc-p">Output is 32 lowercase hex characters. The cert is <strong>stateless</strong> — no database lookup, no expiry. <code class="doc-code">cert_version</code> is stored in sys.md frontmatter (default: 0). Calling <code class="doc-code">POST /api/soul-rotate-cert</code> increments the version and invalidates the previous cert immediately — without changing <code class="doc-code">SOUL_MASTER_KEY</code> or <code class="doc-code">soul_id</code>.</p>
          <DocCode>Authorization: Bearer 7f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c.a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5</DocCode>

          <DocHeading level="2">Service-Token — Scoped External Access</DocHeading>
          <p class="doc-p">64 lowercase hex characters. Allows external systems (AI agents, MCP clients, webhooks) to access soul data with granular permissions defined in <code class="doc-code">api_context.json</code>.</p>
          <DocCode lang="json">{
  "permissions": {
    "soul":          true,
    "calendar":      false,
    "audio":         true,
    "video":         false,
    "images":        false,
    "context_files": true
  }
}</DocCode>

          <DocHeading level="2">BIP39 Mnemonic Authentication</DocHeading>
          <p class="doc-p">Derives a vault key from 12 BIP39 words via PBKDF2 for stateless access without an active session.</p>
          <DocCode>vault_key = PBKDF2-SHA256(mnemonic, soul_id, iterations=100000, length=32)
token     = HMAC-SHA256(vault_key, soul_id)[hex]</DocCode>
          <div class="doc-warning-box mt-4">
            <p class="text-xs font-semibold text-[var(--sys-amber)] mb-1">Rate limiting strongly recommended.</p>
            <p class="text-xs text-[var(--sys-fg-dim)]">PBKDF2 with 100 000 iterations costs ~100ms CPU per request. This endpoint must be rate-limited in production.</p>
          </div>

          <DocHeading level="2">JWT — Service Integration Token</DocHeading>
          <DocCode lang="http">POST /api/soul/v1/token
Authorization: Bearer {soul_id}.{cert}</DocCode>
          <DocCode lang="json">{ "token": "&lt;HS256 JWT&gt;", "expires_in": 2592000, "soul_id": "uuid-v4" }</DocCode>
          <p class="doc-p">Header: <code class="doc-code">alg: HS256</code>. Claims: <code class="doc-code">soul_id</code>, <code class="doc-code">iat</code>, <code class="doc-code">exp</code>. TTL: 30 days. Signed with <code class="doc-code">API_SIGNING_KEY</code> (MUST be distinct from <code class="doc-code">SOUL_MASTER_KEY</code>).</p>
        </section>

        <!-- ═══ MCP TOOLS ═══ -->
        <section id="mcp-tools" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="Spec">MCP Tools</DocHeading>
          <p class="doc-lead">SYS implements the Model Context Protocol (MCP) with Streamable HTTP transport and OAuth 2.0 + PKCE authorization.</p>

          <DocHeading level="2">Connection</DocHeading>
          <DocCode>MCP endpoint:     https://YOUR_DOMAIN/mcp
OAuth authorize:  https://YOUR_DOMAIN/oauth/authorize
OAuth token:      https://YOUR_DOMAIN/oauth/token
Discovery:        https://YOUR_DOMAIN/.well-known/oauth-authorization-server</DocCode>

          <DocHeading level="2">OAuth Flow</DocHeading>
          <div class="doc-steps">
            <div class="doc-step" v-for="(s, i) in oauthSteps" :key="i">
              <div class="doc-step-num">{{ i + 1 }}</div>
              <div><p class="text-sm font-semibold mb-0.5">{{ s.title }}</p><p class="text-sm text-[var(--sys-fg-dim)]">{{ s.desc }}</p></div>
            </div>
          </div>

          <DocHeading level="2">Tool Catalog</DocHeading>
          <div class="doc-table-wrapper mt-4">
            <table class="doc-table">
              <thead><tr><th>Tool</th><th>Requires</th><th>Description</th></tr></thead>
              <tbody>
                <tr v-for="t in mcpTools" :key="t.name">
                  <td><code class="doc-code">{{ t.name }}</code></td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">{{ t.perm }}</td>
                  <td class="text-[var(--sys-fg-dim)]">{{ t.desc }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">soul_write modes</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>mode</th><th>Behavior</th></tr></thead>
              <tbody>
                <tr><td><code class="doc-code">replace</code></td><td class="text-[var(--sys-fg-dim)]">Replace entire section content</td></tr>
                <tr><td><code class="doc-code">append</code></td><td class="text-[var(--sys-fg-dim)]">Add content after existing section content</td></tr>
                <tr><td><code class="doc-code">prepend</code></td><td class="text-[var(--sys-fg-dim)]">Add content before existing section content</td></tr>
              </tbody>
            </table>
          </div>
          <p class="doc-p mt-2">If the target section does not exist, it MUST be created.</p>
        </section>

        <!-- ═══ API REFERENCE ═══ -->
        <section id="endpoints" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="API">Endpoint Reference</DocHeading>
          <p class="doc-lead">Base URL: <code class="doc-code">https://YOUR_DOMAIN</code></p>

          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Method</th><th>Endpoint</th><th>Auth</th><th>Description</th></tr></thead>
              <tbody>
                <tr v-for="e in endpoints" :key="e.path">
                  <td><code class="doc-code text-[var(--sys-fg-dim)]">{{ e.method }}</code></td>
                  <td><code class="doc-code">{{ e.path }}</code></td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">{{ e.auth }}</td>
                  <td class="text-[var(--sys-fg-dim)]">{{ e.desc }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">Rate Limits</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Zone</th><th>Rate</th><th>Burst</th><th>Endpoints</th></tr></thead>
              <tbody>
                <tr v-for="r in rateLimits" :key="r.zone">
                  <td class="font-mono text-xs">{{ r.zone }}</td>
                  <td class="text-[var(--sys-fg-dim)]">{{ r.rate }}</td>
                  <td class="text-[var(--sys-fg-dim)]">{{ r.burst }}</td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">{{ r.eps }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">Error Format</DocHeading>
          <DocCode lang="json">{ "error": "error_code", "message": "Optional human-readable description." }</DocCode>
          <p class="doc-p">Common codes: <code class="doc-code">vault_locked</code> <code class="doc-code">encrypted</code> <code class="doc-code">permission_denied</code> <code class="doc-code">invalid_soul_identity</code> <code class="doc-code">api_not_enabled</code> <code class="doc-code">storage_error</code></p>
        </section>

        <!-- ═══ EXAMPLES ═══ -->
        <section id="examples" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="API">Examples</DocHeading>

          <DocHeading level="2">Full Login Flow</DocHeading>
          <DocCode lang="bash">SOUL_ID="7f3a2b1c-4d5e-6f7a-8b9c-0d1e2f3a4b5c"
BASE="https://YOUR_DOMAIN"

# 1. Get cert
CERT=$(curl -s -X POST "$BASE/api/soul-cert" \
  -H "Content-Type: application/json" \
  -d '{"soul_id":"'"$SOUL_ID"'"}' | jq -r '.cert')

# 2. Validate
curl -s "$BASE/api/validate" -H "Authorization: Bearer $SOUL_ID.$CERT"
# → 200 OK

# 3. Read context
curl -s "$BASE/api/context" -H "Authorization: Bearer $SOUL_ID.$CERT" | jq .</DocCode>

          <DocHeading level="2">Upload Audio File</DocHeading>
          <DocCode lang="bash">B64=$(base64 -w 0 voice-memo.webm)

curl -s -X POST "$BASE/api/vault/sync" \
  -H "Authorization: Bearer $SOUL_ID.$CERT" \
  -H "Content-Type: application/json" \
  -d '{"type":"audio","name":"voice-memo.webm","data":"'"$B64"'","encrypted":false}'
# → { "ok": true, "name": "voice-memo.mp3", "processed": true }</DocCode>

          <DocHeading level="2">Service-Token Access</DocHeading>
          <DocCode lang="bash">SERVICE_TOKEN="abcdef1234..."   # 64 hex chars from api_context.json

curl -s "$BASE/api/soul" -H "Authorization: Bearer $SERVICE_TOKEN"
curl -s "$BASE/api/vault/audio" -H "Authorization: Bearer $SERVICE_TOKEN" | jq '.active_url'</DocCode>

          <DocHeading level="2">Webhook (all resources)</DocHeading>
          <DocCode lang="bash">curl -s -X POST "$BASE/api/webhook" \
  -H "X-Webhook-Token: $SERVICE_TOKEN" | jq '{soul: .soul[0:100], audio_active: .audio_active}'</DocCode>

          <DocHeading level="2">BIP39 Mnemonic Auth</DocHeading>
          <DocCode lang="bash">curl -s -X POST "$BASE/api/webhook/mnemonic" \
  -H "Content-Type: application/json" \
  -d '{"soul_id":"'"$SOUL_ID"'","words":["word1","word2","word3","word4","word5","word6","word7","word8","word9","word10","word11","word12"]}' \
  | jq '{soul_id: .soul_id, has_soul: (.soul != null)}'</DocCode>

          <DocHeading level="2">Fetch Encrypted Bundle</DocHeading>
          <DocCode lang="bash"># Arweave TX ID or HTTPS URL
curl -s -X POST "$BASE/api/fetch-bundle" \
  -H "Content-Type: application/json" \
  -d '{"url":"Cv3x4H9eF2mK1pLqR7sT3uV6wX8yZ0aB2cD4eF6g7h"}' \
  | jq '{schema: .schema, file_count: (.files | length)}'
# Decryption happens client-side</DocCode>

          <DocHeading level="2">MCP via Claude Desktop</DocHeading>
          <DocCode lang="json">{
  "mcpServers": {
    "saveyoursoul": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/client-stdio"],
      "env": { "MCP_SERVER_URL": "https://YOUR_DOMAIN/mcp" }
    }
  }
}</DocCode>
        </section>

        <!-- ═══ ENCRYPTION ═══ -->
        <section id="encryption" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="Architecture">Encryption</DocHeading>

          <div class="doc-table-wrapper mb-6">
            <table class="doc-table">
              <thead><tr><th>Layer</th><th>Algorithm</th><th>Where</th><th>Key holder</th></tr></thead>
              <tbody>
                <tr><td>VPS storage</td><td><code class="doc-code">AES-256-CBC</code></td><td>Server-side files</td><td class="text-[var(--sys-fg-dim)]">User (via vault_key)</td></tr>
                <tr><td>Bundle export</td><td><code class="doc-code">AES-256-GCM</code></td><td>.soul file download</td><td class="text-[var(--sys-fg-dim)]">User (Passkey or BIP39)</td></tr>
                <tr><td>Transit</td><td><code class="doc-code">TLS 1.2+</code></td><td>All API traffic</td><td class="text-[var(--sys-fg-dim)]">Certificate authority</td></tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">VPS File Format (AES-256-CBC)</DocHeading>
          <DocCode>[ 4 bytes magic ][ 16 bytes IV ][ N bytes ciphertext ]
    53 59 53 01     random          PKCS7-padded
    (SYS\x01)</DocCode>
          <p class="doc-p">Files starting with <code class="doc-code">53 59 53 01</code> are encrypted. Files without this magic header are treated as plaintext.</p>

          <DocHeading level="2">Raw Endpoint &amp; Client-Side Decrypt Fallback</DocHeading>
          <p class="doc-p"><code class="doc-code">GET /api/soul?raw=1</code> returns the raw encrypted bytes of <code class="doc-code">sys.md</code> without server-side decryption. This is used for backup / cloud push and as a fallback when the server's active vault session has a different key than the client.</p>
          <p class="doc-p">When the normal <code class="doc-code">GET /api/soul</code> returns <code class="doc-code">decryption_failed</code> or an <code class="doc-code">encrypted</code> status, the browser falls back to:</p>
          <DocCode lang="js">// useSoul.js – _decryptSoulBuffer()
const raw = await fetch('/api/soul?raw=1');
const buf = await raw.arrayBuffer();
// Verify SYS\x01 magic header (bytes 0-3)
const iv         = bytes.slice(4, 20);       // 16-byte IV
const ciphertext = bytes.slice(20);          // PKCS7-padded ciphertext
const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext);</DocCode>
          <p class="doc-p">If client-side decryption also fails (key mismatch), the error <em>"Server-Soul ist mit einem anderen Schlüssel verschlüsselt. Bitte zuerst Vault synchronisieren."</em> is surfaced. The fix is to re-sync the vault so the server re-encrypts with the current key.</p>

          <DocHeading level="2">Bundle Format (AES-256-GCM)</DocHeading>
          <p class="doc-p">Used for <code class="doc-code">.soul</code> bundle exports and cloud backups.</p>
          <DocCode lang="json">{
  "schema": "saveyoursoul/bundle/v1",
  "kdf_params": {
    "algorithm": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 100000,
    "salt": "&lt;base64 random 16 bytes&gt;"
  },
  "files": [
    { "path": "sys.md", "iv": "&lt;base64 12 bytes&gt;", "data": "&lt;base64 AES-256-GCM ciphertext + 16-byte tag&gt;" }
  ]
}</DocCode>

          <DocHeading level="2">Key Derivation for Bundles</DocHeading>
          <p class="doc-p"><strong>From Passkey (WebAuthn):</strong> <code class="doc-code">key = WebAuthn.getAssertion().response.userHandle (32 bytes)</code></p>
          <p class="doc-p"><strong>From BIP39:</strong> <code class="doc-code">key = PBKDF2-SHA256(mnemonic, soul_id, 100000 iter, 32 bytes)</code></p>
          <p class="doc-p">The bundle key never reaches the server. Decryption is always client-side.</p>

          <DocHeading level="2">Key Storage Summary</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Key</th><th>Stored</th><th>Who can read</th></tr></thead>
              <tbody>
                <tr v-for="k in keyStorage" :key="k.key">
                  <td><code class="doc-code">{{ k.key }}</code></td>
                  <td class="text-[var(--sys-fg-dim)]">{{ k.where }}</td>
                  <td class="text-[var(--sys-fg-dim)]">{{ k.who }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="doc-info-box mt-6">
            <p class="text-xs font-semibold text-[var(--sys-accent)] mb-2">Trust boundary</p>
            <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">Full server-side protection (operator cannot read content) applies only when <code class="doc-code">vault_key_hex</code> is NOT persisted in <code class="doc-code">api_context.json</code>. When service-tokens are enabled, <code class="doc-code">vault_key_hex</code> in <code class="doc-code">api_context.json</code> allows the server to decrypt for authorized service requests. This is a deliberate trade-off documented in the privacy policy.</p>
          </div>
        </section>

        <!-- ═══ VAULT ═══ -->
        <section id="vault" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="Architecture">Vault</DocHeading>
          <p class="doc-lead">The vault is the user's personal file store. It exists both locally (File System Access API) and optionally on the VPS.</p>

          <DocHeading level="2">VPS Directory Structure</DocHeading>
          <DocCode>/var/lib/sys/souls/{soul_id}/
├── sys.md                    ← identity file (encrypted or plain)
├── api_context.json           ← permissions, vault index, vault_key_hex
├── soul_connections.json      ← peer network connections
└── vault/
    ├── audio/                 ← MP3 after conversion
    ├── images/
    ├── video/                 ← MP4 H.264+AAC after conversion
    ├── context/               ← .md / .txt / .pdf files
    └── profile/               ← structured JSON profiles</DocCode>

          <DocHeading level="2">Upload Pipeline</DocHeading>
          <div class="doc-steps">
            <div class="doc-step" v-for="(s, i) in uploadPipeline" :key="i">
              <div class="doc-step-num">{{ i + 1 }}</div>
              <div><p class="text-sm text-[var(--sys-fg-dim)]">{{ s }}</p></div>
            </div>
          </div>

          <DocHeading level="2">File Size Limits</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Type</th><th>Max size</th><th>Allowed extensions</th></tr></thead>
              <tbody>
                <tr v-for="f in fileLimits" :key="f.type">
                  <td><code class="doc-code">{{ f.type }}</code></td>
                  <td class="text-[var(--sys-fg-dim)]">{{ f.max }}</td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">{{ f.ext }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="doc-p">Vault quota: 200 files / 500 MB per soul.</p>

          <DocHeading level="2">Vault Session</DocHeading>
          <p class="doc-p">The vault key is held in OpenResty shared memory (<code class="doc-code">lua_shared_dict vault_sessions 10m</code>). Set by <code class="doc-code">POST /api/vault/unlock</code>, cleared by <code class="doc-code">POST /api/vault/lock</code> or TTL expiry. <code class="doc-code">expires_at: 0</code> means unlimited.</p>
        </section>

        <!-- ═══ OPENRESTY ═══ -->
        <section id="openresty" class="doc-section mb-16 scroll-mt-20">
          <DocHeading level="1" badge="Architecture">OpenResty</DocHeading>
          <p class="doc-lead">The reference implementation uses OpenResty (nginx + LuaJIT) as the sole API layer in production. No Node.js process runs in production except the MCP server.</p>

          <DocHeading level="2">Request Flow</DocHeading>
          <DocCode>Browser (SPA)
    │ HTTPS / TLS
    ▼
OpenResty (nginx + LuaJIT)
    ├── /                    → static files (.output/public/)
    ├── /api/soul-cert       → soul_cert.lua          (no auth)
    ├── /api/soul-rotate-cert → soul_rotate_cert.lua  (soul_cert auth)
    ├── /api/soul-sign-sess  → soul_sign_session.lua  (no auth)
    ├── /api/fetch-bundle    → fetch_bundle.lua        (no auth)
    ├── /api/validate        → soul_auth.lua → 200
    ├── /api/context         → soul_auth.lua → api_context.lua
    ├── /api/vault/unlock    → soul_auth.lua → vault_unlock.lua
    ├── /api/vault/sync      → soul_auth.lua → vault_sync.lua
    ├── /api/chat            → soul_auth.lua → Anthropic proxy (SSE)
    ├── /api/soul-update     → soul_auth.lua → Anthropic proxy (JSON)
    ├── /api/soul/v1/token   → soul_auth.lua → soul_token_jwt.lua
    ├── /api/soul            → vault_auth.lua → api_serve.lua
    ├── /api/vault/*         → vault_auth.lua → api_serve.lua
    ├── /api/webhook         → vault_auth.lua → webhook.lua
    ├── /api/webhook/mnemonic → webhook_mnemonic.lua (BIP39 auth)
    ├── /api/vision          → soul_auth.lua → vision_analyze.lua
    ├── /api/tts             → soul_auth.lua → tts.lua
    ├── /api/wavespeed/*     → soul_auth.lua → wavespeed_*.lua
    ├── /mcp                 → proxy → soul-mcp (Node.js :3098)
    └── /oauth/              → proxy → soul-mcp (Node.js :3098)</DocCode>

          <DocHeading level="2">Auth Guards</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>Guard</th><th>Phase</th><th>Accepts</th><th>Sets</th></tr></thead>
              <tbody>
                <tr>
                  <td><code class="doc-code">soul_auth.lua</code></td>
                  <td class="text-[var(--sys-fg-dim)]">access</td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">Bearer {soul_id}.{cert}</td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">ngx.ctx.soul_id, clears Authorization header</td>
                </tr>
                <tr>
                  <td><code class="doc-code">vault_auth.lua</code></td>
                  <td class="text-[var(--sys-fg-dim)]">access</td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">soul_cert OR service_token OR ?token=</td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">soul_id, vault_key, via_webhook, service_permissions</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DocHeading level="2">Environment Variables</DocHeading>
          <p class="doc-p">Declared in the nginx.conf <code class="doc-code">main</code> block. Injected via systemd override. Workers inherit environment only on restart (<code class="doc-code">reload</code> is insufficient).</p>
          <DocCode lang="nginx">env ANTHROPIC_API_KEY;
env SOUL_MASTER_KEY;
env API_SIGNING_KEY;
env ELEVENLABS_API_KEY;
env WAVESPEED_KEY;</DocCode>
          <p class="doc-p">Additional variables for <code class="doc-code">soul-mcp/.env</code> (MCP Node.js process):</p>
          <DocCode lang="dotenv">BASE_URL=https://your-domain.com
SYS_API_URL=https://your-domain.com
PORT=3098
POLYGON_NETWORK=main            # or amoy (testnet)
PINATA_JWT=                     # Optional: .env has priority; fallback is /var/lib/sys/pinata_jwt (set via UI)

# Token-Auth: soul-mcp erkennt zwei Token-Typen automatisch
# soul_cert  → "{uuid}.{32hex}"  — OAuth-Inhaber, voller Tool-Zugang
# pol_access → "{48hex}"         — zahlender externer Agent, nur free_tools
# Validierung via GET /internal/validate-pol-token (localhost, OpenResty shared dict)</DocCode>

          <DocHeading level="2">Lua Script Inventory</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>File</th><th>Phase</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr v-for="l in luaScripts" :key="l.file">
                  <td><code class="doc-code">{{ l.file }}</code></td>
                  <td class="text-xs text-[var(--sys-fg-dim)]">{{ l.phase }}</td>
                  <td class="text-[var(--sys-fg-dim)]">{{ l.purpose }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="doc-info-box mt-4">
            <p class="text-xs text-[var(--sys-fg-dim)] leading-relaxed"><strong class="text-white">Note:</strong> <code class="doc-code">soul_auth.lua</code>, <code class="doc-code">vault_auth.lua</code>, <code class="doc-code">soul_cert.lua</code>, <code class="doc-code">soul_sign_session.lua</code>, <code class="doc-code">soul_token_jwt.lua</code>, and <code class="doc-code">hmac_helper.lua</code> are published as interface stubs only. See <code class="doc-code">CONTRIBUTING.md</code>.</p>
          </div>

          <DocHeading level="2">Dev vs Production</DocHeading>
          <div class="doc-table-wrapper">
            <table class="doc-table">
              <thead><tr><th>nuxt dev (local)</th><th>nuxt generate → VPS</th></tr></thead>
              <tbody>
                <tr><td class="text-[var(--sys-fg-dim)]">Vite dev server</td><td class="text-[var(--sys-fg-dim)]">Static files only</td></tr>
                <tr><td><code class="doc-code">server/api/*.js</code></td><td><code class="doc-code">server/openresty/*.lua</code></td></tr>
                <tr><td class="text-xs text-[var(--sys-fg-dim)]">soul-cert.post.js</td><td class="text-xs text-[var(--sys-fg-dim)]">soul_cert.lua</td></tr>
                <tr><td class="text-xs text-[var(--sys-fg-dim)]">soul-rotate-cert.post.js</td><td class="text-xs text-[var(--sys-fg-dim)]">soul_rotate_cert.lua</td></tr>
                <tr><td class="text-xs text-[var(--sys-fg-dim)]">chat.post.js</td><td class="text-xs text-[var(--sys-fg-dim)]">Anthropic proxy</td></tr>
                <tr><td class="text-xs text-[var(--sys-fg-dim)]">soul-sign-session.post.js</td><td class="text-xs text-[var(--sys-fg-dim)]">soul_sign_session.lua</td></tr>
              </tbody>
            </table>
          </div>
          <p class="doc-p">Both environments MUST exhibit identical behavior. Changes to a JS handler MUST be mirrored in the corresponding Lua script.</p>
        </section>

        <!-- Footer -->
        <div class="pt-8 border-t border-[var(--sys-border)] flex flex-wrap items-center justify-between gap-4">
          <p class="text-xs text-[var(--sys-fg-dim)] opacity-50">Specification version: 1.0-draft · Apache License 2.0</p>
          <a href="https://github.com/uxprojectsjok/SaveYourSoul_SYS" target="_blank" rel="noopener" class="text-xs text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] transition">
            View on GitHub →
          </a>
        </div>

      </main>
    </div>
  </div>
</template>

<script setup>
import { h } from 'vue'

useHead({
  title: 'Developer Docs · SaveYourSoul',
  meta: [
    { name: 'description', content: 'SYS Protocol specification — sys.md format, authentication model, MCP tools, API reference, and architecture docs.' }
  ]
})

const sidebarOpen = ref(false)
const activeSection = ref('overview')

const nav = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      { id: 'overview', title: 'Protocol Overview' },
      { id: 'quickstart', title: 'Quickstart' },
    ]
  },
  {
    id: 'spec',
    title: 'Specification',
    items: [
      { id: 'soul-md', title: 'sys.md Format' },
      { id: 'auth', title: 'Auth Model' },
      { id: 'mcp-tools', title: 'MCP Tools' },
    ]
  },
  {
    id: 'api',
    title: 'API Reference',
    items: [
      { id: 'endpoints', title: 'Endpoints' },
      { id: 'examples', title: 'Examples' },
    ]
  },
  {
    id: 'architecture',
    title: 'Architecture',
    items: [
      { id: 'encryption', title: 'Encryption' },
      { id: 'vault', title: 'Vault' },
      { id: 'openresty', title: 'OpenResty' },
    ]
  }
]

function scrollTo(id) {
  sidebarOpen.value = false
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  activeSection.value = id
}

onMounted(() => {
  const sections = nav.flatMap(g => g.items.map(i => i.id))
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter(e => e.isIntersecting)
      if (visible.length) activeSection.value = visible[0].target.id
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
  )
  sections.forEach(id => {
    const el = document.getElementById(id)
    if (el) observer.observe(el)
  })
})

// ── Data ────────────────────────────────────────────────────────────────────

const principles = [
  { p: 'Local-first', impl: 'sys.md lives in localStorage; vault files in local filesystem' },
  { p: 'Privacy-by-design', impl: 'AES-256-CBC encryption before any server upload' },
  { p: 'Stateless auth', impl: 'HMAC-SHA256 cert derived from key + soul_id — no session DB' },
  { p: 'User-controlled sharing', impl: 'Granular service-token permissions per data type' },
  { p: 'Protocol, not platform', impl: 'sys.md format is open; any compatible server is valid' },
]

const concepts = [
  { term: 'sys.md', def: 'The identity file. Plain Markdown, YAML frontmatter, grows over time.' },
  { term: 'soul_id', def: 'UUID v4. Primary key for all server operations. Never changes.' },
  { term: 'soul_cert', def: '32 hex chars. HMAC-SHA256(SOUL_MASTER_KEY, soul_id)[0:32]. Stateless auth token.' },
  { term: 'vault_key', def: '32-byte AES key. Encrypts sys.md and vault files. Server never stores in plaintext.' },
  { term: 'service-token', def: '64 hex chars. Scoped access token for external services and MCP clients.' },
  { term: 'vault', def: 'Local filesystem folder. Contains audio, images, video, context files.' },
  { term: 'soul_grant', def: 'Permission record created when two souls connect in the network.' },
]

const standards = [
  { std: 'MCP (Model Context Protocol)', rel: 'SYS implements MCP server + OAuth 2.0 + PKCE' },
  { std: 'ActivityPub', rel: 'Conceptually similar — federated identity, but AI-native' },
  { std: 'DID (W3C)', rel: 'soul_id is not a DID but could be mapped to one' },
  { std: 'JWT', rel: 'soul_cert is simpler — stateless HMAC, no claims payload' },
  { std: 'BIP39', rel: 'Used for key derivation in mnemonic auth path' },
]

const frontmatterFields = [
  { field: 'soul_id', type: 'UUID v4', req: 'MUST', desc: 'Primary key. Globally unique. Never changes.' },
  { field: 'soul_name', type: 'string', req: 'MUST', desc: 'Display name chosen by the user.' },
  { field: 'created', type: 'ISO 8601 date', req: 'MUST', desc: 'Creation date of this soul.' },
  { field: 'last_session', type: 'ISO 8601 date', req: 'MUST', desc: 'Date of most recent session.' },
  { field: 'version', type: 'integer', req: 'MUST', desc: 'Schema version. Currently 1.' },
  { field: 'soul_cert', type: '32 hex chars', req: 'MUST', desc: 'HMAC auth token. See Auth Model.' },
  { field: 'cert_version', type: 'integer', req: 'MAY', desc: 'Cert rotation counter. Default 0 (legacy formula). Incremented by /api/soul-rotate-cert.' },
  { field: 'vault_hash', type: 'SHA-256 hex', req: 'MAY', desc: 'Hash of the last synced vault state.' },
  { field: 'soul_growth_chain', type: 'array', req: 'MAY', desc: 'Chronological chain of session hashes.' },
  { field: 'soul_chain_anchor', type: 'string|null', req: 'MAY', desc: 'Blockchain tx hash for on-chain anchoring.' },
  { field: 'storage_tx', type: 'string', req: 'MAY', desc: 'Arweave transaction ID for decentralized storage.' },
]

const bodySections = [
  { s: '## Core Identity', p: 'One-sentence identity summary' },
  { s: '## Values & Beliefs', p: 'Motivations, worldview foundations' },
  { s: '## Aesthetics & Resonance', p: 'Music, visuals, atmospheres' },
  { s: '## Speech Patterns & Expression', p: 'How the person communicates' },
  { s: '## Recurring Themes & Obsessions', p: 'Persistent interests' },
  { s: '## Emotional Signature', p: 'Felt quality of interaction' },
  { s: '## Worldview', p: 'View of humanity, society, future' },
  { s: '## Unanswered Questions', p: 'Open questions this person carries' },
  { s: '## Entwicklung Log (komprimiert)', p: 'KI-komprimierter Entwicklungsverlauf' },
  { s: '## Calendar', p: 'Calendar events (requires calendar permission)' },
  { s: '## Skills', p: 'Structured skill declarations' },
]

const trustModel = [
  { id: 'Soul owner', key: 'soul_cert', level: 'Full', scope: 'All operations on own soul' },
  { id: 'External service', key: 'service-token', level: 'Scoped', scope: 'Permissions in api_context.json' },
  { id: 'Mnemonic caller', key: 'BIP39 12-word phrase', level: 'Scoped', scope: 'Same as service-token' },
  { id: 'Server operator', key: 'SOUL_MASTER_KEY', level: 'Root', scope: 'Can derive any cert' },
]

const oauthSteps = [
  { title: 'GET /oauth/authorize', desc: 'Client sends PKCE code_challenge. HTML consent page shows soul_id + permissions requested.' },
  { title: 'POST /oauth/authorize', desc: 'User approves with soul_id + cert. Server issues auth code (in-memory, 5 min TTL).' },
  { title: 'POST /oauth/token', desc: 'Client exchanges code + code_verifier for access_token (= scoped service-token).' },
  { title: 'MCP tool calls', desc: 'All requests use Authorization: Bearer {access_token}.' },
]

const mcpTools = [
  { name: 'soul_read', perm: 'soul', desc: 'Read the full sys.md content' },
  { name: 'soul_write', perm: 'soul', desc: 'Update a ## Section in sys.md (replace/append/prepend)' },
  { name: 'soul_maturity', perm: 'soul', desc: 'Compute and optionally persist the maturity score (0–100)' },
  { name: 'soul_skills', perm: 'soul', desc: 'Read/write structured skill declarations from ## Skills' },
  { name: 'soul_cloud_push', perm: 'soul', desc: 'Push AES-256-GCM encrypted bundle to Arweave or cloud' },
  { name: 'verify_human', perm: 'soul', desc: 'Verify passkey-based proof of human identity' },
  { name: 'vault_manifest', perm: 'soul', desc: 'Read the vault index (synced_files, active_files, permissions)' },
  { name: 'audio_list', perm: 'audio', desc: 'List synced audio files' },
  { name: 'audio_get', perm: 'audio', desc: 'Get a specific audio file or the active audio URL' },
  { name: 'image_list', perm: 'images', desc: 'List synced image files' },
  { name: 'image_get', perm: 'images', desc: 'Get a specific image file' },
  { name: 'video_list', perm: 'video', desc: 'List synced video files' },
  { name: 'video_get', perm: 'video', desc: 'Get a specific video file' },
  { name: 'context_list', perm: 'context_files', desc: 'List synced context documents' },
  { name: 'context_get', perm: 'context_files', desc: 'Get a specific context document. PDFs are server-side extracted to plain text via pdftotext before returning — no binary transfer.' },
  { name: 'calendar_read', perm: 'calendar', desc: 'Read the ## Calendar section of sys.md' },
  { name: 'network_list', perm: 'soul', desc: 'List connected souls and their public manifests' },
  { name: 'network_peer_get', perm: 'soul', desc: 'Read shared content from a connected peer. Without file param: returns soul_content (sys.md, decrypted server-side if needed) + all public context files inline. With file="sys.md": returns sys.md directly via soul permission — no public_files entry required. Other files require explicit public_files entry in the peer\'s vault config.' },
  { name: 'profile_get', perm: 'soul', desc: 'Read a structured profile (e.g. expertise.json)' },
  { name: 'profile_save', perm: 'soul', desc: 'Write a structured profile' },
  { name: 'beme_chat', perm: 'soul', desc: 'Talk as soul — AI responds as the soul owner, server-side Anthropic call' },
  { name: 'elevenlabs_agent_update', perm: 'soul', desc: 'Update ElevenLabs conversational AI agent with current soul data' },
  { name: 'soul_earnings',           perm: 'soul', desc: 'Read POL earnings — total received, request count, last 20 payment entries (tx_hash, wallet, amount, timestamp)' },
  { name: 'soul_discover',           perm: 'soul', desc: 'Search IPFS/Pinata agent marketplace for registered SYS souls — filter amortized=true, search by name/soul_id, returns mcp_endpoint + payment workflow' },
  // Paid-Agent Tools (pol_access_token, nur free_tools)
  { name: 'soul_read (paid)',        perm: 'pol_access_token', desc: 'soul_read for paying external agents — calls /api/soul/paid-read instead of /api/soul. Only available when amortization.enabled=true. Registered via registerPaidTools() in soul-mcp.' },
]

const endpoints = [
  { method: 'POST', path: '/api/soul-cert', auth: 'none', desc: 'Derive soul_cert for a soul_id (optional cert_version in body)' },
  { method: 'POST', path: '/api/soul-rotate-cert', auth: 'soul_cert', desc: 'Rotate cert — increments cert_version in sys.md, old cert immediately invalid' },
  { method: 'POST', path: '/api/soul-sign-session', auth: 'none', desc: 'Sign a growth chain entry' },
  { method: 'GET', path: '/api/validate', auth: 'soul_cert', desc: 'Validate cert (200 or 401)' },
  { method: 'GET', path: '/api/context', auth: 'soul_cert', desc: 'Read API context + permissions' },
  { method: 'PUT', path: '/api/context', auth: 'soul_cert', desc: 'Update context + upload sys.md' },
  { method: 'POST', path: '/api/vault/unlock', auth: 'soul_cert', desc: 'Unlock vault with AES key' },
  { method: 'POST', path: '/api/vault/lock', auth: 'soul_cert', desc: 'Lock vault immediately' },
  { method: 'GET', path: '/api/vault/session', auth: 'soul_cert', desc: 'Query vault session status' },
  { method: 'POST', path: '/api/vault/sync', auth: 'soul_cert', desc: 'Upload a file to vault' },
  { method: 'GET', path: '/api/vault/manifest', auth: 'vault_auth', desc: 'Vault index' },
  { method: 'GET', path: '/api/soul', auth: 'vault_auth', desc: 'Read sys.md (decrypts on-the-fly)' },
  { method: 'GET', path: '/api/vault/audio[/{file}]', auth: 'vault_auth', desc: 'List or get audio files' },
  { method: 'GET', path: '/api/vault/video[/{file}]', auth: 'vault_auth', desc: 'List or get video files' },
  { method: 'GET', path: '/api/vault/images[/{file}]', auth: 'vault_auth', desc: 'List or get image files' },
  { method: 'GET', path: '/api/vault/context[/{file}]', auth: 'vault_auth', desc: 'List or get context files' },
  { method: 'GET/PUT/DELETE', path: '/api/vault/profile/{type}', auth: 'vault_auth', desc: 'Read, write, or delete analysis profiles (face/voice/motion/expertise) — always AES-256-CBC encrypted on disk' },
  { method: 'DELETE', path: '/api/vault/{type}/{file}', auth: 'soul_cert', desc: 'Delete a vault file' },
  { method: 'GET', path: '/api/vault/public/{soul_id}[/{file}]', auth: 'soul_cert / api_grant', desc: 'Public vault — list or get files shared with network partners' },
  { method: 'GET', path: '/api/vault/peer-stream', auth: 'service_token', desc: 'Peer vault file as raw binary with correct MIME — used by network_peer_get MCP tool' },
  { method: 'GET/POST', path: '/api/vault/connections/network', auth: 'vault_auth', desc: 'Soul Network — list, connect, disconnect souls' },
  { method: 'POST', path: '/api/beme', auth: 'vault_auth', desc: 'Talk as soul — reads sys.md server-side, calls Anthropic, responds as the soul owner' },
  { method: 'POST', path: '/api/chat', auth: 'soul_cert', desc: 'Chat proxy (SSE streaming to Anthropic)' },
  { method: 'POST', path: '/api/soul-update', auth: 'soul_cert', desc: 'Soul enrichment (JSON)' },
  { method: 'POST', path: '/api/fetch-bundle', auth: 'none', desc: 'Fetch encrypted bundle from URL' },
  { method: 'POST', path: '/api/webhook', auth: 'service_token', desc: 'Generic webhook — all resources' },
  { method: 'POST', path: '/api/webhook/mnemonic', auth: 'BIP39 body', desc: 'Mnemonic-auth webhook' },
  { method: 'POST', path: '/api/soul/v1/token', auth: 'soul_cert', desc: 'Issue JWT service token' },
  { method: 'GET', path: '/api/vision', auth: 'soul_cert', desc: 'Claude vision analysis endpoint' },
  { method: 'GET', path: '/api/tts', auth: 'soul_cert', desc: 'ElevenLabs TTS proxy' },
  { method: 'GET/POST', path: '/mcp', auth: 'OAuth 2.0', desc: 'MCP Streamable HTTP endpoint' },
  // Amortisierungs-Stack
  { method: 'GET',     path: '/api/soul/meta',         auth: 'none',      desc: 'Public soul metadata — name, schema, cipher_mode, mcp_endpoint. No auth, 300s cache.' },
  { method: 'GET',     path: '/api/soul/verify',       auth: 'none',      desc: 'Polygon verification (SoulRegistry contract). 24h cache on hit (verify_cache shared dict), 5min on miss.' },
  { method: 'GET/PUT', path: '/api/soul/amortization', auth: 'soul_cert', desc: 'Read or update amortization config (enabled, pol_per_request, wallet, free_tools[]). PUT enabled=true requires prior Polygon verification.' },
  { method: 'POST',    path: '/api/soul/pay',          auth: 'none',      desc: 'POL payment for MCP access. Body: {soul_id, tx_hash}. Validates TX on-chain (recipient, amount, confirmations). Replay-protected 48h. Issues access_token (1h).' },
  { method: 'GET',           path: '/api/soul/earnings',      auth: 'soul_cert', desc: 'POL earnings ledger — total_pol, total_requests, entries[] per payment.' },
  { method: 'POST',          path: '/api/soul/register',      auth: 'soul_cert', desc: 'Pin ERC-8004 agent metadata to IPFS via Pinata. Requires Polygon verification + PINATA_JWT. Stores CID in api_context.json.' },
  { method: 'GET/PUT/DELETE', path: '/api/soul/pinata-config', auth: 'soul_cert', desc: 'Read or set Pinata JWT for IPFS pinning. Stored in /var/lib/sys/pinata_jwt — read at runtime, no soul-mcp restart needed. DELETE clears the key.' },
  // Zugangsmodus + pol_access_token Flow
  { method: 'GET',  path: '/api/soul/paid-read',             auth: 'pol_access_token', desc: 'Returns sys.md for paying external agents. Bearer must be a valid pol_access_token (48 hex chars, 1h TTL from /api/soul/pay). Only works when amortization.enabled=true. Rejects encrypted sys.md with 403.' },
  { method: 'GET',  path: '/internal/validate-pol-token',    auth: 'localhost only',   desc: 'Validates pol_access_token via pol_access shared dict. Returns {ok, soul_id, expires_at}. Called by soul-mcp to distinguish OAuth soul_cert from paid pol_access_token.' },
]

const rateLimits = [
  { zone: 'chat', rate: '1 r/s', burst: '5–30', eps: '/api/chat, /api/soul-update, vision' },
  { zone: 'api', rate: '30 r/s', burst: '10–30', eps: 'General API' },
  { zone: 'auth', rate: '5 r/s', burst: '2–5', eps: '/api/soul-cert, /api/validate' },
  { zone: 'mcp', rate: '5 r/s', burst: '10', eps: '/mcp' },
  { zone: 'oauth', rate: '3 r/s', burst: '5', eps: '/oauth/' },
]

const keyStorage = [
  { key: 'SOUL_MASTER_KEY', where: 'systemd environment', who: 'Server process only' },
  { key: 'API_SIGNING_KEY', where: 'systemd environment', who: 'Server process only' },
  { key: 'vault_key (session)', where: 'OpenResty shared dict', who: 'Server process only, TTL-bound' },
  { key: 'vault_key_hex (persisted)', where: 'api_context.json on VPS', who: 'Server + authorized service-tokens' },
  { key: 'Bundle key (GCM)', where: "User's brain / Passkey / BIP39", who: 'User only — never touches server' },
]

const uploadPipeline = [
  'client: base64-encode file → POST /api/vault/sync { type, name, data, encrypted }',
  'server: validate soul_id (alphanumeric, max 64 chars)',
  'server: decode base64, check file size limit',
  'server: check vault quota (200 files, 500 MB total)',
  'server: validate file extension (whitelist per type)',
  'server: validate magic bytes (signature check)',
  'server: ClamAV scan via clamd INSTREAM protocol',
  'server: write to vault/{type}/{filename}',
  'server: convert audio → MP3 (ffmpeg) / video → MP4 H.264+AAC',
  'server: update synced_files in api_context.json',
]

const fileLimits = [
  { type: 'audio', max: '50 MB', ext: 'mp3, wav, ogg, webm, m4a, opus, flac, aac' },
  { type: 'video', max: '100 MB', ext: 'mp4, mov, avi, mkv, webm' },
  { type: 'image', max: '10 MB', ext: 'jpg, jpeg, png, webp, gif, avif' },
  { type: 'context', max: '512 KB', ext: 'md, txt, pdf' },
]

const luaScripts = [
  { file: 'soul_auth.lua', phase: 'access', purpose: 'soul_cert validation (stub)' },
  { file: 'vault_auth.lua', phase: 'access', purpose: 'soul_cert + service_token validation (stub)' },
  { file: 'soul_cert.lua', phase: 'content', purpose: 'cert derivation endpoint (stub)' },
  { file: 'soul_rotate_cert.lua', phase: 'content', purpose: 'cert rotation — increments cert_version in sys.md' },
  { file: 'soul_sign_session.lua', phase: 'content', purpose: 'growth chain signing (stub)' },
  { file: 'soul_token_jwt.lua', phase: 'content', purpose: 'JWT issuance (stub)' },
  { file: 'hmac_helper.lua', phase: 'module', purpose: 'HMAC utility (stub)' },
  { file: 'api_context.lua', phase: 'content', purpose: 'GET/PUT /api/context' },
  { file: 'vault_unlock.lua', phase: 'content', purpose: 'vault session management' },
  { file: 'vault_sync.lua', phase: 'content', purpose: 'file upload + ClamAV + ffmpeg' },
  { file: 'api_serve.lua', phase: 'content', purpose: 'sys.md + vault file serving' },
  { file: 'webhook.lua', phase: 'content', purpose: 'generic webhook' },
  { file: 'webhook_mnemonic.lua', phase: 'content', purpose: 'BIP39-authenticated webhook' },
  { file: 'fetch_bundle.lua', phase: 'content', purpose: 'fetch encrypted bundle (no auth)' },
  { file: 'external_vault.lua', phase: 'content', purpose: 'fetch soul from external URL' },
  { file: 'tts.lua', phase: 'content', purpose: 'ElevenLabs TTS proxy' },
  { file: 'vision_analyze.lua', phase: 'content', purpose: 'Claude vision endpoint' },
  { file: 'wavespeed_submit.lua', phase: 'content', purpose: 'WaveSpeed AI image generation' },
  { file: 'wavespeed_result.lua', phase: 'content', purpose: 'WaveSpeed result polling' },
  { file: 'vault_delete.lua', phase: 'content', purpose: 'file deletion' },
  { file: 'vault_services.lua', phase: 'content', purpose: 'service management' },
  { file: 'vault_profile.lua', phase: 'content', purpose: 'profile read/write' },
  { file: 'vault_public.lua', phase: 'content', purpose: 'public vault serving' },
  { file: 'soul_connections.lua', phase: 'content', purpose: 'soul network connections + permissions whitelist (soul/audio/images/video/context_files)' },
  { file: 'vault_connections_peer.lua', phase: 'content', purpose: 'peer vault access — reads partner\'s Public Vault files' },
  { file: 'vault_peer_stream.lua', phase: 'content', purpose: 'peer vault file streaming — raw binary + correct MIME for any file type' },
  { file: 'beme.lua',                phase: 'content', purpose: 'beme_chat backend — decrypts sys.md, builds soul system prompt, calls Anthropic API server-side' },
  // Amortisierungs-Stack
  { file: 'soul_meta.lua',          phase: 'content', purpose: 'GET /api/soul/meta — public metadata (name, schema, mcp_endpoint). No auth, 300s cache.' },
  { file: 'soul_verify_cache.lua',  phase: 'content', purpose: 'GET /api/soul/verify — Polygon verification with 24h cache via verify_cache shared dict' },
  { file: 'soul_amortization.lua',  phase: 'content', purpose: 'GET/PUT /api/soul/amortization — amortization config. PUT enabled=true requires Polygon verification.' },
  { file: 'soul_pay.lua',           phase: 'content', purpose: 'POST /api/soul/pay — POL TX verification (ethers.js via MCP), replay protection, access_token issuance (1h)' },
  { file: 'soul_earnings.lua',      phase: 'content', purpose: 'GET /api/soul/earnings — soul_cert auth, reads earnings.json ledger' },
  { file: 'soul_register.lua',       phase: 'content', purpose: 'POST /api/soul/register — pins ERC-8004 agent metadata to IPFS via Pinata (calls MCP /internal/pin-json)' },
  { file: 'soul_pinata_config.lua', phase: 'content', purpose: 'GET/PUT/DELETE /api/soul/pinata-config — stores Pinata JWT in /var/lib/sys/pinata_jwt; soul-mcp reads it at runtime without restart' },
  // Zugangsmodus (Free/Pay Toggle)
  { file: 'soul_paid_read.lua',    phase: 'content', purpose: 'GET /api/soul/paid-read — serves sys.md to paying external agents (pol_access_token auth). Only active when amortization.enabled=true.' },
  { file: 'soul_pol_validate.lua', phase: 'content', purpose: 'GET /internal/validate-pol-token — localhost only. Reads pol_access shared dict, returns {ok, soul_id, expires_at}. Used by soul-mcp to validate paying agents.' },
]

// ── Inline Components ─────────────────────────────────────────────────────────
const DocHeading = defineComponent({
  props: { level: String, badge: String },
  slots: ['default'],
  setup(props, { slots }) {
    return () => {
      const text = slots.default?.()
      const badge = props.badge ? h('span', {
        class: 'text-xs font-mono px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.08)] text-white/70 border border-[rgba(255,255,255,0.18)] ml-2 align-middle'
      }, props.badge) : null
      if (props.level === '1') {
        return h('h2', { class: 'doc-heading-1 flex items-center flex-wrap gap-2' }, [text, badge])
      }
      return h('h3', { class: 'doc-heading-2' }, [text])
    }
  }
})

const DocCode = defineComponent({
  props: { lang: String },
  slots: ['default'],
  setup(props, { slots }) {
    return () => h('div', { class: 'my-4 rounded-xl overflow-hidden border border-[rgba(255,255,255,0.13)]' }, [
      props.lang ? h('div', {
        class: 'px-4 py-2 bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.13)] flex items-center gap-2'
      }, [
        h('span', { class: 'w-2 h-2 rounded-full bg-[rgba(255,255,255,0.15)]' }),
        h('span', { class: 'text-xs font-mono text-[var(--sys-fg-dim)]' }, props.lang)
      ]) : null,
      h('pre', { class: 'px-4 py-4 overflow-x-auto bg-[rgba(255,255,255,0.02)] text-xs font-mono text-[var(--sys-fg)] leading-relaxed m-0' },
        h('code', {}, slots.default?.())
      )
    ])
  }
})
</script>

<style scoped>
/* ── Design tokens ── */
.docs-page {
  --ink: #08070c; --paper: #12101a; --paper-2: #1a1726; --paper-3: #0d0b14;
  --rule: rgba(226,220,240,0.10); --rule-2: rgba(226,220,240,0.20);
  --fg: #ece7f5; --fg-2: rgba(236,231,245,0.72); --fg-3: rgba(236,231,245,0.48); --fg-4: rgba(236,231,245,0.30);
  --accent: #8b5cf6; --accent-2: rgba(139,92,246,0.14); --accent-bright: #a78bfa;
  --serif: 'Noto Serif', Georgia, serif;
  --sans: 'Inter', system-ui, sans-serif;
  --mono: 'Oxanium', monospace;
  min-height: 100dvh;
  background: var(--paper);
  color: var(--fg);
  font-family: var(--sans);
}

/* ── Top Nav ── */
.docs-nav { position: sticky; top: 0; z-index: 40; border-bottom: 1px solid var(--rule); background: rgba(18,16,26,0.92); backdrop-filter: blur(16px); }
.docs-nav-inner { max-width: 1280px; margin: 0 auto; padding: 0 clamp(16px,3vw,32px); height: 56px; display: flex; align-items: center; gap: 20px; }
.docs-lockup { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.docs-logo { width: 28px; height: 28px; object-fit: contain; }
.docs-mark { font-family: var(--mono); font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: var(--fg); }
.docs-dot { color: var(--accent); }
.docs-slash { color: var(--rule-2); margin: 0 2px; font-size: 14px; }
.docs-title { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-4); }

.docs-nav-right { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.docs-github { display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--fg-3); text-decoration: none; border: 1px solid var(--rule-2); padding: 6px 12px; transition: color 0.15s, border-color 0.15s; }
.docs-github:hover { color: var(--accent); border-color: var(--accent); }
.docs-back { display: inline-flex; align-items: center; font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); text-decoration: none; transition: color 0.15s; white-space: nowrap; }
.docs-back:hover { color: var(--accent); }
.docs-menu-btn { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: var(--fg-3); background: transparent; border: none; cursor: pointer; }

/* ── Doc Hero ── */
.doc-hero { margin-bottom: 56px; max-width: 640px; padding-bottom: 40px; border-bottom: 1px solid var(--rule); }
.doc-hero-kicker { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-4); display: block; margin-bottom: 16px; }
.doc-hero-title { font-family: var(--serif); font-size: clamp(36px,5vw,64px); font-weight: 700; letter-spacing: -0.025em; line-height: 1.05; color: var(--fg); margin: 0 0 16px; }
.doc-hero-title em { color: var(--accent); font-style: italic; }
.doc-hero-sub { font-size: 16px; line-height: 1.65; color: var(--fg-2); margin: 0; }

/* ── Content typography ── */
.doc-heading-1 { font-family: var(--serif); font-size: 24px; font-weight: 700; letter-spacing: -0.015em; line-height: 1.25; color: var(--fg); margin: 48px 0 16px; padding-top: 0; }
.doc-heading-1:first-child { margin-top: 0; }
.doc-heading-2 { font-family: var(--mono); font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); margin: 32px 0 12px; font-weight: 500; }

.doc-lead { font-size: 17px; line-height: 1.7; color: var(--fg-2); margin-bottom: 20px; }
.doc-p    { font-size: 15px; line-height: 1.75; color: var(--fg-2); margin-bottom: 14px; }
.doc-list { font-size: 15px; line-height: 1.75; color: var(--fg-2); padding-left: 20px; margin-bottom: 14px; }
.doc-code { font-family: var(--mono); font-size: 12px; background: rgba(139,92,246,0.12); color: var(--accent-bright); padding: 2px 6px; }

.doc-info-box    { background: rgba(139,92,246,0.06); border: 1px solid rgba(139,92,246,0.25); padding: 16px 20px; margin: 20px 0; }
.doc-warning-box { background: rgba(255,200,0,0.04); border: 1px solid rgba(255,200,0,0.20); padding: 16px 20px; margin: 20px 0; }

.doc-section { border-top: 1px solid var(--rule); padding-top: 16px; }
.doc-section:first-of-type { border-top: none; padding-top: 0; }

.doc-steps    { display: flex; flex-direction: column; gap: 16px; }
.doc-step     { display: flex; gap: 16px; }
.doc-step-num { width: 24px; height: 24px; border: 1px solid var(--rule-2); color: var(--fg-3); font-family: var(--mono); font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }

.doc-table-wrapper { overflow-x: auto; border: 1px solid var(--rule); }
.doc-table         { width: 100%; font-size: 13px; border-collapse: collapse; }
.doc-table th      { text-align: left; padding: 10px 16px; font-family: var(--mono); font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-4); background: rgba(13,11,20,0.6); border-bottom: 1px solid var(--rule); }
.doc-table td      { padding: 10px 16px; font-size: 13px; color: var(--fg-2); border-bottom: 1px solid var(--rule); }
.doc-table tr:last-child td { border-bottom: none; }
</style>
