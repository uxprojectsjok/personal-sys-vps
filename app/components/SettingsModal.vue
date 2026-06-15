<template>
  <Teleport :disabled="inline" to="body">
    <Transition name="sys-modal-fade">
      <div
        v-if="inline || open"
        :class="inline ? null : 'sys-modal-overlay'"
        @click.self="!inline && $emit('close')"
        :role="!inline ? 'dialog' : undefined"
        :aria-modal="!inline ? 'true' : undefined"
        :aria-label="!inline ? 'Einstellungen' : undefined"
      >
        <div :class="inline ? null : 'sys-modal sys-modal--md'" :style="!inline ? 'max-width:520px' : ''">
          <template v-if="!inline">
            <div class="sys-modal-handle"></div>
            <!-- Head -->
            <div class="sys-modal-head" style="padding:20px 28px 16px">
              <button class="sys-modal-close" @click="$emit('close')" aria-label="Schließen">×</button>
              <span class="sys-kicker" style="margin-bottom:0;padding-bottom:0;border-bottom:none">Einstellungen</span>
            </div>
          </template>

          <!-- Rail / Tabs -->
          <div class="sys-rail sys-rail--6">
            <button @click="tab = 'api'" class="sys-rail-item" :class="tab === 'api' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">API</span></span>
            </button>
            <button @click="tab = 'dienste'" class="sys-rail-item" :class="tab === 'dienste' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">Dienste</span></span>
            </button>
            <button @click="tab = 'plugins'" class="sys-rail-item" :class="tab === 'plugins' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">Plugins</span></span>
            </button>
            <button @click="tab = 'config'" class="sys-rail-item" :class="tab === 'config' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">Config</span></span>
            </button>
            <button @click="tab = 'archivar'; loadArchivStatus()" class="sys-rail-item" :class="tab === 'archivar' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">Archivar</span></span>
            </button>
            <button @click="tab = 'gesundheit'; loadHealthConfig()" class="sys-rail-item" :class="tab === 'gesundheit' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">Gesundheit</span></span>
            </button>
          </div>

          <!-- Body -->
          <div :class="inline ? 'settings-inline-body' : 'sys-modal-body'" style="padding:24px 28px;overflow-y:auto">

            <!-- ── Tab: Dienste ── -->
            <template v-if="tab === 'dienste'">

              <!-- WaveSpeed Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  WaveSpeed API-Key
                  <span v-if="wavespeedKeySet" class="sm-key-ok">{{ wavespeedPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="wavespeedKey"
                    :type="showWavespeedKey ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none;border-radius:var(--r-xs) 0 0 var(--r-xs)"
                    :style="wavespeedKeySet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="wavespeedKeySet ? 'Neu eingeben zum Überschreiben…' : 'WaveSpeed API-Key…'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="wavespeedDirty = true"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showWavespeedKey = !showWavespeedKey"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none;border-radius:0 var(--r-xs) var(--r-xs) 0"
                    :aria-label="showWavespeedKey ? 'Key verbergen' : 'Key anzeigen'"
                  >
                    <i :class="showWavespeedKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div v-if="wavespeedKeySet" style="display:flex;gap:8px">
                  <button @click="deleteKey('wavespeed_key')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">Löschen</button>
                </div>
              </div>

              <!-- ElevenLabs Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  ElevenLabs API-Key
                  <span v-if="elevenlabsKeySet" class="sm-key-ok">{{ elevenlabsPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="elevenlabsKey"
                    :type="showElevenlabsKey ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none;border-radius:var(--r-xs) 0 0 var(--r-xs)"
                    :style="elevenlabsKeySet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="elevenlabsKeySet ? 'Neu eingeben zum Überschreiben…' : 'ElevenLabs API-Key…'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="elevenlabsDirty = true"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showElevenlabsKey = !showElevenlabsKey"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none;border-radius:0 var(--r-xs) var(--r-xs) 0"
                    :aria-label="showElevenlabsKey ? 'Key verbergen' : 'Key anzeigen'"
                  >
                    <i :class="showElevenlabsKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div v-if="elevenlabsKeySet" style="display:flex;gap:8px">
                  <button @click="deleteKey('elevenlabs_key')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">Löschen</button>
                </div>
              </div>

              <!-- ElevenLabs Agent-URL (Klartext-URL, kein eye) -->
              <div class="sys-field" style="gap:12px">
                <label class="sys-field-label">
                  ElevenLabs Agent-URL
                  <span v-if="agentUrlSet" class="sm-key-ok">gespeichert</span>
                </label>
                <input
                  v-model="agentUrl"
                  type="text"
                  class="sys-input"
                  :style="agentUrlSet ? 'border-color:var(--sys-ok)' : ''"
                  :placeholder="agentUrlSet ? 'Neu eingeben zum Überschreiben…' : 'https://elevenlabs.io/app/talk-to?agent_id=…'"
                  autocomplete="off"
                  spellcheck="false"
                  @keyup.enter="saveAgentUrl"
                />
                <div v-if="agentUrl || agentUrlSet" style="display:flex;align-items:center;gap:8px">
                  <button v-if="agentUrl" @click="saveAgentUrl" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn">Speichern</button>
                  <button v-if="agentUrlSet" @click="deleteAgentUrl" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">Löschen</button>
                  <span v-if="agentUrlFeedback" class="sm-feedback"
                    :style="agentUrlFeedback.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'">
                    {{ agentUrlFeedback.message }}
                  </span>
                </div>
              </div>

              <!-- Feedback -->
              <Transition name="sys-modal-fade">
                <div v-if="feedback" style="margin-top:12px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="feedback.ok
                    ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                    : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                >{{ feedback.message }}</div>
              </Transition>

            </template>

            <!-- ── Tab: API ── -->
            <template v-if="tab === 'api'">

              <!-- Key status -->
              <div class="sys-state" :class="keySource === 'soul' ? 'sys-state--ok' : keySource === 'none' ? '' : 'sys-state--info'" style="margin-bottom:20px">
                <div class="sys-state-mark"></div>
                <div class="sys-state-text">
                  <span class="sys-state-label">{{ keySourceLabel }}</span>
                  <span v-if="keyPreview" class="sys-state-value">{{ keyPreview }}</span>
                </div>
              </div>

              <!-- Model -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">Modell</label>
                <select v-model="model" class="sys-input" style="cursor:pointer">
                  <option value="">Server-Standard</option>
                  <option value="claude-opus-4-6">Claude Opus 4.6 — leistungsstark</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — ausgewogen</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — schnell</option>
                </select>
              </div>

              <!-- Anthropic Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">Anthropic API-Key</label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="apiKey"
                    :type="showKey ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none;border-radius:var(--r-xs) 0 0 var(--r-xs)"
                    :style="(keySource === 'soul' || keySource === 'master') ? 'border-color:var(--sys-ok)' : ''"
                    placeholder="sk-ant-..."
                    autocomplete="off"
                    spellcheck="false"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showKey = !showKey"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none;border-radius:0 var(--r-xs) var(--r-xs) 0"
                    :aria-label="showKey ? 'Key verbergen' : 'Key anzeigen'"
                  >
                    <i :class="showKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div v-if="keySource === 'soul'" style="display:flex;gap:8px">
                  <button @click="deleteKey('anthropic_key')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">Löschen</button>
                </div>
              </div>

              <!-- Feedback -->
              <Transition name="sys-modal-fade">
                <div v-if="feedback" style="margin-top:12px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="feedback.ok
                    ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                    : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                >{{ feedback.message }}</div>
              </Transition>

            </template>

            <!-- ── Tab: Plugins ── -->
            <template v-if="tab === 'plugins'">

              <!-- Brave Search Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  Brave Search API-Key
                  <span v-if="braveKeySet" class="sm-key-ok">{{ bravePreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="braveKey"
                    :type="showBraveKey ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none;border-radius:var(--r-xs) 0 0 var(--r-xs)"
                    :style="braveKeySet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="braveKeySet ? 'Neu eingeben zum Überschreiben…' : 'BSA…'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="braveDirty = true"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showBraveKey = !showBraveKey"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none;border-radius:0 var(--r-xs) var(--r-xs) 0"
                    :aria-label="showBraveKey ? 'Key verbergen' : 'Key anzeigen'"
                  >
                    <i :class="showBraveKey ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div v-if="braveKeySet" style="display:flex;gap:8px">
                  <button @click="deleteKey('brave_key')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">Löschen</button>
                </div>
              </div>

              <!-- Reown Project ID -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  Reown Project ID
                  <span v-if="reownSet" class="sm-key-ok">{{ reownPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="reownProjectId"
                    :type="showReownId ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none;border-radius:var(--r-xs) 0 0 var(--r-xs)"
                    :style="reownSet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="reownSet ? 'Neu eingeben zum Überschreiben…' : 'a1b2c3d4…'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="reownDirty = true"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showReownId = !showReownId"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none;border-radius:0 var(--r-xs) var(--r-xs) 0"
                    :aria-label="showReownId ? 'ID verbergen' : 'ID anzeigen'"
                  >
                    <i :class="showReownId ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div v-if="reownSet" style="display:flex;gap:8px">
                  <button @click="deleteKey('reown_project_id')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">Löschen</button>
                </div>
              </div>

              <!-- Zapier MCP -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  Zapier MCP Server
                  <span v-if="mcpUrlSet" class="sm-key-ok">{{ mcpPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="mcpUrl"
                    :type="showMcpUrl ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none;border-radius:var(--r-xs) 0 0 var(--r-xs)"
                    :style="mcpUrlSet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="mcpUrlSet ? 'Neu eingeben zum Überschreiben…' : 'https://mcp.zapier.com/api/mcp/s/…/mcp'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="mcpDirty = true"
                    @keyup.enter="saveConfig"
                  />
                  <button
                    @click="showMcpUrl = !showMcpUrl"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none;border-radius:0 var(--r-xs) var(--r-xs) 0"
                    :aria-label="showMcpUrl ? 'URL verbergen' : 'URL anzeigen'"
                  >
                    <i :class="showMcpUrl ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div v-if="mcpUrlSet" style="display:flex;gap:8px">
                  <button @click="deleteKey('mcp_url')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">Löschen</button>
                </div>
              </div>

              <!-- Pinata JWT -->
              <div class="sys-field" style="gap:12px">
                <label class="sys-field-label">
                  Pinata JWT
                  <span v-if="pinataJwtSet" class="sm-key-ok">{{ pinataPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="pinataJwt"
                    :type="showPinataJwt ? 'text' : 'password'"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-right:none;border-radius:var(--r-xs) 0 0 var(--r-xs)"
                    :style="pinataJwtSet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="pinataJwtSet ? 'Neu eingeben zum Überschreiben…' : 'eyJ…'"
                    autocomplete="off"
                    spellcheck="false"
                    @keyup.enter="savePinataJwt"
                  />
                  <button
                    @click="showPinataJwt = !showPinataJwt"
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="padding:0 12px;border-left:none;border-radius:0 var(--r-xs) var(--r-xs) 0"
                    :aria-label="showPinataJwt ? 'JWT verbergen' : 'JWT anzeigen'"
                  >
                    <i :class="showPinataJwt ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                  </button>
                </div>
                <div v-if="pinataJwt || pinataJwtSet" style="display:flex;align-items:center;gap:8px">
                  <button v-if="pinataJwt" @click="savePinataJwt" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn">Speichern</button>
                  <button v-if="pinataJwtSet" @click="deletePinataJwt" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">Löschen</button>
                  <span v-if="pinataFeedback" class="sm-feedback"
                    :style="pinataFeedback.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'">
                    {{ pinataFeedback.message }}
                  </span>
                </div>
              </div>

              <!-- Feedback -->
              <Transition name="sys-modal-fade">
                <div v-if="feedback" style="margin-top:12px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="feedback.ok
                    ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                    : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                >{{ feedback.message }}</div>
              </Transition>

            </template>

            <!-- ── Tab: Config ── -->
            <template v-if="tab === 'config'">

              <!-- Soul-Cert -->
              <div style="margin-bottom:24px">
                <div class="sys-field-label" style="margin-bottom:8px">Soul-Cert</div>
                <div v-if="soulToken" style="margin-bottom:12px;padding:8px 12px;background:rgba(0,0,0,0.18);border-radius:var(--r-xs)">
                  <div style="display:flex;align-items:flex-start;gap:8px">
                    <code style="flex:1;font-family:var(--sys-mono);font-size:13px;color:var(--fg-2);word-break:break-all;user-select:all;line-height:1.55">{{ soulToken }}</code>
                    <button @click="copyCurrentCert" style="background:none;border:none;cursor:pointer;padding:2px;flex-shrink:0" title="Kopieren">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :style="certCurrentCopied ? 'color:var(--accent)' : 'color:var(--fg-4)'">
                        <path v-if="certCurrentCopied" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        <path v-else stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/>
                      </svg>
                    </button>
                  </div>
                </div>
                <button
                  @click="handleRotateCert"
                  :disabled="certRotateBusy"
                  class="sys-btn-ed sys-btn-ed--primary"
                  style="width:100%;justify-content:center"
                >{{ certRotateBusy ? 'Rotiert…' : 'Soul-Cert rotieren' }}</button>
                <Transition name="sys-modal-fade">
                  <div v-if="certRotationResult" style="margin-top:10px;padding:12px 14px;border:1px solid var(--sys-rule-strong)">
                    <div v-if="certRotationResult.error" style="font-family:var(--sys-mono);font-size:11px;color:var(--sys-err)">
                      Cert-Rotation fehlgeschlagen — bitte Seite neu laden und erneut versuchen.
                    </div>
                    <template v-else>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                      <span style="font-family:var(--sys-mono);font-size:11px;color:var(--sys-accent-bright)">Cert rotiert — Version {{ certRotationResult.cert_version }}</span>
                      <button @click="certRotationResult = null" style="background:none;border:none;cursor:pointer;color:var(--sys-fg-dim);font-size:16px;line-height:1;padding:0">×</button>
                    </div>
                    <div class="sm-sec-head" style="margin-bottom:4px">Bearer-Token (Zugangscode)</div>
                    <div style="display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.3);padding:8px 10px;margin-bottom:8px">
                      <code style="flex:1;font-family:var(--sys-mono);font-size:11px;color:var(--sys-accent-bright);word-break:break-all;user-select:all">Bearer {{ soulToken }}</code>
                      <button @click="copyCertResult" style="background:none;border:none;cursor:pointer;padding:0;flex-shrink:0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                          :style="certCopied ? 'color:var(--sys-ok)' : 'color:var(--sys-fg-dim)'">
                          <path v-if="certCopied" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                          <path v-else stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/>
                        </svg>
                      </button>
                    </div>
                    <p class="sm-desc" :style="certRotationResult.validated ? 'color:var(--sys-ok)' : 'color:var(--fg-4)'">
                      {{ certRotationResult.validated ? '✓ Cert auf Server validiert' : 'Server-Validierung prüfen — Seite neu laden' }}
                    </p>
                    <p v-if="certRotationResult.credsUpdated" class="sm-desc f-ok" style="margin-top:4px">
                      ✓ Biometrische Zugangsdaten aktualisiert
                    </p>
                    <p v-else-if="certRotationResult.credsUpdateFailed" class="sm-desc" style="color:var(--sys-warn);margin-top:4px">
                      Biometrische Zugangsdaten konnten nicht aktualisiert werden — beim nächsten Login einmalig neu speichern.
                    </p>
                    </template>
                  </div>
                </Transition>
              </div>

              <!-- Admin verbinden (Multi-Hoster, kein Admin) -->
              <template v-if="!isAdmin && isMultiHoster">
                <div style="padding-top:20px;border-top:1px solid var(--sys-rule)">
                  <div class="sys-field-label" style="margin-bottom:12px">Admin verbinden</div>
                  <p class="sys-prose" style="margin-bottom:16px">Gib den Admin-Token ein, den du beim Server-Setup erhalten hast. Er wird nur lokal im Browser gespeichert.</p>
                  <div class="sys-field" style="margin-bottom:12px">
                    <label class="sys-field-label">Admin-Token</label>
                    <div style="display:flex;gap:0">
                      <input
                        v-model="connectToken"
                        :type="showConnectToken ? 'text' : 'password'"
                        class="sys-input sys-input--mono"
                        style="flex:1;border-right:none;border-radius:var(--r-xs) 0 0 var(--r-xs)"
                        placeholder="adm_..."
                        autocomplete="off"
                        spellcheck="false"
                        @keyup.enter="connectAdmin"
                      />
                      <button
                        @click="showConnectToken = !showConnectToken"
                        class="sys-btn-ed sys-btn-ed--ghost"
                        style="padding:0 12px;border-left:none;border-radius:0 var(--r-xs) var(--r-xs) 0"
                        :aria-label="showConnectToken ? 'Token verbergen' : 'Token anzeigen'"
                      >
                        <i :class="showConnectToken ? 'ri-eye-off-line' : 'ri-eye-line'" class="ri-fw" style="font-size:13px" />
                      </button>
                    </div>
                  </div>
                  <button class="sys-btn-ed sys-btn-ed--primary" @click="connectAdmin" :disabled="connectingAdmin || !connectToken">
                    {{ connectingAdmin ? 'Prüfe…' : 'Verbinden' }}
                  </button>
                  <Transition name="sys-modal-fade">
                    <div v-if="connectFeedback" style="margin-top:12px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                      :style="connectFeedback.ok
                        ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                        : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                    >{{ connectFeedback.message }}</div>
                  </Transition>
                </div>
              </template>

              <!-- Server-Admin (isAdmin) -->
              <template v-if="isAdmin">
                <div style="padding-top:20px;border-top:1px solid var(--sys-rule)">
                  <div class="sys-field-label" style="margin-bottom:12px">Server-Admin</div>
                  <div class="sm-infoblock">
                    Master-Key-Rotation betrifft diese Instanz. Grace-Period 15 min — danach sind alte Certs ungültig.
                  </div>
                  <div class="sys-field">
                    <label class="sys-field-label">Neuer Soul-Master-Key</label>
                    <div style="display:flex;gap:8px">
                      <input v-model="newMasterKey" type="text" readonly class="sys-input sys-input--mono" style="flex:1" placeholder="→ Generieren klicken" />
                      <button @click="generateMasterKey" class="sys-btn-ed sys-btn-ed--primary" style="white-space:nowrap">Generieren</button>
                    </div>
                  </div>
                  <Transition name="sys-modal-fade">
                    <div v-if="graceUntil" style="border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.05);padding:14px 16px;margin-bottom:16px">
                      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                        <span class="sm-accent-label">Grace-Period aktiv</span>
                        <span class="sm-accent-label">{{ graceCountdown }}</span>
                      </div>
                    </div>
                  </Transition>
                  <div v-if="isMultiHoster" class="sys-field" style="padding-top:14px;border-top:1px solid var(--sys-rule);margin-bottom:0">
                    <label class="sys-field-label">Admin-Token rotieren</label>
                    <div style="display:flex;gap:8px">
                      <input v-model="newAdminToken" type="text" readonly class="sys-input sys-input--mono" style="flex:1" placeholder="→ Generieren klicken" />
                      <button @click="generateAdminToken" class="sys-btn-ed sys-btn-ed--primary" style="white-space:nowrap">Generieren</button>
                    </div>
                  </div>
                  <div style="margin-top:16px">
                    <button class="sys-btn-ed sys-btn-ed--primary" @click="saveMaster"
                      :disabled="savingMaster || (!newMasterKey && !masterAnthropicKey && !newAdminToken)">
                      {{ savingMaster ? 'Rotiert…' : 'Speichern & rotieren' }}
                    </button>
                  </div>
                  <Transition name="sys-modal-fade">
                    <div v-if="adminFeedback" style="margin-top:12px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                      :style="adminFeedback.ok
                        ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                        : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                    >{{ adminFeedback.message }}</div>
                  </Transition>
                </div>
              </template>

            </template>

            <!-- ── Tab: Gesundheit ── -->
            <template v-if="tab === 'gesundheit'">

              <div class="sys-field" style="gap:10px;margin-bottom:20px">
                <label class="sys-field-label">Provider</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button v-for="p in HEALTH_PROVIDERS" :key="p.id"
                    class="sys-btn-ed" :class="healthAdapter === p.id ? 'sys-btn-ed--primary' : 'sys-btn-ed--ghost'"
                    :disabled="p.soon" :style="p.soon ? 'opacity:0.4;cursor:not-allowed' : ''"
                    @click="!p.soon && (healthAdapter = p.id)">
                    {{ p.label }}<span v-if="p.soon" style="font-size:10px;margin-left:6px;opacity:0.6">bald</span>
                  </button>
                </div>
              </div>

              <div v-if="healthAdapter === 'garmin'" class="sys-field" style="gap:10px;margin-bottom:20px">
                <label class="sys-field-label">Gerät</label>
                <select class="sys-input" v-model="healthGarminModel" style="cursor:pointer">
                  <optgroup label="Venu / Vivoactive">
                    <option value="garmin_vivoactive2">Vivoactive 2</option>
                    <option value="garmin_vivoactive3">Vivoactive 3</option>
                    <option value="garmin_vivoactive4">Vivoactive 4</option>
                    <option value="garmin_venu">Venu</option>
                    <option value="garmin_venu2">Venu 2</option>
                  </optgroup>
                  <optgroup label="Forerunner">
                    <option value="garmin_fr235">Forerunner 235</option>
                    <option value="garmin_fr245">Forerunner 245</option>
                    <option value="garmin_fr255">Forerunner 255</option>
                    <option value="garmin_fr265">Forerunner 265</option>
                    <option value="garmin_fr945">Forerunner 945</option>
                  </optgroup>
                  <optgroup label="Fenix">
                    <option value="garmin_fenix5">Fenix 5</option>
                    <option value="garmin_fenix6">Fenix 6</option>
                    <option value="garmin_fenix7">Fenix 7</option>
                  </optgroup>
                  <optgroup label="Instinct / Epix">
                    <option value="garmin_instinct">Instinct</option>
                    <option value="garmin_epix">Epix</option>
                  </optgroup>
                </select>
                <span class="sm-desc">Das Gerät beeinflusst wie Daten interpretiert werden. Alle Modelle nutzen die Garmin Connect API.</span>
              </div>

              <div v-if="healthAdapter === 'garmin'" class="sys-field" style="gap:10px;margin-bottom:20px">
                <label class="sys-field-label">Garmin Connect E-Mail</label>
                <input class="sys-input" type="email" v-model="healthGarminEmail" placeholder="deine@email.de" autocomplete="off" />
              </div>

              <div v-if="healthAdapter === 'garmin'" class="sys-field" style="gap:10px;margin-bottom:20px">
                <label class="sys-field-label">Garmin Connect Passwort</label>
                <input class="sys-input" type="password" v-model="healthGarminPassword"
                  :placeholder="healthHasPassword ? '•••••••• (leer lassen = behalten)' : 'Passwort eingeben'"
                  autocomplete="new-password" />
              </div>

              <div v-if="healthAdapter === 'apple_health'" class="sys-field" style="gap:10px;margin-bottom:20px">
                <div class="sm-infoblock">Für Apple Health muss die Health-Sync App auf deinem iPhone installiert sein. Die Einrichtung erfolgt über SSH (install.sh).</div>
              </div>

              <div v-if="healthAdapter === 'oura'" class="sys-field" style="gap:10px;margin-bottom:20px">
                <div class="sm-infoblock">Oura Ring API-Token wird über SSH in der health_sync Konfiguration hinterlegt.</div>
              </div>

              <Transition name="sys-modal-fade">
                <div v-if="healthMsg" style="margin-top:4px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="healthMsgError
                    ? 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'
                    : 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'"
                >{{ healthMsg }}</div>
              </Transition>

            </template>

            <!-- ── Tab: Archivar ── -->
            <template v-if="tab === 'archivar'">

              <!-- LONGMEM Status -->
              <div class="sys-field" style="margin-bottom:24px">
                <div class="sys-field-label" style="margin-bottom:10px">Langzeitgedächtnis (LONGMEM)</div>
                <div v-if="archivLoading" class="archivar-loading">Lade…</div>
                <template v-else>
                  <div class="archivar-lm-block">
                    <div class="archivar-lm-row">
                      <span class="archivar-lm-key">Fakten</span>
                      <span class="archivar-lm-val" :class="longmemFacts > 0 ? 'archivar-lm-ok' : 'archivar-lm-dim'">
                        {{ longmemFacts > 0 ? longmemFacts + ' gespeichert' : 'noch keine' }}
                      </span>
                    </div>
                    <div class="archivar-lm-row">
                      <span class="archivar-lm-key">Letztes Aufräumen</span>
                      <span class="archivar-lm-val archivar-lm-dim">{{ longmemUpdated || '—' }}</span>
                    </div>
                    <div class="archivar-lm-row">
                      <span class="archivar-lm-key">Größe</span>
                      <span class="archivar-lm-val archivar-lm-dim">{{ longmemSizeKb }}</span>
                    </div>
                    <div class="archivar-lm-row">
                      <span class="archivar-lm-key">Chaos</span>
                      <span class="archivar-lm-val archivar-chaos-wrap">
                        <span class="archivar-chaos-bar">
                          <span class="archivar-chaos-fill" :style="{ width: longmemChaos.pct + '%', background: longmemChaos.color }" />
                        </span>
                        <span :style="{ color: longmemChaos.color }">{{ longmemChaos.label }}</span>
                      </span>
                    </div>
                  </div>
                  <button
                    class="sys-btn-ed sys-btn-ed--primary"
                    style="margin-top:14px;width:100%;justify-content:center"
                    :disabled="crystallizeBusy"
                    @click="triggerCrystallize"
                  ><span v-if="crystallizeBusy" class="dots-running">Räumt auf</span><template v-else>Jetzt aufräumen</template></button>
                  <Transition name="sys-modal-fade">
                    <div v-if="archivFeedback" style="margin-top:10px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                      :style="archivFeedback.ok
                        ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                        : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                    >{{ archivFeedback.message }}</div>
                  </Transition>
                </template>
              </div>

            </template>

          </div>

          <!-- Foot -->
          <div class="sys-modal-foot">
            <div class="sys-foot-meta">
              <template v-if="tab === 'api'">
                <span class="sys-dot" :class="keySource === 'soul' ? 'sys-dot--ok' : keySource === 'none' ? 'sys-dot--idle' : 'sys-dot--live'"></span>
                {{ keySourceLabel }}
              </template>
              <template v-else-if="tab === 'dienste'">
                <span class="sys-dot sys-dot--idle"></span>
                Dienste
              </template>
              <template v-else-if="tab === 'plugins'">
                <span class="sys-dot sys-dot--idle"></span>
                Plugins
              </template>
              <template v-else-if="tab === 'config'">
                <span class="sys-dot" :class="isAdmin ? 'sys-dot--warn' : 'sys-dot--idle'"></span>
                {{ isAdmin ? 'Server-Admin · Rotation' : 'Soul-Cert & Admin' }}
              </template>
              <template v-else-if="tab === 'archivar'">
                <span class="sys-dot" :class="longmemFacts > 0 ? 'sys-dot--ok' : 'sys-dot--idle'"></span>
                {{ longmemFacts > 0 ? longmemFacts + ' Fakten im Langzeitgedächtnis' : 'Langzeitgedächtnis leer' }}
              </template>
              <template v-else-if="tab === 'gesundheit'">
                <span class="sys-dot" :class="healthHasPassword ? 'sys-dot--ok' : 'sys-dot--idle'"></span>
                {{ healthHasPassword ? 'Garmin verbunden' : 'Noch nicht eingerichtet' }}
              </template>
            </div>
            <div class="sys-foot-actions">
              <template v-if="tab === 'api' || tab === 'dienste' || tab === 'plugins'">
                <button class="sys-btn-ed sys-btn-ed--primary" @click="saveConfig" :disabled="saving">
                  {{ saving ? 'Speichert…' : 'Speichern' }}
                </button>
              </template>
              <template v-else-if="tab === 'gesundheit'">
                <button class="sys-btn-ed sys-btn-ed--primary" @click="saveHealthConfig" :disabled="healthSaving">
                  {{ healthSaving ? 'Speichert…' : 'Speichern' }}
                </button>
              </template>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useSoul } from '~/composables/useSoul.js'
import { useVault } from '~/composables/useVault.js'
import { useSavedCreds } from '~/composables/useSavedCreds.js'
import { useSoulPasskey } from '~/composables/useSoulPasskey.js'
import { useMcpTools } from '~/composables/useMcpTools.js'

const props = defineProps({ open: Boolean, inline: { type: Boolean, default: false } })
const emit  = defineEmits(['close', 'master-rotated'])

const { soulToken, rotateCert, soulContent: composableSoulContent, pushToServer, exportAsBlob } = useSoul()
const { isConnected: vaultConnected, writeFile, allFiles } = useVault()
const savedCreds = useSavedCreds()
const passkey    = useSoulPasskey()
const { clearMcpCache, loadMcpTools } = useMcpTools()

// ── Admin-Erkennung ───────────────────────────────────────────────────────────
const ADMIN_KEY    = 'sys_admin_token'
const isAdmin      = ref(false)
const adminToken   = ref('')
const isSoulAdmin  = ref(false)   // true = per-soul token (multi-hoster)
const isMultiHoster = ref(false)  // false = single-hoster (soul owner = admin)

const currentSoulId = computed(() => soulToken.value?.split('.')?.[0] ?? '')

async function loadNodeStatus() {
  try {
    const res = await fetch('/api/node-status')
    if (res.ok) {
      const d = await res.json()
      isMultiHoster.value = !!d.multi_hoster
    }
  } catch {}
}

function detectAdmin() {
  if (!isMultiHoster.value) {
    // Single-Hoster: soul owner ist immer Admin — kein Token nötig
    isAdmin.value     = !!soulToken.value
    isSoulAdmin.value = false
    adminToken.value  = ''
    return
  }
  // Multi-Hoster: Token aus localStorage lesen
  const soulId = currentSoulId.value
  if (soulId) {
    const perSoul = localStorage.getItem(`sys_admin_token_${soulId}`)
    if (perSoul && perSoul.startsWith('adm_') && perSoul.length === 68) {
      isAdmin.value    = true
      adminToken.value  = perSoul
      isSoulAdmin.value = true
      return
    }
  }
  const stored = localStorage.getItem(ADMIN_KEY)
  if (stored && stored.startsWith('adm_') && stored.length === 68) {
    isAdmin.value    = true
    adminToken.value  = stored
    isSoulAdmin.value = false
  }
}

// ── Tab ──────────────────────────────────────────────────────────────────────
const tab = ref('api')

// ── Gesundheit Tab State ──────────────────────────────────────────────────────
const HEALTH_PROVIDERS = [
  { id: 'garmin',       label: 'Garmin',       soon: false },
  { id: 'apple_health', label: 'Apple Health', soon: true  },
  { id: 'oura',         label: 'Oura Ring',    soon: true  },
]
const healthAdapter       = ref('garmin')
const healthGarminModel   = ref('garmin_fr235')
const healthGarminEmail   = ref('')
const healthGarminPassword = ref('')
const healthHasPassword   = ref(false)
const healthSaving        = ref(false)
const healthMsg           = ref('')
const healthMsgError      = ref(false)

async function loadHealthConfig() {
  try {
    const r = await fetch('/api/health/config', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      healthAdapter.value     = d.adapter     || 'garmin'
      healthGarminModel.value = d.garmin_model || 'garmin_fr235'
      healthGarminEmail.value = d.garmin_email || ''
      healthHasPassword.value = !!d.has_password
    }
  } catch {}
}

async function saveHealthConfig() {
  healthSaving.value = true; healthMsg.value = ''; healthMsgError.value = false
  try {
    const body = { adapter: healthAdapter.value, garmin_model: healthGarminModel.value, garmin_email: healthGarminEmail.value }
    if (healthGarminPassword.value) body.garmin_password = healthGarminPassword.value
    const r = await fetch('/api/health/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (r.ok) {
      healthMsg.value = 'Gespeichert ✓'
      healthGarminPassword.value = ''
      healthHasPassword.value = true
    } else {
      healthMsgError.value = true; healthMsg.value = 'Fehler beim Speichern.'
    }
  } catch { healthMsgError.value = true; healthMsg.value = 'Netzwerkfehler.' }
  healthSaving.value = false
  setTimeout(() => { healthMsg.value = '' }, 4000)
}

// ── API-Key Tab State ─────────────────────────────────────────────────────────
const apiKey    = ref('')
const model     = ref('')
const showKey   = ref(false)
const saving    = ref(false)
const feedback  = ref(null)

const anthTest  = ref(null)  // { loading, ok, message }
const waveTest  = ref(null)
const labsTest  = ref(null)
const keySource  = ref('none')   // 'soul' | 'master' | 'env' | 'none'
const keyPreview = ref('')

const wavespeedKey      = ref('')
const showWavespeedKey  = ref(false)
const wavespeedKeySet   = ref(false)
const wavespeedPreview  = ref('')
const wavespeedDirty    = ref(false)

const elevenlabsKey     = ref('')
const showElevenlabsKey = ref(false)
const elevenlabsKeySet  = ref(false)
const elevenlabsPreview = ref('')
const elevenlabsDirty   = ref(false)

const braveKey     = ref('')
const showBraveKey = ref(false)
const braveKeySet  = ref(false)
const bravePreview = ref('')
const braveDirty   = ref(false)

const reownProjectId = ref('')
const showReownId    = ref(false)
const reownSet       = ref(false)
const reownPreview   = ref('')
const reownDirty     = ref(false)

const mcpUrl     = ref('')
const showMcpUrl = ref(false)
const mcpUrlSet  = ref(false)
const mcpPreview = ref('')
const mcpDirty   = ref(false)


const pinataJwt      = ref('')
const showPinataJwt  = ref(false)
const pinataJwtSet   = ref(false)
const pinataPreview  = ref('')
const pinataFeedback = ref(null)
const agentUrl         = ref('')
const showAgentUrl     = ref(false)
const agentUrlSet      = ref(false)
const agentUrlFeedback = ref(null)

const keySourceLabel = computed(() => ({
  soul:   'Eigener Key aktiv',
  master: 'Server-Key aktiv',
  env:    'Env-Key aktiv',
  none:   'Kein Key konfiguriert',
}[keySource.value] || ''))

async function loadStatus() {
  try {
    const res = await fetch('/api/get-config', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (!res.ok) return
    const d = await res.json()
    keySource.value       = d.key_source || 'none'
    keyPreview.value      = d.key_preview || ''
    wavespeedKeySet.value  = !!d.wavespeed_key_set
    wavespeedPreview.value = d.wavespeed_preview || ''
    elevenlabsKeySet.value  = !!d.elevenlabs_key_set
    elevenlabsPreview.value = d.elevenlabs_preview || ''
    agentUrlSet.value = !!d.elevenlabs_agent_url
    agentUrl.value    = d.elevenlabs_agent_url || ''
    braveKeySet.value  = !!d.brave_key_set
    bravePreview.value = d.brave_preview || ''
    mcpUrlSet.value  = !!d.mcp_url_set
    mcpPreview.value = d.mcp_preview || ''
    reownSet.value     = !!d.reown_project_id_set
    reownPreview.value = d.reown_preview || ''

    if (d.model) model.value = d.model
  } catch {}
  try {
    const pr = await fetch('/api/soul/pinata-config', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (pr.ok) {
      const pd = await pr.json()
      pinataJwtSet.value  = pd.configured
      pinataPreview.value = pd.preview || ''
    }
  } catch {}
}

async function savePinataJwt() {
  if (!pinataJwt.value.trim()) return
  try {
    const res = await fetch('/api/soul/pinata-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ jwt: pinataJwt.value.trim() }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      pinataJwt.value     = ''
      pinataFeedback.value = { ok: true, message: 'Gespeichert ✓' }
      pinataJwtSet.value   = true
      pinataPreview.value  = d.preview || ''
      await loadStatus()
    } else {
      pinataFeedback.value = { ok: false, message: d.error || `Fehler ${res.status}` }
    }
  } catch (e) {
    pinataFeedback.value = { ok: false, message: e.message }
  }
  setTimeout(() => { pinataFeedback.value = null }, 5000)
}

async function deletePinataJwt() {
  try {
    await fetch('/api/soul/pinata-config', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    pinataJwtSet.value  = false
    pinataPreview.value = ''
  } catch {}
}


async function saveAgentUrl() {
  agentUrlFeedback.value = null
  try {
    const res = await fetch('/api/set-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ elevenlabs_agent_url: agentUrl.value.trim() }),
    })
    if (res.ok) {
      agentUrlSet.value = !!agentUrl.value.trim()
      agentUrlFeedback.value = { ok: true, message: 'Gespeichert ✓' }
    } else {
      agentUrlFeedback.value = { ok: false, message: `Fehler ${res.status}` }
    }
  } catch (e) {
    agentUrlFeedback.value = { ok: false, message: e.message }
  }
  setTimeout(() => { agentUrlFeedback.value = null }, 4000)
}

async function deleteAgentUrl() {
  try {
    await fetch('/api/set-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ elevenlabs_agent_url: '' }),
    })
    agentUrl.value    = ''
    agentUrlSet.value = false
  } catch {}
}

async function deleteKey(field) {
  try {
    await fetch('/api/set-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ [field]: '' }),
    })
    if (field === 'anthropic_key')    { keySource.value = 'none'; keyPreview.value = '' }
    if (field === 'wavespeed_key')    { wavespeedKeySet.value = false; wavespeedPreview.value = '' }
    if (field === 'elevenlabs_key')   { elevenlabsKeySet.value = false; elevenlabsPreview.value = '' }
    if (field === 'brave_key')        { braveKeySet.value = false; bravePreview.value = '' }
    if (field === 'reown_project_id') { reownSet.value = false; reownPreview.value = '' }
    if (field === 'mcp_url')          { mcpUrlSet.value = false; mcpPreview.value = ''; clearMcpCache() }
    await loadStatus()
  } catch {}
}

function sanitizeKey(k) {
  // Remove non-ISO-8859-1 characters (e.g. zero-width spaces from copy-paste)
  return (k || '').replace(/[^\x20-\xFF]/g, '').trim()
}

async function testKey(type, key, useStored = false) {
  key = sanitizeKey(key)
  const stateRef = { anthropic: anthTest, wavespeed: waveTest, elevenlabs: labsTest }[type]
  stateRef.value = { loading: true, ok: null, message: '' }
  let ok = false
  let msg = ''
  try {
    if (useStored) {
      // Gespeicherter Key → Server liest aus config.json und testet serverseitig
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
        body: JSON.stringify({ key_type: type, use_stored: true })
      })
      const d = await res.json().catch(() => ({}))
      ok  = d.ok === true
      msg = ok ? 'Key gültig ✓' : `Fehler ${d.status || res.status}${d.error ? ' · ' + d.error : ''}`
    } else if (!key) {
      ok = false; msg = 'Kein Key eingegeben'
    } else if (type === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'test' }] })
      })
      ok  = res.status === 200
      msg = ok ? 'Key gültig ✓' : `Fehler ${res.status}${res.status === 401 ? ' · Ungültiger Key' : res.status === 429 ? ' · Rate-Limit' : ''}`
    } else if (type === 'elevenlabs') {
      // ElevenLabs blockiert CORS → immer über Server testen
      const body = key
        ? { elevenlabs_key: key }
        : { key_type: 'elevenlabs', use_stored: true }
      const res = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
        body: JSON.stringify(body)
      })
      const d = await res.json().catch(() => ({}))
      ok  = d.ok === true
      msg = ok ? 'Key gültig ✓' : `Fehler ${d.status || res.status}${d.error ? ' · ' + d.error : res.status === 401 ? ' · Ungültiger Key' : ''}`
    } else if (type === 'wavespeed') {
      ok  = /^[0-9a-f]{32,}$/i.test(key)
      msg = ok ? 'Format OK (Hex-Key erkannt)' : 'Ungültiges Format — Hex erwartet'
    }
  } catch (e) {
    ok  = false
    msg = `Verbindungsfehler: ${e.message}`
  }
  stateRef.value = { loading: false, ok, message: msg }
  setTimeout(() => { stateRef.value = null }, 6000)
}

async function saveConfig() {
  saving.value  = true
  feedback.value = null
  try {
    const body = {}
    if (apiKey.value) body.anthropic_key = sanitizeKey(apiKey.value)
    if (model.value) body.model = model.value
    if (wavespeedDirty.value) body.wavespeed_key = sanitizeKey(wavespeedKey.value)
    if (elevenlabsDirty.value) body.elevenlabs_key = sanitizeKey(elevenlabsKey.value)
    if (braveDirty.value) body.brave_key = sanitizeKey(braveKey.value)
    if (mcpDirty.value) body.mcp_url = sanitizeKey(mcpUrl.value)
    if (reownDirty.value) body.reown_project_id = reownProjectId.value.trim()
    const res = await fetch('/api/set-config', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization: `Bearer ${soulToken.value}`,
      },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      feedback.value = { ok: true, message: 'Gespeichert ✓' }
      await loadStatus()
      apiKey.value        = ''
      wavespeedKey.value  = ''
      wavespeedDirty.value = false
      elevenlabsKey.value  = ''
      elevenlabsDirty.value = false
      braveKey.value  = ''
      braveDirty.value = false
      mcpUrl.value  = ''
      mcpDirty.value = false
      reownProjectId.value = ''
      reownDirty.value = false
      if (body.mcp_url !== undefined) { clearMcpCache(); loadMcpTools(soulToken.value) }
    } else {
      feedback.value = { ok: false, message: d.message || d.error || `Fehler ${res.status}` }
    }
  } catch {
    feedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    saving.value = false
    setTimeout(() => { feedback.value = null }, 5000)
  }
}

