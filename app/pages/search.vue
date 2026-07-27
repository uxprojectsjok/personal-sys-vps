<template>
  <div class="srp-page">
    <header class="srp-header">
      <NuxtLink to="/" class="srp-logo">
        <img src="/logo.png" alt="SYS" class="srp-logo-img" />
        <span class="srp-logo-text">SYS<em>.</em></span>
      </NuxtLink>
      <form class="srp-search-box" @submit.prevent="runSearch">
        <svg class="srp-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="11" cy="11" r="7"/>
          <path stroke-linecap="round" d="m20 20-3.5-3.5"/>
        </svg>
        <input
          v-model="query"
          type="text"
          class="srp-search-input"
          :placeholder="$t('landing.search_placeholder')"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="80"
          :aria-label="$t('landing.search_placeholder')"
        />
        <button type="submit" class="srp-search-submit" :disabled="!query.trim()" :aria-label="$t('landing.search_placeholder')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m0 0-6-6m6 6-6 6"/>
          </svg>
        </button>
      </form>
      <button type="button" class="srp-back" @click="$router.back()" :aria-label="$t('common.back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 12H5m0 0 6-6m-6 6 6 6"/>
        </svg>
      </button>
    </header>

    <main class="srp-main">
      <div class="srp-col">
        <p v-if="loading" class="srp-status">{{ $t('landing.search_loading') }}</p>
        <p v-else-if="error" class="srp-status">{{ $t('landing.search_error') }}</p>
        <template v-else-if="submittedQuery">
          <p class="srp-count">{{ $t('landing.search_result_count', { n: allResults.length, q: submittedQuery }) }}</p>
          <p v-if="allResults.length === 0" class="srp-status">{{ $t('landing.search_empty') }}</p>

          <div v-else class="srp-results">
            <a
              v-for="r in pageResults" :key="r.origin"
              class="srp-item"
              :href="r.origin"
              target="_blank" rel="noopener noreferrer"
            >
              <div class="srp-item-breadcrumb">
                <span class="srp-avatar" aria-hidden="true">{{ r.initial }}</span>
                <div class="srp-item-breadcrumb-text">
                  <span class="srp-item-site">{{ r.hostname }}</span>
                  <span class="srp-item-url">{{ r.origin }}</span>
                </div>
              </div>
              <span class="srp-item-title">{{ r.title }}</span>
              <span v-if="r.snippet" class="srp-item-desc" v-html="r.snippet"></span>
              <span v-if="r.meta" class="srp-item-meta">{{ r.meta }}</span>
              <span v-if="r.tags?.length" class="srp-item-tags">
                <span v-for="t in r.tags.slice(0, 8)" :key="t" class="srp-item-tag">#{{ t }}</span>
              </span>
            </a>
          </div>

          <nav v-if="pageCount > 1" class="srp-pagination" aria-label="Pagination">
            <button class="srp-page-btn" :disabled="page === 1" @click="page--">←</button>
            <button
              v-for="p in pageCount" :key="p"
              class="srp-page-btn"
              :class="{ on: p === page }"
              @click="page = p"
            >{{ p }}</button>
            <button class="srp-page-btn" :disabled="page === pageCount" @click="page++">→</button>
          </nav>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup>
// Google-artige Ergebnisseite für die Netzwerksuche — separat von der
// Landing (dort sitzt nur noch das reine Suchfeld, ContextSearch.vue, das
// hierher navigiert). Such-Logik geteilt über useNetworkSearch.js.
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNetworkSearch } from '~/composables/useNetworkSearch.js'

definePageMeta({ layout: false })

const route  = useRoute()
const router = useRouter()
const { t }  = useI18n()
const { loading, error, ensureLoaded, search } = useNetworkSearch()

const query          = ref(String(route.query.q || ''))
const submittedQuery  = ref('')
const allResults      = ref([])
const page            = ref(1)
const PER_PAGE        = 10

async function runQuery(q) {
  submittedQuery.value = q
  page.value = 1
  if (!q) { allResults.value = []; return }
  await ensureLoaded()
  allResults.value = search(q, t)
}

function runSearch() {
  const q = query.value.trim().slice(0, 80)
  if (!q) return
  router.push({ path: '/search', query: { q } })
}

