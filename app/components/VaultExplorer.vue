<template>
  <div class="rounded-none bg-[var(--sys-bg-elevated)] border border-[var(--sys-border)] overflow-hidden">
    <div class="p-3 space-y-3">

    <!-- ── Tabs ─────────────────────────────────────────────────────────── -->
    <div class="flex gap-1 p-1 rounded-none bg-white/5 border border-white/8 items-center">
      <button
        v-for="t in TABS" :key="t.id"
        @click="switchTab(t.id)"
        class="flex-1 h-8 rounded-none text-sm font-medium transition-all"
        :class="tab === t.id ? 'bg-white/12 text-white' : 'text-white/40 hover:text-white/65'"
      >{{ t.label }}</button>
      <button
        @click="onRefresh"
        :disabled="isScanning"
        class="w-8 h-8 flex items-center justify-center rounded-none text-white/40 hover:text-white hover:bg-white/8 disabled:opacity-30 transition text-lg leading-none"
        title="Aktualisieren"
      >
        <span :class="isScanning ? 'animate-spin inline-block' : ''">↻</span>
      </button>
    </div>

    <!-- Feedback: als fixed Toast über Teleport (modal ist scrollbar, inline wäre unsichtbar) -->

    <!-- ── LOKAL ─────────────────────────────────────────────────────────── -->
    <template v-if="tab === 'local'">
      <div v-if="!vaultConnected" class="py-8 flex flex-col items-center gap-2">
        <svg class="w-8 h-8 text-white/15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"/>
        </svg>
        <p class="text-sm text-white/35">Vault nicht verbunden</p>
      </div>

      <!-- Cloud-Modus-Badge -->
      <div v-if="vaultConnected && memoryMode" class="flex items-center gap-2 px-3 py-2 rounded-none bg-white/4 border border-white/10 text-xs text-white/50">
        <svg class="w-3.5 h-3.5 flex-none text-white/35" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z"/>
        </svg>
        <span class="flex-1 truncate">Cloud-Modus{{ cloudSource ? ' · ' + cloudSource.split('/').pop() : '' }}</span>
        <span class="text-white/30">in-memory</span>
      </div>

      <template v-else>
        <!-- Sync-Button (gehört zum Lokal-Tab) -->
        <button
          v-if="soulCert"
          @click="openSyncModal"
          :disabled="isSyncing || isScanning"
          class="w-full h-9 flex items-center justify-center gap-1.5 rounded-none border border-white/10 text-white/60 hover:text-white hover:bg-white/8 disabled:opacity-30 transition text-xs font-medium"
          title="sys.md und alle lokalen Vault-Dateien auf den Server hochladen"
        >
          <svg v-if="isSyncing" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
          </svg>
          <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>
          </svg>
          <span>{{ isSyncing ? 'Lädt…' : 'Vault syncen' }}</span>
        </button>

        <!-- Identity-Datei als eigene Gruppe (beliebiger *.md Name) -->
        <div v-if="soulContent && (!vaultConnected || memoryMode || allFiles.some(f => f.kind === 'soul'))">
          <div class="flex items-center gap-2 px-1 pt-1 pb-1">
            <p class="text-[10px] font-medium text-white/30 uppercase tracking-widest flex-1">Soul · 1</p>
          </div>
          <div class="divide-y divide-white/[0.05] rounded-none border border-white/[0.07]">
            <div class="flex items-center gap-2 px-3 min-h-[44px]">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-[#22c55e]/60"/>
              <span class="text-sm text-white/70 flex-1 font-mono">{{ localSoulFileName }}</span>
              <!-- Cert rotieren -->
              <button
                @click="handleRotateCert"
                :disabled="rotateBusy"
                class="w-8 h-8 flex items-center justify-center rounded-none text-white/40 hover:text-[#f97316] hover:bg-white/8 transition shrink-0 disabled:opacity-30"
                title="Soul-Cert rotieren (altes Cert sofort ungültig)"
                aria-label="Soul-Cert rotieren"
              >
                <svg v-if="rotateBusy" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/></svg>
                <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 0 1 21.75 8.25Z"/>
                </svg>
              </button>
              <!-- sys.md herunterladen -->
              <button
                @click="downloadSoulLocal"
                class="w-8 h-8 flex items-center justify-center rounded-none text-white/40 hover:text-white hover:bg-white/8 transition shrink-0"
                :title="`${localSoulFileName} herunterladen (lokaler Stand)`"
                :aria-label="`${localSoulFileName} herunterladen`"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <p v-if="!hasLocalFiles" class="py-3 text-center text-sm text-white/30">Noch keine Dateien im Vault</p>

        <!-- Bulk-Aktionsleiste Lokal -->
        <div v-if="selectedLocal.size > 0"
          class="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-none bg-white/5 border border-white/10"
        >
          <span class="text-xs text-white/60 sm:flex-1">{{ selectedLocal.size }} ausgewählt</span>
          <div class="flex items-center gap-1.5">
            <button v-if="soulCert" @click="uploadSelectedLocal"
              class="flex-1 sm:flex-none px-2.5 py-1.5 rounded-none bg-white/8 text-white/70 hover:text-white hover:bg-white/12 transition text-xs flex items-center justify-center gap-1.5"
            >
              <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/></svg>
              Hochladen
            </button>
            <button @click="deleteSelectedLocal"
              class="flex-1 sm:flex-none px-2.5 py-1.5 rounded-none bg-red-950/30 text-red-400/70 hover:text-red-400 hover:bg-red-950/50 transition text-xs flex items-center justify-center gap-1.5"
            >
              <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
              Löschen
            </button>
            <button @click="clearSelection('local')"
              class="w-7 h-7 flex items-center justify-center rounded-none text-white/40 hover:text-white hover:bg-white/8 transition text-xs"
            >✕</button>
          </div>
        </div>

        <!-- Dateiliste Lokal: flat, ohne Card-Rahmen pro Gruppe -->
        <div v-for="(files, type) in localArchive" :key="type">
          <!-- Typ-Label -->
          <div class="flex items-center gap-2 px-1 pt-2 pb-1">
            <p class="text-[10px] font-medium text-white/30 uppercase tracking-widest flex-1">{{ TYPE_LABELS[type] }} · {{ files.length }}</p>
          </div>
          <!-- Inline-Player -->
          <div v-if="playerSrc && playerTab === 'local' && files.includes(playerName)"
            class="px-3 py-2 mb-1 rounded-none border border-white/8 bg-white/3">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-white/50 truncate flex-1">{{ playerName }}</span>
              <button @click="closePlayer" class="text-white/35 hover:text-white p-1 text-xs">✕</button>
            </div>
            <audio v-if="playerKind === 'audio'" :src="playerSrc" controls preload="auto" class="w-full" style="height:32px"/>
            <video v-else :src="playerSrc" controls playsinline class="w-full rounded-none max-h-48"/>
          </div>
          <!-- Datei-Zeilen -->
          <div class="divide-y divide-white/[0.05] rounded-none border border-white/[0.07]">
            <div v-for="name in files" :key="name"
              class="flex items-center gap-2 px-3 min-h-[44px] hover:bg-white/[0.04] transition-colors cursor-pointer select-none"
              :class="selectedLocal.has(name) ? 'bg-white/[0.06]' : ''"
              @click="toggleSelect('local', name)"
            >
              <button @click.stop="onSetActive(type, name)" class="flex items-center gap-2 flex-1 py-2 text-left min-w-0" :disabled="settingActive">
                <span class="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
                  :class="isActive(type, name) ? 'bg-white' : 'bg-white/20 hover:bg-white/40'"/>
                <span class="text-sm text-white/70 truncate">{{ name }}</span>
                <span v-if="isActive(type, name)" class="text-xs font-medium text-white/40 shrink-0">aktiv</span>
              </button>
              <button
                @click.stop="openContextMenu('local', type, name, $event)"
                :disabled="!!localBusy[name]"
                class="w-8 h-8 flex items-center justify-center rounded-none transition disabled:opacity-25 shrink-0"
                :class="isMenuOpen(type, name) ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/8'"
                aria-label="Aktionen"
              >
                <svg v-if="localBusy[name]" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                  <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="14" cy="8" r="1.5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

      </template>
    </template>

    <!-- ── SERVER ────────────────────────────────────────────────────────── -->
    <template v-if="tab === 'server'">
      <div v-if="!soulCert" class="py-8 text-center text-sm text-white/35">Soul-Zertifikat benötigt</div>
      <div v-else-if="serverLoading" class="py-8 flex items-center justify-center">
        <svg class="w-4 h-4 animate-spin text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
        </svg>
      </div>
      <template v-else>
        <p v-if="!hasServerFiles" class="py-5 text-center text-sm text-white/30">
          Keine Dateien auf dem Server
        </p>

        <!-- Bulk-Aktionsleiste Server -->
        <div v-if="selectedServer.size > 0"
          class="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-none bg-white/5 border border-white/10"
        >
          <span class="text-xs text-white/60 sm:flex-1">{{ selectedServer.size }} ausgewählt</span>
          <div class="flex items-center gap-1.5">
            <button v-if="vaultConnected" @click="downloadSelectedServer"
              class="flex-1 sm:flex-none px-2.5 py-1.5 rounded-none bg-white/8 text-white/70 hover:text-white hover:bg-white/12 transition text-xs flex items-center justify-center gap-1.5"
            >
              <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5"/></svg>
              Lokal speichern
            </button>
            <button v-if="soulCert" @click="deleteSelectedServer"
              class="flex-1 sm:flex-none px-2.5 py-1.5 rounded-none bg-red-950/30 text-red-400/70 hover:text-red-400 hover:bg-red-950/50 transition text-xs flex items-center justify-center gap-1.5"
            >
              <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/></svg>
              Löschen
            </button>
            <button @click="clearSelection('server')"
              class="w-7 h-7 flex items-center justify-center rounded-none text-white/40 hover:text-white hover:bg-white/8 transition text-xs"
            >✕</button>
          </div>
        </div>

        <!-- sys.md (VPS) -->
        <div>
          <div class="flex items-center gap-2 px-1 pt-1 pb-1">
            <p class="text-[10px] font-medium text-white/30 uppercase tracking-widest flex-1">Soul · 1</p>
          </div>
          <div class="divide-y divide-white/[0.05] rounded-none border border-white/[0.07]">
            <div class="flex items-center gap-2 px-3 min-h-[44px]">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-[#22c55e]/60"/>
              <span class="text-sm text-white/70 flex-1 font-mono">sys.md</span>
              <button
                @click="downloadSoulServer"
                :disabled="soulServerDownloading"
                class="w-8 h-8 flex items-center justify-center rounded-none text-white/40 hover:text-white hover:bg-white/8 transition shrink-0 disabled:opacity-30"
                title="sys.md vom Server herunterladen (VPS-Stand)"
                aria-label="sys.md vom Server herunterladen"
              >
                <svg v-if="soulServerDownloading" class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
                </svg>
                <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Dateiliste Server: flat, ohne Card-Rahmen pro Gruppe -->
        <div v-for="(files, type) in serverArchive" :key="type">
          <div class="flex items-center gap-2 px-1 pt-2 pb-1">
            <p class="text-[10px] font-medium text-white/30 uppercase tracking-widest flex-1">{{ TYPE_LABELS[type] }} · {{ files.length }}</p>
          </div>
          <!-- Inline-Player -->
          <div v-if="playerSrc && playerTab === 'server' && files.includes(playerName)"
            class="px-3 py-2 mb-1 rounded-none border border-white/8 bg-white/3">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono text-white/50 truncate flex-1">{{ playerName }}</span>
              <button @click="closePlayer" class="text-white/35 hover:text-white p-1 text-xs">✕</button>
            </div>
            <audio v-if="playerKind === 'audio'" :src="playerSrc" controls preload="auto" class="w-full" style="height:32px"/>
            <video v-else :src="playerSrc" controls playsinline class="w-full rounded-none max-h-48"/>
          </div>
          <div class="divide-y divide-white/[0.05] rounded-none border border-white/[0.07]">
            <div v-for="name in files" :key="name"
              class="flex items-center gap-2 px-3 min-h-[44px] hover:bg-white/[0.04] transition-colors cursor-pointer select-none"
              :class="selectedServer.has(name) ? 'bg-white/[0.06]' : ''"
              @click="toggleSelect('server', name)"
            >
              <button @click.stop="onSetActive(type, name)" class="flex items-center gap-2 flex-1 py-2 text-left min-w-0" :disabled="settingActive">
                <span class="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
                  :class="isActive(type, name) ? 'bg-white' : 'bg-white/20 hover:bg-white/40'"/>
                <span class="text-sm text-white/70 truncate">{{ name }}</span>
                <span v-if="isActive(type, name)" class="text-xs font-medium text-white/40 shrink-0">aktiv</span>
              </button>
              <button
                @click.stop="openContextMenu('server', type, name, $event)"
                :disabled="!!serverBusy[name]"
                class="w-8 h-8 flex items-center justify-center rounded-none transition disabled:opacity-25 shrink-0"
                :class="isMenuOpen(type, name) ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white hover:bg-white/8'"
                aria-label="Aktionen"
              >
                <svg v-if="serverBusy[name]" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                  <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="14" cy="8" r="1.5"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

      </template>

    </template>

    <!-- ── NETZWERK ──────────────────────────────────────────────────────── -->
    <template v-if="tab === 'network'">
      <div v-if="!soulCert" class="py-8 text-center text-sm text-white/35">Soul-Zertifikat benötigt</div>
      <template v-else>

        <!-- Datei hinzufügen -->
        <button @click="publicPickerOpen = !publicPickerOpen"
          class="w-full flex items-center justify-center gap-1.5 py-2 rounded-none border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 transition text-xs">
          <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          Datei hinzufügen
        </button>

        <!-- Picker aus Server-Dateien -->
        <div v-if="publicPickerOpen" class="rounded-none border border-white/8 bg-white/3 max-h-36 overflow-y-auto">
          <button v-for="f in serverFilesNotPublic" :key="f.name"
            @click="isSafePublicFilename(f.name) && addPublicFile(f.name)"
            :disabled="!isSafePublicFilename(f.name)"
            :title="isSafePublicFilename(f.name) ? '' : 'Dateiname enthält Leerzeichen oder Sonderzeichen – bitte umbenennen (nur Buchstaben, Zahlen, Bindestrich, Punkt, Unterstrich erlaubt)'"
            class="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
            :class="isSafePublicFilename(f.name) ? 'hover:bg-white/5' : 'opacity-40 cursor-not-allowed'">
            <span class="text-xs font-mono truncate" :class="isSafePublicFilename(f.name) ? 'text-white/60' : 'text-red-400/70'">{{ f.name }}</span>
            <span v-if="!isSafePublicFilename(f.name)" class="ml-auto text-[10px] text-red-400/60 shrink-0">umbenennen</span>
            <span v-else class="ml-auto text-xs text-white/35 shrink-0">{{ TYPE_LABELS[f.type] }}</span>
          </button>
          <p v-if="serverFilesNotPublic.length === 0" class="px-3 py-2 text-xs text-white/35">
            Alle Server-Dateien bereits freigegeben
          </p>
        </div>

        <!-- Leerer Zustand -->
        <p v-if="!Object.keys(networkArchive).length" class="py-3 text-center text-sm text-white/30">Noch keine Dateien freigegeben</p>

        <!-- Dateien gruppiert nach Typ -->
        <div v-for="(files, type) in networkArchive" :key="type">
          <div class="flex items-center gap-2 px-1 pt-2 pb-1">
            <p class="text-[10px] font-medium text-white/30 uppercase tracking-widest flex-1">{{ TYPE_LABELS[type] }} · {{ files.length }}</p>
          </div>
          <div class="divide-y divide-white/[0.05] rounded-none border border-white/[0.07]">
            <div v-for="name in files" :key="name" class="flex items-center gap-2 px-3 min-h-[44px]">
              <span class="w-1.5 h-1.5 rounded-full shrink-0 bg-white/30"/>
              <span class="text-sm text-white/70 truncate flex-1 font-mono">{{ name }}</span>
              <button
                @click.stop="onDeleteNetworkFile(name)"
                :disabled="!!networkBusy[name]"
                class="w-8 h-8 flex items-center justify-center rounded-none transition disabled:opacity-25 shrink-0 text-white/25 hover:text-red-400 hover:bg-red-950/30"
                aria-label="Entfernen"
              >
                <svg v-if="networkBusy[name]" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" d="M12 3a9 9 0 1 0 9 9"/>
                </svg>
                <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <p v-if="publicSyncError" class="text-xs text-red-400">{{ publicSyncError }}</p>
        <p v-else-if="publicSyncOk" class="text-xs text-[#22c55e]/80">Freigabe aktualisiert ✓</p>

      </template>
    </template>

    <!-- Dateien importieren (Lokal-Tab + Vault verbunden) -->
    <label
      v-if="tab === 'local' && vaultConnected"
      class="w-full flex items-center justify-center gap-1.5 py-2 rounded-none border border-dashed border-white/15 text-white/40 hover:text-white/70 hover:border-white/30 transition cursor-pointer text-xs"
      title="Dateien aus dem Gerät importieren"
    >
      <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
      </svg>
      Dateien importieren
      <input
        ref="fileInputRef"
        type="file"
        multiple
        accept="audio/*,video/*,image/*,.md,.txt,.pdf"
        class="sr-only"
        @change="addLocalFiles"
      />
    </label>

    <!-- ── Verschlüsselung & Dateien (immer sichtbar wenn soulCert) ──────── -->
    <div v-if="soulCert" class="pt-3 space-y-2">
      <p class="text-xs tracking-wider uppercase text-white/30 px-1">
        Aktionen
      </p>

      <!-- Soul verschlüsseln & Download -->
      <button
        class="w-full flex items-center gap-3 px-4 py-3 rounded-none transition-all duration-150 text-left"
        style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);"
        @mouseenter="e => e.currentTarget.style.background='rgba(255,255,255,0.07)'"
        @mouseleave="e => e.currentTarget.style.background='rgba(255,255,255,0.03)'"
        @click="$emit('encrypt')"
      >
        <div class="w-8 h-8 rounded-none flex items-center justify-center flex-none"
          style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12)">
          <svg class="w-4 h-4 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-white/80">Soul verschlüsseln & Download</p>
          <p class="text-xs text-white/35 mt-0.5">AES-256-GCM · BIP39 · .soul-Datei</p>
        </div>
      </button>

      <!-- Cloud-Vault löschen -->
      <button
        class="w-full flex items-center gap-3 px-4 py-3 rounded-none transition-all duration-150 text-left"
        style="background: rgba(239,68,68,0.03); border: 1px solid rgba(239,68,68,0.12);"
        @mouseenter="e => e.currentTarget.style.background='rgba(239,68,68,0.08)'"
        @mouseleave="e => e.currentTarget.style.background='rgba(239,68,68,0.03)'"
        @click="confirmDeleteOpen = true"
        :disabled="deleteVaultLoading"
      >
        <div class="w-8 h-8 rounded-none flex items-center justify-center flex-none"
          style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2)">
          <svg class="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-red-400">{{ deleteVaultLoading ? 'Wird gelöscht…' : 'Cloud-Vault löschen' }}</p>
          <p class="text-xs text-white/35 mt-0.5">Entfernt alle Vault-Dateien vom Server</p>
        </div>
      </button>
    </div>

    </div>
  </div>

  <!-- ── Toast-Feedback (fixed, escapes scrollable modal) ─────────────────── -->
  <Teleport to="body">
    <Transition name="vault-toast">
      <div
        v-if="successMsg || errorMsg"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] px-4 py-3 rounded-none border shadow-2xl text-sm font-medium flex items-center gap-2.5 max-w-sm w-[calc(100vw-2rem)]"
        :class="successMsg
          ? 'bg-[#052e16] border-[#166534] text-[#4ade80]'
          : 'bg-[#2d0a0a] border-[#7f1d1d] text-[#f87171]'"
      >
        <svg v-if="successMsg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/>
        </svg>
        <svg v-else class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
        </svg>
        <span>{{ successMsg || errorMsg }}</span>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Cloud-Vault Löschen Bestätigungs-Modal ──────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="confirmDeleteOpen"
        class="fixed inset-0 z-[400] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        @click.self="confirmDeleteOpen = false"
        role="dialog" aria-modal="true" aria-labelledby="confirm-delete-title"
      >
        <div class="relative w-full max-w-sm bg-[var(--sys-bg-elevated)] border border-[var(--sys-border)] rounded-2xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 id="confirm-delete-title" class="text-sm font-semibold text-red-400">Cloud-Vault löschen</h2>
            <button @click="confirmDeleteOpen = false" class="w-7 h-7 flex items-center justify-center rounded-none text-white/40 hover:text-white hover:bg-white/8 transition" aria-label="Schließen">✕</button>
          </div>
          <div class="px-5 pb-5 space-y-4">
            <p class="text-sm text-white/60 leading-relaxed">
              Alle Vault-Dateien auf dem Server werden unwiderruflich gelöscht.<br>
              <span class="text-white/40">Die lokale Verbindung bleibt bestehen.</span>
            </p>
            <div class="flex gap-2">
              <button
                @click="confirmDeleteOpen = false"
                class="flex-1 h-10 rounded-none border border-[var(--sys-border)] text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition"
              >Abbrechen</button>
              <button
                @click="handleDeleteVault"
                :disabled="deleteVaultLoading"
                class="flex-1 h-10 rounded-none bg-red-500/15 border border-red-500/30 text-sm font-semibold text-red-400 hover:bg-red-500/25 disabled:opacity-40 transition"
              >{{ deleteVaultLoading ? 'Wird gelöscht…' : 'Endgültig löschen' }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Sync-Bestätigungs-Modal ──────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="syncModalOpen"
        class="fixed inset-0 z-[400] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
        @click.self="syncModalOpen = false"
        role="dialog" aria-modal="true" aria-labelledby="sync-modal-title"
      >
        <div class="relative w-full max-w-sm bg-[var(--sys-bg-elevated)] border border-[var(--sys-border)] rounded-2xl shadow-2xl overflow-hidden">

          <!-- Header -->
          <div class="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 id="sync-modal-title" class="text-sm font-semibold text-white">Vault auf Server syncen</h2>
            <button @click="syncModalOpen = false" class="w-7 h-7 flex items-center justify-center rounded-none text-white/40 hover:text-white hover:bg-white/8 transition" aria-label="Schließen">✕</button>
          </div>

          <!-- Body -->
          <div class="px-5 pb-2 space-y-3">
            <p class="text-xs text-white/55 leading-relaxed">
              Du bist dabei, deinen lokalen Vault auf den Server hochzuladen. Dabei werden folgende Inhalte übertragen und bereits vorhandene Server-Dateien ersetzt:
            </p>

            <!-- Was wird hochgeladen -->
            <ul class="space-y-1.5">
              <li v-if="soulContent" class="flex items-center gap-2 text-xs text-white/70">
                <span class="w-1.5 h-1.5 rounded-full bg-[#22c55e] shrink-0"/>
                <span class="font-mono">sys.md</span>
                <span class="text-white/35 ml-auto">Dein Soul-Profil</span>
              </li>
              <li v-for="(files, type) in localArchive" :key="type" class="flex items-center gap-2 text-xs text-white/70">
                <span class="w-1.5 h-1.5 rounded-full bg-white/30 shrink-0"/>
                <span>{{ files.length }} {{ TYPE_LABELS[type] }}-Datei{{ files.length !== 1 ? 'en' : '' }}</span>
              </li>
              <li v-if="!soulContent && Object.keys(localArchive).length === 0" class="text-xs text-white/35 italic">
                Keine lokalen Dateien vorhanden
              </li>
            </ul>

            <!-- Verschlüsselungsmodus -->
            <div class="flex items-center gap-2 px-3 py-2 rounded-none bg-white/[0.04] border border-white/8 text-xs">
              <svg class="w-3.5 h-3.5 shrink-0 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              <span v-if="vaultKey && vaultKey !== '__encrypted__'" class="text-white/60">
                Upload <strong class="text-white/80">verschlüsselt</strong> (AES-256-CBC)
              </span>
              <span v-else class="text-white/60">
                Upload <strong class="text-white/80">unverschlüsselt</strong>
              </span>
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center gap-2 px-5 py-4 border-t border-[var(--sys-border)]">
            <button
              @click="syncModalOpen = false"
              class="flex-1 py-2.5 rounded-none border border-white/12 text-white/55 text-xs hover:bg-white/6 hover:text-white transition"
            >Abbrechen</button>
            <button
              @click="confirmSync"
              class="flex-1 py-2.5 rounded-none bg-[var(--sys-violet)] text-white text-xs font-medium hover:opacity-90 active:scale-[0.97] transition"
            >Jetzt syncen</button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Kontext-Menü (Teleport, fixed, escapes overflow:hidden) ──────────── -->
  <Teleport to="body">
    <div v-if="openMenuKey"
      class="fixed z-[200] w-48 rounded-none border border-white/12 bg-[var(--sys-bg-elevated)] shadow-2xl py-1"
      :style="{ top: menuPos.top + 'px', right: menuPos.right + 'px' }"
      @click.stop
    >
      <template v-if="menuCtx.tab === 'local'">
        <button v-if="menuCtx.type === 'audio' || menuCtx.type === 'video'"
          @click="onPlayLocal(menuCtx.type, menuCtx.name); closeMenu()"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-white/70 hover:bg-white/8 hover:text-white transition"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          {{ playerName === menuCtx.name && playerTab === 'local' ? 'Stop' : 'Abspielen' }}
        </button>
        <button v-if="soulCert"
          @click="uploadToServer(menuCtx.type, menuCtx.name); closeMenu()"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-white/70 hover:bg-white/8 hover:text-white transition"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"/>
          </svg>
          Auf Server hochladen
        </button>
        <div class="my-1 border-t border-white/8"/>
        <button
          @click="deleteLocalFileEntry(menuCtx.name); closeMenu()"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-red-400/80 hover:bg-red-950/30 hover:text-red-400 transition"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
          </svg>
          Lokal löschen
        </button>
      </template>
      <template v-else-if="menuCtx.tab === 'server'">
        <button v-if="menuCtx.type === 'audio' || menuCtx.type === 'video'"
          @click="onPlayServer(menuCtx.type, menuCtx.name); closeMenu()"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-white/70 hover:bg-white/8 hover:text-white transition"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          {{ playerName === menuCtx.name && playerTab === 'server' ? 'Stop' : 'Abspielen' }}
        </button>
        <button v-if="vaultConnected"
          @click="downloadToLocal(menuCtx.type, menuCtx.name); closeMenu()"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-white/70 hover:bg-white/8 hover:text-white transition"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 3v13.5m0 0-4.5-4.5M12 16.5l4.5-4.5"/>
          </svg>
          Lokal speichern
        </button>
        <button v-if="PROFILE_TYPE_MAP[menuCtx.type]"
          @click="onCreateProfile(menuCtx.type, menuCtx.name); closeMenu()"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-white/70 hover:bg-white/8 hover:text-white transition"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/>
          </svg>
          {{ PROFILE_LABELS[PROFILE_TYPE_MAP[menuCtx.type]] }} erstellen
        </button>
        <div class="my-1 border-t border-white/8"/>
        <button
          @click="onDeleteServer(menuCtx.type, menuCtx.name); closeMenu()"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-red-400/80 hover:bg-red-950/30 hover:text-red-400 transition"
        >
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"/>
          </svg>
          Vom Server löschen
        </button>
      </template>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from "vue";
import { useVault } from "~/composables/useVault.js";
import { useApiContext } from "~/composables/useApiContext.js";
import { useVaultSession } from "~/composables/useVaultSession.js";

const props = defineProps({
  soulCert:    { type: String, default: "" },
  soulContent: { type: String, default: "" },
});
const emit = defineEmits(["encrypt", "logout-required"]);

const TABS = [{ id: "local", label: "Lokal" }, { id: "server", label: "Server" }, { id: "network", label: "Netzwerk" }];
const TYPE_LABELS = { audio: "Audio", video: "Video", images: "Bilder", context: "Kontext", profiles: "KI-Profile" };
const MEDIA_EXTS  = /\.(mp3|wav|ogg|m4a|flac|aac|webm|mp4|mov|avi|mkv|jpg|jpeg|png|webp|gif|avif|md|txt|pdf)$/i;
const SKIP_FILES  = /^(voice_profile\.json|motion_profile\.json)$/i;

const {
  isConnected: vaultConnected, memoryMode, cloudSource, writeFile, readVaultFile, deleteLocalFile, scanVault: scanLocalVault,
  allFiles
} = useVault();

const {
  loaded, localFiles, syncedFiles, activeFiles,
  loadContext, fetchVpsVaultFiles, setActive, scanVault: scanApiVault,
  syncFile, syncAll, isSyncing, syncError, deleteVaultFile,
  publicShare, publicSyncing, publicSyncError,
  loadPublicShare, savePublicShare, syncPublicFiles,
  resetContext, sessionExpired,
  baseUrl
} = useApiContext();

const { vaultKey } = useVaultSession();

const tab          = ref("local");
const isScanning   = ref(false);
const serverLoading = ref(false);
const settingActive = ref(false);
const localBusy    = reactive({});  // { [name]: "up" }
const serverBusy   = reactive({});  // { [name]: "down" | "del" }
const errorMsg     = ref("");
const successMsg   = ref("");

// ── Selektion & Kontextmenü ─────────────────────────────────────────────────
const selectedLocal  = ref(new Set());
const selectedServer = ref(new Set());
const openMenuKey    = ref(null);              // "type::name"
const menuPos        = reactive({ top: 0, right: 0 });
const menuCtx        = reactive({ tab: "", type: "", name: "" });

function toggleSelect(tabId, name) {
  const s = tabId === "local" ? selectedLocal : selectedServer;
  const set = new Set(s.value);
  if (set.has(name)) set.delete(name); else set.add(name);
  s.value = set;
}

function toggleSelectAll(tabId, type, files) {
  const s = tabId === "local" ? selectedLocal : selectedServer;
  const set = new Set(s.value);
  const allSelected = files.every(n => set.has(n));
  for (const n of files) { if (allSelected) set.delete(n); else set.add(n); }
  s.value = set;
}

function clearSelection(tabId) {
  if (tabId === "local") selectedLocal.value = new Set();
  else selectedServer.value = new Set();
}

function openContextMenu(tabId, type, name, event) {
  const key = `${type}::${name}`;
  if (openMenuKey.value === key) { openMenuKey.value = null; return; }
  const rect = event.currentTarget.getBoundingClientRect();
  menuPos.top   = rect.bottom + 4;
  menuPos.right = window.innerWidth - rect.right;
  menuCtx.tab  = tabId;
  menuCtx.type = type;
  menuCtx.name = name;
  openMenuKey.value = key;
}

function closeMenu() { openMenuKey.value = null; }

function isMenuOpen(type, name) { return openMenuKey.value === `${type}::${name}`; }

async function uploadSelectedLocal() {
  if (!props.soulCert) return;
  const names = [...selectedLocal.value];
  let ok = 0, fail = 0;
  for (const name of names) {
    for (const [type, files] of Object.entries(localArchive.value)) {
      if (files.includes(name)) {
        localBusy[name] = "up";
        try {
          const file = await readVaultFile(name);
          if (!file) { fail++; continue; }
          const key        = vaultKey.value === "__encrypted__" ? "" : (vaultKey.value || "");
          const serverType = type === "images" ? "image" : type;
          const res = await syncFile(props.soulCert, serverType, name, file, key);
          if (res.ok) ok++; else fail++;
        } catch { fail++; }
        finally { delete localBusy[name]; }
        break;
      }
    }
  }
  await loadContext(props.soulCert);
  selectedLocal.value = new Set();
  if (fail === 0) showSuccess(`${ok} Datei${ok !== 1 ? "en" : ""} hochgeladen ✓`);
  else if (ok === 0) showError(`Upload fehlgeschlagen (${fail} Fehler)`);
  else showError(`${ok} hochgeladen, ${fail} fehlgeschlagen`);
}

async function deleteSelectedLocal() {
  const names = [...selectedLocal.value];
  selectedLocal.value = new Set();
  let ok = 0, fail = 0;
  for (const name of names) {
    localBusy[name] = "del";
    const result = await deleteLocalFile(name);
    if (result) { ok++; if (playerName.value === name && playerTab.value === "local") closePlayer(); }
    else fail++;
    delete localBusy[name];
  }
  await scanLocalVault();
  await scanApiVault();
  if (fail === 0) showSuccess(`${ok} Datei${ok !== 1 ? "en" : ""} gelöscht ✓`);
  else if (ok === 0) showError(`Löschen fehlgeschlagen (${fail} Fehler)`);
  else showError(`${ok} gelöscht, ${fail} fehlgeschlagen`);
}

async function downloadSelectedServer() {
  if (!vaultConnected.value) return;
  const names = [...selectedServer.value];
  let ok = 0, fail = 0;
  for (const name of names) {
    for (const [type, files] of Object.entries(serverArchive.value)) {
      if (files.includes(name)) {
        serverBusy[name] = "down";
        try {
          const res = await fetch(`/api/vault/${encodeURIComponent(type)}/${encodeURIComponent(name)}`, { headers: authH.value });
          if (!res.ok) { fail++; continue; }
          const buf = await res.arrayBuffer();
          const saved = await writeFile(name, buf);
          if (saved) ok++;
          else { triggerBlobDownload(buf, name); ok++; }
        } catch { fail++; }
        finally { delete serverBusy[name]; }
        break;
      }
    }
  }
  await loadContext(props.soulCert);
  selectedServer.value = new Set();
  if (fail === 0) showSuccess(`${ok} Datei${ok !== 1 ? "en" : ""} lokal gespeichert ✓`);
  else if (ok === 0) showError(`Download fehlgeschlagen (${fail} Fehler)`);
  else showError(`${ok} gespeichert, ${fail} fehlgeschlagen`);
}

async function deleteSelectedServer() {
  const names = [...selectedServer.value];
  selectedServer.value = new Set();
  let ok = 0, fail = 0;
  for (const name of names) {
    for (const [type, files] of Object.entries(serverArchive.value)) {
      if (files.includes(name)) {
        serverBusy[name] = "del";
        const result = await deleteVaultFile(props.soulCert, type, name);
        if (result) { ok++; if (playerName.value === name) closePlayer(); }
        else fail++;
        delete serverBusy[name];
        break;
      }
    }
  }
  if (fail === 0) showSuccess(`${ok} Datei${ok !== 1 ? "en" : ""} vom Server gelöscht ✓`);
  else if (ok === 0) showError(`Löschen fehlgeschlagen (${fail} Fehler)`);
  else showError(`${ok} gelöscht, ${fail} fehlgeschlagen`);
}

// Public Vault / Netzwerk
const publicOpen    = ref(false);
const publicPickerOpen = ref(false);
const publicSaving  = ref(false);
const publicSyncOk  = ref(false);
const networkBusy   = reactive({});

// Inline-Player
const playerSrc  = ref("");
const playerTab  = ref("");    // "local" | "server"
const playerName = ref("");
const playerKind = ref("audio");
let   playerBlobUrl = "";

const soulId = computed(() => props.soulCert?.split(".")?.[0] ?? "");
const authH  = computed(() => ({ Authorization: `Bearer ${props.soulCert}` }));

// ── Cert-Rotation ───────────────────────────────────────────────────────────

const { rotateCert, soulContent: composableSoulContent, pendingSoulFileWrite } = useSoul();
const rotateBusy = ref(false);

async function handleRotateCert() {
  if (rotateBusy.value) return;
  rotateBusy.value = true;
  try {
    const result = await rotateCert();
    if (!result) {
      showError("Cert-Rotation fehlgeschlagen");
      return;
    }

    // Physische Datei im Vault-Ordner überschreiben — composableSoulContent.value
    // statt props.soulContent nutzen: props kann durch Vue-Render-Batching noch
    // den alten Wert haben während die Singleton-Ref bereits aktuell ist.
    if (vaultConnected.value && composableSoulContent.value) {
      const fileName = localSoulFileName.value;
      await writeFile(fileName, new TextEncoder().encode(composableSoulContent.value));
    }

    showSuccess(`Cert rotiert ✓  (Version ${result.cert_version})`);
  } finally {
    rotateBusy.value = false;
  }
}

// ── Datei-Filter für Archiv-Anzeige ────────────────────────────────────────

// Identity-Datei: per kind filtern, nicht per Name
const localSoulFileName = computed(() => {
  const soulFile = allFiles.value.find(f => f.kind === "soul");
  return soulFile ? soulFile.name : "sys.md";
});

function keep(name) {
  // Identity-Datei (beliebiger *.md Name) nie im Archiv zeigen
  if (allFiles.value.some(f => f.kind === "soul" && f.name === name)) return false;
  return MEDIA_EXTS.test(name) && !SKIP_FILES.test(name);
}

const localArchive = computed(() => {
  const result = {};
  for (const type of ["audio", "video", "images", "context"]) {
    const files = (localFiles.value[type] || []).filter(keep);
    if (files.length) result[type] = files;
  }
  // Profile: kein keep-Filter (keine Dateiendung)
  const profiles = (localFiles.value.profiles || []).filter(p => typeof p === "string" && p.length > 0);
  if (profiles.length) result.profiles = profiles;
  return result;
});

const serverArchive = computed(() => {
  const result = {};
  for (const type of ["audio", "video", "images", "context"]) {
    const files = (syncedFiles.value[type] || []).filter(keep);
    if (files.length) result[type] = files;
  }
  // Profile haben keine Dateiendung – keep-Filter überspringen
  const profiles = (syncedFiles.value.profiles || []).filter(p => typeof p === 'string' && p.length > 0);
  if (profiles.length) result.profiles = profiles;
  return result;
});

const hasLocalFiles  = computed(() => Object.keys(localArchive.value).length > 0);
const hasServerFiles = computed(() => Object.keys(serverArchive.value).length > 0);

const networkArchive = computed(() => {
  const result = {};
  for (const type of ["audio", "video", "images", "context"]) {
    const files = publicShare.value.public_files
      .map(pf => pfName(pf))
      .filter(name => {
        const t = typeFromName(name);
        const key = t === "image" ? "images" : (t || "context");
        return key === type;
      });
    if (files.length) result[type] = files;
  }
  return result;
});

// Alle Server-Dateien als flache Liste mit type (für Public-Picker)
const allServerFiles = computed(() => {
  const result = [];
  for (const [type, files] of Object.entries(serverArchive.value)) {
    for (const name of files) result.push({ name, type });
  }
  return result;
});

const serverFilesNotPublic = computed(() => {
  const already    = new Set(publicShare.value.public_files.map(pf => pfName(pf)));
  const serverList = allServerFiles.value.filter(f => !already.has(f.name));
  // Lokale Dateien die weder bereits public noch auf dem Server sind
  const serverNames = new Set(allServerFiles.value.map(f => f.name));
  const localList   = [];
  for (const [type, files] of Object.entries(localArchive.value)) {
    for (const name of files) {
      if (!already.has(name) && !serverNames.has(name)) {
        localList.push({ name, type });
      }
    }
  }
  return [...serverList, ...localList];
});

// ── Helpers ────────────────────────────────────────────────────────────────

function pfName(pf)   { return typeof pf === "string" ? pf : pf.name; }
function pfCipher(pf) { return typeof pf === "object" ? (pf.cipher || "open") : "open"; }
function isSafePublicFilename(name) { return /^[a-zA-Z0-9._-]+$/.test(name) && name.length <= 120; }

function typeFromName(name) {
  const lower = name.toLowerCase();
  if (/\.(mp3|wav|ogg|webm|m4a|opus|flac|aac)$/.test(lower)) return "audio";
  if (/\.(mp4|mov|avi|mkv)$/.test(lower))                     return "video";
  if (/\.(jpe?g|png|webp|gif|avif)$/.test(lower))             return "image";
  if (/\.(md|txt|pdf)$/.test(lower))                           return "context";
  return null;
}

function showError(msg, ms = 4000) {
  successMsg.value = "";
  errorMsg.value = msg;
  setTimeout(() => { if (errorMsg.value === msg) errorMsg.value = ""; }, ms);
}

function showSuccess(msg, ms = 2500) {
  errorMsg.value = "";
  successMsg.value = msg;
  setTimeout(() => { if (successMsg.value === msg) successMsg.value = ""; }, ms);
}

// ── Profil-Analyse ─────────────────────────────────────────────────────────

const PROFILE_TYPE_MAP = { images: 'face', audio: 'voice', video: 'motion' };
const PROFILE_LABELS   = { face: 'Gesichtsprofil', voice: 'Stimmprofil', motion: 'Bewegungsprofil' };

async function onCreateProfile(fileType, filename) {
  const ptype = PROFILE_TYPE_MAP[fileType];
  if (!ptype || !props.soulCert) return;

  serverBusy[filename] = 'profile';

  try {
    const res = await fetch(`${baseUrl}/api/vault/profile/analyze`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${props.soulCert}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ type: ptype, filename, file_type: fileType }),
    });
    const data = await res.json();

    if (data.manual) {
      // Audio/Video: Anleitung anzeigen
      showError(data.hint || `${PROFILE_LABELS[ptype]} über Claude MCP erstellen.`, 6000);
    } else if (data.ok) {
      showSuccess(`${PROFILE_LABELS[ptype]} erstellt ✓`);
    } else {
      showError(data.error || 'Analyse fehlgeschlagen');
    }
  } catch (e) {
    showError('Analyse-Fehler: ' + e.message);
  } finally {
    delete serverBusy[filename];
  }
}

