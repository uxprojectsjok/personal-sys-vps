<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <a href="#main-content" class="skip-link">{{ $t('common.skip_to_content') }}</a>
      <SysSidebar route="wallet" :soul-meta="soulMeta" :collapsed="sidebarCollapsed" :monetization-enabled="monetizationEnabled"
        @go="onNav" @lock="lockGate" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="[$t('nav.group_network'), $t('nav.wallet')]" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div id="main-content" class="scroll">
          <div class="page wa-page">
            <div class="wa-head">
              <div class="wa-eyebrow">{{ $t('wallet.eyebrow') }}</div>
              <h1 class="wa-title">{{ $t('wallet.hero_prefix') }} <em>{{ $t('wallet.hero_em') }}</em></h1>
              <p class="wa-sub">{{ $t('settings.x402_desc') }}</p>
            </div>

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
                <code class="archivar-lm-val archivar-lm-dim" style="font-size:14px;word-break:break-all;text-align:right">{{ x402Address }}</code>
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
                <pre style="white-space:pre-wrap;word-break:break-all;margin:0;font-family:var(--mono);font-size:13px">{{ x402PayResult }}</pre>
              </div>
            </div>

            <!-- Feedback -->
            <Transition name="sys-modal-fade">
              <div v-if="x402Feedback" style="margin-top:10px;padding:10px 14px;border-left:2px solid;font-family:var(--mono);font-size:13px"
                :style="x402Feedback.ok
                  ? 'border-color:var(--sys-ok);color:var(--sys-ok);background:rgba(184,220,196,0.06)'
                  : 'border-color:var(--sys-err);color:var(--sys-err);background:rgba(240,163,163,0.06)'"
              >{{ x402Feedback.message }}</div>
            </Transition>

          </div>
        </div>
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
  </ClientOnly>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSoul } from '~/composables/useSoul.js'
import { useNodeStatus } from '~/composables/useNodeStatus.js'

definePageMeta({ layout: false })
const { t } = useI18n()
const router = useRouter()
const { hasSoul, soulMeta, soulToken, clear } = useSoul()
const { monetizationEnabled, fetchNodeStatus } = useNodeStatus()
onMounted(() => { fetchNodeStatus(); loadX402Status() })

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)

function lockGate() { clear(); document.cookie = 'sys_gate=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax'; window.location.href = '/' }
function onNav(id) {
  const routes = { chat:'/session', setup:'/setup', soul:'/soul', chronik:'/chronicle', files:'/vault', maturity:'/maturity', health:'/health', archivar:'/archivar', anchor:'/anchor', transfer:'/transfer', export:'/export', market:'/marketplace', earnings:'/earnings', settings:'/settings', connect:'/connection', gatekeeper:'/gatekeeper', agent:'/agent', impressum:'/impressum', datenschutz:'/datenschutz', lizenz:'/lizenz', apps:'/apps' }
  if (id === 'wallet') return
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}

// ── x402 Test-Wallet (per Soul, siehe soul-mcp/lib/x402_agent_wallet.mjs) ──────
// Operator/Soul kann eine kleine Test-Wallet hinterlegen (privater Key, nie
// der Haupt-Wallet), um den eigenen x402-Verkaufsweg (POST /api/soul/pay/x402)
// zu testen — soul-mcp verschlüsselt den Key at rest und signiert Zahlungen
// direkt mit @x402/evm + viem, keine Third-Party-Pairing-Dance nötig.
const x402Configured   = ref(false)
const x402Address      = ref('')
const x402Balances     = ref(null)
const x402KeyInput     = ref('')
const x402KeySaving    = ref(false)
const x402BalancesBusy = ref(false)
const x402PayBusy      = ref(false)
const x402PayResult    = ref('')
const x402Feedback     = ref(null)

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
</script>

<style scoped>
.wa-page { max-width: 720px; margin: 0 auto; padding: 36px clamp(22px,4vw,42px) 88px; }
.wa-head { padding-bottom: 32px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
.wa-eyebrow {
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em;
  color: var(--accent); text-transform: uppercase; margin-bottom: 10px;
}
.wa-title {
  font-family: var(--serif); font-size: clamp(32px, 5vw, 48px);
  font-weight: 400; letter-spacing: -0.03em; color: var(--fg);
  line-height: 1.05; margin-bottom: 14px;
}
.wa-title em { font-style: italic; color: var(--accent); }
.wa-sub { font-size: 17px; line-height: 1.65; color: var(--fg); max-width: 560px; margin: 0; }

.archivar-lm-block { border: 1px solid var(--sys-rule); border-radius: var(--r-xs); overflow: hidden; }
.archivar-lm-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--sys-rule); font-family: var(--mono); font-size: 14px; }
.archivar-lm-row:last-child { border-bottom: none; }
.archivar-lm-key  { color: var(--fg); letter-spacing: 0.06em; text-transform: uppercase; font-size: 11px; }
.archivar-lm-val  { color: var(--fg-2); letter-spacing: 0.04em; }
.archivar-lm-ok   { color: var(--sys-ok); }
.archivar-lm-dim  { color: var(--fg); }
</style>
