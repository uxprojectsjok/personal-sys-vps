<template>
  <Teleport :disabled="inline" to="body">
    <Transition name="sys-modal-fade">
      <div
        v-if="inline || open"
        :class="inline ? null : 'sys-modal-overlay'"
        @click.self="!inline && $emit('close')"
        :role="!inline ? 'dialog' : undefined"
        :aria-modal="!inline ? 'true' : undefined"
        :aria-label="!inline ? $t('settings.aria_label') : undefined"
      >
        <div :class="inline ? null : 'sys-modal sys-modal--md'" :style="!inline ? 'max-width:520px' : ''">
          <template v-if="!inline">
            <div class="sys-modal-handle"></div>
            <!-- Head -->
            <div class="sys-modal-head" style="padding:20px 28px 16px">
              <button class="sys-modal-close" @click="$emit('close')" :aria-label="$t('common.close')">×</button>
              <span class="sys-kicker" style="margin-bottom:0;padding-bottom:0;border-bottom:none">{{ $t('settings.title') }}</span>
            </div>
          </template>

          <!-- Rail / Tabs -->
          <div class="sys-rail" @wheel="onTabWheel">
            <button @click="tab = 'api'" class="sys-rail-item" :class="tab === 'api' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_api') }}</span></span>
            </button>
            <button @click="tab = 'dienste'" class="sys-rail-item" :class="tab === 'dienste' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_services') }}</span></span>
            </button>
            <button @click="tab = 'plugins'" class="sys-rail-item" :class="tab === 'plugins' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_plugins') }}</span></span>
            </button>
            <button @click="tab = 'config'" class="sys-rail-item" :class="tab === 'config' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_config') }}</span></span>
            </button>
            <button @click="tab = 'archivar'; loadArchivStatus()" class="sys-rail-item" :class="tab === 'archivar' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_archivar') }}</span></span>
            </button>
            <button @click="tab = 'gesundheit'; loadHealthConfig()" class="sys-rail-item" :class="tab === 'gesundheit' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_health') }}</span></span>
            </button>
            <button v-if="!isMultiHoster" @click="tab = 'agent'; loadAgentStatus()" class="sys-rail-item" :class="tab === 'agent' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_agent') }}</span></span>
            </button>
            <button v-if="!isMultiHoster" @click="tab = 'x402'; loadX402Status()" class="sys-rail-item" :class="tab === 'x402' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_x402') }}</span></span>
            </button>
            <button v-if="isAdmin && isMultiHoster" @click="tab = 'einladen'; loadInviteToken()" class="sys-rail-item" :class="tab === 'einladen' ? 'is-active' : ''">
              <span class="sys-rail-lbl"><span class="sys-rail-t">{{ $t('settings.tab_invite') }}</span></span>
            </button>
          </div>

          <!-- Body -->
          <div :class="inline ? 'settings-inline-body' : 'sys-modal-body'" :style="inline ? 'padding:24px 28px' : 'padding:24px 28px;overflow-y:auto'">

            <!-- ── Tab: Dienste ── -->
            <template v-if="tab === 'dienste'">

              <!-- ElevenLabs Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  {{ $t('settings.elevenlabs_key') }}
                  <span v-if="elevenlabsKeySet" class="sm-key-ok">{{ elevenlabsPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="elevenlabsKey"
                    type="password"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-radius:var(--r-xs)"
                    :style="elevenlabsKeySet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="elevenlabsKeySet ? $t('common.overwrite_placeholder') : $t('settings.elevenlabs_key') + '…'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="elevenlabsDirty = true"
                    @keyup.enter="saveConfig"
                  />
                </div>
                <div v-if="elevenlabsKeySet" style="display:flex;gap:8px">
                  <button @click="deleteKey('elevenlabs_key')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">{{ $t('settings.delete') }}</button>
                </div>
              </div>

              <!-- ElevenLabs Agent-URL (Klartext-URL, kein eye) -->
              <div class="sys-field" style="gap:12px">
                <label class="sys-field-label">
                  {{ $t('settings.agent_url_label') }}
                  <span v-if="agentUrlSet" class="sm-key-ok">{{ $t('settings.agent_saved') }}</span>
                </label>
                <input
                  v-model="agentUrl"
                  type="text"
                  class="sys-input"
                  :style="agentUrlSet ? 'border-color:var(--sys-ok)' : ''"
                  :placeholder="agentUrlSet ? $t('settings.agent_url_placeholder_set') : $t('settings.agent_url_placeholder_empty')"
                  autocomplete="off"
                  spellcheck="false"
                  @keyup.enter="saveAgentUrl"
                />
                <div v-if="agentUrl || agentUrlSet" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <button v-if="agentUrl" @click="saveAgentUrl" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn">{{ $t('common.save') }}</button>
                  <button v-if="agentUrlSet" @click="deleteAgentUrl" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">{{ $t('settings.delete') }}</button>
                  <button @click="confirmRotateWebhook" :disabled="webhookRotateBusy" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-warn)">{{ webhookRotateBusy ? $t('settings.token_renewing') : $t('settings.token_renew') }}</button>
                  <span v-if="agentUrlFeedback" class="sm-feedback"
                    :style="agentUrlFeedback.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'">
                    {{ agentUrlFeedback.message }}
                  </span>
                  <span v-if="webhookFeedback" class="sm-feedback"
                    :style="webhookFeedback.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'">
                    {{ webhookFeedback.message }}
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
                <label class="sys-field-label">{{ $t('settings.model') }}</label>
                <select v-model="model" class="sys-input" style="cursor:pointer">
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6 — Standard</option>
                  <option value="claude-sonnet-5">Claude Sonnet 5 — neu</option>
                  <option value="claude-fable-5">Claude Fable 5 — kreativ</option>
                  <option value="claude-opus-4-7">Claude Opus 4.7 — tief</option>
                  <option value="claude-opus-4-8">Claude Opus 4.8 — leistungsstark</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — schnell</option>
                </select>
              </div>

              <!-- Anthropic Key -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">{{ $t('settings.anthropic_key') }}</label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="apiKey"
                    type="password"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-radius:var(--r-xs)"
                    :style="(keySource === 'soul' || keySource === 'master') ? 'border-color:var(--sys-ok)' : ''"
                    placeholder="sk-ant-..."
                    autocomplete="off"
                    spellcheck="false"
                    @keyup.enter="saveConfig"
                  />
                </div>
                <div v-if="keySource === 'soul'" style="display:flex;gap:8px">
                  <button @click="deleteKey('anthropic_key')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">{{ $t('settings.delete') }}</button>
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

              <!-- Reown Project ID -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  {{ $t('settings.reown_id') }}
                  <span v-if="reownSet" class="sm-key-ok">{{ reownPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="reownProjectId"
                    type="password"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-radius:var(--r-xs)"
                    :style="reownSet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="reownSet ? $t('common.overwrite_placeholder') : 'a1b2c3d4…'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="reownDirty = true"
                    @keyup.enter="saveConfig"
                  />
                </div>
                <div v-if="reownSet" style="display:flex;gap:8px">
                  <button @click="deleteKey('reown_project_id')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">{{ $t('settings.delete') }}</button>
                </div>
              </div>

              <!-- Zapier MCP -->
              <div class="sys-field" style="gap:12px;margin-bottom:24px">
                <label class="sys-field-label">
                  {{ $t('settings.mcp_label') }}
                  <span v-if="mcpUrlSet" class="sm-key-ok">{{ mcpPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="mcpUrl"
                    type="password"
                    class="sys-input sys-input--mono"
                    style="flex:1;border-radius:var(--r-xs)"
                    :style="mcpUrlSet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="mcpUrlSet ? $t('common.overwrite_placeholder') : 'https://mcp.zapier.com/api/mcp/s/…/mcp'"
                    autocomplete="off"
                    spellcheck="false"
                    @input="mcpDirty = true"
                    @keyup.enter="saveConfig"
                  />
                </div>
                <div v-if="mcpUrlSet" style="display:flex;gap:8px">
                  <button @click="deleteKey('mcp_url')" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">{{ $t('settings.delete') }}</button>
                </div>
              </div>

              <!-- Pinata JWT -->
              <div class="sys-field" style="gap:12px">
                <label class="sys-field-label">
                  {{ $t('settings.pinata_jwt') }}
                  <span v-if="pinataJwtSet" class="sm-key-ok">{{ pinataPreview }}</span>
                </label>
                <div style="display:flex;gap:0">
                  <input
                    v-model="pinataJwt"
                    type="password"
                    class="sys-input"
                    style="flex:1;border-radius:var(--r-xs)"
                    :style="pinataJwtSet ? 'border-color:var(--sys-ok)' : ''"
                    :placeholder="pinataJwtSet ? $t('common.overwrite_placeholder') : 'eyJ…'"
                    autocomplete="off"
                    spellcheck="false"
                    @keyup.enter="savePinataJwt"
                  />
                </div>
                <div v-if="pinataJwtSet || pinataFeedback" style="display:flex;align-items:center;gap:8px">
                  <button v-if="pinataJwtSet" @click="deletePinataJwt" class="sys-btn-ed sys-btn-ed--ghost sm-test-btn" style="color:var(--sys-err)">{{ $t('settings.delete') }}</button>
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

              <!-- Language -->
              <div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--sys-rule)">
                <div class="sys-field-label" style="margin-bottom:4px">{{ $t('settings.language') }}</div>
                <p class="sm-desc" style="margin-bottom:12px">{{ $t('settings.language_desc') }}</p>
                <div style="display:flex;gap:8px">
                  <button
                    v-for="loc in LOCALES"
                    :key="loc.code"
                    @click="switchLocale(loc.code)"
                    class="sys-btn-ed"
                    :class="locale === loc.code ? 'sys-btn-ed--primary' : 'sys-btn-ed--ghost'"
                    style="min-width:80px;justify-content:center"
                  >
                    {{ loc.name }}
                  </button>
                </div>
              </div>

              <!-- Soul-Cert -->
              <div style="margin-bottom:24px">
                <div class="sys-field-label" style="margin-bottom:8px">{{ $t('settings.soul_cert') }}</div>
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
                >{{ certRotateBusy ? $t('settings.cert_rotating') : $t('settings.cert_rotate') }}</button>
                <Transition name="sys-modal-fade">
                  <div v-if="certRotationResult" style="margin-top:10px;padding:12px 14px;border:1px solid var(--sys-rule-strong)">
                    <div v-if="certRotationResult.error" style="font-family:var(--sys-mono);font-size:11px;color:var(--sys-err)">
                      {{ $t('settings.cert_rotation_failed') }}
                    </div>
                    <template v-else>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                      <span style="font-family:var(--sys-mono);font-size:11px;color:var(--sys-accent-bright)">{{ $t('settings.cert_rotated', { version: certRotationResult.cert_version }) }}</span>
                      <button @click="certRotationResult = null" style="background:none;border:none;cursor:pointer;color:var(--sys-fg-dim);font-size:16px;line-height:1;padding:0">×</button>
                    </div>
                    <div class="sm-sec-head" style="margin-bottom:4px">{{ $t('settings.bearer_token') }}</div>
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
                      {{ certRotationResult.validated ? $t('settings.cert_validated') : $t('settings.cert_check_hint') }}
                    </p>
                    <p v-if="certRotationResult.credsUpdated" class="sm-desc f-ok" style="margin-top:4px">
                      {{ $t('settings.biometric_updated') }}
                    </p>
                    <p v-else-if="certRotationResult.credsUpdateFailed" class="sm-desc" style="color:var(--sys-warn);margin-top:4px">
                      {{ $t('settings.biometric_update_failed') }}
                    </p>
                    </template>
                  </div>
                </Transition>
              </div>

              <!-- Vault Key -->
              <div style="padding-top:20px;border-top:1px solid var(--sys-rule);margin-bottom:24px">
                <div class="sys-field-label" style="margin-bottom:8px">{{ $t('settings.vault_key_title') }}</div>
                <p class="sm-desc" style="margin-bottom:12px">{{ $t('settings.vault_key_desc') }}</p>

                <div v-if="vaultKeyStatus?.vault_key_hex" style="margin-bottom:12px;padding:8px 12px;background:rgba(0,0,0,0.18);border-radius:var(--r-xs)">
                  <div style="display:flex;align-items:flex-start;gap:8px">
                    <code style="flex:1;font-family:var(--sys-mono);font-size:13px;color:var(--fg-2);word-break:break-all;user-select:all;line-height:1.55">{{ vaultKeyStatus.vault_key_hex }}</code>
                    <button @click="copyVaultKey" style="background:none;border:none;cursor:pointer;padding:2px;flex-shrink:0" title="Kopieren">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :style="vaultKeyCopied ? 'color:var(--accent)' : 'color:var(--fg-4)'">
                        <path v-if="vaultKeyCopied" stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
                        <path v-else stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <div v-if="vaultKeyStatus" style="margin-bottom:12px;padding:10px 12px;background:rgba(0,0,0,0.18);border-radius:var(--r-xs)">
                  <div style="display:flex;align-items:center;gap:8px">
                    <template v-if="vaultKeyStatus.checked === 0">
                      <span style="color:var(--fg-4);font-size:12px">{{ $t('settings.vault_key_not_encrypted') }}</span>
                    </template>
                    <template v-else-if="!vaultKeyStatus.has_key">
                      <!-- Kein Schlüssel hinterlegt (z.B. gerade gelockt) ist ein normaler,
                           erwarteter Zustand — sähe mit der Mismatch-Logik unten sonst wie
                           ein echter Fehler aus (alle Dateien "mismatched", weil kein Schlüssel
                           zum Prüfen da ist), ist aber keiner. -->
                      <span style="color:var(--fg-4);font-size:12px">{{ $t('settings.vault_key_locked') }}</span>
                    </template>
                    <template v-else-if="vaultKeyStatus.all_ok">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--sys-ok);flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                      <span style="color:var(--sys-ok);font-size:12px">{{ $t('settings.vault_key_ok', { n: vaultKeyStatus.checked }) }}</span>
                    </template>
                    <template v-else>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--sys-err);flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"/></svg>
                      <span style="color:var(--sys-err);font-size:12px">{{ $t('settings.vault_key_mismatch', { n: vaultKeyStatus.mismatched.length, total: vaultKeyStatus.checked }) }}</span>
                    </template>
                  </div>
                  <ul v-if="vaultKeyStatus.has_key && !vaultKeyStatus.all_ok && vaultKeyStatus.mismatched?.length" style="margin:8px 0 0;padding-left:18px">
                    <li v-for="f in vaultKeyStatus.mismatched" :key="f" style="font-family:var(--sys-mono);font-size:11px;color:var(--sys-err)">{{ f }}</li>
                  </ul>
                </div>

                <button
                  @click="handleResyncVaultKey"
                  :disabled="vaultKeyBusy"
                  class="sys-btn-ed sys-btn-ed--primary"
                  style="width:100%;justify-content:center"
                >{{ vaultKeyBusy ? $t('settings.vault_key_syncing') : $t('settings.vault_key_resync') }}</button>

                <p v-if="vaultKeyError" class="sm-desc" style="color:var(--sys-err);margin-top:8px">{{ vaultKeyError }}</p>
                <p v-if="vaultKeySynced" class="sm-desc f-ok" style="margin-top:8px">{{ $t('settings.vault_key_synced') }}</p>

                <!-- Aktuelle Methode -->
                <div v-if="vaultKeyStatus?.vault_key_method" style="margin-top:10px;padding:8px 12px;background:rgba(0,0,0,0.12);border-radius:var(--r-xs)">
                  <span style="font-size:12px;color:var(--fg-3)">
                    {{ $t('settings.vault_key_method_current', { method: vaultKeyStatus.vault_key_method === 'mnemonic' ? $t('vault_session.method_label_mnemonic') : (vaultKeyStatus.vault_key_method === 'passkey' ? $t('vault_session.method_label_passkey') : vaultKeyStatus.vault_key_method) }) }}
                    <template v-if="vaultKeyStatus.vault_key_set_at">{{ $t('settings.vault_key_set_at', { date: formatVaultKeyDate(vaultKeyStatus.vault_key_set_at) }) }}</template>
                  </span>
                </div>

                <!-- Verschlüsselung ändern -->
                <button
                  v-if="!vaultKeyChangeMode"
                  @click="startVaultKeyChange"
                  :disabled="!vaultKeyStatus?.has_key || !vaultKeyStatus?.all_ok"
                  class="sys-btn-ed sys-btn-ed--primary"
                  style="width:100%;justify-content:center;margin-top:8px"
                >{{ $t('settings.vault_key_change_btn') }}</button>
                <p v-if="!vaultKeyChangeMode && !vaultKeyStatus?.has_key" class="sm-desc" style="margin-top:6px">{{ $t('settings.vault_key_change_disabled_no_key') }}</p>
                <p v-else-if="!vaultKeyChangeMode && vaultKeyStatus?.has_key && !vaultKeyStatus?.all_ok" class="sm-desc" style="margin-top:6px">{{ $t('settings.vault_key_change_disabled_mismatch') }}</p>

                <Transition name="sys-modal-fade">
                  <div v-if="vaultKeyChangeMode" style="margin-top:10px;padding:12px 14px;border:1px solid var(--sys-rule-strong)">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
                      <span class="sm-sec-head">{{ $t('settings.vault_key_change_choose') }}</span>
                      <button @click="cancelVaultKeyChange" style="background:none;border:none;cursor:pointer;color:var(--sys-fg-dim);font-size:16px;line-height:1;padding:0">×</button>
                    </div>

                    <template v-if="!vaultKeyChangeSuccess">
                      <div class="grid grid-cols-2 gap-1.5" style="margin-bottom:10px">
                        <button
                          v-for="opt in [{ value: 'passkey', label: $t('vault_session.method_passkey') }, { value: 'mnemonic', label: $t('vault_session.method_mnemonic') }]"
                          :key="opt.value"
                          type="button"
                          style="padding:8px 4px;min-height:38px;font-size:14px;border-radius:var(--r-xs);border:1px solid;transition:all .15s"
                          :style="newVaultKeyMethod === opt.value
                            ? 'border-color:var(--accent);color:var(--accent);background:var(--accent-dim);font-weight:600'
                            : 'border-color:var(--line-2);color:var(--fg-2)'"
                          @click="newVaultKeyMethod = opt.value; newMnemonicWords = []; newMnemonicSavedConfirm = false"
                        >{{ opt.label }}</button>
                      </div>

                      <p style="font-size:13px;color:var(--fg-4);margin:0 0 10px">
                        {{ newVaultKeyMethod === 'mnemonic' ? $t('vault_session.mnemonic_tradeoff') : $t('vault_session.passkey_tradeoff') }}
                      </p>

                      <template v-if="newVaultKeyMethod === 'mnemonic'">
                        <button
                          v-if="!newMnemonicWords.length"
                          @click="newMnemonicWords = generateMnemonicWords()"
                          class="sys-btn-ed sys-btn-ed--ghost"
                          style="width:100%;justify-content:center;margin-bottom:10px"
                        >{{ $t('settings.vault_key_change_mnemonic_generate') }}</button>

                        <template v-else>
                          <div style="background:rgba(0,0,0,0.3);padding:10px 12px;margin-bottom:8px;font-family:var(--sys-mono);font-size:13px;color:var(--sys-accent-bright);line-height:1.8;display:grid;grid-template-columns:repeat(3,1fr);gap:2px 8px">
                            <span v-for="(w, i) in newMnemonicWords" :key="i">{{ i + 1 }}. {{ w }}</span>
                          </div>
                          <p class="sm-desc" style="margin-bottom:8px">{{ $t('settings.vault_key_change_words_title') }}</p>
                          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--fg-2);margin-bottom:10px;cursor:pointer">
                            <input type="checkbox" v-model="newMnemonicSavedConfirm" />
                            {{ $t('settings.vault_key_change_mnemonic_saved_confirm') }}
                          </label>
                        </template>
                      </template>

                      <button
                        v-if="newVaultKeyMethod === 'passkey'"
                        @click="handleVaultKeyChange"
                        :disabled="vaultKeyChangeBusy"
                        class="sys-btn-ed sys-btn-ed--primary"
                        style="width:100%;justify-content:center"
                      >{{ vaultKeyChangeBusy ? $t('settings.vault_key_change_migrating') : $t('settings.vault_key_change_passkey_btn') }}</button>

                      <button
                        v-else-if="newVaultKeyMethod === 'mnemonic' && newMnemonicWords.length"
                        @click="handleVaultKeyChange"
                        :disabled="vaultKeyChangeBusy || !newMnemonicSavedConfirm"
                        class="sys-btn-ed sys-btn-ed--primary"
                        style="width:100%;justify-content:center"
                      >{{ vaultKeyChangeBusy ? $t('settings.vault_key_change_migrating') : $t('settings.vault_key_change_confirm_btn') }}</button>
                    </template>

                    <p v-if="vaultKeyChangeError" class="sm-desc" style="color:var(--sys-err);margin-top:8px">{{ vaultKeyChangeError }}</p>
                    <p v-if="vaultKeyChangeSuccess" class="sm-desc f-ok" style="margin-top:8px">{{ vaultKeyChangeSuccess }}</p>
                  </div>
                </Transition>
              </div>

              <!-- Datenschutz: Scan-Sichtbarkeit -->
              <div style="padding-top:20px;border-top:1px solid var(--sys-rule);margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--sys-rule)">
                <div class="sys-field-label" style="margin-bottom:12px">{{ $t('settings.privacy_title') }}</div>
                <div class="sm-infoblock">
                  {{ $t('settings.privacy_desc') }}
                </div>
                <label class="api-panel-row" style="cursor:pointer;margin-bottom:14px">
                  <div class="api-toggle" :class="discoverable ? 'is-on' : ''">
                    <div class="api-toggle-thumb" :class="discoverable ? 'is-on' : ''"></div>
                  </div>
                  <input type="checkbox" :checked="discoverable" class="sr-only" :disabled="discoverableSaving" @change="toggleDiscoverable" />
                  <span class="api-panel-row-label">{{ $t('settings.privacy_toggle_label') }}</span>
                </label>
                <div class="sm-infoblock" :class="{ 'sm-infoblock--warn': !discoverable }" style="margin-bottom:0">
                  {{ discoverable ? $t('settings.privacy_on_hint') : $t('settings.privacy_off_hint') }}
                </div>
                <div v-if="discoverable" class="sm-infoblock sm-infoblock--warn" style="margin-top:10px">
                  {{ $t('settings.privacy_permanence_warning') }}
                </div>
                <Transition name="sys-modal-fade">
                  <p v-if="discoverableFeedback" class="sm-desc" style="color:var(--sys-err);margin-top:6px">{{ discoverableFeedback.message }}</p>
                </Transition>
              </div>

              <!-- Admin verbinden (Multi-Hoster, kein Admin) -->
              <template v-if="!isAdmin && isMultiHoster">
                <div style="padding-top:20px;border-top:1px solid var(--sys-rule)">
                  <div class="sys-field-label" style="margin-bottom:12px">{{ $t('settings.admin_connect') }}</div>
                  <p class="sys-prose" style="margin-bottom:16px">{{ $t('settings.admin_connect_desc') }}</p>
                  <div class="sys-field" style="margin-bottom:12px">
                    <label class="sys-field-label">{{ $t('settings.admin_token_label') }}</label>
                    <div style="display:flex;gap:0">
                      <input
                        v-model="connectToken"
                        type="password"
                        class="sys-input sys-input--mono"
                        style="flex:1;border-radius:var(--r-xs)"
                        placeholder="adm_..."
                        autocomplete="off"
                        spellcheck="false"
                        @keyup.enter="connectAdmin"
                      />
                    </div>
                  </div>
                  <button class="sys-btn-ed sys-btn-ed--primary" @click="connectAdmin" :disabled="connectingAdmin || !connectToken">
                    {{ connectingAdmin ? $t('common.checking') : $t('settings.connect_btn') }}
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
                  <div class="sys-field-label" style="margin-bottom:12px">{{ $t('settings.server_admin') }}</div>
                  <div class="sm-infoblock">
                    {{ $t('settings.master_key_rotation') }}
                  </div>
                  <div class="sys-field">
                    <label class="sys-field-label">{{ $t('settings.new_master_key') }}</label>
                    <div style="display:flex;gap:8px">
                      <input v-model="newMasterKey" type="text" readonly class="sys-input sys-input--mono" style="flex:1" placeholder="→ Generate" />
                      <button @click="generateMasterKey" class="sys-btn-ed sys-btn-ed--primary" style="white-space:nowrap">{{ $t('settings.generate') }}</button>
                    </div>
                  </div>
                  <Transition name="sys-modal-fade">
                    <div v-if="graceUntil" style="border:1px solid rgba(245,158,11,0.25);background:rgba(245,158,11,0.05);padding:14px 16px;margin-bottom:16px">
                      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                        <span class="sm-accent-label">{{ $t('settings.grace_active') }}</span>
                        <span class="sm-accent-label">{{ graceCountdown }}</span>
                      </div>
                    </div>
                  </Transition>
                  <div v-if="isMultiHoster" class="sys-field" style="padding-top:14px;border-top:1px solid var(--sys-rule);margin-bottom:0">
                    <label class="sys-field-label">{{ $t('settings.rotate_admin_token') }}</label>
                    <div style="display:flex;gap:8px">
                      <input v-model="newAdminToken" type="text" readonly class="sys-input sys-input--mono" style="flex:1" placeholder="→ Generate" />
                      <button @click="generateAdminToken" class="sys-btn-ed sys-btn-ed--primary" style="white-space:nowrap">{{ $t('settings.generate') }}</button>
                    </div>
                  </div>
                  <div style="margin-top:16px">
                    <button class="sys-btn-ed sys-btn-ed--primary" @click="saveMaster"
                      :disabled="savingMaster || (!newMasterKey && !masterAnthropicKey && !newAdminToken)">
                      {{ savingMaster ? $t('settings.admin_saving') : $t('settings.save_rotate') }}
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

              <!-- Status -->
              <div class="sys-field" style="gap:6px;margin-bottom:20px">
                <label class="sys-field-label">Garmin Connect</label>
                <div v-if="!healthHasPassword" class="sm-desc" style="color:var(--fg-2)">{{ $t('settings.health_sync_not_configured') }}</div>
                <div v-else-if="healthSyncStatus" class="sm-desc" :style="healthSyncStatus.ok ? 'color:var(--sys-ok)' : 'color:var(--c-err,#e06c75)'">
                  {{ healthSyncStatus.ok ? '✓' : '✗' }} {{ healthSyncStatus.message }}
                  <span v-if="healthSyncStatus.last_run" style="color:var(--fg-2);margin-left:6px">{{ healthSyncStatus.last_run }}</span>
                </div>
                <div v-else class="sm-desc" style="color:var(--sys-ok)">✓ {{ $t('settings.health_sync_configured') }}</div>
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
                <div class="sys-field-label" style="margin-bottom:10px">{{ $t('settings.longmem_title') }}</div>
                <div v-if="archivLoading" class="archivar-loading">{{ $t('common.loading') }}</div>
                <template v-else>
                  <div class="archivar-lm-block">
                    <div class="archivar-lm-row">
                      <span class="archivar-lm-key">{{ $t('settings.facts_label') }}</span>
                      <span class="archivar-lm-val" :class="longmemFacts > 0 ? 'archivar-lm-ok' : 'archivar-lm-dim'">
                        {{ longmemFacts > 0 ? $t('settings.facts_count', { n: longmemFacts }) : $t('chat.no_facts') }}
                      </span>
                    </div>
                    <div class="archivar-lm-row">
                      <span class="archivar-lm-key">{{ $t('settings.last_cleanup') }}</span>
                      <span class="archivar-lm-val archivar-lm-dim">{{ longmemUpdated || '—' }}</span>
                    </div>
                    <div class="archivar-lm-row">
                      <span class="archivar-lm-key">{{ $t('settings.size') }}</span>
                      <span class="archivar-lm-val archivar-lm-dim">{{ longmemSizeKb }}</span>
                    </div>
                    <div class="archivar-lm-row">
                      <span class="archivar-lm-key">{{ $t('chat.chaos') }}</span>
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
                  ><span v-if="crystallizeBusy" class="dots-running">{{ $t('settings.cleanup_running') }}</span><template v-else>{{ $t('settings.cleanup_now') }}</template></button>
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

            <!-- ── Tab: Agent ── -->
            <template v-if="tab === 'agent'">

              <p style="font-size:15px;line-height:1.65;color:var(--fg);margin:0 0 20px">{{ $t('settings.agent_cron_desc') }}</p>

              <!-- Status Block -->
              <div class="archivar-lm-block" style="margin-bottom:20px">
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">Claude Code</span>
                  <span class="archivar-lm-val" :class="agentInstalled ? 'archivar-lm-ok' : ''">
                    {{ agentInstalled ? $t('settings.agent_installed') : $t('settings.agent_not_installed') }}
                  </span>
                </div>
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('settings.agent_interval_label') }}</span>
                  <span class="archivar-lm-val">
                    {{ agentInterval === 'daily' ? $t('settings.agent_interval_daily') : $t('settings.agent_interval_hourly') }}
                  </span>
                </div>
                <div class="archivar-lm-row">
                  <span class="archivar-lm-key">{{ $t('settings.agent_last_run') }}</span>
                  <span class="archivar-lm-val archivar-lm-dim">{{ agentLastRun || $t('settings.agent_last_run_never') }}</span>
                </div>
              </div>

              <!-- Not installed hint -->
              <div v-if="!agentInstalled" class="sm-infoblock" style="margin-bottom:20px">
                {{ $t('settings.agent_not_installed_hint') }}
              </div>

              <!-- No API key warning -->
              <div v-if="keySource === 'none'" class="sm-infoblock" style="margin-bottom:20px;border-color:var(--sys-warn)">
                {{ $t('settings.agent_no_api_key') }}
              </div>

              <!-- MCP Service Token fehlt -->
              <div v-if="agentInstalled && !agentMcpTokenOk" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:12px 16px;border:1px solid var(--sys-warn);border-radius:var(--r-xs);background:rgba(220,184,109,0.04)">
                <div>
                  <div style="font-size:14px;font-weight:500;color:var(--sys-warn)">{{ $t('settings.agent_mcp_token_missing') }}</div>
                  <div style="font-size:13px;line-height:1.55;color:var(--fg-2);margin-top:4px">{{ $t('settings.agent_mcp_token_missing_hint') }}</div>
                </div>
                <button
                  class="sys-btn-ed sys-btn-ed--ghost"
                  style="flex-shrink:0;margin-left:12px"
                  :disabled="agentSetupMcpBusy"
                  @click="setupAgentMcpToken"
                >{{ agentSetupMcpBusy ? '…' : $t('settings.agent_mcp_token_setup') }}</button>
              </div>

              <!-- Enable / Disable toggle -->
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;padding:14px 16px;border:1px solid var(--sys-rule);border-radius:var(--r-xs)"
                :style="agentEnabled ? 'border-color:var(--sys-ok);background:rgba(184,220,196,0.04)' : ''">
                <div>
                  <div style="font-family:var(--sys-mono);font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:var(--fg)"
                    :style="agentEnabled ? 'color:var(--sys-ok)' : ''">
                    {{ agentEnabled ? $t('settings.agent_enabled') : $t('settings.agent_disabled') }}
                  </div>
                  <div style="font-family:var(--sys-mono);font-size:11px;color:var(--fg-4);margin-top:3px;letter-spacing:0.04em">
                    {{ agentInterval === 'daily' ? $t('settings.agent_interval_daily') : $t('settings.agent_interval_hourly') }}
                  </div>
                </div>
                <button
                  @click="toggleAgent(!agentEnabled)"
                  :disabled="agentToggleBusy"
                  class="agent-toggle"
                  :class="agentEnabled ? 'agent-toggle--on' : ''"
                  :aria-label="agentEnabled ? $t('settings.agent_disable') : $t('settings.agent_enable')"
                >
                  <span class="agent-toggle-knob"></span>
                </button>
              </div>

              <!-- Interval selector + Run now -->
              <div class="sys-field" style="gap:10px;margin-bottom:24px">
                <label class="sys-field-label">{{ $t('settings.agent_interval_label') }}</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button
                    v-for="iv in ['hourly','daily']"
                    :key="iv"
                    class="sys-btn-ed"
                    :class="agentInterval === iv ? 'sys-btn-ed--primary' : 'sys-btn-ed--ghost'"
                    @click="setAgentInterval(iv)"
                  >{{ iv === 'hourly' ? $t('settings.agent_interval_hourly') : $t('settings.agent_interval_daily') }}</button>
                  <button
                    class="sys-btn-ed sys-btn-ed--ghost"
                    style="margin-left:auto"
                    :disabled="agentRunNowBusy"
                    @click="runAgentNow"
                  >{{ agentRunNowBusy ? $t('settings.agent_running') : $t('settings.agent_run_now') }}</button>
                </div>
              </div>

              <!-- Queue editor -->
              <div class="sys-field" style="gap:10px">
                <label class="sys-field-label">{{ $t('settings.agent_queue_title') }}</label>
                <p style="font-size:13px;line-height:1.55;color:var(--fg-2);margin:0 0 8px">{{ $t('settings.agent_queue_desc') }}</p>
                <textarea
                  v-model="agentQueueText"
                  class="sys-input"
                  rows="6"
                  :placeholder="$t('settings.agent_queue_placeholder')"
                  style="font-family:var(--sys-mono);font-size:12px;resize:vertical;line-height:1.6"
                  spellcheck="false"
                ></textarea>
              </div>

              <!-- Feedback -->
              <Transition name="sys-modal-fade">
                <div v-if="agentFeedback" style="margin-top:10px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="agentFeedback.ok
                    ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                    : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                >{{ agentFeedback.message }}</div>
              </Transition>

              <!-- Agent running status -->
              <div v-if="agentRunNowBusy || agentRunPolling" class="agent-status-running">
                <span class="agent-status-dot"></span>
                {{ agentRunNowBusy ? $t('settings.agent_starting') : $t('settings.agent_working') }}
              </div>

            </template>

            <!-- ── Tab: x402 test tooling ── -->
            <template v-if="tab === 'x402'">

              <p style="font-size:15px;line-height:1.65;color:var(--fg);margin:0 0 20px">{{ $t('settings.x402_desc') }}</p>

              <!-- Status Block -->
              <div class="archivar-lm-block" style="margin-bottom:20px;font-size:15px">
                <div class="archivar-lm-row" style="gap:16px">
                  <span class="archivar-lm-key" style="font-size:15px;text-transform:none;letter-spacing:0;flex-shrink:0">{{ $t('settings.x402_wallet_label') }}</span>
                  <span class="archivar-lm-val" :class="x402Configured ? 'archivar-lm-ok' : ''">
                    {{ x402Configured ? $t('settings.x402_wallet_ready') : $t('settings.x402_wallet_missing') }}
                  </span>
                </div>
                <div v-if="x402Address" class="archivar-lm-row" style="gap:16px">
                  <span class="archivar-lm-key" style="font-size:15px;text-transform:none;letter-spacing:0;flex-shrink:0">{{ $t('settings.x402_address_label') }}</span>
                  <code class="archivar-lm-val archivar-lm-dim" style="font-size:13px;word-break:break-all;text-align:right">{{ x402Address }}</code>
                </div>
                <div v-if="x402Balances" class="archivar-lm-row" style="gap:16px">
                  <span class="archivar-lm-key" style="font-size:15px;text-transform:none;letter-spacing:0;flex-shrink:0">{{ $t('settings.x402_balance_label') }}</span>
                  <span class="archivar-lm-val">{{ x402Balances.usdc }} USDC · {{ x402Balances.pol }} POL</span>
                </div>
              </div>

              <!-- Key entry -->
              <div class="sys-field" style="gap:10px;margin-bottom:24px">
                <label class="sys-field-label">{{ x402Configured ? $t('settings.x402_replace_key_label') : $t('settings.x402_key_label') }}</label>
                <p style="font-size:15px;line-height:1.65;color:var(--fg-2);margin:0 0 8px">{{ $t('settings.x402_key_desc') }}</p>
                <div style="display:flex;gap:8px">
                  <input
                    v-model="x402KeyInput"
                    type="password"
                    class="sys-input sys-input--mono"
                    style="flex:1"
                    placeholder="0x…"
                    autocomplete="off"
                  />
                  <button
                    class="sys-btn-ed sys-btn-ed--primary"
                    :disabled="!x402KeyInput.trim() || x402KeySaving"
                    @click="x402SaveKey"
                  >{{ x402KeySaving ? $t('settings.agent_running') : $t('common.save') }}</button>
                </div>
              </div>

              <!-- Balance + test payment -->
              <div v-if="x402Configured" class="sys-field" style="gap:10px;margin-bottom:24px">
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="sys-btn-ed sys-btn-ed--primary" :disabled="x402BalancesBusy" @click="x402GetBalances">
                    {{ x402BalancesBusy ? $t('settings.agent_running') : $t('settings.x402_balances_btn') }}
                  </button>
                  <button class="sys-btn-ed sys-btn-ed--primary" :disabled="x402PayBusy" @click="x402SendTestPayment">
                    {{ x402PayBusy ? $t('settings.agent_running') : $t('settings.x402_test_pay_btn') }}
                  </button>
                </div>
                <p style="font-size:15px;line-height:1.65;color:var(--fg-4);margin:0">{{ $t('settings.x402_test_pay_hint') }}</p>

                <div v-if="x402PayResult" class="sm-infoblock" style="margin-top:8px">
                  <pre style="white-space:pre-wrap;word-break:break-all;margin:0;font-family:var(--sys-mono);font-size:11px">{{ x402PayResult }}</pre>
                </div>
              </div>

              <!-- Feedback -->
              <Transition name="sys-modal-fade">
                <div v-if="x402Feedback" style="margin-top:10px;padding:10px 14px;border-left:2px solid;font-family:var(--sys-mono);font-size:11px"
                  :style="x402Feedback.ok
                    ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                    : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
                >{{ x402Feedback.message }}</div>
              </Transition>

            </template>

            <!-- ── Tab: Einladen ── -->
            <template v-if="tab === 'einladen'">
              <p class="sm-desc" style="margin-bottom:20px;line-height:1.7">{{ $t('settings.invite_desc') }}</p>

              <div class="sys-field" style="margin-bottom:20px">
                <label class="sys-field-label">{{ $t('settings.invite_token_label') }}</label>
                <div style="display:flex;gap:8px;align-items:center">
                  <code style="flex:1;padding:10px 14px;background:rgba(0,0,0,0.18);border-radius:var(--r-xs);font-family:var(--sys-mono);font-size:13px;color:var(--sys-accent-bright);word-break:break-all;user-select:all;border:1px solid var(--sys-rule)">
                    {{ inviteToken || $t('settings.invite_not_generated') }}
                  </code>
                  <button v-if="inviteToken" class="sys-btn-ed" @click="copyInviteToken" style="flex-shrink:0">
                    {{ inviteCopied ? $t('settings.invite_copied') : $t('settings.invite_copy') }}
                  </button>
                </div>
              </div>

              <div class="sm-infoblock" style="margin-bottom:20px">
                {{ $t('settings.invite_hint') }}
              </div>

              <div v-if="inviteFeedback" class="sm-infoblock" :style="inviteFeedbackOk ? 'border-color:var(--sys-ok);color:var(--sys-ok)' : 'border-color:var(--sys-err);color:var(--sys-err)'" style="margin-bottom:0">
                {{ inviteFeedback }}
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
                {{ $t('settings.tab_services') }}
              </template>
              <template v-else-if="tab === 'plugins'">
                <span class="sys-dot sys-dot--idle"></span>
                {{ $t('settings.tab_plugins') }}
              </template>
              <template v-else-if="tab === 'config'">
                <span class="sys-dot" :class="isAdmin ? 'sys-dot--warn' : 'sys-dot--idle'"></span>
                {{ isAdmin ? $t('settings.rotation_admin') : $t('settings.admin_cert') }}
              </template>
              <template v-else-if="tab === 'archivar'">
                <span class="sys-dot" :class="longmemFacts > 0 ? 'sys-dot--ok' : 'sys-dot--idle'"></span>
                {{ longmemFacts > 0 ? $t('settings.facts_count', { n: longmemFacts }) : $t('settings.memory_empty') }}
              </template>
              <template v-else-if="tab === 'gesundheit'">
                <span class="sys-dot" :class="healthHasPassword ? 'sys-dot--ok' : 'sys-dot--idle'"></span>
                {{ healthHasPassword ? $t('settings.garmin_connected') : $t('settings.not_configured') }}
              </template>
              <template v-else-if="tab === 'agent'">
                <span class="sys-dot" :class="agentEnabled ? 'sys-dot--ok' : 'sys-dot--idle'"></span>
                {{ agentEnabled ? $t('settings.agent_enabled') : $t('settings.agent_disabled') }}
              </template>
              <template v-else-if="tab === 'einladen'">
                <span class="sys-dot" :class="inviteToken ? 'sys-dot--ok' : 'sys-dot--idle'"></span>
                {{ inviteToken ? $t('settings.invite_active') : $t('settings.invite_inactive') }}
              </template>
            </div>
            <div class="sys-foot-actions">
              <template v-if="tab === 'api' || tab === 'dienste' || tab === 'plugins'">
                <button class="sys-btn-ed sys-btn-ed--primary" @click="saveConfig" :disabled="saving">
                  {{ saving ? $t('settings.saving') : $t('common.save') }}
                </button>
              </template>
              <template v-else-if="tab === 'einladen'">
                <button class="sys-btn-ed sys-btn-ed--primary" @click="rotateInviteToken" :disabled="inviteRotating">
                  {{ inviteRotating ? $t('settings.invite_rotating') : $t('settings.invite_rotate') }}
                </button>
              </template>
              <template v-else-if="tab === 'agent'">
                <button class="sys-btn-ed sys-btn-ed--primary" @click="saveAgentQueue" :disabled="agentQueueSaving">
                  {{ agentQueueSaving ? $t('settings.agent_queue_saving') : $t('settings.agent_queue_save') }}
                </button>
              </template>
              <template v-else-if="tab === 'gesundheit'">
                <!-- MFA-Code-Eingabe wenn Garmin einen Code per SMS gesendet hat -->
                <template v-if="healthNeedsMfa">
                  <input
                    v-model="healthMfaCode"
                    type="text"
                    inputmode="numeric"
                    maxlength="8"
                    placeholder="MFA-Code (SMS)"
                    class="sys-input"
                    style="width:140px;font-family:var(--sys-mono);letter-spacing:0.15em"
                    @keyup.enter="submitMfa"
                  />
                  <button class="sys-btn-ed sys-btn-ed--primary" @click="submitMfa" :disabled="healthLoginBusy || !healthMfaCode">
                    {{ healthLoginBusy ? '…' : 'Code senden' }}
                  </button>
                </template>
                <template v-else>
                  <button class="sys-btn-ed sys-btn-ed--primary" @click="garminLogin" :disabled="healthLoginBusy">
                    {{ healthLoginBusy ? '…' : 'Garmin Login' }}
                  </button>
                  <span v-if="healthGarminConnected" style="font-size:11px;font-family:var(--sys-mono);color:var(--sys-ok);padding:0 6px;align-self:center">Garmin verbunden ✓</span>
                </template>
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
import { useVaultSession } from '~/composables/useVaultSession.js'
import { generateMnemonicWords } from '~/composables/useSoulEncrypt.js'
import { useMcpTools } from '~/composables/useMcpTools.js'
import { useConfirm } from '~/composables/useConfirm.js'
import { useI18n } from 'vue-i18n'