function isActive(type, name) {
  const a = activeFiles.value[type];
  return Array.isArray(a) ? a.includes(name) : a === name;
}

// ── Tab wechseln ───────────────────────────────────────────────────────────

function switchTab(id) {
  tab.value = id;
  closePlayer();
  if (id === "server" && !loaded.value && props.soulCert) {
    serverLoading.value = true;
  }
}

// ── Refresh ────────────────────────────────────────────────────────────────

async function onRefresh() {
  isScanning.value = true;
  if (props.soulCert) {
    await loadContext(props.soulCert);
    await loadPublicShare(props.soulCert);
  } else {
    await scanApiVault();
  }
  isScanning.value = false;
  showSuccess("Aktualisiert ✓");
}

// ── Alle hochladen ─────────────────────────────────────────────────────────

async function onSyncAll() {
  if (!props.soulCert || isSyncing.value) return;
  // Kein Schlüssel im Speicher → Vault muss zuerst geöffnet werden
  if (!vaultKey.value || vaultKey.value === "__encrypted__") {
    showError("Vault ist gesperrt oder Schlüssel fehlt. Bitte zuerst den Vault öffnen (Vault-Zugang → entsperren).");
    return;
  }
  await syncAll(props.soulCert, composableSoulContent.value || props.soulContent, vaultKey.value || "");
  if (syncError.value) showError(syncError.value);
  else showSuccess("sys.md + Vault-Dateien auf Server hochgeladen ✓");
}

