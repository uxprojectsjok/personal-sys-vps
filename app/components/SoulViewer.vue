<template>
  <div class="sv-root">
    <div v-for="section in SOUL_SECTIONS" :key="section.key" class="sv-section">
      <template v-if="getContent(section.key)">
        <div class="sv-label">{{ section.label }}</div>
        <p class="sv-body">{{ getContent(section.key) }}</p>
      </template>
    </div>

    <div v-if="allEmpty" class="sv-empty">
      Noch keine Seeleninhalte gespeichert.
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { parseSoul } from "#shared/utils/soulParser.js";
import { useSoul } from "~/composables/useSoul.js";

const { soulContent } = useSoul();

const SOUL_SECTIONS = [
  { key: "Kern-Identität",                       label: "Kern-Identität" },
  { key: "Werte & Überzeugungen",                label: "Werte & Überzeugungen" },
  { key: "Ästhetik & Resonanz",                  label: "Ästhetik & Resonanz" },
  { key: "Sprachmuster & Ausdruck",              label: "Sprachmuster & Ausdruck" },
  { key: "Wiederkehrende Themen & Obsessionen",  label: "Themen & Obsessionen" },
  { key: "Emotionale Signatur",                  label: "Emotionale Signatur" },
  { key: "Weltbild",                             label: "Weltbild" },
  { key: "Offene Fragen dieser Person",          label: "Offene Fragen" },
  { key: "Session-Log (komprimiert)",            label: "Verlauf" },
];

const parsed = computed(() => parseSoul(soulContent.value));

function getContent(key) {
  let c = parsed.value.sections[key];
  if (key === "Session-Log (komprimiert)" || key === "Session-Log") {
    const a = parsed.value.sections["Session-Log"] ?? "";
    const b = parsed.value.sections["Session-Log (komprimiert)"] ?? "";
    c = [a, b].filter(Boolean).join("\n\n") || "";
  }
  if (!c) return "";
  if (
    c.includes("Noch nicht beschrieben") ||
    c.includes("Noch nicht eingetragen") ||
    c.includes("Musik, Atmosphären")
  ) return "";
  return c;
}

const allEmpty = computed(() =>
  SOUL_SECTIONS.every(s => !getContent(s.key))
);
</script>

<style scoped>
.sv-root {
  padding: 8px 0 8px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.sv-section {
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
}
.sv-section:last-child {
  border-bottom: none;
}

.sv-label {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--fg-3);
  margin-bottom: 6px;
}

.sv-body {
  font-size: 13px;
  line-height: 1.65;
  color: var(--fg-2);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}

.sv-empty {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--fg-2);
  padding: 24px 0;
  text-align: center;
  letter-spacing: 0.08em;
}
</style>