const props = defineProps({ open: Boolean, inline: { type: Boolean, default: false } })
const emit  = defineEmits(['close', 'master-rotated'])

const { soulToken, rotateCert, soulContent: composableSoulContent, pushToServer, exportAsBlob } = useSoul()
const { isConnected: vaultConnected, writeFile, allFiles } = useVault()
const savedCreds = useSavedCreds()
const passkey    = useSoulPasskey()
const vaultSession = useVaultSession()
const { clearMcpCache, loadMcpTools } = useMcpTools()
const { ask: confirmAsk } = useConfirm()
const { t, locale, setLocale } = useI18n()

const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
]

function switchLocale(code) {
  setLocale(code)
  localStorage.setItem('sys-locale', code)
}

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

// Vertical mouse wheel -> horizontal scroll for the overflowing tab rail
// (no visible scrollbar, so without this desktop mouse users can't reach
// tabs past the fold — no drag/touch, no horizontal wheel on most mice).
function onTabWheel(e) {
  const el = e.currentTarget
  if (el.scrollWidth <= el.clientWidth) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

// ── Gesundheit Tab State ──────────────────────────────────────────────────────
const healthHasPassword   = ref(false)
const healthMsg           = ref('')
const healthMsgError      = ref(false)
const healthNeedsMfa      = ref(false)
const healthMfaCode       = ref('')
const healthLoginBusy     = ref(false)
const healthGarminConnected = ref(false)
const healthSyncStatus     = ref(null)

async function loadHealthConfig() {
  try {
    const r = await fetch('/api/health/config', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      healthHasPassword.value     = !!d.has_password
      healthGarminConnected.value = !!d.has_tokens
    }
  } catch {}
  try {
    const rs = await fetch('/api/health/sync-status', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (rs.ok) healthSyncStatus.value = await rs.json()
  } catch {}
}

async function garminLogin() {
  healthLoginBusy.value = true; healthMsg.value = ''; healthMsgError.value = false; healthNeedsMfa.value = false
  try {
    const r = await fetch('/api/health/login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' },
    })
    const d = await r.json()
    if (d.needs_mfa) {
      healthNeedsMfa.value = true
      healthMsg.value = d.message || 'MFA-Code per SMS erhalten — bitte eingeben.'
    } else if (d.ok) {
      healthGarminConnected.value = true
      healthMsg.value = 'Login erfolgreich ✓'
      setTimeout(() => { healthMsg.value = '' }, 4000)
    } else {
      healthMsgError.value = true
      healthMsg.value = d.error || 'Login fehlgeschlagen.'
    }
  } catch { healthMsgError.value = true; healthMsg.value = 'Netzwerkfehler.' }
  healthLoginBusy.value = false
}

