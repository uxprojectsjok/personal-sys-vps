<template>
  <div style="display:flex;flex-direction:column;gap:28px">

    <p style="font-size:13px;color:var(--fg-3);line-height:1.6;margin:0">{{ $t('connections.intro') }}</p>

    <!-- Eingehende Anfragen -->
    <div v-if="pendingIn.length">
      <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0 0 4px">{{ $t('connections.pending_in_title') }}</p>
      <div style="display:flex;flex-direction:column;gap:1px;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden">
        <div
          v-for="c in pendingIn"
          :key="c.soul_id"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--surface-2)"
        >
          <div style="min-width:0;flex:1">
            <p style="font-size:12px;font-family:var(--mono);color:var(--fg);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.soul_id }}</p>
            <p style="font-size:12px;color:var(--fg-3);margin:2px 0 0">{{ c.node_url }}</p>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
              <span
                v-for="key in c.permissions"
                :key="key"
                style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:var(--fg-2)"
              >{{ key }}</span>
            </div>
            <input
              v-model="acceptAliasDrafts[c.soul_id]"
              type="text"
              class="sys-input sys-input--mono"
              style="margin-top:6px;max-width:220px"
              :placeholder="$t('connections.alias_placeholder')"
              :aria-label="$t('connections.alias_placeholder')"
            />
          </div>
          <div style="display:flex;gap:6px;flex:none">
            <button class="btn btn-sm btn-primary" @click="handleAccept(c)">{{ $t('connections.btn_accept') }}</button>
            <button class="icon-btn" style="color:var(--sys-err)" :aria-label="$t('connections.disconnect_aria', { name: c.soul_id })" @click="handleRemove(c)">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Neue Verbindung anfragen -->
    <div>
      <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0 0 4px">{{ $t('connections.request_title') }}</p>
      <p style="font-size:13px;color:var(--fg-3);line-height:1.6;margin:0 0 14px">{{ $t('connections.request_hint') }}</p>

      <div style="display:flex;flex-direction:column;gap:10px">
        <input
          v-model="targetSoulId"
          type="text"
          class="sys-input sys-input--mono"
          :placeholder="$t('connections.soul_id_placeholder')"
          :aria-label="$t('connections.soul_id_placeholder')"
        />
        <input
          v-model="targetAlias"
          type="text"
          class="sys-input"
          :placeholder="$t('connections.alias_placeholder')"
          :aria-label="$t('connections.alias_placeholder')"
        />
        <input
          v-model="targetNodeUrl"
          type="text"
          class="sys-input sys-input--mono"
          :placeholder="$t('gatekeeper.node_url_placeholder')"
          :aria-label="$t('gatekeeper.node_url_placeholder')"
        />
        <p style="font-size:12px;color:var(--fg-3);margin:0">{{ $t('gatekeeper.node_url_hint') }}</p>

        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <label v-for="p in allPermissions" :key="p.value" style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--fg-2)">
            <input type="checkbox" :value="p.value" v-model="selectedPerms" />
            {{ p.label }}
          </label>
        </div>

        <button
          class="btn btn-primary"
          :disabled="!targetSoulId.trim() || !targetNodeUrlOrLocal || requestBusy"
          @click="handleRequest"
        >{{ requestBusy ? $t('gatekeeper.btn_connecting') : $t('connections.btn_request') }}</button>

        <p v-if="requestFeedback" :style="requestFeedback.ok ? 'color:var(--sys-ok)' : 'color:var(--sys-err)'" style="font-size:13px;margin:0">
          {{ requestFeedback.message }}
        </p>
      </div>
    </div>

    <!-- Bestätigte + ausgehend wartende Verbindungen -->
    <div>
      <p style="font-size:15px;font-weight:500;color:var(--fg);margin:0 0 4px">{{ $t('connections.list_title') }}</p>
      <div v-if="otherConnections.length" style="display:flex;flex-direction:column;gap:1px;border:1px solid var(--line);border-radius:var(--r-sm);overflow:hidden">
        <div
          v-for="c in otherConnections"
          :key="c.soul_id"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:var(--surface-2)"
        >
          <div style="min-width:0">
            <p style="font-size:13px;color:var(--fg);margin:0">{{ c.alias || c.soul_id.slice(0, 8) }}</p>
            <p style="font-size:12px;font-family:var(--mono);color:var(--fg-3);margin:1px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.soul_id }}</p>
            <p style="font-size:12px;color:var(--fg-3);margin:2px 0 0">{{ c.node_url }} — {{ c.status === 'accepted' ? $t('gatekeeper.federated_accepted') : $t('gatekeeper.federated_pending_out') }}</p>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
              <span
                v-for="key in c.permissions"
                :key="key"
                style="font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:var(--fg-2)"
              >{{ key }}</span>
            </div>
          </div>
          <button class="icon-btn" style="flex:none;color:var(--sys-err)" :aria-label="$t('connections.disconnect_aria', { name: c.soul_id })" @click="handleRemove(c)">✕</button>
        </div>
      </div>
      <p v-else style="font-size:14px;color:var(--fg-3);margin:0">{{ $t('connections.empty') }}</p>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSoulConnections } from '../composables/useSoulConnections.js'
