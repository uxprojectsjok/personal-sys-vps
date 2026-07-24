<template>
  <div style="display:flex;flex-direction:column;gap:28px">

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

  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultServices } from '../composables/useVaultServices.js'
import { useGatekeeper } from '../composables/useGatekeeper.js'
import { useConfirm } from '../composables/useConfirm.js'

const { t } = useI18n()
const { ask } = useConfirm()

const { services, fetchServices } = useVaultServices()
const { wired, fetchWired, wireToGatekeeper, unwireSoul } = useGatekeeper()

const gatekeeperSoulId = ref('')
const selectedToken    = ref('')
const connectBusy      = ref(false)
const connectFeedback  = ref(null)

onMounted(async () => {
  await Promise.all([fetchServices(), fetchWired()])
})

async function handleConnect() {
  connectBusy.value = true
  connectFeedback.value = null
  const svc = services.value.find(s => s.token === selectedToken.value)
  const data = await wireToGatekeeper(gatekeeperSoulId.value.trim(), selectedToken.value, svc?.name || '')
  connectBusy.value = false
  if (data?.ok) {
    connectFeedback.value = { ok: true, message: t('gatekeeper.connect_success') }
    gatekeeperSoulId.value = ''
    selectedToken.value = ''
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
</script>