// ── Connect Tab State ─────────────────────────────────────────────────────────
const connectToken      = ref('')
const showConnectToken  = ref(false)
const connectingAdmin   = ref(false)
const connectFeedback   = ref(null)

async function connectAdmin() {
  if (!connectToken.value) return
  connectingAdmin.value = true
  connectFeedback.value = null
  try {
    // Per-soul token zuerst versuchen (multi-hoster)
    const soulId = currentSoulId.value
    let matched = false
    if (soulId) {
      const res = await fetch('/api/set-master', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Soul-Admin-Token': connectToken.value,
          'X-Soul-Id': soulId,
        },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        localStorage.setItem(`sys_admin_token_${soulId}`, connectToken.value)
        matched = true
        isSoulAdmin.value = true
      }
    }
    // Fallback: globaler Admin-Token (single-hoster)
    if (!matched) {
      const res = await fetch('/api/set-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': connectToken.value },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        localStorage.setItem(ADMIN_KEY, connectToken.value)
        matched = true
        isSoulAdmin.value = false
      }
    }
    if (matched) {
      connectFeedback.value = { ok: true, message: 'Admin-Zugang verbunden ✓' }
      setTimeout(() => {
        detectAdmin()
        tab.value = 'admin'
        connectToken.value = ''
        connectFeedback.value = null
      }, 800)
    } else {
      connectFeedback.value = { ok: false, message: 'Token ungültig — Zugang verweigert' }
    }
  } catch {
    connectFeedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    connectingAdmin.value = false
  }
}