import { useConfirm } from '../composables/useConfirm.js'

const { t } = useI18n()
const { ask } = useConfirm()

const { connections, fetchConnections, requestConnection, acceptConnection, removeConnection } = useSoulConnections()

const targetSoulId   = ref('')
const targetAlias    = ref('')
const targetNodeUrl  = ref('')
const selectedPerms  = ref(['soul', 'context_files'])
const requestBusy    = ref(false)
const requestFeedback = ref(null)
const acceptAliasDrafts = ref({})

const allPermissions = computed(() => [
  { value: 'soul',          label: 'Soul' },
  { value: 'audio',         label: 'Audio' },
  { value: 'images',        label: t('services.perm_images') },
  { value: 'video',         label: 'Video' },
  { value: 'context_files', label: t('services.perm_context') },
])

// node_url ist bei Soul-zu-Soul Pflicht (anders als beim Gatekeeper-Wire, wo
// "leer = gleicher Node" ein sinnvoller Default ist) — der Zielserver muss
// wissen, welchen lokalen Souls-Ordner er beim Empfang ansprechen soll, das
// klärt sich hier nicht implizit.
const targetNodeUrlOrLocal = computed(() => targetNodeUrl.value.trim())

const pendingIn = computed(() => connections.value.filter(c => c.status === 'pending_in'))
const otherConnections = computed(() => connections.value.filter(c => c.status !== 'pending_in'))

onMounted(fetchConnections)

async function handleRequest() {
  requestBusy.value = true
  requestFeedback.value = null
  const perms = Object.fromEntries(selectedPerms.value.map(p => [p, true]))
  const data = await requestConnection(targetSoulId.value.trim(), targetNodeUrl.value.trim(), perms, targetAlias.value.trim() || undefined)
  requestBusy.value = false
  if (data?.ok) {
    requestFeedback.value = { ok: true, message: t('gatekeeper.connect_success') }
    targetSoulId.value = ''
    targetAlias.value = ''
    targetNodeUrl.value = ''
  } else {
    requestFeedback.value = { ok: false, message: t('gatekeeper.connect_error') }
  }
}

async function handleAccept(c) {
  const alias = (acceptAliasDrafts.value[c.soul_id] || '').trim() || undefined
  await acceptConnection(c.soul_id, alias)
  delete acceptAliasDrafts.value[c.soul_id]
}

async function handleRemove(c) {
  if (!await ask({
    title: t('gatekeeper.disconnect_title'),
    message: t('gatekeeper.disconnect_msg', { name: c.soul_id }),
    confirmText: t('gatekeeper.disconnect_confirm'),
  })) return
  await removeConnection(c.soul_id)
}
</script>