async function submitMfa() {
  if (!healthMfaCode.value.trim()) return
  healthLoginBusy.value = true; healthMsg.value = ''
  try {
    const r = await fetch('/api/health/mfa', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: healthMfaCode.value.trim() }),
    })
    const d = await r.json()
    if (d.ok) {
      healthNeedsMfa.value = false; healthMfaCode.value = ''
      if (d.pending) {
        healthMsg.value = 'Code übermittelt — Login läuft…'
        setTimeout(() => { healthMsg.value = '' }, 5000)
      } else {
        healthGarminConnected.value = true
        healthMsg.value = 'Login erfolgreich ✓'
        setTimeout(() => { healthMsg.value = '' }, 4000)
      }
    } else {
      healthMsgError.value = true; healthMsg.value = d.error || 'MFA fehlgeschlagen.'
    }
  } catch { healthMsgError.value = true; healthMsg.value = 'Netzwerkfehler.' }
  healthLoginBusy.value = false
}

// ── API-Key Tab State ─────────────────────────────────────────────────────────
const apiKey    = ref('')
const model     = ref('')
const saving    = ref(false)
const feedback  = ref(null)

const anthTest  = ref(null)  // { loading, ok, message }
const labsTest  = ref(null)
const discoverable        = ref(true)
const discoverableSaving  = ref(false)
const discoverableFeedback = ref(null)
const keySource  = ref('none')   // 'soul' | 'master' | 'env' | 'none'
const keyPreview = ref('')