// ── Admin Tab State ───────────────────────────────────────────────────────────
const newMasterKey      = ref('')
const masterAnthropicKey = ref('')
const newAdminToken     = ref('')
const savingMaster      = ref(false)
const adminFeedback     = ref(null)
const graceUntil        = ref(null)
const graceCountdown    = ref('')
let graceTimer          = null

function generateMasterKey() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  newMasterKey.value = `sys_${hex}`
}

function generateAdminToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  newAdminToken.value = `adm_${hex}`
}

function startGraceCountdown(isoString) {
  graceUntil.value = isoString
  function tick() {
    const diff = new Date(isoString) - Date.now()
    if (diff <= 0) { graceCountdown.value = 'Abgelaufen'; return }
    const m = Math.floor(diff / 60_000)
    const s = Math.floor((diff % 60_000) / 1000)
    graceCountdown.value = `${m}m ${s}s verbleibend`
    graceTimer = setTimeout(tick, 1_000)
  }
  tick()
}

async function saveMaster() {
  if (!newMasterKey.value && !masterAnthropicKey.value && !newAdminToken.value) return
  savingMaster.value  = true
  adminFeedback.value = null
  try {
    const body = {}
    if (newMasterKey.value)                     body.soul_master_key = newMasterKey.value
    if (!isSoulAdmin.value && masterAnthropicKey.value) body.anthropic_key = masterAnthropicKey.value
    if (newAdminToken.value)                    body.new_admin_token = newAdminToken.value
    const soulId = currentSoulId.value
    const authHeaders = isSoulAdmin.value && soulId
      ? { 'X-Soul-Admin-Token': adminToken.value, 'X-Soul-Id': soulId }
      : adminToken.value
        ? { 'X-Admin-Token': adminToken.value }
        : { 'Authorization': `Bearer ${soulToken.value}` }
    const res = await fetch('/api/set-master', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify(body),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok) {
      const masterRotated = !!body.soul_master_key
      let msg = 'Gespeichert ✓'
      if (d.prev_valid_until) msg += ' — Grace-Period 15 min aktiv'
      if (newAdminToken.value) {
        if (isSoulAdmin.value && soulId) {
          localStorage.setItem(`sys_admin_token_${soulId}`, newAdminToken.value)
        } else {
          localStorage.setItem(ADMIN_KEY, newAdminToken.value)
        }
        adminToken.value = newAdminToken.value
        msg += ' — Admin-Token rotiert & gespeichert'
      }
      adminFeedback.value = { ok: true, message: msg }
      if (d.prev_valid_until) startGraceCountdown(d.prev_valid_until)
      newMasterKey.value       = ''
      masterAnthropicKey.value = ''
      newAdminToken.value      = ''
      await loadStatus()
      if (masterRotated) {
        emit('master-rotated')
        // Altes Cert ist während der Grace-Period noch gültig — sofort neues ausstellen.
        await handleRotateCert()
        // Cert-Ergebnis im Admin-Tab kommunizieren (Result-Card ist im API-Tab).
        if (certRotationResult.value && !certRotationResult.value.error) {
          adminFeedback.value = { ok: true, message: 'Master-Key & Cert rotiert ✓ — sys.md heruntergeladen. Du bleibst eingeloggt.' }
        } else {
          adminFeedback.value = { ok: false, message: 'Master-Key rotiert — Cert-Rotation fehlgeschlagen. Manuell im API-Tab erneuern.' }
        }
      }
    } else {
      adminFeedback.value = { ok: false, message: d.message || d.error || `Fehler ${res.status}` }
    }
  } catch {
    adminFeedback.value = { ok: false, message: 'Netzwerkfehler' }
  } finally {
    savingMaster.value = false
    setTimeout(() => { adminFeedback.value = null }, 6000)
  }
}

