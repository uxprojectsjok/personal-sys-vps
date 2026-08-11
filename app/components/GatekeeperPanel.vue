<template>
  <div class="gk-groups">

    <!-- ═══ Als Gatekeeper — diese Soul bündelt andere ═══ -->
    <section class="gk-group">
      <div class="gk-group-head">
        <span class="gk-group-eyebrow">{{ $t('gatekeeper.group_as_gatekeeper') }}</span>
        <p class="gk-group-desc">{{ $t('gatekeeper.group_as_gatekeeper_desc') }}</p>
      </div>

      <!-- Gatekeeper-Funktion an/aus -->
      <div class="gk-block">
        <label class="field-label--toggle" @click.prevent="handleToggleGatekeeper">
          <span
            class="toggle-switch"
            :class="{ on: gatekeeperEnabled }"
            role="switch"
            :aria-checked="gatekeeperEnabled"
            tabindex="0"
            @keydown.enter.space.prevent="handleToggleGatekeeper"
          ><span class="toggle-knob"></span></span>
          <span class="field-label">{{ $t('gatekeeper.enabled_toggle_label') }}</span>
        </label>
        <p class="gk-hint">{{ $t('gatekeeper.enabled_toggle_hint') }}</p>
      </div>

      <!-- Wired Souls -->
      <div class="gk-block">
        <p class="gk-block-title">{{ $t('gatekeeper.wired_title') }}</p>
        <p class="gk-hint">{{ $t('gatekeeper.wired_hint') }}</p>

        <div v-if="wired.length" class="gk-list">
          <div v-for="w in wired" :key="w.soul_id + '@' + (w.node_url || '')" class="gk-row">
            <div class="gk-row-main">
              <p class="gk-row-name">
                {{ w.name }}
                <span v-if="w.status === 'pending'" class="gk-badge gk-badge--pending">{{ $t('gatekeeper.pending_badge') }}</span>
              </p>
              <p class="gk-row-mono">{{ w.soul_id }}</p>
              <p class="gk-row-mono">{{ w.node_url }}</p>
              <div class="gk-tags">
                <span v-for="key in Object.keys(w.permissions || {}).filter(k => w.permissions[k])" :key="key" class="gk-tag">{{ key }}</span>
              </div>
            </div>
            <div class="gk-row-actions">
              <button v-if="w.status === 'pending'" class="btn btn-sm btn-primary" @click="handleAcceptWire(w)">{{ $t('gatekeeper.btn_accept') }}</button>
              <button class="icon-btn gk-danger" :aria-label="$t('gatekeeper.disconnect_aria', { name: w.name })" @click="handleDisconnect(w)">✕</button>
            </div>
          </div>
        </div>
        <p v-else class="gk-empty">{{ $t('gatekeeper.wired_empty') }}</p>
      </div>

      <!-- Föderierte Gatekeeper -->
      <div class="gk-block">
        <p class="gk-block-title">{{ $t('gatekeeper.federated_title') }}</p>
        <p class="gk-hint">{{ $t('gatekeeper.federated_hint') }}</p>

        <!-- Eingehende Anfragen -->
        <div v-if="pendingIn.length" class="gk-list" style="margin-bottom:14px">
          <div v-for="f in pendingIn" :key="f.soul_id" class="gk-row">
            <div class="gk-row-main">
              <p class="gk-row-mono">{{ f.soul_id }}</p>
              <p class="gk-hint">{{ f.node_url }} — {{ $t('gatekeeper.federated_pending_in') }}</p>
            </div>
            <div class="gk-row-actions">
              <button class="btn btn-sm btn-primary" @click="handleAcceptFederation(f)">{{ $t('gatekeeper.btn_accept') }}</button>
              <button class="icon-btn gk-danger" :aria-label="$t('gatekeeper.disconnect_aria', { name: f.soul_id })" @click="handleRemoveFederation(f)">✕</button>
            </div>
          </div>
        </div>

        <!-- Neue Anfrage stellen -->
        <div class="gk-form" style="margin-bottom:14px">
          <input
            v-model="federateSoulId"
            type="text"
            class="sys-input sys-input--mono"
            :placeholder="$t('gatekeeper.federate_soul_id_placeholder')"
            :aria-label="$t('gatekeeper.federate_soul_id_placeholder')"
          />
          <input
            v-model="federateNodeUrl"
            type="text"
            class="sys-input sys-input--mono"
            :placeholder="$t('gatekeeper.node_url_placeholder')"
            :aria-label="$t('gatekeeper.node_url_placeholder')"
          />
          <button
            class="btn btn-primary"
            :disabled="!federateSoulId.trim() || !federateNodeUrl.trim() || federateBusy"
            @click="handleRequestFederation"
          >{{ federateBusy ? $t('gatekeeper.btn_connecting') : $t('gatekeeper.btn_federate') }}</button>
          <p v-if="federateFeedback" class="gk-feedback" :class="federateFeedback.ok ? 'gk-feedback--ok' : 'gk-feedback--err'">{{ federateFeedback.message }}</p>
        </div>

        <!-- Bestätigte + ausgehend wartende Föderationen -->
        <div v-if="otherFederated.length" class="gk-list">
          <div v-for="f in otherFederated" :key="f.soul_id" class="gk-row">
            <div class="gk-row-main">
              <p class="gk-row-mono">{{ f.soul_id }}</p>
              <p class="gk-hint">{{ f.node_url }} — {{ f.status === 'accepted' ? $t('gatekeeper.federated_accepted') : $t('gatekeeper.federated_pending_out') }}</p>
            </div>
            <button class="icon-btn gk-danger" style="flex:none" :aria-label="$t('gatekeeper.disconnect_aria', { name: f.soul_id })" @click="handleRemoveFederation(f)">✕</button>
          </div>
        </div>
        <p v-else-if="!pendingIn.length" class="gk-empty">{{ $t('gatekeeper.federated_empty') }}</p>
      </div>
    </section>

    <div class="gk-divider" />

    <!-- ═══ Deine Verbindungen — diese Soul als Spoke hinter fremden Gatekeepern ═══ -->
    <section class="gk-group">
      <div class="gk-group-head">
        <span class="gk-group-eyebrow">{{ $t('gatekeeper.group_my_connections') }}</span>
        <p class="gk-group-desc">{{ $t('gatekeeper.group_my_connections_desc') }}</p>
      </div>

      <!-- Connected to (ausgehende Verbindungen dieser Soul) -->
      <div v-if="wiredTo.length" class="gk-block">
        <p class="gk-block-title">{{ $t('gatekeeper.connected_title') }}</p>
        <p class="gk-hint">{{ $t('gatekeeper.connected_hint') }}</p>

        <div class="gk-list">
          <div v-for="c in wiredTo" :key="c.gatekeeper_soul_id" class="gk-row">
            <div class="gk-row-main">
              <p class="gk-row-mono">
                {{ c.gatekeeper_soul_id }}
                <span v-if="c.status === 'pending'" class="gk-badge gk-badge--pending">{{ $t('gatekeeper.pending_badge') }}</span>
              </p>
              <p class="gk-hint">{{ formatDate(c.wired_at) }}</p>
            </div>
            <button class="icon-btn gk-danger" style="flex:none" :aria-label="$t('gatekeeper.disconnect_aria', { name: c.gatekeeper_soul_id })" @click="handleSelfDisconnect(c)">✕</button>
          </div>
        </div>
      </div>

      <!-- Erreichbare Peers (über Gatekeeper-Wiring, inkl. Geschwister-Spokes) -->
      <div v-if="myPeers.length" class="gk-block">
        <p class="gk-block-title">{{ $t('gatekeeper.peers_title') }}</p>
        <p class="gk-hint">{{ $t('gatekeeper.peers_hint') }}</p>

        <div class="gk-list">
          <div v-for="p in myPeers" :key="p.soul_id + '@' + (p.node_url || '')" class="gk-row">
            <div class="gk-row-main">
              <p class="gk-row-name">
                {{ p.name || p.soul_id.slice(0, 8) }}
                <span v-if="p.is_gatekeeper" class="gk-badge gk-badge--ok">{{ $t('gatekeeper.peers_gatekeeper_badge') }}</span>
              </p>
              <p class="gk-row-mono">{{ p.soul_id }}</p>
              <p class="gk-row-mono">{{ p.node_url }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Mit Gatekeeper verbinden -->
      <div class="gk-block">
        <p class="gk-block-title">{{ $t('gatekeeper.connect_title') }}</p>
        <p class="gk-hint">{{ $t('gatekeeper.connect_hint') }}</p>

        <div class="gk-form">
          <input
            v-model="gatekeeperSoulId"
            type="text"
            class="sys-input sys-input--mono"
            :placeholder="$t('gatekeeper.gatekeeper_id_placeholder')"
            :aria-label="$t('gatekeeper.gatekeeper_id_placeholder')"
          />

          <select v-model="selectedToken" class="sys-input" :aria-label="$t('gatekeeper.own_token_label')">
            <option value="" disabled>{{ $t('gatekeeper.own_token_placeholder') }}</option>
            <option v-for="svc in services" :key="svc.token" :value="svc.token">{{ svc.name }}</option>
          </select>
          <p v-if="!services.length" class="gk-hint" style="margin:0">{{ $t('gatekeeper.no_own_tokens') }}</p>

          <input
            v-model="gatekeeperNodeUrl"
            type="text"
            class="sys-input sys-input--mono"
            :placeholder="$t('gatekeeper.gk_node_url_placeholder')"
            :aria-label="$t('gatekeeper.gk_node_url_placeholder')"
          />
          <p class="gk-hint" style="margin:0">{{ $t('gatekeeper.gk_node_url_hint') }}</p>

          <button
            class="btn btn-primary"
            :disabled="!gatekeeperSoulId.trim() || !selectedToken || connectBusy"
            @click="handleConnect"
          >{{ connectBusy ? $t('gatekeeper.btn_connecting') : $t('gatekeeper.btn_connect') }}</button>

          <p v-if="connectFeedback" class="gk-feedback" :class="connectFeedback.ok ? 'gk-feedback--ok' : 'gk-feedback--err'">{{ connectFeedback.message }}</p>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultServices } from '../composables/useVaultServices.js'