const elevenlabsKey     = ref('')
const elevenlabsKeySet  = ref(false)
const elevenlabsPreview = ref('')
const elevenlabsDirty   = ref(false)

const reownProjectId = ref('')
const reownSet       = ref(false)
const reownPreview   = ref('')
const reownDirty     = ref(false)

const mcpUrl     = ref('')
const mcpUrlSet  = ref(false)
const mcpPreview = ref('')
const mcpDirty   = ref(false)


const pinataJwt      = ref('')
const pinataJwtSet   = ref(false)
const pinataPreview  = ref('')
const pinataFeedback = ref(null)
const webhookTokenPreview = ref('')
const webhookRotateBusy   = ref(false)
const webhookFeedback     = ref(null)

const agentUrl         = ref('')
const showAgentUrl     = ref(false)
const agentUrlSet      = ref(false)
const agentUrlFeedback = ref(null)

const keySourceLabel = computed(() => ({
  soul:   t('settings.key_status_soul'),
  master: t('settings.key_status_master'),
  env:    t('settings.key_status_env'),
  none:   t('settings.key_status_none'),
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
    elevenlabsKeySet.value  = !!d.elevenlabs_key_set
    elevenlabsPreview.value = d.elevenlabs_preview || ''
    agentUrlSet.value = !!d.elevenlabs_agent_url
    agentUrl.value    = d.elevenlabs_agent_url || ''
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
  try {
    const wr = await fetch('/api/soul/webhook-token-info', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (wr.ok) {
      const wd = await wr.json()
      webhookTokenPreview.value = wd.preview || ''
    }
  } catch {}
  try {
    const dr = await fetch('/api/soul/privacy', {
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (dr.ok) {
      const dd = await dr.json()
      discoverable.value = dd.discoverable !== false
    }
  } catch {}
}

async function toggleDiscoverable() {
  const next = !discoverable.value
  discoverableSaving.value   = true
  discoverableFeedback.value = null
  try {
    const res = await fetch('/api/soul/privacy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ discoverable: next }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.ok) {
      discoverable.value = next
    } else {
      discoverableFeedback.value = { ok: false, message: t('settings.privacy_save_failed') }
    }
  } catch {
    discoverableFeedback.value = { ok: false, message: t('settings.privacy_save_failed') }
  }
  discoverableSaving.value = false
}

async function confirmRotateWebhook() {
  const ok = await confirmAsk({
    title:       t('settings.webhook_rotate_title'),
    message:     t('settings.webhook_rotate_msg'),
    confirmText: t('settings.renew'),
    cancelText:  t('common.cancel'),
    danger:      true,
  })
  if (!ok) return
  webhookRotateBusy.value = true
  webhookFeedback.value   = null
  try {
    const res = await fetch('/api/soul/rotate-webhook-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.ok) {
      webhookTokenPreview.value = d.token_preview || ''
      if (d.agent_patched) {
        webhookFeedback.value = { ok: true, message: t('settings.token_renewed_agent') }
      } else if (d.agent_err) {
        webhookFeedback.value = { ok: true, message: t('settings.token_renewed_agent_failed', { err: d.agent_err }) }
      } else {
        webhookFeedback.value = { ok: true, message: t('settings.token_renewed') }
      }
    } else {
      webhookFeedback.value = { ok: false, message: d.error || `${t('common.error')} ${res.status}` }
    }
  } catch (e) {
    webhookFeedback.value = { ok: false, message: e.message }
  } finally {
    webhookRotateBusy.value = false
    setTimeout(() => { webhookFeedback.value = null }, 8000)
  }
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
    if (field === 'elevenlabs_key')   { elevenlabsKeySet.value = false; elevenlabsPreview.value = '' }
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
  const stateRef = { anthropic: anthTest, elevenlabs: labsTest }[type]
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
      msg = ok ? t('common.valid') : `${t('common.error')} ${d.status || res.status}${d.error ? ' · ' + d.error : ''}`
    } else if (!key) {
      ok = false; msg = t('settings.no_key_entered')
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
      msg = ok ? t('common.valid') : `${t('common.error')} ${res.status}${res.status === 401 ? ' · ' + t('settings.key_invalid') : res.status === 429 ? ' · ' + t('settings.rate_limit') : ''}`
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
      msg = ok ? t('common.valid') : `${t('common.error')} ${d.status || res.status}${d.error ? ' · ' + d.error : res.status === 401 ? ' · ' + t('settings.key_invalid') : ''}`
    }
  } catch (e) {
    ok  = false
    msg = `${t('settings.connection_error')}: ${e.message}`
  }
  stateRef.value = { loading: false, ok, message: msg }
  setTimeout(() => { stateRef.value = null }, 6000)
}

async function saveConfig() {
  saving.value  = true
  feedback.value = null
  if (pinataJwt.value.trim()) await savePinataJwt()
  try {
    const body = {}
    if (apiKey.value) body.anthropic_key = sanitizeKey(apiKey.value)
    if (model.value) body.model = model.value
    if (elevenlabsDirty.value) body.elevenlabs_key = sanitizeKey(elevenlabsKey.value)
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
      elevenlabsKey.value  = ''
      elevenlabsDirty.value = false
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
      connectFeedback.value = { ok: true, message: t('settings.admin_connected') }
      setTimeout(() => {
        detectAdmin()
        tab.value = 'admin'
        connectToken.value = ''
        connectFeedback.value = null
      }, 800)
    } else {
      connectFeedback.value = { ok: false, message: t('settings.access_denied') }
    }
  } catch {
    connectFeedback.value = { ok: false, message: t('common.network_error') }
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
      let msg = t('common.saved')
      if (d.prev_valid_until) msg += t('settings.grace_period_suffix')
      if (newAdminToken.value) {
        if (isSoulAdmin.value && soulId) {
          localStorage.setItem(`sys_admin_token_${soulId}`, newAdminToken.value)
        } else {
          localStorage.setItem(ADMIN_KEY, newAdminToken.value)
        }
        adminToken.value = newAdminToken.value
        msg += t('settings.admin_token_rotated_suffix')
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
          adminFeedback.value = { ok: true, message: t('settings.master_key_rotated') }
        } else {
          adminFeedback.value = { ok: false, message: t('settings.master_key_cert_failed') }
        }
      }
    } else {
      adminFeedback.value = { ok: false, message: d.message || d.error || `${t('common.error')} ${res.status}` }
    }
  } catch {
    adminFeedback.value = { ok: false, message: t('common.network_error') }
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

// ── Vault Key ─────────────────────────────────────────────────────────────────
// Health-Check + manueller Re-Sync für den Vault-Verschlüsselungsschlüssel
// (getrennt vom Soul-Cert oben — siehe vault_unlock.lua key_matches_sys_md()).
// Existiert, weil ein Key-Mismatch bisher erst beim nächsten fehlschlagenden
// soul_read auffiel, ohne sichtbaren Status oder erreichbaren Reparatur-Weg.
const vaultKeyStatus = ref(null)   // { is_encrypted, has_key, matches, vault_key_hex }
const vaultKeyBusy   = ref(false)
const vaultKeyError  = ref('')
const vaultKeySynced = ref(false)
const vaultKeyCopied = ref(false)

function copyVaultKey() {
  if (!vaultKeyStatus.value?.vault_key_hex) return
  navigator.clipboard.writeText(vaultKeyStatus.value.vault_key_hex).catch(() => {})
  vaultKeyCopied.value = true
  setTimeout(() => { vaultKeyCopied.value = false }, 2000)
}

// Für Passkey-Registrierungen aus den Vault-Flows unten — OHNE das hier über-
// gebene getAuthHeaders bleibt ein frisch registrierter Passkey server-seitig
// unbekannt für /api/verify/fingerprint-check (siehe verify_passkey_register.lua),
// nur das Vault-Unlock funktioniert damit (das braucht nur die client-seitige
// PRF-Ableitung, keine Server-Registrierung). Praktische Folge, live beobachtet:
// nach einer Passkey-Löschung im OS + Neuregistrierung über "Verschlüsselung
// ändern" bestand bereits ein funktionierender Passkey für den Vault — Verify
// wusste trotzdem nichts davon und wollte bei der nächsten Fingerprint-Prüfung
// erneut einen NEUEN Passkey anlegen (dritte Registrierung für dasselbe Gerät).
function verifyAuthHeaders() {
  return { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' }
}

async function fetchVaultKeyStatus() {
  if (!soulToken.value || soulToken.value === 'anonymous') return
  try {
    const res = await fetch('/api/vault/key-status', {
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    vaultKeyStatus.value = res.ok ? await res.json() : null
  } catch {
    vaultKeyStatus.value = null
  }
}

async function handleResyncVaultKey() {
  if (vaultKeyBusy.value) return
  vaultKeyBusy.value   = true
  vaultKeyError.value  = ''
  vaultKeySynced.value = false
  try {
    // getAuthHeaders übergeben, damit ein hier evtl. NEU registrierter Passkey
    // (z.B. weil der alte im OS gelöscht wurde) auch server-seitig für Fingerprint-
    // Verify registriert wird — siehe verifyAuthHeaders()-Kommentar oben.
    const prf = await passkey.authenticateOrRegister('Soul', verifyAuthHeaders)
    if (!prf) {
      vaultKeyError.value = passkey.passkeyError.value || t('settings.vault_key_biometric_failed')
      return
    }
    const hexKey = await passkey.deriveVaultKeyHex(prf)
    const result = await vaultSession.unlock('1d', '', hexKey)
    if (result?.ok) {
      vaultKeySynced.value = true
      // Server hat gerade bestätigt, dass genau dieses Credential den richtigen
      // Vault-Schlüssel liefert — jetzt die lokale Credential-Liste darauf
      // kürzen. saveCredentialId() hängt bei jeder Registrierung nur an, räumt
      // nie auf; ohne dieses Kürzen könnte ein späterer, nicht eingeschränkter
      // authenticatePasskey()-Aufruf auf DEMSELBEN Gerät wieder eine andere,
      // noch gespeicherte (aber falsche/veraltete) ID zugewiesen bekommen —
      // genau der scheinbar zufällige "kann nicht sein"-Mismatch, den ein Test
      // nach dem vorherigen Fix noch zeigte.
      passkey.pruneToCredentialId(passkey.lastUsedCredentialId.value)
      await fetchVaultKeyStatus()
    } else {
      vaultKeyError.value = result?.message || result?.error || t('settings.vault_key_sync_failed')
    }
  } finally {
    vaultKeyBusy.value = false
  }
}

// ── Verschlüsselung ändern ────────────────────────────────────────────────────
// Nutzt POST /api/vault/rekey — anders als handleResyncVaultKey oben (das nur
// einen BESTEHENDEN Schlüssel bestätigt) migriert dies alle Dateien auf einen
// NEUEN Schlüssel + Methode. vault_key_hex steht bereits aus vaultKeyStatus zur
// Verfügung (Settings verlangt ohnehin vollen Owner-Zugriff via soul-cert) —
// der Server prüft alte+neue Schlüssel serverseitig trotzdem noch einmal nach.
const vaultKeyChangeMode      = ref(false)
const newVaultKeyMethod       = ref('passkey')
const newMnemonicWords        = ref([])
const newMnemonicSavedConfirm = ref(false)
const vaultKeyChangeBusy      = ref(false)
const vaultKeyChangeError     = ref('')
const vaultKeyChangeSuccess   = ref('')

function formatVaultKeyDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString(locale.value === 'de' ? 'de-DE' : 'en-US', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

function startVaultKeyChange() {
  vaultKeyChangeMode.value      = true
  newVaultKeyMethod.value       = 'passkey'
  newMnemonicWords.value        = []
  newMnemonicSavedConfirm.value = false
  vaultKeyChangeError.value     = ''
  vaultKeyChangeSuccess.value   = ''
}

function cancelVaultKeyChange() {
  vaultKeyChangeMode.value      = false
  newMnemonicWords.value        = []
  newMnemonicSavedConfirm.value = false
  vaultKeyChangeError.value     = ''
  vaultKeyChangeSuccess.value   = ''
}

async function handleVaultKeyChange() {
  if (vaultKeyChangeBusy.value) return
  const oldKey = vaultKeyStatus.value?.vault_key_hex
  if (!oldKey) {
    vaultKeyChangeError.value = t('settings.vault_key_change_disabled_no_key')
    return
  }
  vaultKeyChangeBusy.value    = true
  vaultKeyChangeError.value   = ''
  vaultKeyChangeSuccess.value = ''
  try {
    let newKey = ''
    if (newVaultKeyMethod.value === 'passkey') {
      const prf = await passkey.authenticateOrRegister('Soul', verifyAuthHeaders)
      if (!prf) {
        vaultKeyChangeError.value = passkey.passkeyError.value || t('settings.vault_key_biometric_failed')
        return
      }
      newKey = await passkey.deriveVaultKeyHex(prf)
    } else {
      if (!newMnemonicWords.value.length) return
      newKey = await vaultSession.deriveVaultKey(newMnemonicWords.value.join(' '), soulToken.value.split('.')[0])
    }

    if (newKey === oldKey) {
      vaultKeyChangeError.value = t('settings.vault_key_change_same_key')
      return
    }

    const result = await vaultSession.rekey(oldKey, newKey, newVaultKeyMethod.value)
    if (result?.ok) {
      vaultKeyChangeSuccess.value = t('settings.vault_key_change_success', { n: result.migrated?.length ?? 0 })
      if (newVaultKeyMethod.value === 'passkey') {
        passkey.pruneToCredentialId(passkey.lastUsedCredentialId.value)
      }
      await fetchVaultKeyStatus()
    } else {
      vaultKeyChangeError.value = result?.message || result?.error || t('settings.vault_key_change_failed')
    }
  } finally {
    vaultKeyChangeBusy.value = false
  }
}

watch(tab, (val) => { if (val === 'config') fetchVaultKeyStatus() })

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
  if (e <= 7 && d <= 14) return { pct: Math.max(8, pct), color: '#22c55e', label: t('settings.chaos_calm') }
  if (e <= 12 || d <= 21) return { pct: Math.max(40, pct), color: '#f59e0b', label: t('settings.chaos_growing') }
  return { pct: 100, color: '#ef4444', label: t('settings.chaos_chaotic') }
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
    archivFeedback.value = { ok: false, message: t('settings.soul_not_loaded') }
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
      archivFeedback.value = { ok: true, message: t('settings.cleanup_done') }
      setTimeout(() => { archivFeedback.value = null }, 5000)
    } else {
      archivFeedback.value = { ok: false, message: data?.error || t('settings.cleanup_error') }
      setTimeout(() => { archivFeedback.value = null }, 8000)
    }
  } catch {
    crystallizeBusy.value = false
    archivFeedback.value = { ok: false, message: t('common.network_error') }
    setTimeout(() => { archivFeedback.value = null }, 8000)
  }
}

// ── Agent Tab ─────────────────────────────────────────────────────────────────
const agentInstalled    = ref(false)
const agentEnabled      = ref(false)
const agentInterval     = ref('hourly')
const agentLastRun      = ref('')
const agentToggleBusy   = ref(false)
const agentRunNowBusy   = ref(false)
const agentQueueText    = ref('')
const agentQueueSaving  = ref(false)
const agentFeedback     = ref(null)
const agentRunPolling   = ref(false)
let   agentLogTimer     = null
const agentMcpTokenOk   = ref(true)
const agentSetupMcpBusy = ref(false)

// ── x402 Tab ──────────────────────────────────────────────────────────────────
// Operator-only test tooling (see lua/soul_pay_x402.lua) — lets the node
// operator act as a real payer to test their own x402 sell-side. Node-global,
// not soul-scoped, so this tab is Personal-node only (enforced server-side too,
// not just hidden here — see the multi_hoster check in each x402_agent_*.lua).
//
// v1.0.56: replaced polygon-agent/AgentConnect (unreliable session-creation
// step, see CHANGELOG) with a direct private-key flow — the operator exports
// a key from a MetaMask account they made specifically for this and pastes
// it in once; soul-mcp encrypts it at rest and signs payments with
// @x402/evm + viem directly, no third-party pairing dance involved.
const x402Configured     = ref(false)
const x402Address        = ref('')
const x402Balances       = ref(null)
const x402KeyInput       = ref('')
const x402KeySaving      = ref(false)
const x402BalancesBusy   = ref(false)
const x402PayBusy        = ref(false)
const x402PayResult      = ref('')
const x402Feedback       = ref(null)

function x402ShowFeedback(ok, message) {
  x402Feedback.value = { ok, message }
  setTimeout(() => { x402Feedback.value = null }, 5000)
}

async function loadX402Status() {
  try {
    const r = await fetch('/api/x402/agent/status', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      x402Configured.value = !!d.configured
      x402Address.value    = d.address || ''
    }
  } catch { /* silent */ }
}

async function x402SaveKey() {
  x402KeySaving.value = true
  x402Feedback.value  = null
  try {
    const r = await fetch('/api/x402/agent/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ private_key: x402KeyInput.value.trim() }),
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) {
      x402Configured.value = true
      x402Address.value    = d.address
      x402KeyInput.value   = ''
      x402ShowFeedback(true, t('settings.x402_key_saved') + ' ✓')
    } else {
      x402ShowFeedback(false, d.message || d.error || `Error ${r.status}`)
    }
  } catch (e) {
    x402ShowFeedback(false, e.message)
  }
  x402KeySaving.value = false
}

async function x402GetBalances() {
  x402BalancesBusy.value = true
  try {
    const r = await fetch('/api/x402/agent/balances', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.ok) {
      x402Balances.value = { usdc: d.usdc, pol: d.pol }
    } else {
      x402ShowFeedback(false, d.error || `Error ${r.status}`)
    }
  } catch (e) {
    x402ShowFeedback(false, e.message)
  }
  x402BalancesBusy.value = false
}

async function x402SendTestPayment() {
  x402PayBusy.value   = true
  x402PayResult.value = ''
  x402Feedback.value  = null
  try {
    const soul_id = soulToken.value?.split('.')?.[0]
    const r = await fetch('/api/x402/agent/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({
        url: `${window.location.origin}/api/soul/pay/x402`,
        method: 'POST',
        body: { soul_id },
      }),
    })
    const d = await r.json().catch(() => ({}))
    x402PayResult.value = JSON.stringify(d, null, 2)
    if (r.ok && d.ok) x402GetBalances()
  } catch (e) {
    x402ShowFeedback(false, e.message)
  }
  x402PayBusy.value = false
}