// ── Aktiv setzen ───────────────────────────────────────────────────────────

async function onSetActive(type, name) {
  if (!props.soulCert || settingActive.value || type === 'profiles') return;
  settingActive.value = true;
  await setActive(props.soulCert, type, name);
  settingActive.value = false;
}

const fileInputRef   = ref(null);
const syncModalOpen  = ref(false);

function openSyncModal() {
  if (!props.soulCert || isSyncing.value) return;
  syncModalOpen.value = true;
}

async function confirmSync() {
  syncModalOpen.value = false;
  await onSyncAll();
}

// ── Lokal: Dateien importieren (Mehrfachauswahl) ──────────────────────────

async function addLocalFiles(event) {
  const files = [...(event.target.files || [])];
  if (!files.length || !vaultConnected.value) return;
  event.target.value = "";
  let ok = 0, fail = 0;
  for (const file of files) {
    const buf    = await file.arrayBuffer();
    const result = await writeFile(file.name, buf);
    if (result) ok++; else fail++;
  }
  await scanLocalVault();
  await scanApiVault();
  if (fail === 0) showSuccess(`${ok} Datei${ok !== 1 ? "en" : ""} importiert ✓`);
  else if (ok === 0) showError(`Import fehlgeschlagen (${fail} Fehler)`);
  else showError(`${ok} importiert, ${fail} fehlgeschlagen`);
}