import { useGatekeeper } from '../composables/useGatekeeper.js'
import { useConfirm } from '../composables/useConfirm.js'

const { t } = useI18n()
const { ask } = useConfirm()

const { services, fetchServices } = useVaultServices()
const {
  wired, wiredTo, federated, myPeers, error: wireError,
  gatekeeperEnabled, fetchGatekeeperEnabled, setGatekeeperEnabled,
  fetchWired, fetchWiredTo, wireToGatekeeper, unwireSoul, acceptWire, disconnectFromGatekeeper,
  fetchFederated, requestFederation, acceptFederation, removeFederation,
  fetchMyPeers,
  formatDate,
} = useGatekeeper()

const gatekeeperSoulId  = ref('')
const gatekeeperNodeUrl = ref('')
const selectedToken     = ref('')
const connectBusy       = ref(false)
const connectFeedback   = ref(null)

const federateSoulId   = ref('')
const federateNodeUrl  = ref('')
const federateBusy     = ref(false)
const federateFeedback = ref(null)

const pendingIn      = computed(() => federated.value.filter(f => f.status === 'pending_in'))
const otherFederated = computed(() => federated.value.filter(f => f.status !== 'pending_in'))

onMounted(async () => {
  await Promise.all([fetchServices(), fetchWired(), fetchWiredTo(), fetchFederated(), fetchGatekeeperEnabled(), fetchMyPeers()])
})