onUnmounted(() => clearTimeout(graceTimer))

// ── Cert-Rotation ─────────────────────────────────────────────────────────────
const certRotateBusy     = ref(false)
const certRotationResult = ref(null)
const certCopied         = ref(false)
const certCurrentCopied  = ref(false)

function copyCurrentCert() {
  navigator.clipboard.writeText(soulToken.value || '').catch(() => {})
  certCurrentCopied.value = true
  setTimeout(() => { certCurrentCopied.value = false }, 2000)
}

const localSoulFileName = computed(() => {
  const soulFile = allFiles.value.find(f => f.kind === 'soul')
  return soulFile ? soulFile.name : 'sys.md'
})

async function downloadSoulLocal() {
  // Immer Server-Stand holen — Browser-Cache kann veraltet sein
  let content = composableSoulContent.value
  if (soulToken.value && soulToken.value !== 'anonymous') {
    try {
      const res = await fetch('/api/soul', {
        headers: { Authorization: `Bearer ${soulToken.value}` },
        cache: 'no-store'
      })
      if (res.ok) {
        const text = await res.text()
        if (text?.trim().startsWith('---')) content = text
      }
    } catch { /* Fallback auf Browser-Cache */ }
  }
  if (!content) return
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: localSoulFileName.value })
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

async function copyCertResult() {
  if (!certRotationResult.value?.cert) return
  try {
    await navigator.clipboard.writeText(`Bearer ${soulToken.value}`)
    certCopied.value = true
    setTimeout(() => { certCopied.value = false }, 2000)
  } catch {}
}