// ── Invite Token (Multi-Hoster) ───────────────────────────────────────────────
const inviteToken      = ref('')
const inviteCopied     = ref(false)
const inviteRotating   = ref(false)
const inviteFeedback   = ref('')
const inviteFeedbackOk = ref(false)

async function loadInviteToken() {
  inviteFeedback.value = ''
  try {
    const r = await fetch('/api/invite-token', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      inviteToken.value = d.invite_token || ''
    }
  } catch { /* silent */ }
}

async function rotateInviteToken() {
  if (inviteRotating.value) return
  inviteRotating.value = true
  inviteFeedback.value = ''
  try {
    const r = await fetch('/api/invite-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    const d = await r.json()
    if (r.ok) {
      inviteToken.value      = d.invite_token || ''
      inviteFeedback.value   = t('settings.invite_rotated')
      inviteFeedbackOk.value = true
    } else {
      inviteFeedback.value   = d.message || d.error || t('settings.invite_rotate_failed')
      inviteFeedbackOk.value = false
    }
  } catch {
    inviteFeedback.value   = t('settings.invite_rotate_failed')
    inviteFeedbackOk.value = false
  } finally {
    inviteRotating.value = false
  }
}

async function copyInviteToken() {
  try {
    await navigator.clipboard.writeText(inviteToken.value)
    inviteCopied.value = true
    setTimeout(() => { inviteCopied.value = false }, 2000)
  } catch { /* silent */ }
}

async function loadAgentStatus() {
  try {
    const r = await fetch('/api/agent/cron', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      agentInstalled.value = !!d.installed
      agentEnabled.value   = !!d.enabled
      agentInterval.value  = d.interval || 'hourly'
      agentLastRun.value   = d.last_run || ''
    }
  } catch {}
  // Check if Agent Runner MCP service token exists
  try {
    const r = await fetch('/api/vault/services', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      agentMcpTokenOk.value = (d.services || []).some(s => s.name === 'SYS Agent Runner')
    }
  } catch {}
  // Load current agent.md content
  try {
    const r = await fetch('/api/agent/queue', { headers: { Authorization: `Bearer ${soulToken.value}` } })
    if (r.ok) {
      const d = await r.json()
      agentQueueText.value = d.content || ''
    }
  } catch {}
}

async function setupAgentMcpToken() {
  agentSetupMcpBusy.value = true
  try {
    const r = await fetch('/api/vault/services/agent-runner/rotate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}` }
    })
    if (r.ok) agentMcpTokenOk.value = true
  } catch { /* silent */ } finally {
    agentSetupMcpBusy.value = false
  }
}