// ── Lokal: Datei löschen ───────────────────────────────────────────────────

async function deleteLocalFileEntry(name) {
  if (localBusy[name]) return;
  localBusy[name] = "del";
  const ok = await deleteLocalFile(name);
  if (ok) {
    await scanLocalVault();
    await scanApiVault();
    if (playerName.value === name && playerTab.value === "local") closePlayer();
    showSuccess(`${name} gelöscht ✓`);
  } else {
    showError("Lokales Löschen fehlgeschlagen");
  }
  delete localBusy[name];
}

// ── Lokal → Server hochladen ───────────────────────────────────────────────

async function uploadToServer(type, name) {
  if (!props.soulCert) return;
  localBusy[name] = "up";
  try {
    const file = await readVaultFile(name);
    if (!file) { showError("Datei nicht lesbar"); return; }
    const key        = vaultKey.value === "__encrypted__" ? "" : (vaultKey.value || "");
    const serverType = type === "images" ? "image" : type;
    const res = await syncFile(props.soulCert, serverType, name, file, key);
    if (res.ok) {
      await loadContext(props.soulCert);
      showSuccess(`${name} hochgeladen ✓`);
    } else {
      showError(res.error || "Upload fehlgeschlagen");
    }
  } catch { showError("Upload fehlgeschlagen"); }
  finally { delete localBusy[name]; }
}