async function handleToggleGatekeeper() {
  if (gatekeeperEnabled.value) {
    // Ausschalten beendet jetzt echte Verbindungen (nicht nur pausieren) —
    // dafür eine Bestätigung, analog zu den einzelnen Disconnect-Aktionen.
    if (!await ask({
      title: t('gatekeeper.toggle_off_title'),
      message: t('gatekeeper.toggle_off_msg'),
      confirmText: t('gatekeeper.toggle_off_confirm'),
    })) return
  }
  await setGatekeeperEnabled(!gatekeeperEnabled.value)
  await fetchWired()
}

async function handleSelfDisconnect(c) {
  if (!await ask({
    title: t('gatekeeper.disconnect_title'),
    message: t('gatekeeper.disconnect_msg', { name: c.gatekeeper_soul_id }),
    confirmText: t('gatekeeper.disconnect_confirm'),
  })) return
  await disconnectFromGatekeeper(c.gatekeeper_soul_id)
}

async function handleConnect() {
  connectBusy.value = true
  connectFeedback.value = null
  const svc = services.value.find(s => s.token === selectedToken.value)
  const data = await wireToGatekeeper(gatekeeperSoulId.value.trim(), selectedToken.value, svc?.name || '', gatekeeperNodeUrl.value)
  connectBusy.value = false
  if (data?.ok) {
    connectFeedback.value = {
      ok: true,
      message: data.status === 'pending' ? t('gatekeeper.connect_pending') : t('gatekeeper.connect_success'),
    }
    await fetchWiredTo()
    gatekeeperSoulId.value = ''
    gatekeeperNodeUrl.value = ''
    selectedToken.value = ''
  } else if (wireError.value === 'self_wire_not_allowed') {
    connectFeedback.value = { ok: false, message: t('gatekeeper.err_self_wire') }
  } else if (wireError.value === 'gatekeeper_soul_not_found') {
    connectFeedback.value = { ok: false, message: t('gatekeeper.err_soul_not_found') }
  } else {
    connectFeedback.value = { ok: false, message: t('gatekeeper.connect_error') }
  }
}

