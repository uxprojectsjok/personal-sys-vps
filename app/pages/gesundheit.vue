<template>
  <ClientOnly>
    <div v-if="hasSoul" class="app" :class="{ 'drawer-open': drawerOpen, 'is-collapsed': sidebarCollapsed }">
      <SysSidebar route="health" :soul-meta="soulMeta" :collapsed="sidebarCollapsed"
        @go="onNav" @lock="lockSoul" @collapse="sidebarCollapsed = !sidebarCollapsed" />
      <div class="scrim-mob" @click="drawerOpen = false" />
      <div class="main">
        <SysTopbar :crumbs="['Körper', 'Gesundheit']" @open-drawer="drawerOpen = !drawerOpen" @open-cmdk="cmdkOpen = true" />
        <div class="scroll">
        <div class="page hl-page">

          <!-- Header -->
          <div class="hl-head">
            <div class="eyebrow">Körper</div>
            <h1 class="hl-title">Wie dein Körper <em>lebt</em></h1>
            <p class="hl-lede">Gesundheit misst vitale Signale deines Alltags — Herzfrequenz, Schlaf, Bewegung. Nicht Perfektion, sondern Kontinuität.</p>
          </div>

          <!-- Not configured -->
          <template v-if="!health.configured && !loading">
            <div class="hl-empty">
              <div class="hl-empty-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12h3l2-7 4 14 3-8 2 3h4"/></svg>
              </div>
              <div class="hl-empty-title">Health-Sync noch nicht eingerichtet</div>
              <p class="hl-empty-desc">Verbinde deinen Fitness-Tracker um Vitaldaten automatisch zu synchronisieren.</p>
              <button class="hl-setup-toggle-btn" @click="setupOpen = true">Einrichten</button>
            </div>
          </template>

          <!-- Configured: Ring + Levels + Cards -->
          <template v-else-if="health.configured || parsed.hasData">

            <!-- Hero: Ring + Levels -->
            <div class="hl-hero">
              <div class="hl-ring-wrap">
                <svg viewBox="0 0 160 160" class="hl-ring-svg">
                  <circle cx="80" cy="80" r="66" fill="none" stroke="rgba(245,241,234,0.07)" stroke-width="12" />
                  <circle cx="80" cy="80" r="66" fill="none" :stroke="ringColor" stroke-width="12"
                    stroke-linecap="round"
                    :stroke-dasharray="CIRC"
                    :stroke-dashoffset="CIRC * (1 - score / 100)"
                    transform="rotate(-90 80 80)"
                    style="transition: stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)"
                  />
                </svg>
                <div class="hl-ring-inner">
                  <span class="hl-pct">{{ score }}</span>
                  <span class="hl-unit">%</span>
                  <span class="hl-level-name">{{ currentLevel?.name }}</span>
                  <span v-if="nextHint" class="hl-next-hint">{{ nextHint }} bis {{ nextLevel?.name }}</span>
                </div>
              </div>

              <ol class="hl-levels">
                <li v-for="lv in LEVELS" :key="lv.name" class="hl-level"
                  :class="{ active: currentLevel?.name === lv.name, done: score > lv.max }">
                  <span class="hl-lv-check">
                    <svg v-if="score > lv.max" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="m3 8 4 4 6-7"/></svg>
                    <span v-else class="hl-lv-num">{{ lv.num }}</span>
                  </span>
                  <span class="hl-lv-name">{{ lv.name }}</span>
                  <span class="hl-lv-range">{{ lv.range }}</span>
                </li>
              </ol>
            </div>

            <!-- Last sync info -->
            <div v-if="health.lastSync || health.source" class="hl-sync-meta">
              <span v-if="health.source" class="hl-source-badge">{{ deviceLabel(health.source) }}</span>
              <span v-if="health.lastSync" class="hl-sync-date">Letzter Sync: {{ health.lastSync }}</span>
            </div>

            <!-- Stat Cards -->
            <div class="hl-section-head">Was dein Körper zeigt</div>
            <div class="hl-cards">

              <!-- Ruhepuls -->
              <div class="hl-card">
                <div class="hl-card-top">
                  <span class="hl-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h3l2-7 4 14 3-8 2 3h4"/></svg></span>
                  <span class="hl-card-val">{{ parsed.rhr != null ? parsed.rhr : '—' }}<small v-if="parsed.rhr">bpm</small></span>
                </div>
                <div class="hl-card-title">Ruhepuls</div>
                <div class="hl-card-desc">{{ rhrDesc }}</div>
                <div class="hl-mini-ring-wrap">
                  <svg viewBox="0 0 60 60" class="hl-mini-ring">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(245,241,234,0.07)" stroke-width="5"/>
                    <circle cx="30" cy="30" r="24" fill="none" :stroke="ringColor" stroke-width="5"
                      stroke-linecap="round"
                      :stroke-dasharray="MINI_CIRC"
                      :stroke-dashoffset="MINI_CIRC * (1 - rhrScore / 100)"
                      transform="rotate(-90 30 30)"
                      style="transition:stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)"
                    />
                  </svg>
                  <span class="hl-mini-pct">{{ rhrScore }}<small>%</small></span>
                </div>
              </div>

              <!-- Schlaf -->
              <div class="hl-card">
                <div class="hl-card-top">
                  <span class="hl-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg></span>
                  <span class="hl-card-val">{{ parsed.sleepH != null ? parsed.sleepH : '—' }}<small v-if="parsed.sleepH">h</small></span>
                </div>
                <div class="hl-card-title">Schlaf</div>
                <div class="hl-card-desc">{{ sleepDesc }}</div>
                <div class="hl-mini-ring-wrap">
                  <svg viewBox="0 0 60 60" class="hl-mini-ring">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(245,241,234,0.07)" stroke-width="5"/>
                    <circle cx="30" cy="30" r="24" fill="none" :stroke="ringColor" stroke-width="5"
                      stroke-linecap="round"
                      :stroke-dasharray="MINI_CIRC"
                      :stroke-dashoffset="MINI_CIRC * (1 - sleepScore / 100)"
                      transform="rotate(-90 30 30)"
                      style="transition:stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)"
                    />
                  </svg>
                  <span class="hl-mini-pct">{{ sleepScore }}<small>%</small></span>
                </div>
              </div>

              <!-- Schritte -->
              <div class="hl-card">
                <div class="hl-card-top">
                  <span class="hl-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 4a1 1 0 1 0 2 0 1 1 0 0 0-2 0m-2 3 2 1 1 4-3 2m2-7-2 3-3 1"/></svg></span>
                  <span class="hl-card-val">{{ parsed.steps != null ? (parsed.steps >= 1000 ? (parsed.steps/1000).toFixed(1)+'k' : parsed.steps) : '—' }}</span>
                </div>
                <div class="hl-card-title">Schritte</div>
                <div class="hl-card-desc">{{ stepsDesc }}</div>
                <div class="hl-mini-ring-wrap">
                  <svg viewBox="0 0 60 60" class="hl-mini-ring">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(245,241,234,0.07)" stroke-width="5"/>
                    <circle cx="30" cy="30" r="24" fill="none" :stroke="ringColor" stroke-width="5"
                      stroke-linecap="round"
                      :stroke-dasharray="MINI_CIRC"
                      :stroke-dashoffset="MINI_CIRC * (1 - stepsScore / 100)"
                      transform="rotate(-90 30 30)"
                      style="transition:stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)"
                    />
                  </svg>
                  <span class="hl-mini-pct">{{ stepsScore }}<small>%</small></span>
                </div>
              </div>

              <!-- Aktive Tage -->
              <div class="hl-card">
                <div class="hl-card-top">
                  <span class="hl-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83"/></svg></span>
                  <span class="hl-card-val">{{ parsed.activeDays != null ? parsed.activeDays : '—' }}<small v-if="parsed.activeDays != null">/7</small></span>
                </div>
                <div class="hl-card-title">Aktive Tage</div>
                <div class="hl-card-desc">{{ activeDaysDesc }}</div>
                <div class="hl-mini-ring-wrap">
                  <svg viewBox="0 0 60 60" class="hl-mini-ring">
                    <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(245,241,234,0.07)" stroke-width="5"/>
                    <circle cx="30" cy="30" r="24" fill="none" :stroke="ringColor" stroke-width="5"
                      stroke-linecap="round"
                      :stroke-dasharray="MINI_CIRC"
                      :stroke-dashoffset="MINI_CIRC * (1 - activeDaysScore / 100)"
                      transform="rotate(-90 30 30)"
                      style="transition:stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)"
                    />
                  </svg>
                  <span class="hl-mini-pct">{{ activeDaysScore }}<small>%</small></span>
                </div>
              </div>

              <!-- Letzte Aktivität -->
              <div class="hl-card">
                <div class="hl-card-top">
                  <span class="hl-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7Z"/></svg></span>
                  <span class="hl-card-val-sm">{{ parsed.lastActivity?.type || '—' }}</span>
                </div>
                <div class="hl-card-title">Letzte Aktivität</div>
                <div class="hl-card-desc" v-if="parsed.lastActivity">
                  {{ parsed.lastActivity.date }} · {{ parsed.lastActivity.duration }} · {{ parsed.lastActivity.distance }}
                  <span v-if="parsed.lastActivity.hr"> · ♥ {{ parsed.lastActivity.hr }}</span>
                </div>
                <div class="hl-card-desc" v-else>Noch keine Aktivitäten</div>
                <div class="hl-card-bar"><div class="hl-card-fill" :style="{ width: activeDaysScore + '%' }" /></div>
              </div>

              <!-- Monat -->
              <div class="hl-card">
                <div class="hl-card-top">
                  <span class="hl-card-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6ZM4 9h16M8 3v4m8-4v4"/></svg></span>
                  <span class="hl-card-val">{{ parsed.monthlyActiveDays != null ? parsed.monthlyActiveDays : '—' }}<small v-if="parsed.monthlyActiveDays != null">d</small></span>
                </div>
                <div class="hl-card-title">Monat</div>
                <div class="hl-card-desc">
                  <span v-if="parsed.monthlyRhr">♥ {{ parsed.monthlyRhr }} bpm · </span>
                  <span v-if="parsed.monthlySleepH">{{ parsed.monthlySleepH }}h Schlaf · </span>
                  <span v-if="parsed.monthlyActiveDays">{{ parsed.monthlyActiveDays }} aktive Tage</span>
                  <span v-if="!parsed.monthlyRhr && !parsed.monthlySleepH">Noch keine Monatsdaten</span>
                </div>
                <div class="hl-card-bar"><div class="hl-card-fill" :style="{ width: monthScore + '%' }" /></div>
              </div>

            </div>

          </template>

          <!-- Loading -->
          <div v-else class="hl-loading">
            <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
          </div>

          <!-- ── Setup ─────────────────────────────────────────────────────────── -->
          <div class="hl-setup-section">
            <button class="hl-setup-header" @click="setupOpen = !setupOpen">
              <span class="hl-setup-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;flex:none"><path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8.4 3a8.4 8.4 0 0 0-.14-1.5l2-1.55-2-3.46-2.36.95a8.4 8.4 0 0 0-2.6-1.5L14.5 2h-5l-.4 2.44a8.4 8.4 0 0 0-2.6 1.5L4.14 5 2.14 8.45l2 1.55a8.5 8.5 0 0 0 0 3l-2 1.55 2 3.46 2.36-.95a8.4 8.4 0 0 0 2.6 1.5L9.5 22h5l.4-2.44a8.4 8.4 0 0 0 2.6-1.5l2.36.95 2-3.46-2-1.55c.09-.49.14-.99.14-1.5Z"/></svg>
                Einrichtung
              </span>
              <svg class="hl-chevron" :class="{ open: setupOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6"/></svg>
            </button>

            <Transition name="setup-slide">
              <div v-if="setupOpen" class="hl-setup-body">

                <!-- Provider -->
                <div class="hl-field-group">
                  <label class="hl-label">Provider</label>
                  <div class="hl-radio-row">
                    <button v-for="p in PROVIDERS" :key="p.id"
                      class="hl-radio-btn" :class="{ active: form.adapter === p.id }"
                      @click="form.adapter = p.id">
                      {{ p.label }}
                    </button>
                  </div>
                </div>

                <!-- Device (Garmin) -->
                <div v-if="form.adapter === 'garmin'" class="hl-field-group">
                  <label class="hl-label">Gerät</label>
                  <select class="hl-select" v-model="form.garmin_model">
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
                  <p class="hl-field-hint">Das Gerät beeinflusst wie Daten interpretiert werden. Alle Modelle nutzen die Garmin Connect API.</p>
                </div>

                <!-- Garmin Credentials -->
                <div v-if="form.adapter === 'garmin'" class="hl-field-group">
                  <label class="hl-label">Garmin Connect E-Mail</label>
                  <input class="hl-input" type="email" v-model="form.garmin_email" placeholder="deine@email.de" autocomplete="off" />
                </div>
                <div v-if="form.adapter === 'garmin'" class="hl-field-group">
                  <label class="hl-label">Garmin Connect Passwort</label>
                  <input class="hl-input" type="password" v-model="form.garmin_password" :placeholder="config.has_password ? '••••••••  (unverändert lassen um beizubehalten)' : 'Passwort eingeben'" autocomplete="new-password" />
                </div>

                <!-- Apple Health hint -->
                <div v-if="form.adapter === 'apple_health'" class="hl-field-group">
                  <div class="hl-info-box">Für Apple Health muss die Health-Sync App auf deinem iPhone installiert sein. Die Einrichtung erfolgt über SSH (install.sh).</div>
                </div>

                <!-- Oura hint -->
                <div v-if="form.adapter === 'oura'" class="hl-field-group">
                  <div class="hl-info-box">Oura Ring API-Token wird über SSH in der health_sync Konfiguration hinterlegt.</div>
                </div>

                <!-- Actions -->
                <div class="hl-setup-actions">
                  <button class="hl-btn hl-btn--primary" :disabled="saving" @click="saveConfig">
                    <svg v-if="saving" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                    {{ saving ? 'Speichern…' : 'Einstellungen speichern' }}
                  </button>
                  <button class="hl-btn hl-btn--secondary" :disabled="syncing" @click="triggerSync">
                    <svg v-if="syncing" class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                    {{ syncing ? 'Sync läuft…' : 'Jetzt synchronisieren' }}
                  </button>
                </div>

                <p v-if="saveMsg" class="hl-save-msg" :class="{ error: saveMsgError }">{{ saveMsg }}</p>

              </div>
            </Transition>
          </div>

        </div>
        </div><!-- /scroll -->
      </div>
      <SysCommandPalette :open="cmdkOpen" @close="cmdkOpen = false" @navigate="onNav" @insert="() => {}" />
    </div>
    <SysPageLoading v-else />
    <SysMobileNav />
  </ClientOnly>
