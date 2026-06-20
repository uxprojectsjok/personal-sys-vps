<template>
  <div class="soul-meter">

    <!-- Label row -->
    <div class="soul-meter-header">
      <button
        class="soul-meter-label"
        @click="open = !open"
        :title="open ? $t('maturity.breakdown_close') : $t('maturity.breakdown_open')"
      >
        <span>Soul Index</span>
        <svg
          class="soul-meter-chevron"
          :class="open ? 'is-open' : ''"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        ><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/></svg>
      </button>
      <span class="soul-meter-level" :class="[levelColor, isMature ? 'soul-mature-glow' : '']">{{ level }}</span>
    </div>

    <!-- Track -->
    <div class="soul-meter-track">
      <div
        class="soul-meter-fill"
        :class="isMature ? 'soul-pulse' : ''"
        :style="{
          width: score + '%',
          background: isMature
            ? 'linear-gradient(90deg, hsl(var(--chart-1)), hsl(var(--chart-4)))'
            : 'linear-gradient(90deg, hsl(var(--chart-1) / 0.7), hsl(var(--chart-2) / 0.6))',
          boxShadow: isMature ? '0 0 10px hsl(var(--chart-1) / 0.4)' : 'none'
        }"
      ></div>
      <div class="soul-meter-tick" :title="$t('maturity.premium_threshold')"></div>
    </div>

    <!-- Score row -->
    <div class="soul-meter-score">
      <span class="soul-meter-score-val">{{ score }}/100</span>
      <span v-if="isMature" class="soul-meter-ready">{{ $t('maturity.ready_encrypt') }}</span>
      <span v-else class="soul-meter-hint">
        <template v-if="score >= 55">{{ $t('maturity.until_premium', { n: Math.max(0, 75 - score) }) }}</template>
        <template v-else-if="score >= 35">{{ $t('maturity.until_established', { n: Math.max(0, 55 - score) }) }}</template>
        <template v-else-if="score >= 15">{{ $t('maturity.until_maturing', { n: Math.max(0, 35 - score) }) }}</template>
        <template v-else>{{ $t('maturity.until_building', { n: Math.max(0, 15 - score) }) }}</template>
      </span>
    </div>

    <!-- Breakdown -->
    <Transition name="slide-up">
      <div v-if="open && breakdown" class="soul-meter-breakdown">

        <div v-for="pillar in pillars" :key="pillar.key" class="soul-meter-pillar">
          <span class="soul-meter-pillar-label" :class="pillar.labelColor">{{ pillar.label }}</span>
          <div class="soul-meter-pillar-track">
            <div
              class="soul-meter-pillar-fill"
              :style="pillar.barStyle + '; width: ' + (breakdown[pillar.key] / pillar.max * 100) + '%'"
            ></div>
          </div>
          <span class="soul-meter-pillar-val" :class="pillar.valueColor">
            {{ breakdown[pillar.key] }}/{{ pillar.max }}
          </span>
        </div>

        <div class="soul-meter-skills">
          <template v-if="breakdown.signatureVerified">
            <span class="soul-meter-skills-ok">{{ $t('maturity.sig_verified') }}</span>
          </template>
          <template v-else-if="breakdown.signatureHints?.length">
            <span class="soul-meter-skills-hints">
              {{ breakdown.signatureHints.slice(0, 5).join(' · ') }}
              <span v-if="breakdown.signatureHints.length > 5"> +{{ breakdown.signatureHints.length - 5 }}</span>
            </span>
            <span class="soul-meter-skills-suffix"> {{ $t('maturity.skills_suffix') }}</span>
          </template>
          <template v-else>
            <span class="soul-meter-skills-empty">{{ $t('maturity.skills_empty') }}</span>
          </template>
        </div>

      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  score:     { type: Number,  required: true },
  level:     { type: String,  required: true },
  isMature:  { type: Boolean, required: true },
  breakdown: { type: Object,  default: null },
});

const { t } = useI18n();
const open = ref(false);

