<template>
  <div class="flex flex-col gap-3">

    <!-- Label-Zeile -->
    <div class="flex items-center justify-between">
      <button
        class="sys-link flex items-center gap-1.5 text-sm tracking-[0.14em] uppercase text-[var(--sys-fg-muted)] hover:text-[var(--sys-fg)] transition-colors"
        @click="open = !open"
        :title="open ? 'Breakdown schließen' : 'Breakdown anzeigen'"
      >
        <span>Soul Index</span>
        <svg
          class="w-3 h-3 transition-transform duration-300"
          :class="open ? 'rotate-180' : ''"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
        ><path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7"/></svg>
      </button>
      <span
        class="text-sm font-bold tracking-[0.08em] uppercase transition-colors duration-700"
        :class="[levelColor, isMature ? 'soul-mature-glow' : '']"
      >{{ level }}</span>
    </div>

    <!-- Track + Fill -->
    <div class="relative h-[4px] w-full rounded-full bg-white/[0.07]">
      <div
        class="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
        :class="isMature ? 'soul-pulse' : ''"
        :style="{
          width: score + '%',
          background: isMature
            ? 'linear-gradient(90deg, hsl(var(--chart-1)), hsl(var(--chart-4)))'
            : 'linear-gradient(90deg, hsl(var(--chart-1) / 0.7), hsl(var(--chart-2) / 0.6))',
          boxShadow: isMature ? '0 0 10px hsl(var(--chart-1) / 0.4)' : 'none'
        }"
      ></div>
      <!-- Threshold-Tick bei 75% -->
      <div class="absolute top-0 bottom-0 w-px bg-white/25" style="left:75%" title="Premium-Schwelle: 75 Punkte"></div>
    </div>

    <!-- Score-Zeile -->
    <div class="flex items-center justify-between">
      <span class="text-xs font-mono text-[var(--sys-fg-muted)] tabular-nums">{{ score }}/100</span>
      <span v-if="isMature" class="text-xs text-[var(--sys-fg)] font-semibold">✓ Bereit zur Verschlüsselung</span>
      <span v-else class="text-xs text-[var(--sys-fg-dim)]">
        <template v-if="score >= 55">{{ Math.max(0, 75 - score) }} bis Premium</template>
        <template v-else-if="score >= 35">{{ Math.max(0, 55 - score) }} bis Etabliert</template>
        <template v-else-if="score >= 15">{{ Math.max(0, 35 - score) }} bis Reifung</template>
        <template v-else>{{ Math.max(0, 15 - score) }} bis Aufbau</template>
      </span>
    </div>

    <!-- Breakdown -->
    <Transition name="slide-up">
      <div v-if="open && breakdown" class="space-y-2.5 pt-3 border-t border-[var(--sys-border)]">

        <!-- Säulen -->
        <div v-for="pillar in pillars" :key="pillar.key" class="flex items-center gap-3">
          <span class="text-xs font-medium w-20 flex-none" :class="pillar.labelColor">{{ pillar.label }}</span>
          <div class="flex-1 h-[3px] rounded-full bg-[var(--sys-border)]">
            <div
              class="h-full rounded-full transition-all duration-500"
              :style="pillar.barStyle + '; width: ' + (breakdown[pillar.key] / pillar.max * 100) + '%'"
            ></div>
          </div>
          <span class="text-xs font-mono w-8 text-right tabular-nums" :class="pillar.valueColor">
            {{ breakdown[pillar.key] }}/{{ pillar.max }}
          </span>
        </div>

        <!-- Skills Detail -->
        <div class="pt-2 border-t border-[var(--sys-border)]">
          <template v-if="breakdown.signatureVerified">
            <span class="text-xs text-[var(--sys-fg)] font-semibold">✓ Signatur extern verifiziert</span>
          </template>
          <template v-else-if="breakdown.signatureHints?.length">
            <span class="text-xs text-[var(--sys-fg-muted)] leading-relaxed">
              {{ breakdown.signatureHints.slice(0, 5).join(' · ') }}
              <span v-if="breakdown.signatureHints.length > 5"> +{{ breakdown.signatureHints.length - 5 }}</span>
            </span>
            <span class="text-xs text-[var(--sys-fg-dim)] ml-1.5">erkannte Skills</span>
          </template>
          <template v-else>
            <span class="text-xs text-[var(--sys-fg-dim)] leading-relaxed">Trag herausragende Skills in deine Soul ein — das steigert den Wert</span>
          </template>
        </div>

      </div>
    </Transition>

  </div>
</template>

<script setup>
import { ref, computed } from "vue";

const props = defineProps({
  score:     { type: Number,  required: true },
  level:     { type: String,  required: true },
  isMature:  { type: Boolean, required: true },
  breakdown: { type: Object,  default: null },
});

const open = ref(false);

const pillars = [
  {
    key: "herkunft",  label: "Herkunft",  max: 25,
    labelColor: "text-[var(--sys-fg-muted)]",
    barStyle:   "background: #f59e0b",
    valueColor: "text-[var(--sys-fg-dim)]",
  },
  {
    key: "tiefe",     label: "Tiefe",     max: 20,
    labelColor: "text-[var(--sys-fg-muted)]",
    barStyle:   "background: #60a5fa",
    valueColor: "text-[var(--sys-fg-dim)]",
  },
  {
    key: "biometrie", label: "Biometrie", max: 20,
    labelColor: "text-[var(--sys-fg-muted)]",
    barStyle:   "background: #c084fc",
    valueColor: "text-[var(--sys-fg-dim)]",
  },
  {
    key: "archiv",    label: "Archiv",    max: 20,
    labelColor: "text-[var(--sys-fg-muted)]",
    barStyle:   "background: #34d399",
    valueColor: "text-[var(--sys-fg-dim)]",
  },
  {
    key: "signatur",  label: "Skills",    max: 15,
    labelColor: "text-[var(--sys-fg-muted)]",
    barStyle:   "background: #fb923c",
    valueColor: "text-[var(--sys-fg-dim)]",
  },
  {
    key: "netzwerk",  label: "Net Skill", max: 10,
    labelColor: "text-[var(--sys-fg-muted)]",
    barStyle:   "background: #22d3ee",
    valueColor: "text-[var(--sys-fg-dim)]",
  },
];

const levelColor = computed(() => {
  if (props.isMature) return "text-[var(--sys-fg)] font-bold";
  if (props.score >= 55)  return "text-[var(--sys-fg)]";
  if (props.score >= 35)  return "text-[var(--sys-fg-muted)]";
  if (props.score >= 15)  return "text-[var(--sys-fg-dim)]";
  return "text-[var(--sys-fg-dim)] opacity-60";
});
</script>