</template>

<script setup>
definePageMeta({ layout: false })
import { ref, computed, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSoul } from '~/composables/useSoul.js'

const router = useRouter()
const { hasSoul, soulMeta, soulToken } = useSoul()

const drawerOpen = ref(false), sidebarCollapsed = ref(false), cmdkOpen = ref(false)
const loading    = ref(true)
const setupOpen  = ref(false)
const saving     = ref(false)
const syncing    = ref(false)
const saveMsg    = ref('')
const saveMsgError = ref(false)

// ── Config (provider/device) ──────────────────────────────────────────────────
const config = reactive({ configured: false, adapter: 'garmin', garmin_model: 'garmin_fr235', garmin_email: '', has_password: false, last_sync: null })
const form   = reactive({ adapter: 'garmin', garmin_model: 'garmin_fr235', garmin_email: '', garmin_password: '' })

// ── Health data (from health.md) ──────────────────────────────────────────────
const health = reactive({ configured: false, source: null, lastSync: null, raw: '' })

const PROVIDERS = [
  { id: 'garmin',       label: 'Garmin' },
  { id: 'apple_health', label: 'Apple Health' },
  { id: 'oura',         label: 'Oura Ring' },
]

const DEVICE_LABELS = {
  garmin_fr235: 'Forerunner 235', garmin_fr245: 'Forerunner 245',
  garmin_fr255: 'Forerunner 255', garmin_fr265: 'Forerunner 265',
  garmin_fr945: 'Forerunner 945', garmin_vivoactive2: 'Vivoactive 2',
  garmin_vivoactive3: 'Vivoactive 3', garmin_vivoactive4: 'Vivoactive 4',
  garmin_venu: 'Venu', garmin_venu2: 'Venu 2',
  garmin_fenix5: 'Fenix 5', garmin_fenix6: 'Fenix 6', garmin_fenix7: 'Fenix 7',
  garmin_instinct: 'Instinct', garmin_epix: 'Epix',
}
function deviceLabel(src) { return DEVICE_LABELS[src] || src || 'Unbekannt' }