async function handleRotateCert() {
  if (certRotateBusy.value) return
  certRotateBusy.value = true
  certRotationResult.value = null
  try {
    const result = await rotateCert()
    if (!result) { certRotationResult.value = { error: true }; return }

    // Vault-Datei + Server + lokaler Download — alle drei aktualisieren
    if (vaultConnected.value && composableSoulContent.value) {
      await writeFile(localSoulFileName.value, new TextEncoder().encode(composableSoulContent.value))
    }
    await pushToServer()
    await exportAsBlob()

    // Server-Validierung
    let validated = false
    try {
      const soulId = soulToken.value?.split('.')?.[0] ?? ''
      const vRes = await fetch('/api/validate', { headers: { Authorization: `Bearer ${soulId}.${result.cert}` } })
      validated = vRes.ok
    } catch {}

    // Gespeicherte biometrische Zugangsdaten mit neuem Cert aktualisieren.
    // Eine einzige Biometrik-Bestätigung genügt — danach ist der neue Cert gespeichert.
    let credsUpdated = false
    let credsUpdateFailed = false
    if (savedCreds.hasCreds.value) {
      try {
        const prf = await passkey.authenticatePasskey()
        if (prf) {
          credsUpdated = await savedCreds.updateCert(result.cert, prf)
          if (!credsUpdated) credsUpdateFailed = true
        } else {
          credsUpdateFailed = true
        }
      } catch {
        credsUpdateFailed = true
      }
    }

    certRotationResult.value = { ...result, validated, credsUpdated, credsUpdateFailed }
  } finally {
    certRotateBusy.value = false
  }
}