// ── Server → Lokal herunterladen ────────────────────────────────────────────

async function downloadToLocal(type, name) {
  if (!vaultConnected.value) return;
  serverBusy[name] = "down";
  try {
    // Profile haben einen eigenen Endpunkt
    const url = type === 'profiles'
      ? `/api/vault/profile/${encodeURIComponent(name)}`
      : `/api/vault/${encodeURIComponent(type)}/${encodeURIComponent(name)}`;
    const res = await fetch(url, { headers: authH.value });
    if (!res.ok) { showError("Download fehlgeschlagen"); return; }
    const buf = await res.arrayBuffer();
    // Profile lokal als profile/{name}.json ablegen (Unterordner + Extension)
    const localPath = type === 'profiles' ? `profile/${name}.json` : name;
    const ok  = await writeFile(localPath, buf);
    if (ok) { await loadContext(props.soulCert); showSuccess(`${name} lokal gespeichert ✓`); }
    else {
      // Fallback: Browser-Download (Mobile / kein Vault geöffnet)
      triggerBlobDownload(buf, name);
    }
  } catch { showError("Download fehlgeschlagen"); }
  finally { delete serverBusy[name]; }
}

function triggerBlobDownload(buf, name) {
  const blob = new Blob([buf]);
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
}

// ── sys.md Download ──────────────────────────────────────────────────────