async function toggleAgent(enable) {
  agentToggleBusy.value = true
  agentFeedback.value   = null
  try {
    const r = await fetch('/api/agent/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ enabled: enable }),
    })
    if (r.ok) {
      agentEnabled.value   = enable
      agentFeedback.value  = { ok: true, message: enable ? t('settings.agent_enabled') + ' ✓' : t('settings.agent_disabled') }
    } else {
      agentFeedback.value = { ok: false, message: `Error ${r.status}` }
    }
  } catch (e) {
    agentFeedback.value = { ok: false, message: e.message }
  }
  agentToggleBusy.value = false
  setTimeout(() => { agentFeedback.value = null }, 4000)
}

async function setAgentInterval(iv) {
  agentInterval.value = iv
  try {
    await fetch('/api/agent/cron', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ interval: iv }),
    })
  } catch {}
}

async function runAgentNow() {
  agentRunNowBusy.value = true
  agentFeedback.value   = null
  clearInterval(agentLogTimer)
  try {
    const r = await fetch('/api/agent/run', {
      method: 'POST',
      headers: { Authorization: `Bearer ${soulToken.value}` },
    })
    const d = await r.json().catch(() => ({}))
    if (r.ok) {
      agentFeedback.value   = { ok: true, message: d.message || t('settings.agent_run_started') }
      agentRunNowBusy.value = false
      agentRunPolling.value = true
      let ticks = 0
      agentLogTimer = setInterval(async () => {
        ticks++
        try {
          const lr = await fetch('/api/agent/log', { headers: { Authorization: `Bearer ${soulToken.value}` } })
          if (lr.ok) {
            const ld = await lr.json()
            if (!ld.running) {
              clearInterval(agentLogTimer)
              agentRunPolling.value = false
              const cr = await fetch('/api/agent/cron', { headers: { Authorization: `Bearer ${soulToken.value}` } })
              if (cr.ok) { const cd = await cr.json(); agentLastRun.value = cd.last_run || '' }
              return
            }
          }
        } catch {}
        if (ticks >= 90) { clearInterval(agentLogTimer); agentRunPolling.value = false }
      }, 2000)
    } else {
      agentFeedback.value   = { ok: false, message: d.error || `Error ${r.status}` }
      agentRunNowBusy.value = false
    }
  } catch (e) {
    agentFeedback.value   = { ok: false, message: e.message }
    agentRunNowBusy.value = false
  }
}