const pillars = computed(() => [
  { key: "herkunft",  label: t('maturity.pillar_origin'),     max: 25, labelColor: "text-[var(--sys-fg-muted)]", barStyle: "background:#f59e0b", valueColor: "text-[var(--sys-fg-muted)]" },
  { key: "tiefe",     label: t('maturity.pillar_depth'),      max: 20, labelColor: "text-[var(--sys-fg-muted)]", barStyle: "background:#60a5fa", valueColor: "text-[var(--sys-fg-muted)]" },
  { key: "biometrie", label: t('maturity.pillar_biometrics'), max: 20, labelColor: "text-[var(--sys-fg-muted)]", barStyle: "background:#c084fc", valueColor: "text-[var(--sys-fg-muted)]" },
  { key: "archiv",    label: t('maturity.pillar_archive'),    max: 20, labelColor: "text-[var(--sys-fg-muted)]", barStyle: "background:#34d399", valueColor: "text-[var(--sys-fg-muted)]" },
  { key: "signatur",  label: "Skills",                        max: 15, labelColor: "text-[var(--sys-fg-muted)]", barStyle: "background:#fb923c", valueColor: "text-[var(--sys-fg-muted)]" },
  { key: "netzwerk",  label: "Net Skill",                     max: 10, labelColor: "text-[var(--sys-fg-muted)]", barStyle: "background:#22d3ee", valueColor: "text-[var(--sys-fg-muted)]" },
]);

const levelColor = computed(() => {
  if (props.isMature) return "text-[var(--sys-fg)] font-bold";
  if (props.score >= 55)  return "text-[var(--sys-fg)]";
  if (props.score >= 35)  return "text-[var(--sys-fg-muted)]";
  if (props.score >= 15)  return "text-[var(--sys-fg-dim)]";
  return "text-[var(--sys-fg-dim)] opacity-60";
});
</script>

<style scoped>
.soul-meter { display: flex; flex-direction: column; gap: 10px; }

.soul-meter-header { display: flex; align-items: center; justify-content: space-between; }

.soul-meter-label {
  display: flex; align-items: center; gap: 6px;
  font-family: var(--sys-mono);
  font-size: 12px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--sys-fg-muted);
  background: none; border: none; cursor: pointer; padding: 0;
  min-height: unset; border-radius: 0;
  transition: color 0.15s;
}
.soul-meter-label:hover { color: var(--sys-fg); }

.soul-meter-chevron {
  width: 11px; height: 11px;
  transition: transform 0.3s;
}
.soul-meter-chevron.is-open { transform: rotate(180deg); }

.soul-meter-level {
  font-family: var(--sys-serif);
  font-size: 13px;
  letter-spacing: 0.04em;
  transition: color 0.7s;
}

.soul-meter-track {
  position: relative;
  height: 3px;
  width: 100%;
  background: rgba(255,255,255,0.07);
}
.soul-meter-fill {
  position: absolute;
  inset-block: 0;
  left: 0;
  transition: width 0.7s ease-out;
}
.soul-meter-tick {
  position: absolute;
  top: 0; bottom: 0;
  left: 75%;
  width: 1px;
  background: rgba(255,255,255,0.22);
}

.soul-meter-score { display: flex; align-items: center; justify-content: space-between; }
.soul-meter-score-val {
  font-family: var(--sys-mono);
  font-size: 12px;
  color: var(--sys-fg-muted);
  tabular-nums: all;
}
.soul-meter-ready {
  font-family: var(--sys-mono);
  font-size: 12px;
  color: var(--sys-ok);
  letter-spacing: 0.06em;
}
.soul-meter-hint {
  font-family: var(--sys-mono);
  font-size: 12px;
  color: var(--sys-fg-muted);
}

.soul-meter-breakdown {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--sys-rule);
}

.soul-meter-pillar { display: flex; align-items: center; gap: 10px; }
.soul-meter-pillar-label {
  font-family: var(--sys-mono);
  font-size: 12px;
  width: 64px;
  flex-shrink: 0;
  letter-spacing: 0.04em;
}
.soul-meter-pillar-track {
  flex: 1;
  height: 2px;
  background: var(--sys-rule-strong);
}
.soul-meter-pillar-fill {
  height: 100%;
  transition: width 0.5s;
}
.soul-meter-pillar-val {
  font-family: var(--sys-mono);
  font-size: 12px;
  width: 32px;
  text-align: right;
  tabular-nums: all;
}

.soul-meter-skills {
  padding-top: 8px;
  border-top: 1px solid var(--sys-rule);
}
.soul-meter-skills-ok {
  font-family: var(--sys-mono);
  font-size: 12px;
  color: var(--sys-ok);
  letter-spacing: 0.06em;
}
.soul-meter-skills-hints {
  font-family: var(--sys-mono);
  font-size: 12px;
  color: var(--sys-fg-muted);
  line-height: 1.6;
}
.soul-meter-skills-suffix {
  font-family: var(--sys-mono);
  font-size: 12px;
  color: var(--sys-fg-muted);
  margin-left: 4px;
}
.soul-meter-skills-empty {
  font-family: var(--sys-serif);
  font-size: 13px;
  color: var(--sys-fg-muted);
  line-height: 1.5;
}
</style>
