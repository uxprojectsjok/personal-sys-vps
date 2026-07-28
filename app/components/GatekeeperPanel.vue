<template>
  <div style="display:flex;flex-direction:column;gap:28px">

    <!-- Gatekeeper-Funktion an/aus -->
    <div>
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
      <p style="font-size:12px;color:var(--fg-3);line-height:1.6;margin:6px 0 0">{{ $t('gatekeeper.enabled_toggle_hint') }}</p>
    </div>

    <!-- Connected to (ausgehende Verbindungen dieser Soul) -->
    <div v-if="wiredTo.length">
      <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0 0 4px">{{ $t('gatekeeper.connected_title') }}</p>
      <p style="font-size:13px;color:var(--fg-3);line-height:1.6;margin:0 0 14px">{{ $t('gatekeeper.connected_hint') }}</p>

      <div style="display:flex;flex-direction:column;gap:1px;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden">
        <div
          v-for="c in wiredTo"
          :key="c.gatekeeper_soul_id"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--surface-2)"
        >
          <div style="min-width:0">
            <p style="font-size:12px;font-family:var(--mono);color:var(--fg);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.gatekeeper_soul_id }}</p>
            <p style="font-size:12px;color:var(--fg-3);margin:2px 0 0">{{ formatDate(c.wired_at) }}</p>
          </div>
          <button
            class="icon-btn"
            :aria-label="$t('gatekeeper.disconnect_aria', { name: c.gatekeeper_soul_id })"
            style="flex:none;color:var(--sys-err)"
            @click="handleSelfDisconnect(c)"
          >✕</button>
        </div>
      </div>
    </div>

    <!-- Mit Gatekeeper verbinden -->
    <div>
      <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0 0 4px">{{ $t('gatekeeper.connect_title') }}</p>
      <p style="font-size:13px;color:var(--fg-3);line-height:1.6;margin:0 0 14px">{{ $t('gatekeeper.connect_hint') }}</p>

      <div style="display:flex;flex-direction:column;gap:10px">
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
        <p v-if="!services.length" style="font-size:13px;color:var(--fg-3);margin:0">{{ $t('gatekeeper.no_own_tokens') }}</p>

        <input
          v-model="gatekeeperNodeUrl"
          type="text"
          class="sys-input sys-input--mono"
          :placeholder="$t('gatekeeper.gk_node_url_placeholder')"
          :aria-label="$t('gatekeeper.gk_node_url_placeholder')"
        />
        <p style="font-size:12px;color:var(--fg-3);margin:0">{{ $t('gatekeeper.gk_node_url_hint') }}</p>

        <button
          class="btn btn-primary"
          :disabled="!gatekeeperSoulId.trim() || !selectedToken || connectBusy"
          @click="handleConnect"
        >{{ connectBusy ? $t('gatekeeper.btn_connecting') : $t('gatekeeper.btn_connect') }}</button>

        <p v-if="connectFeedback" :style="connectFeedback.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'" style="font-size:13px;margin:0">
          {{ connectFeedback.message }}
        </p>
      </div>
    </div>

    <!-- Wired Souls -->
    <div>
      <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0 0 4px">{{ $t('gatekeeper.wired_title') }}</p>
      <p style="font-size:13px;color:var(--fg-3);line-height:1.6;margin:0 0 14px">{{ $t('gatekeeper.wired_hint') }}</p>

      <div v-if="wired.length" style="display:flex;flex-direction:column;gap:1px;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden">
        <div
          v-for="w in wired"
          :key="w.soul_id"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--surface-2)"
        >
          <div style="min-width:0">
            <p style="font-size:14px;color:var(--fg);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ w.name }}</p>
            <p style="font-size:12px;font-family:var(--mono);color:var(--fg-3);margin:2px 0 0">{{ w.soul_id }}</p>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
              <span
                v-for="key in Object.keys(w.permissions || {}).filter(k => w.permissions[k])"
                :key="key"
                style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:var(--fg-2)"
              >{{ key }}</span>
            </div>
          </div>
          <button
            class="icon-btn"
            :aria-label="$t('gatekeeper.disconnect_aria', { name: w.name })"
            style="flex:none;color:var(--sys-err)"
            @click="handleDisconnect(w)"
          >✕</button>
        </div>
      </div>
      <p v-else style="font-size:14px;color:var(--fg-3);margin:0">{{ $t('gatekeeper.wired_empty') }}</p>
    </div>

    <!-- Föderierte Gatekeeper -->
    <div>
      <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0 0 4px">{{ $t('gatekeeper.federated_title') }}</p>
      <p style="font-size:13px;color:var(--fg-3);line-height:1.6;margin:0 0 14px">{{ $t('gatekeeper.federated_hint') }}</p>

      <!-- Eingehende Anfragen -->
      <div v-if="pendingIn.length" style="display:flex;flex-direction:column;gap:1px;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden;margin-bottom:14px">
        <div
          v-for="f in pendingIn"
          :key="f.soul_id"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--surface-2)"
        >
          <div style="min-width:0">
            <p style="font-size:12px;font-family:var(--mono);color:var(--fg);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ f.soul_id }}</p>
            <p style="font-size:12px;color:var(--fg-3);margin:2px 0 0">{{ f.node_url }} — {{ $t('gatekeeper.federated_pending_in') }}</p>
          </div>
          <div style="display:flex;gap:6px;flex:none">
            <button class="btn btn-sm btn-primary" @click="handleAcceptFederation(f)">{{ $t('gatekeeper.btn_accept') }}</button>
            <button class="icon-btn" style="color:var(--sys-err)" :aria-label="$t('gatekeeper.disconnect_aria', { name: f.soul_id })" @click="handleRemoveFederation(f)">✕</button>
          </div>
        </div>
      </div>

      <!-- Neue Anfrage stellen -->
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
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
        <p v-if="federateFeedback" :style="federateFeedback.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'" style="font-size:13px;margin:0">
          {{ federateFeedback.message }}
        </p>
      </div>

      <!-- Bestätigte + ausgehend wartende Föderationen -->
      <div v-if="otherFederated.length" style="display:flex;flex-direction:column;gap:1px;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden">
        <div
          v-for="f in otherFederated"
          :key="f.soul_id"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--surface-2)"
        >
          <div style="min-width:0">
            <p style="font-size:12px;font-family:var(--mono);color:var(--fg);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ f.soul_id }}</p>
            <p style="font-size:12px;color:var(--fg-3);margin:2px 0 0">{{ f.node_url }} — {{ f.status === 'accepted' ? $t('gatekeeper.federated_accepted') : $t('gatekeeper.federated_pending_out') }}</p>
          </div>
          <button class="icon-btn" style="flex:none;color:var(--sys-err)" :aria-label="$t('gatekeeper.disconnect_aria', { name: f.soul_id })" @click="handleRemoveFederation(f)">✕</button>
        </div>
      </div>
      <p v-else-if="!pendingIn.length" style="font-size:14px;color:var(--fg-3);margin:0">{{ $t('gatekeeper.federated_empty') }}</p>
    </div>

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
  wired, wiredTo, federated, error: wireError,
  gatekeeperEnabled, fetchGatekeeperEnabled, setGatekeeperEnabled,
  fetchWired, fetchWiredTo, wireToGatekeeper, unwireSoul, disconnectFromGatekeeper,
  fetchFederated, requestFederation, acceptFederation, removeFederation,
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
  await Promise.all([fetchServices(), fetchWired(), fetchWiredTo(), fetchFederated(), fetchGatekeeperEnabled()])
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
    connectFeedback.value = { ok: true, message: t('gatekeeper.connect_success') }
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
  await unwireSoul(w.soul_id)
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
</style>