async function saveAgentQueue() {
  agentQueueSaving.value = true
  agentFeedback.value    = null
  try {
    const r = await fetch('/api/agent/queue', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${soulToken.value}` },
      body: JSON.stringify({ content: agentQueueText.value }),
    })
    if (r.ok) {
      agentFeedback.value = { ok: true, message: t('settings.agent_queue_saved') }
    } else {
      agentFeedback.value = { ok: false, message: `Error ${r.status}` }
    }
  } catch (e) {
    agentFeedback.value = { ok: false, message: e.message }
  }
  agentQueueSaving.value = false
  setTimeout(() => { agentFeedback.value = null }, 4000)
}

// ── Beim Öffnen laden ─────────────────────────────────────────────────────────
async function initSettings() {
  await loadNodeStatus()
  detectAdmin()
  loadStatus()
  tab.value            = 'api'
  elevenlabsKey.value  = ''
  elevenlabsDirty.value = false
}

watch(() => props.open, (val) => { if (val) initSettings() })

onMounted(() => { if (props.inline) initSettings() })
</script>

<style scoped>
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Toggle switch (Datenschutz/Discoverable) — Muster wie ApiContextPanel.vue,
   dort aber scoped, deshalb hier dupliziert ── */
.api-panel-row { display: flex; align-items: center; gap: 10px; cursor: pointer; padding-top: 0; }
.api-panel-row-label { font-family: var(--sys-mono); font-size: 14px; letter-spacing: 0.1em; color: var(--fg); transition: color 0.15s; }
.api-panel-row:hover .api-panel-row-label { color: var(--sys-fg); }
.api-toggle { position: relative; width: 36px; height: 20px; background: rgba(255,255,255,0.1); border-radius: 10px; flex-shrink: 0; transition: background 0.2s; }
.api-toggle.is-on { background: var(--sys-ok); }
.api-toggle-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.2s; }
.api-toggle-thumb.is-on { transform: translateX(16px); }

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
  font-size: 13px; line-height: 1.55;
  color: var(--fg-2);
}
.sm-infoblock--warn {
  border-left-color: var(--sys-warn);
  background: rgba(232,163,63,0.06);
  color: var(--sys-warn);
}

/* Override: Rail scrollbar auf Mobile */
@media (max-width: 640px) {
  :deep(.sys-rail) {
    grid-template-columns: repeat(7, minmax(72px, 1fr));
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
.settings-inline-body { max-height: none; overflow: visible; }

/* Agent on/off toggle */
.agent-toggle {
  position: relative; display: inline-flex; align-items: center;
  width: 44px; height: 24px; border-radius: 12px; border: none; cursor: pointer;
  background: var(--sys-rule-strong); transition: background 0.2s ease;
  flex-shrink: 0;
}
.agent-toggle--on { background: var(--sys-ok); }
.agent-toggle:disabled { opacity: 0.45; cursor: not-allowed; }
.agent-toggle-knob {
  position: absolute; left: 3px; width: 18px; height: 18px; border-radius: 50%;
  background: #fff; transition: transform 0.2s ease; box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}
.agent-toggle--on .agent-toggle-knob { transform: translateX(20px); }
.agent-status-running {
  display: flex; align-items: center; gap: 7px;
  margin-top: 12px;
  font-family: var(--sys-mono); font-size: 11px; letter-spacing: 0.05em;
  color: var(--sys-ok);
}
.agent-status-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  background: var(--sys-ok);
  box-shadow: 0 0 6px var(--sys-ok);
  animation: soul-pulse 1.4s ease-in-out infinite;
}

</style>
