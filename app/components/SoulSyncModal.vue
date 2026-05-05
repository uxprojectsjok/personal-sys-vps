<template>
  <Teleport to="body">
    <Transition name="sys-modal-fade">
      <div
        v-if="syncStatus === 'differs'"
        class="sys-modal-overlay"
        @click.self="dismissSync()"
        role="dialog" aria-modal="true" aria-labelledby="soul-sync-title"
      >
        <!-- 4-row grid: head / meta-bar / body / foot -->
        <div class="sys-modal sys-modal--md" style="grid-template-rows:auto auto 1fr auto">
          <div class="sys-modal-handle"></div>

          <!-- Head -->
          <div class="sys-modal-head">
            <button class="sys-modal-close" @click="dismissSync()" aria-label="Schließen">×</button>
            <span class="sys-kicker">Soul · Sync</span>
            <h2 id="soul-sync-title" class="sys-display" style="font-size:clamp(22px,3vw,32px)">Abgleich</h2>
            <p class="sys-lede">{{ changedSections.length }} Abschnitte unterscheiden sich zwischen diesem Gerät und dem Server.</p>
          </div>

          <!-- Meta bar (rail slot) -->
          <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--sys-rule);background:var(--sys-paper-3)">
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 20px;border-right:1px solid var(--sys-rule)">
              <span style="font-family:var(--sys-mono);font-size:10px;font-weight:700;letter-spacing:0.2em;color:var(--sys-fg-dim)">L</span>
              <span style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-dim)">Dieses Gerät</span>
              <span style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-muted)">{{ localLastSession || '—' }}</span>
              <span v-if="newerSide === 'local'" style="font-family:var(--sys-mono);font-size:9px;letter-spacing:0.15em;text-transform:uppercase;padding:2px 8px;border:1px solid var(--sys-rule-strong);color:var(--sys-fg-muted)">Aktueller</span>
            </div>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 20px">
              <span style="font-family:var(--sys-mono);font-size:10px;font-weight:700;letter-spacing:0.2em;color:var(--sys-fg-dim)">S</span>
              <span style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-dim)">Server</span>
              <span style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-muted)">{{ serverLastSession || '—' }}</span>
              <span v-if="newerSide === 'server'" style="font-family:var(--sys-mono);font-size:9px;letter-spacing:0.15em;text-transform:uppercase;padding:2px 8px;border:1px solid var(--sys-rule-strong);color:var(--sys-fg-muted)">Aktueller</span>
            </div>
          </div>

          <!-- Section diffs -->
          <div class="sys-modal-body" style="padding:0">
            <div
              v-for="s in changedSections"
              :key="s.name"
              style="padding:14px 40px;border-bottom:1px solid var(--sys-rule)"
            >
              <button
                style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;background:none;border:none;cursor:pointer;padding:0;min-height:unset;border-radius:0;text-align:left;font-family:inherit"
                @click="openSections[s.name] = !openSections[s.name]"
              >
                <span style="font-family:var(--sys-serif);font-size:14px;color:var(--sys-fg-muted)">{{ s.name }}</span>
                <div style="display:flex;align-items:center;gap:12px;flex-shrink:0">
                  <span style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-dim)">
                    <b>L</b> {{ s.localLen }}
                    <span style="opacity:.4;margin:0 4px">/</span>
                    <b>S</b> {{ s.serverLen }}
                  </span>
                  <svg
                    width="12" height="12"
                    style="color:var(--sys-fg-dim);transition:transform .2s;flex-shrink:0"
                    :style="openSections[s.name] ? 'transform:rotate(180deg)' : ''"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
                  ><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/></svg>
                </div>
              </button>

              <div v-if="openSections[s.name]" style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div class="sys-card-ed" style="margin-bottom:0">
                  <div class="sys-card-head">
                    <span style="font-family:var(--sys-mono);font-size:10px;font-weight:700;letter-spacing:0.2em;color:var(--sys-fg-dim)">L – Dieses Gerät</span>
                  </div>
                  <div class="sys-card-body">
                    <p style="font-family:var(--sys-serif);font-size:13px;color:var(--sys-fg-muted);line-height:1.5;white-space:pre-wrap;word-break:break-words;margin:0">{{ s.localSnippet }}</p>
                    <p v-if="s.localLen > 200" style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-dim);opacity:.5;margin:6px 0 0">+{{ s.localLen - 200 }} Zeichen</p>
                  </div>
                </div>
                <div class="sys-card-ed" style="margin-bottom:0">
                  <div class="sys-card-head">
                    <span style="font-family:var(--sys-mono);font-size:10px;font-weight:700;letter-spacing:0.2em;color:var(--sys-fg-dim)">S – Server</span>
                  </div>
                  <div class="sys-card-body">
                    <p style="font-family:var(--sys-serif);font-size:13px;color:var(--sys-fg-muted);line-height:1.5;white-space:pre-wrap;word-break:break-words;margin:0">{{ s.serverSnippet }}</p>
                    <p v-if="s.serverLen > 200" style="font-family:var(--sys-mono);font-size:10px;color:var(--sys-fg-dim);opacity:.5;margin:6px 0 0">+{{ s.serverLen - 200 }} Zeichen</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Foot -->
          <div class="sys-modal-foot">
            <div class="sys-foot-meta">
              <span class="sys-dot" :class="newerSide === 'server' ? 'sys-dot--live' : newerSide === 'local' ? 'sys-dot--ok' : 'sys-dot--idle'"></span>
              {{ newerSide === 'server' ? 'Server aktueller' : newerSide === 'local' ? 'Gerät aktueller' : 'Gleicher Stand' }}
            </div>
            <div class="sys-foot-actions">
              <button
                class="sys-btn-ed"
                :class="newerSide === 'server' ? 'sys-btn-ed--primary' : 'sys-btn-ed--ghost'"
                @click="handleAcceptServer"
                :disabled="saving"
              >{{ newerSide === 'server' ? '✓ Server übernehmen' : 'Server übernehmen' }}</button>
              <button
                class="sys-btn-ed"
                :class="newerSide === 'local' ? 'sys-btn-ed--primary' : 'sys-btn-ed--ghost'"
                @click="handlePushLocal"
                :disabled="saving"
              >
                <span v-if="saving">Lädt…</span>
                <span v-else>{{ newerSide === 'local' ? '✓ Auf Server hochladen' : 'Auf Server hochladen' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useSoul } from '~/composables/useSoul.js';
import { useVault } from '~/composables/useVault.js';

const {
  soulContent, serverContent, syncStatus,
  acceptServerVersion, pushToServer, dismissSync
} = useSoul();

const { writeSoulMd, isConnected: vaultConnected } = useVault();

const saving       = ref(false);
const openSections = ref({});

function extractMeta(md, field) {
  return md.match(new RegExp(`${field}:\\s*(.+)`))?.[1]?.trim() ?? '';
}

function extractSections(md) {
  const result = {};
  const parts = md.split(/\n(?=## )/);
  for (const part of parts) {
    const m = part.match(/^## (.+?)\n([\s\S]*)/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}

const localLastSession  = computed(() => extractMeta(soulContent.value,  'last_session'));
const serverLastSession = computed(() => extractMeta(serverContent.value, 'last_session'));
const localVersion      = computed(() => extractMeta(soulContent.value,  'version') || '1');
const serverVersion     = computed(() => extractMeta(serverContent.value,'version') || '1');

const newerSide = computed(() => {
  const l = localLastSession.value;
  const s = serverLastSession.value;
  if (l && s && l !== s) return l > s ? 'local' : 'server';
  const lv = parseInt(localVersion.value) || 1;
  const sv = parseInt(serverVersion.value) || 1;
  if (lv !== sv) return lv > sv ? 'local' : 'server';
  return 'unknown';
});

const changedSections = computed(() => {
  if (!serverContent.value) return [];
  const local  = extractSections(soulContent.value);
  const remote = extractSections(serverContent.value);
  const all    = new Set([...Object.keys(local), ...Object.keys(remote)]);
  return [...all]
    .filter(k => (local[k] ?? '') !== (remote[k] ?? ''))
    .map(k => {
      const lc = local[k]  ?? '';
      const sc = remote[k] ?? '';
      return {
        name:          k,
        localLen:      lc.length,
        serverLen:     sc.length,
        localSnippet:  lc.slice(0, 200).trim() || '(leer)',
        serverSnippet: sc.slice(0, 200).trim() || '(leer)',
      };
    });
});

async function handleAcceptServer() {
  acceptServerVersion();
  if (vaultConnected.value) {
    await writeSoulMd(soulContent.value, 'sys');
  }
}

async function handlePushLocal() {
  saving.value = true;
  await pushToServer();
  saving.value = false;
}
</script>
