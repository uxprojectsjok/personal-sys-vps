<template>
  <div class="sv-root">
    <div v-for="section in SOUL_SECTIONS" :key="section.key" class="sv-section">
      <template v-if="getContent(section.key)">
        <div class="sv-label">{{ section.label }}</div>
        <p class="sv-body">{{ getContent(section.key) }}</p>
      </template>
    </div>

    <template v-if="allEmpty && longmemGroups.length">
      <div v-for="group in longmemGroups" :key="group.key" class="sv-section">
        <div class="sv-label">{{ group.label }}</div>
        <ul class="sv-longmem-list">
          <li v-for="(item, i) in group.items" :key="i">
            <span v-if="item.cat" class="sv-longmem-cat">[{{ item.cat }}]</span>
            {{ item.text }}
          </li>
        </ul>
      </div>
    </template>

    <div v-if="allEmpty && !longmemGroups.length" class="sv-empty">
      {{ $t('soul_viewer.empty') }}
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { parseSoul, extractLongmem } from "#shared/utils/soulParser.js";
import { useSoul } from "~/composables/useSoul.js";

const { t } = useI18n();
const { soulContent } = useSoul();

const SOUL_SECTIONS = computed(() => [
  { key: "Kern-Identität",                       label: t('soul_viewer.section_identity') },
  { key: "Werte & Überzeugungen",                label: t('soul_viewer.section_values') },
  { key: "Ästhetik & Resonanz",                  label: t('soul_viewer.section_aesthetics') },
  { key: "Sprachmuster & Ausdruck",              label: t('soul_viewer.section_language') },
  { key: "Wiederkehrende Themen & Obsessionen",  label: t('soul_viewer.section_themes') },
  { key: "Emotionale Signatur",                  label: t('soul_viewer.section_emotional') },
  { key: "Weltbild",                             label: t('soul_viewer.section_worldview') },
  { key: "Offene Fragen dieser Person",          label: t('soul_viewer.section_questions') },
  { key: "Session-Log (komprimiert)",            label: t('soul_viewer.section_history') },
]);

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

// Fallback: Archivar kristallisiert inzwischen primär in LONGMEM statt in
// Prosa-Sektionen — ohne das würde das Panel bei modernen Souls leer wirken.
const longmem = computed(() => extractLongmem(soulContent.value));

const LONGMEM_GROUP_DEFS = computed(() => [
  { key: "facts",     label: t('soul_viewer.section_facts'),     limit: 8 },
  { key: "memories",  label: t('soul_viewer.section_memories'),  limit: 5 },
  { key: "ideas",     label: t('soul_viewer.section_ideas'),     limit: 5 },
  { key: "learnings", label: t('soul_viewer.section_learnings'), limit: 5 },
]);

const longmemGroups = computed(() => {
  const lm = longmem.value;
  if (!lm) return [];
  return LONGMEM_GROUP_DEFS.value
    .map(def => {
      const items = (lm[def.key] ?? [])
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, def.limit)
        .map(it => ({ cat: it.cat ?? null, text: it.text ?? it.title ?? "" }))
        .filter(it => it.text);
      return { ...def, items };
    })
    .filter(def => def.items.length);
});
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

.sv-longmem-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sv-longmem-list li {
  font-size: 13px;
  line-height: 1.6;
  color: var(--fg-2);
  word-break: break-word;
}
.sv-longmem-cat {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--fg-3);
  margin-right: 4px;
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