// ── Archivar Tab ──────────────────────────────────────────────────────────────
const herzActive       = ref(false)
const longmemFacts     = ref(0)
const longmemUpdated   = ref('')
const bootstrapPending = ref(false)
const archivLoading    = ref(false)
const crystallizeBusy   = ref(false)
const longmemSizeBytes  = ref(0)
const longmemLogEntries = ref(0)
const longmemDaysSince  = ref(0)

const longmemSizeKb = computed(() => {
  const kb = longmemSizeBytes.value / 1024
  return kb < 1 ? longmemSizeBytes.value + ' B' : kb.toFixed(1) + ' KB'
})

const longmemChaos = computed(() => {
  const e = longmemLogEntries.value, d = longmemDaysSince.value
  const pct = Math.min(100, Math.round(e / 15 * 70 + d / 30 * 30))
  if (e <= 7 && d <= 14) return { pct: Math.max(8, pct), color: '#22c55e', label: 'ruhig' }
  if (e <= 12 || d <= 21) return { pct: Math.max(40, pct), color: '#f59e0b', label: 'wächst' }
  return { pct: 100, color: '#ef4444', label: 'chaotisch' }
})
const archivFeedback   = ref(null)

async function loadArchivStatus() {
  archivLoading.value = true
  try {
    const [herzRes, lmRes] = await Promise.all([
      fetch('/api/soul/herz/status', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      }).then(r => r.json()).catch(() => null),
      fetch('/api/soul/longmem-status', {
        headers: { Authorization: `Bearer ${soulToken.value}` }
      }).then(r => r.json()).catch(() => null),
    ])
    herzActive.value        = herzRes?.active ?? false
    longmemFacts.value      = lmRes?.facts ?? 0
    longmemUpdated.value    = lmRes?.updated ?? ''
    bootstrapPending.value  = lmRes?.bootstrap_pending ?? false
    longmemSizeBytes.value  = lmRes?.size_bytes ?? 0
    longmemLogEntries.value = lmRes?.log_entries ?? 0
    longmemDaysSince.value  = lmRes?.days_since_cleanup ?? 0
  } finally {
    archivLoading.value = false
  }
}