watch(() => route.query.q, (q) => {
  query.value = String(q || '')
  runQuery(query.value.trim())
}, { immediate: true })

const pageCount   = computed(() => Math.max(1, Math.ceil(allResults.value.length / PER_PAGE)))
const pageResults = computed(() => allResults.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))
</script>

<style scoped>
.srp-page { min-height: 100dvh; background: var(--bg); color: var(--fg); }
.srp-header {
  display: flex; align-items: center; gap: 20px;
  padding: 18px clamp(20px,4vw,48px); border-bottom: 1px solid var(--line);
}
.srp-logo { display: flex; align-items: center; gap: 8px; font-family: var(--serif); font-size: 22px; color: var(--fg); text-decoration: none; flex: none; }
.srp-logo-img { width: 26px; height: 26px; display: block; }
.srp-logo em { font-style: italic; color: var(--accent); }
.srp-back {
  flex: none; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--line); border-radius: var(--r-sm); color: var(--fg-2); cursor: pointer;
}
.srp-back svg { width: 17px; height: 17px; }
.srp-back:hover { color: var(--fg); border-color: var(--accent); }
.srp-search-box {
  display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; max-width: 560px;
  padding: 4px 4px 4px 14px; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); transition: border-color .15s;
}
.srp-search-box:focus-within { border-color: var(--accent); }
.srp-search-icon { width: 16px; height: 16px; flex: none; color: var(--fg-3); }
.srp-search-input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: var(--fg); font-family: var(--sans); font-size: 14px; padding: 8px 0; }
.srp-search-submit {
  flex: none; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  background: var(--accent); color: var(--on-accent, #fff); border: none; border-radius: var(--r-sm); cursor: pointer;
}
.srp-search-submit svg { width: 15px; height: 15px; }
.srp-search-submit:disabled { opacity: .4; cursor: not-allowed; }

.srp-main { padding: 28px clamp(20px,4vw,48px) 60px; }
.srp-col { max-width: 620px; }
.srp-status { font-size: 14px; color: var(--fg-3); padding: 24px 0; }
.srp-count { font-size: 13px; color: var(--fg-3); margin: 0 0 20px; }

.srp-results { display: flex; flex-direction: column; gap: 28px; }
.srp-item { display: flex; flex-direction: column; gap: 2px; text-decoration: none; color: var(--fg); }
.srp-item-breadcrumb { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.srp-avatar {
  flex: none; width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent-dim, rgba(109,184,154,0.18)); color: var(--accent);
  font-family: var(--serif); font-size: 13px; font-weight: 600;
}
.srp-item-breadcrumb-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.35; }
.srp-item-site { font-size: 13px; color: var(--fg); }
.srp-item-url { font-family: var(--mono); font-size: 12px; color: var(--fg-3); }
.srp-item-title { font-size: 18px; font-weight: 500; color: var(--accent); }
.srp-item:hover .srp-item-title { text-decoration: underline; }
.srp-item-meta { font-size: 12px; color: var(--fg-3); margin-top: 2px; }
.srp-item-desc { font-size: 14px; color: var(--fg-2); line-height: 1.6; margin-top: 2px; }
.srp-item-desc :deep(mark) { background: var(--accent-dim, rgba(109,184,154,0.25)); color: var(--fg); border-radius: 2px; padding: 0 1px; }
.srp-item-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.srp-item-tag { font-size: 11px; color: var(--accent); }

.srp-pagination { display: flex; align-items: center; justify-content: flex-start; gap: 6px; margin-top: 40px; }
.srp-page-btn {
  min-width: 32px; height: 32px; padding: 0 8px; display: flex; align-items: center; justify-content: center;
  background: none; border: 1px solid var(--line); border-radius: var(--r-sm); color: var(--fg-2);
  font-family: var(--mono); font-size: 13px; cursor: pointer; transition: all .15s;
}
.srp-page-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--fg); }
.srp-page-btn.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent, #fff); }
.srp-page-btn:disabled { opacity: .35; cursor: not-allowed; }

@media (max-width: 640px) {
  .srp-header { flex-wrap: wrap; gap: 12px 16px; padding: 14px 16px; }
  .srp-logo { order: 1; }
  .srp-back { order: 2; margin-left: auto; }
  .srp-search-box { order: 3; flex-basis: 100%; max-width: none; }
}
</style>