async function handleDisconnect(w) {
  if (!await ask({
    title: t('gatekeeper.disconnect_title'),
    message: t('gatekeeper.disconnect_msg', { name: w.name }),
    confirmText: t('gatekeeper.disconnect_confirm'),
  })) return
  await unwireSoul(w.soul_id, w.node_url)
}

async function handleAcceptWire(w) {
  await acceptWire(w.soul_id, w.node_url)
}

async function handleRequestFederation() {
  federateBusy.value = true
  federateFeedback.value = null
  const data = await requestFederation(federateSoulId.value.trim(), federateNodeUrl.value.trim())
  federateBusy.value = false
  if (data?.ok) {
    federateFeedback.value = { ok: true, message: t('gatekeeper.connect_success') }
    federateSoulId.value = ''
    federateNodeUrl.value = ''
  } else {
    federateFeedback.value = { ok: false, message: t('gatekeeper.connect_error') }
  }
}

async function handleAcceptFederation(f) {
  await acceptFederation(f.soul_id)
}

async function handleRemoveFederation(f) {
  if (!await ask({
    title: t('gatekeeper.disconnect_title'),
    message: t('gatekeeper.disconnect_msg', { name: f.soul_id }),
    confirmText: t('gatekeeper.disconnect_confirm'),
  })) return
  await removeFederation(f.soul_id)
}
</script>

<style scoped>
/* Toggle switch — gleiches Muster wie AgentMarketplacePanel.vue */
.field-label { font-family: var(--sans); font-size: 16px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--fg); }
.field-label--toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 10px 0; }
.toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; background: var(--line-2); border-radius: 10px; transition: background 0.2s; cursor: pointer; flex-shrink: 0; }
.toggle-switch.on { background: var(--accent); }
.toggle-knob { position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; background: #fff; border-radius: 50%; transition: transform 0.2s; }
.toggle-switch.on .toggle-knob { transform: translateX(16px); }

/* ── Struktur: zwei klar getrennte Rollen-Gruppen ────────────────────── */
.gk-groups { display: flex; flex-direction: column; }
.gk-group { display: flex; flex-direction: column; gap: 26px; }
.gk-divider { height: 1px; background: var(--line); margin: 40px 0; }
.gk-group-head { margin-bottom: 2px; }
.gk-group-eyebrow { font-family: var(--mono); font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent); }
.gk-group-desc { font-size: 15px; color: var(--fg); line-height: 1.6; margin: 6px 0 0; max-width: 52ch; }

.gk-block-title { font-size: 15px; font-weight: 500; color: var(--fg); margin: 0 0 4px; }
.gk-hint { font-size: 14px; color: var(--fg-3); line-height: 1.6; margin: 0 0 14px; }
.gk-empty { font-size: 14px; color: var(--fg-3); margin: 0; }

.gk-form { display: flex; flex-direction: column; gap: 10px; }
.gk-feedback { font-size: 13px; margin: 0; }
.gk-feedback--ok { color: var(--sys-ok); }
.gk-feedback--err { color: var(--sys-err); }

.gk-list { display: flex; flex-direction: column; gap: 1px; border: 1px solid var(--line); border-radius: var(--r-sm); overflow: hidden; }
.gk-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; background: var(--surface-2); }
.gk-row-main { min-width: 0; }
.gk-row-name { font-size: 14px; color: var(--fg); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gk-row-mono { font-size: 12px; font-family: var(--mono); color: var(--fg-3); margin: 2px 0 0; }
.gk-row-actions { display: flex; gap: 6px; flex: none; }
.gk-danger { color: var(--sys-err); }

.gk-badge { font-size: 11px; padding: 1px 6px; border-radius: 3px; margin-left: 6px; }
.gk-badge--pending { background: rgba(230,180,60,0.12); border: 1px solid rgba(230,180,60,0.3); color: #e6b43c; }
.gk-badge--ok { background: rgba(109,184,154,0.12); border: 1px solid rgba(109,184,154,0.3); color: var(--sys-ok); }

.gk-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.gk-tag { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: var(--fg-2); }
</style>