async function triggerCrystallize() {
  const token = soulToken.value
  if (!token || token === 'anonymous') {
    archivFeedback.value = { ok: false, message: 'Soul nicht geladen — bitte Seite neu laden.' }
    setTimeout(() => { archivFeedback.value = null }, 8000)
    return
  }
  crystallizeBusy.value = true
  archivFeedback.value  = null
  try {
    const res = await fetch('/api/soul/herz/crystallize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    await loadArchivStatus()
    crystallizeBusy.value = false
    if (data?.ok) {
      archivFeedback.value = { ok: true, message: 'Aufräumen abgeschlossen ✓' }
      setTimeout(() => { archivFeedback.value = null }, 5000)
    } else {
      archivFeedback.value = { ok: false, message: data?.error || 'Fehler beim Aufräumen' }
      setTimeout(() => { archivFeedback.value = null }, 8000)
    }
  } catch {
    crystallizeBusy.value = false
    archivFeedback.value = { ok: false, message: 'Netzwerkfehler' }
    setTimeout(() => { archivFeedback.value = null }, 8000)
  }
}

// ── Beim Öffnen laden ─────────────────────────────────────────────────────────
async function initSettings() {
  await loadNodeStatus()
  detectAdmin()
  loadStatus()
  tab.value            = 'api'
  wavespeedKey.value   = ''
  wavespeedDirty.value = false
  elevenlabsKey.value  = ''
  elevenlabsDirty.value = false
}

watch(() => props.open, (val) => { if (val) initSettings() })

onMounted(() => { if (props.inline) initSettings() })
</script>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Settings form atoms ─────────────────────────────────────────────── */
/* Small action button (Test / Save inline) */
.sm-test-btn {
  height: 32px; padding: 0 12px;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.06em;
}
/* Key-set preview badge (shown inline in label) */
.sm-key-ok {
  font-family: var(--mono); font-size: 12px; color: var(--accent);
  text-transform: none; letter-spacing: 0; margin-left: 8px; font-weight: 400;
}
/* Description / info paragraphs below inputs */
.sm-desc {
  font-family: var(--mono); font-size: 12px; color: var(--fg-2);
  letter-spacing: 0.04em; margin: 0; line-height: 1.55;
}
/* Uppercase section mini-head */
.sm-sec-head {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--fg-4); margin-bottom: 10px;
}
/* Inline result feedback (ok/err toggled via :style) */
.sm-feedback {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.02em;
}
/* Accent-colored label chips (grace period, cert version etc.) */
.sm-accent-label {
  font-family: var(--mono); font-size: 12px; color: var(--accent-bright);
  letter-spacing: 0.06em;
}
/* Warning / info block with left border */
.sm-infoblock {
  padding: 10px 14px; margin-bottom: 20px;
  border-left: 2px solid var(--line-2);
  background: var(--surface-2);
  font-family: var(--mono); font-size: 12px;
  letter-spacing: 0.06em; color: var(--fg-2);
}