function downloadSoulLocal() {
  const content = composableSoulContent.value || props.soulContent;
  if (!content) return;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = localSoulFileName.value;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

const soulServerDownloading = ref(false);

async function downloadSoulServer() {
  if (!props.soulCert || soulServerDownloading.value) return;
  soulServerDownloading.value = true;
  try {
    const res = await fetch("/api/soul", { headers: authH.value });
    if (!res.ok) { showError("Server-Download fehlgeschlagen"); return; }
    const text = await res.text();
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "sys.md";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  } catch { showError("Server-Download fehlgeschlagen"); }
  finally { soulServerDownloading.value = false; }
}

// ── Server: Datei löschen ──────────────────────────────────────────────────

async function onDeleteServer(type, name) {
  if (!props.soulCert) return;
  serverBusy[name] = "del";
  const ok = await deleteVaultFile(props.soulCert, type, name);
  if (ok) showSuccess(`${name} vom Server gelöscht ✓`);
  else showError("Löschen fehlgeschlagen");
  if (playerName.value === name) closePlayer();
  delete serverBusy[name];
}

// ── Inline-Player ─────────────────────────────────────────────────────────

function closePlayer() {
  playerSrc.value = "";
  if (playerBlobUrl) { URL.revokeObjectURL(playerBlobUrl); playerBlobUrl = ""; }
  playerName.value = "";
}

async function onPlayLocal(type, name) {
  if (playerName.value === name && playerTab.value === "local") { closePlayer(); return; }
  closePlayer();
  const file = await readVaultFile(name);
  if (!file) { showError("Datei nicht lesbar"); return; }
  playerBlobUrl = URL.createObjectURL(file);
  playerKind.value = type === "video" ? "video" : "audio";
  playerTab.value  = "local";
  playerName.value = name;
  playerSrc.value  = playerBlobUrl;
}

async function onPlayServer(type, name) {
  if (playerName.value === name && playerTab.value === "server") { closePlayer(); return; }
  closePlayer();
  try {
    const res = await fetch(`/api/vault/${encodeURIComponent(type)}/${encodeURIComponent(name)}`, { headers: authH.value });
    if (!res.ok) { showError("Datei nicht abspielbar"); return; }
    const blob = await res.blob();
    playerBlobUrl = URL.createObjectURL(blob);
    playerKind.value = type === "video" ? "video" : "audio";
    playerTab.value  = "server";
    playerName.value = name;
    playerSrc.value  = playerBlobUrl;
  } catch { showError("Abspielen fehlgeschlagen"); }
}

onMounted(() => document.addEventListener("click", closeMenu));
onUnmounted(() => { closePlayer(); document.removeEventListener("click", closeMenu); });

// ── Public Vault ───────────────────────────────────────────────────────────

async function addPublicFile(name) {
  publicShare.value.public_files.push({ name, cipher: "open" });
  publicPickerOpen.value = false;
  await onUploadNetworkFile(name);
}

function removePublicFileLocal(idx) {
  publicShare.value.public_files.splice(idx, 1);
}

function setPfCipher(idx, cipher) {
  const pf = publicShare.value.public_files[idx];
  publicShare.value.public_files[idx] = { name: pfName(pf), cipher };
}

async function onSyncPublic() {
  if (!props.soulCert) return;
  if (!vaultKey.value || vaultKey.value === "__encrypted__") {
    publicSyncError.value = "Vault ist gesperrt oder Schlüssel fehlt. Bitte zuerst den Vault öffnen (Vault-Zugang → entsperren).";
    return;
  }
  publicSyncOk.value = false;
  publicSaving.value = true;
  const saved = await savePublicShare(props.soulCert);
  publicSaving.value = false;
  if (!saved) { publicSyncError.value = "Konfiguration konnte nicht gespeichert werden."; return; }
  await syncPublicFiles(props.soulCert, vaultKey.value || "");
  if (!publicSyncError.value) {
    publicSyncOk.value = true;
    setTimeout(() => { publicSyncOk.value = false; }, 3000);
  }
}

async function onUploadNetworkFile(name) {
  if (!props.soulCert) return;
  networkBusy[name] = "up";
  publicSyncOk.value = false;
  publicSaving.value = true;
  const saved = await savePublicShare(props.soulCert);
  publicSaving.value = false;
  if (!saved) {
    publicSyncError.value = "Konfiguration konnte nicht gespeichert werden.";
    const rollbackIdx = publicShare.value.public_files.findIndex(pf => pfName(pf) === name);
    if (rollbackIdx !== -1) publicShare.value.public_files.splice(rollbackIdx, 1);
    delete networkBusy[name]; return;
  }
  await syncPublicFiles(props.soulCert, vaultKey.value || "");
  delete networkBusy[name];
  if (publicSyncError.value) {
    const rollbackIdx = publicShare.value.public_files.findIndex(pf => pfName(pf) === name);
    if (rollbackIdx !== -1) publicShare.value.public_files.splice(rollbackIdx, 1);
    await savePublicShare(props.soulCert);
  } else {
    showSuccess(`${name} hochgeladen ✓`);
    publicSyncOk.value = true;
    setTimeout(() => { publicSyncOk.value = false; }, 3000);
  }
}

async function onDeleteNetworkFile(name) {
  if (!props.soulCert) return;
  networkBusy[name] = "del";
  const idx = publicShare.value.public_files.findIndex(pf => pfName(pf) === name);
  if (idx !== -1) publicShare.value.public_files.splice(idx, 1);
  await savePublicShare(props.soulCert);
  delete networkBusy[name];
  showSuccess(`${name} aus Netzwerk entfernt ✓`);
}

// ── Cloud-Vault löschen ────────────────────────────────────────────────────

const deleteVaultLoading = ref(false);
const confirmDeleteOpen  = ref(false);

async function handleDeleteVault() {
  deleteVaultLoading.value = true;
  try {
    const res = await fetch("/api/vault", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${props.soulCert}` },
    });
    if (!res.ok) throw new Error(await res.text());
    confirmDeleteOpen.value = false;
    // Vault inkl. api_context.json gelöscht → Session ist ungültig.
    // sessionExpired auslösen → index.vue zeigt Logout-Modal.
    resetContext();
    sessionExpired.value = true;
  } catch (e) {
    showError("Fehler beim Löschen: " + e.message);
  } finally {
    deleteVaultLoading.value = false;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

watch(() => props.soulCert, async (cert) => {
  if (!cert || cert === "anonymous") return;
  serverLoading.value = true;
  const status = await loadContext(cert);
  if (status === "auth_failed") {
    // sessionExpired wurde in loadContext gesetzt → index.vue's watcher ruft switchSoul().
    serverLoading.value = false;
    return;
  }
  await loadPublicShare(cert);
  serverLoading.value = false;
}, { immediate: true });

// Vault verbunden → Server-Vault scannen + ggf. ausstehenden cert-Write nachholen
// pendingSoulFileWrite: von resetCertToV0 gesetzt (aus handleSoulUploaded nach Login)
watch(vaultConnected, async (connected) => {
  if (connected) {
    await scanApiVault();
    if (pendingSoulFileWrite.value && localSoulFileName.value) {
      await writeFile(localSoulFileName.value, new TextEncoder().encode(composableSoulContent.value));
      pendingSoulFileWrite.value = false;
    }
  }
}, { immediate: true });

watch(loaded, (val) => {
  if (val) serverLoading.value = false;
});

</script>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s, transform 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(-6px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.vault-toast-enter-active, .vault-toast-leave-active { transition: opacity 0.25s, transform 0.25s; }
.vault-toast-enter-from, .vault-toast-leave-to { opacity: 0; transform: translate(-50%, 12px); }
</style>