function authHeaders() { return { Authorization: `Bearer ${soulToken.value}`, 'Content-Type': 'application/json' } }

// ── Parse health.md ───────────────────────────────────────────────────────────
const parsed = computed(() => {
  const raw = health.raw
  if (!raw) return { hasData: false }

  const num   = (re) => { const m = raw.match(re); return m ? parseFloat(m[1].replace('.', '').replace(',', '.')) : null }
  const str   = (re) => { const m = raw.match(re); return m ? m[1].trim() : null }

  const rhr         = num(/Resting HR:\s*([\d,.]+)\s*bpm/)
  const activeDays  = num(/Active days:\s*(\d+)/)
  const steps       = num(/Steps:\s*([\d.,]+)/)

  // Sleep: "5h 14min" → hours decimal, or "–" → null
  let sleepH = null
  const sleepRaw = str(/Sleep:\s*([^\n]+)/)
  if (sleepRaw && sleepRaw !== '–') {
    const hm = sleepRaw.match(/(\d+)h\s*(\d+)?m?i?n?/)
    if (hm) sleepH = parseFloat(hm[1]) + (hm[2] ? parseInt(hm[2]) / 60 : 0)
  }

  // Last activity
  let lastActivity = null
  const actMatch = raw.match(/##\s*Recent Activities\n([\s\S]*?)(?:\n##|$)/)
  if (actMatch) {
    const firstLine = actMatch[1].trim().split('\n')[0]
    const am = firstLine.match(/[-–]\s*(\S+)\s+(\S+)\s+(\d+)\s*min\s+([\d.]+)\s*km(?:\s+♥\s*([\d.]+)\s*bpm)?/)
    if (am) lastActivity = { date: am[1], type: am[2], duration: am[3] + ' min', distance: am[4] + ' km', hr: am[5] ? am[5] + ' bpm' : null }
  }

  // Monthly
  const monthBlock   = raw.match(/##\s*Monthly[\s\S]*?(?:\n##|$)/)?.[0] || ''
  const monthlyRhr   = monthBlock.match(/Resting HR:\s*([\d,.]+)/)?.[1] || null
  const monthlySleepRaw = monthBlock.match(/Sleep:\s*([^\n]+)/)?.[1] || null
  let monthlySleepH = null
  if (monthlySleepRaw && monthlySleepRaw !== '–') {
    const hm = monthlySleepRaw.match(/(\d+)h\s*(\d+)?/)
    if (hm) monthlySleepH = parseFloat(hm[1]) + (hm[2] ? Math.round(parseInt(hm[2]) / 60 * 10) / 10 : 0)
  }
  const monthlyActiveDays = monthBlock.match(/Active days:\s*(\d+)/)?.[1] || null

  return {
    hasData: rhr != null || sleepH != null || steps != null,
    rhr, sleepH: sleepH ? Math.round(sleepH * 10) / 10 : null,
    steps, activeDays, lastActivity,
    monthlyRhr: monthlyRhr ? Math.round(parseFloat(monthlyRhr)) : null,
    monthlySleepH, monthlyActiveDays: monthlyActiveDays ? parseInt(monthlyActiveDays) : null,
  }
})

// ── Scores ────────────────────────────────────────────────────────────────────
const rhrScore = computed(() => {
  const r = parsed.value.rhr
  if (r == null) return 0
  if (r < 50) return 100; if (r < 55) return 95; if (r < 60) return 88
  if (r < 65) return 78;  if (r < 70) return 65; if (r < 75) return 50
  if (r < 80) return 35;  return 20
})
const sleepScore = computed(() => {
  const h = parsed.value.sleepH
  if (h == null) return 0
  if (h >= 8) return 100; if (h >= 7.5) return 92; if (h >= 7) return 82
  if (h >= 6.5) return 68; if (h >= 6) return 52; if (h >= 5.5) return 38
  if (h >= 5) return 28; return 15
})
const stepsScore = computed(() => {
  const s = parsed.value.steps
  if (s == null) return 0
  return Math.min(100, Math.round(s / 100))
})
const activeDaysScore = computed(() => {
  const d = parsed.value.activeDays
  if (d == null) return 0
  return Math.round(d / 7 * 100)
})
const monthScore = computed(() => {
  const d = parsed.value.monthlyActiveDays
  if (d == null) return 0
  return Math.min(100, Math.round(d / 30 * 100 * 1.5))
})

const score = computed(() => {
  const vals = [rhrScore.value, sleepScore.value, stepsScore.value, activeDaysScore.value].filter(v => v > 0)
  if (!vals.length) return 0
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
})

const rhrDesc    = computed(() => { const r = parsed.value.rhr; if (!r) return 'Keine Daten'; if (r < 60) return r + ' bpm · Ausgezeichnet'; if (r < 70) return r + ' bpm · Gut'; if (r < 80) return r + ' bpm · Normal'; return r + ' bpm · Erhöht' })
const sleepDesc  = computed(() => { const h = parsed.value.sleepH; if (!h) return 'Keine Daten diese Woche'; if (h >= 7) return h + 'h · Ausreichend (Ziel 8h)'; if (h >= 6) return h + 'h · Etwas wenig'; return h + 'h · Zu wenig Schlaf' })
const stepsDesc  = computed(() => { const s = parsed.value.steps; if (!s) return 'Keine Daten'; return (s >= 10000 ? 'Ziel erreicht · ' : (s >= 7500 ? 'Fast am Ziel · ' : 'Unter Tagesziel · ')) + Math.round(s).toLocaleString('de-DE') + ' Schritte/Tag' })
const activeDaysDesc = computed(() => { const d = parsed.value.activeDays; if (d == null) return 'Keine Daten'; return d + ' von 7 Tagen aktiv' + (d >= 5 ? ' · Stark' : d >= 3 ? ' · Gut' : ' · Ausbaufähig') })

// ── Levels ────────────────────────────────────────────────────────────────────
const CIRC      = 2 * Math.PI * 66
const MINI_CIRC = 2 * Math.PI * 24

const LEVELS = [
  { num: '01', name: 'Sedentär',   range: '0 – 20 %',   min: 0,  max: 20  },
  { num: '02', name: 'Aktiv',      range: '21 – 45 %',  min: 21, max: 45  },
  { num: '03', name: 'Fit',        range: '46 – 68 %',  min: 46, max: 68  },
  { num: '04', name: 'Athletisch', range: '69 – 87 %',  min: 69, max: 87  },
  { num: '05', name: 'Vital',      range: '88 – 100 %', min: 88, max: 100 },
]
const currentLevel = computed(() => LEVELS.find(l => score.value >= l.min && score.value <= l.max) ?? LEVELS[0])
const nextLevel    = computed(() => LEVELS.find(l => l.min > score.value))
const nextHint     = computed(() => nextLevel.value ? (nextLevel.value.min - score.value) + ' Punkte' : null)
const ringColor    = computed(() => score.value >= 88 ? '#6db89a' : score.value >= 69 ? '#6d9ab8' : score.value >= 46 ? '#b8a56d' : 'rgba(245,241,234,0.3)')

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadAll() {
  loading.value = true
  try {
    const [cfgRes, mdRes] = await Promise.all([
      fetch('/api/health/config', { headers: authHeaders() }),
      fetch('/api/vault/context/health.md', { headers: authHeaders() }),
    ])

    if (cfgRes.ok) {
      const c = await cfgRes.json()
      Object.assign(config, c)
      form.adapter      = c.adapter      || 'garmin'
      form.garmin_model = c.garmin_model || 'garmin_fr235'
      form.garmin_email = c.garmin_email || ''
      health.configured = c.configured
    }

    if (mdRes.ok) {
      const text = await mdRes.text()
      health.raw      = text
      health.source   = text.match(/source:\s*(\S+)/)?.[1] || null
      health.lastSync = text.match(/last_sync:\s*([^\n]+)/)?.[1]?.trim() || null
      if (!health.configured && health.source) health.configured = true
    }
  } catch { /**/ }
  loading.value = false
}

async function saveConfig() {
  saving.value = true; saveMsg.value = ''; saveMsgError.value = false
  try {
    const body = { adapter: form.adapter, garmin_model: form.garmin_model, garmin_email: form.garmin_email }
    if (form.garmin_password) body.garmin_password = form.garmin_password
    const r = await fetch('/api/health/config', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
    if (r.ok) {
      saveMsg.value = 'Gespeichert.'
      form.garmin_password = ''
      config.has_password = true
      health.configured = true
    } else {
      saveMsgError.value = true; saveMsg.value = 'Fehler beim Speichern.'
    }
  } catch { saveMsgError.value = true; saveMsg.value = 'Netzwerkfehler.' }
  saving.value = false
}

async function triggerSync() {
  syncing.value = true; saveMsg.value = ''; saveMsgError.value = false
  try {
    const r = await fetch('/api/health-sync', { method: 'POST', headers: authHeaders() })
    if (r.ok) {
      saveMsg.value = 'Sync gestartet — Daten in ca. 30 Sekunden aktualisiert.'
      setTimeout(loadAll, 35000)
    } else {
      const d = await r.json().catch(() => ({}))
      saveMsgError.value = true
      saveMsg.value = d.error || 'Sync fehlgeschlagen.'
    }
  } catch { saveMsgError.value = true; saveMsg.value = 'Netzwerkfehler.' }
  syncing.value = false
}

onMounted(loadAll)

// ── Navigation ────────────────────────────────────────────────────────────────
function lockSoul() { document.cookie = 'sys_token=; Max-Age=0; path=/'; window.location.href = '/gate' }
function onNav(id) {
  if (id === 'health') return
  const routes = { chat:'/session', setup:'/einrichten', soul:'/soul', chronik:'/chronik', files:'/dateien', maturity:'/reife', calendar:'/kalender', anchor:'/verankern', export:'/exportieren', peers:'/peers', connect:'/verbindung', market:'/marketplace', earnings:'/einnahmen', settings:'/einstellungen' }
  if (routes[id]) { router.push(routes[id]); return }
  drawerOpen.value = false; router.push('/')
}
</script>

<style scoped>
.hl-page { max-width:900px; padding-top:32px; padding-bottom:calc(80px + env(safe-area-inset-bottom,0px)); }

/* Header */
.hl-head { margin-bottom:40px; }
.hl-title { font-family:var(--serif); font-size:clamp(32px,4vw,48px); font-weight:400; letter-spacing:-0.02em; color:var(--fg); line-height:1.1; margin:8px 0 14px; }
.hl-title em { color:var(--accent); font-style:italic; }
.hl-lede { font-size:15px; line-height:1.65; color:var(--fg); max-width:560px; margin:0; }

/* Empty state */
.hl-empty { display:flex; flex-direction:column; align-items:center; gap:16px; padding:60px 24px; text-align:center; border:1px dashed var(--line-2); border-radius:var(--r); }
.hl-empty-ic { width:52px; height:52px; border-radius:50%; background:var(--accent-dim); display:flex; align-items:center; justify-content:center; color:var(--accent); }
.hl-empty-ic svg { width:24px; height:24px; }
.hl-empty-title { font-family:var(--sans); font-size:16px; font-weight:600; color:var(--fg); }
.hl-empty-desc { font-family:var(--mono); font-size:12px; color:var(--fg-3); max-width:340px; line-height:1.7; margin:0; }
.hl-setup-toggle-btn { height:38px; padding:0 20px; background:var(--accent); border:none; border-radius:var(--r-xs); font-family:var(--sans); font-size:13px; font-weight:600; color:var(--on-accent); cursor:pointer; }

/* Loading */
.hl-loading { display:flex; justify-content:center; padding:60px 0; color:var(--fg-4); }
.hl-loading svg { width:24px; height:24px; }

/* Hero */
.hl-hero { display:grid; grid-template-columns:auto 1fr; gap:48px; align-items:center; margin-bottom:20px; }
@media(max-width:640px){ .hl-hero{ grid-template-columns:1fr; gap:32px; } }
.hl-ring-wrap { position:relative; width:200px; height:200px; flex:none; display:grid; place-items:center; }
.hl-ring-svg  { position:absolute; inset:0; width:100%; height:100%; }
.hl-ring-inner { display:flex; flex-direction:column; align-items:center; z-index:1; }
.hl-pct  { font-family:var(--serif); font-size:52px; font-weight:400; letter-spacing:-0.03em; color:var(--fg); line-height:1; }
.hl-unit { font-family:var(--mono); font-size:14px; color:var(--fg-3); letter-spacing:0.06em; }
.hl-level-name { font-family:var(--mono); font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:var(--accent); margin-top:4px; }
.hl-next-hint  { font-family:var(--mono); font-size:9px; letter-spacing:0.10em; text-transform:uppercase; color:var(--fg-4); margin-top:2px; }

/* Levels */
.hl-levels { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }
.hl-level  { display:flex; align-items:center; gap:12px; padding:10px 14px; border-radius:6px; font-family:var(--mono); font-size:15px; letter-spacing:0.06em; color:var(--fg); transition:background 0.15s, color 0.15s; }
.hl-level.active { background:rgba(109,184,154,0.10); border:1px solid rgba(109,184,154,0.25); }
.hl-level.active .hl-lv-name { color:var(--accent); font-weight:600; }
.hl-lv-check { width:22px; height:22px; flex:none; display:grid; place-items:center; border:1px solid var(--rule-2); border-radius:50%; color:var(--fg-3); font-size:10px; }
.hl-level.done .hl-lv-check { border-color:var(--accent); color:var(--accent); }
.hl-level.done .hl-lv-check svg { width:13px; height:13px; }
.hl-level.active .hl-lv-check { background:var(--accent); border-color:var(--accent); color:var(--on-accent); }
.hl-lv-num  { font-size:10px; color:inherit; }
.hl-lv-name { flex:1; text-transform:uppercase; font-size:17px; letter-spacing:0.08em; color:var(--fg); }
.hl-lv-range{ font-size:15px; color:var(--fg); white-space:nowrap; }

/* Sync meta */
.hl-sync-meta { display:flex; align-items:center; gap:12px; margin-bottom:36px; }
.hl-source-badge { font-family:var(--mono); font-size:13px; letter-spacing:0.08em; padding:3px 10px; background:var(--accent-dim); border:1px solid rgba(109,184,154,0.25); border-radius:4px; color:var(--accent); }
.hl-sync-date { font-family:var(--mono); font-size:13px; color:var(--fg); }

/* Section head */
.hl-section-head { font-family:var(--serif); font-size:20px; font-weight:400; color:var(--fg); letter-spacing:-0.01em; margin-bottom:20px; }

/* Cards */
.hl-cards { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:40px; }
@media(max-width:720px){ .hl-cards{ grid-template-columns:repeat(2,1fr); } }
@media(max-width:480px){ .hl-cards{ grid-template-columns:1fr; } }

.hl-card { background:var(--surface); border:1px solid var(--line); padding:18px 16px 16px; display:flex; flex-direction:column; gap:8px; border-radius:var(--r); }
.hl-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; margin-bottom:2px; }
.hl-card-icon { width:20px; height:20px; color:var(--fg-3); flex:none; }
.hl-card-icon svg { width:20px; height:20px; }
.hl-card-val { font-family:var(--serif); font-size:22px; color:var(--fg); line-height:1; letter-spacing:-0.02em; }
.hl-card-val small { font-family:var(--mono); font-size:12px; color:var(--fg-3); vertical-align:super; margin-left:2px; }
.hl-card-val-sm { font-family:var(--mono); font-size:15px; color:var(--accent); font-weight:600; text-transform:capitalize; line-height:1.2; }
.hl-card-title { font-size:15px; font-weight:600; color:var(--fg); line-height:1.2; }
.hl-card-desc  { font-size:13px; color:var(--fg-2); line-height:1.55; font-family:var(--mono); flex:1; }

/* Mini ring */
.hl-mini-ring-wrap { position:relative; display:inline-flex; align-items:center; justify-content:center; width:76px; height:76px; align-self:flex-end; }
.hl-mini-ring { width:76px; height:76px; }
.hl-mini-pct  { position:absolute; font-family:var(--mono); font-size:14px; color:var(--fg); font-weight:600; line-height:1; }
.hl-mini-pct small { font-size:10px; color:var(--fg-3); vertical-align:super; }

/* Progress bar (for cards without mini ring) */
.hl-card-bar  { height:2px; background:var(--line); margin-top:6px; border-radius:1px; overflow:hidden; }
.hl-card-fill { height:100%; background:var(--accent); border-radius:1px; transition:width 0.8s cubic-bezier(0.4,0,0.2,1); }

/* Setup section */
.hl-setup-section { border:1px solid var(--line); border-radius:var(--r); overflow:hidden; margin-top:8px; }
.hl-setup-header { display:flex; align-items:center; justify-content:space-between; width:100%; padding:16px 20px; background:var(--surface); border:none; cursor:pointer; text-align:left; }
.hl-setup-label { display:flex; align-items:center; gap:8px; font-family:var(--mono); font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:var(--fg); }
.hl-chevron { width:16px; height:16px; color:var(--fg-2); transition:transform 0.2s; flex:none; }
.hl-chevron.open { transform:rotate(180deg); }
.hl-setup-body { padding:24px 20px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:20px; }

/* Form elements */
.hl-field-group { display:flex; flex-direction:column; gap:6px; }
.hl-label { font-family:var(--mono); font-size:13px; letter-spacing:0.08em; text-transform:uppercase; color:var(--fg); }
.hl-radio-row { display:flex; gap:8px; flex-wrap:wrap; }
.hl-radio-btn { height:38px; padding:0 16px; border:1px solid var(--line-2); border-radius:var(--r-xs); background:var(--surface-2); font-family:var(--sans); font-size:15px; color:var(--fg); cursor:pointer; transition:all 0.15s; }
.hl-radio-btn.active { border-color:var(--accent); background:var(--accent-dim); color:var(--accent); font-weight:600; }
.hl-select { height:44px; padding:0 12px; background:var(--surface-2); border:1px solid var(--line-2); border-radius:var(--r-xs); font-family:var(--sans); font-size:15px; color:var(--fg); width:100%; cursor:pointer; }
.hl-input  { height:44px; padding:0 12px; background:var(--surface-2); border:1px solid var(--line-2); border-radius:var(--r-xs); font-family:var(--sans); font-size:15px; color:var(--fg); width:100%; }
.hl-input:focus, .hl-select:focus { outline:none; border-color:var(--accent); }
.hl-field-hint { font-family:var(--mono); font-size:13px; color:var(--fg-2); line-height:1.6; margin:0; }
.hl-info-box { font-family:var(--mono); font-size:13px; color:var(--fg); line-height:1.7; padding:14px 16px; background:var(--surface-3); border:1px solid var(--line); border-radius:var(--r-xs); }

/* Actions */
.hl-setup-actions { display:flex; gap:10px; flex-wrap:wrap; }
.hl-btn { display:inline-flex; align-items:center; gap:8px; height:40px; padding:0 18px; border-radius:var(--r-xs); font-family:var(--sans); font-size:14px; font-weight:600; cursor:pointer; transition:all 0.15s; border:none; }
.hl-btn:disabled { opacity:0.45; cursor:not-allowed; }
.hl-btn--primary   { background:var(--accent); color:var(--on-accent); }
.hl-btn--primary:hover:not(:disabled) { background:var(--accent-bright); }
.hl-btn--secondary { background:var(--surface-2); border:1px solid var(--line-2); color:var(--fg-2); }
.hl-btn--secondary:hover:not(:disabled) { color:var(--fg); border-color:var(--fg-3); }
.hl-save-msg { font-family:var(--mono); font-size:12px; color:var(--accent); margin:0; }
.hl-save-msg.error { color:#e06c75; }

/* Animations */
.spin { animation:hl-spin 1s linear infinite; }
@keyframes hl-spin { to{ transform:rotate(360deg) } }
.setup-slide-enter-active, .setup-slide-leave-active { transition:all 0.22s ease; }
.setup-slide-enter-from, .setup-slide-leave-to { opacity:0; transform:translateY(-6px); }
</style>