/* Override: Rail scrollbar auf Mobile */
@media (max-width: 640px) {
  :deep(.sys-rail) {
    grid-template-columns: repeat(6, minmax(80px, 1fr));
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  :deep(.sys-rail-item) {
    display: flex !important;
    padding: 10px 6px;
    justify-content: center;
  }
}

/* Archivar Tab */
.archivar-status-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: var(--surface-2);
  border: 1px solid var(--sys-rule);
  border-radius: var(--r-xs);
}
.archivar-status-lbl {
  font-family: var(--mono); font-size: 12px;
  color: var(--fg-2); letter-spacing: 0.04em;
}
.archivar-loading {
  font-family: var(--mono); font-size: 12px;
  color: var(--fg-4); letter-spacing: 0.06em;
}
.archivar-lm-block {
  border: 1px solid var(--sys-rule);
  border-radius: var(--r-xs);
  overflow: hidden;
}
.archivar-lm-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 14px;
  border-bottom: 1px solid var(--sys-rule);
  font-family: var(--mono); font-size: 12px;
}
.archivar-lm-row:last-child { border-bottom: none; }
.archivar-lm-key  { color: var(--fg); letter-spacing: 0.06em; text-transform: uppercase; font-size: 10px; }
.archivar-lm-val  { color: var(--fg-2); letter-spacing: 0.04em; }
.archivar-lm-ok   { color: var(--sys-ok); }
.archivar-lm-warn { color: var(--sys-warn); }
.archivar-lm-dim  { color: var(--fg); }
.archivar-chaos-wrap { display: flex; align-items: center; gap: 8px; }
.archivar-chaos-bar  { width: 64px; flex-shrink: 0; height: 6px; background: rgba(255,255,255,0.18); border-radius: 3px; overflow: hidden; }
.archivar-chaos-fill { display: block; height: 100%; border-radius: 3px; transition: width 0.6s ease, background 0.6s ease; }
.settings-inline-body { max-height: none !important; overflow: visible !important; }
</style>
