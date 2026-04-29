// app/composables/useVault.js
// File System Access API – Vault-Ordner für Langzeit-Gedächtnis
// IndexedDB speichert den Verzeichnis-Handle zwischen Sessions

import { ref, computed } from "vue";

const DB_NAME    = "sys.vault";
const DB_VERSION = 1;
const STORE_NAME = "handles";

// Bildformate die als Vault-Bilder erfasst werden
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

// ── DOCX-Text-Extraktor (browsernativer ZIP + XML Parser) ─────────────────
// Vision-Preprocessing: max. Kantenlänge und JPEG-Qualität
// 512px = 1 Anthropic-Kachel = ~1.750 Tokens (Minimum)
const VISION_MAX_PX  = 512;
const VISION_QUALITY = 0.82;

// Singleton-State
const dirHandle    = ref(null);
const profileUrl   = ref(null);   // Blob-URL für Anzeige im UI
const profileBase64 = ref(null);  // Preprocesstes JPEG base64 für Vision-API
const contextFiles = ref([]);     // [{ name, text }] – Textdateien für System-Prompt
const allFiles     = ref([]);     // [{ name, kind: 'profile'|'text'|'image' }] – alle Dateien
const vaultSoulId  = ref(null);

// Memory-Vault-State (Cloud-Modus – kein lokaler Ordner erforderlich)
const memoryMode  = ref(false);
const memoryFiles = ref(new Map());  // Map<string (path), ArrayBuffer>
const cloudSource = ref("");         // Gespeicherte Cloud-URL (für Re-Export-Hinweis)

export function useVault() {
  const isClient = typeof window !== "undefined";
  const isSupported = computed(() => isClient && "showDirectoryPicker" in window);

  // ── Vision-Preprocessing ──────────────────────────────────────────────────

  /**
   * Skaliert ein Bild auf max. VISION_MAX_PX und konvertiert es zu JPEG base64.
   * Ergebnis: reiner base64-String (ohne data:-Prefix) für die Anthropic Vision API.
   * 1 Kachel (512×512) = ~1.750 Tokens – deutlich günstiger als Originalgröße.
   */
  function preprocessImageForVision(file) {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, VISION_MAX_PX / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(objectUrl);
        const dataUrl = canvas.toDataURL("image/jpeg", VISION_QUALITY);
        resolve(dataUrl.split(",")[1] ?? null); // nur Base64-Teil
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
      img.src = objectUrl;
    });
  }

  // ── IndexedDB ─────────────────────────────────────────────────────────────

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
      req.onsuccess      = (e) => resolve(e.target.result);
      req.onerror        = ()  => reject(req.error);
    });
  }

  async function saveHandle(soulId, handle) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, soulId);
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch (e) { console.error("[useVault] saveHandle:", e); }
  }

  async function loadHandle(soulId) {
    try {
      const db  = await openDb();
      const tx  = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(soulId);
      return await new Promise((res, rej) => {
        req.onsuccess = () => res(req.result ?? null);
        req.onerror   = () => rej(req.error);
      });
    } catch { return null; }
  }

  async function deleteHandle(soulId) {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(soulId);
    } catch { /* */ }
  }

  // ── Vault-Scan ────────────────────────────────────────────────────────────

  async function scanVault() {
    // ── Memory-Modus ──────────────────────────────────────────────────────
    if (memoryMode.value) {
      const texts = [];
      const files = [];
      if (profileUrl.value?.startsWith("blob:")) URL.revokeObjectURL(profileUrl.value);
      profileUrl.value    = null;
      profileBase64.value = null;

      for (const [name, buffer] of memoryFiles.value.entries()) {
        const basename = name.toLowerCase().split("/").pop() ?? "";
        const ext      = basename.split(".").pop() ?? "";
        const prefix   = name.includes("/") ? name.split("/").slice(0, -1).join("/") : "";

        if (basename === "profile.jpg" || basename === "profile.png" || basename === "profile.webp") {
          try {
            const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
            const blob = new Blob([buffer], { type: mime });
            profileUrl.value    = URL.createObjectURL(blob);
            profileBase64.value = await preprocessImageForVision(new File([blob], basename));
            files.push({ name, kind: "profile" });
          } catch { }
          continue;
        }
        if (/^profile_\d+\.(jpg|jpeg|png|webp)$/.test(basename) && !prefix) {
          files.push({ name, kind: "profile-archive" }); continue;
        }
        // KI-Profile: alle Dateien in profile/ (auch ohne .json-Endung)
        if (prefix === "profile") {
          try {
            const text = new TextDecoder().decode(buffer);
            if (text.trim()) { texts.push({ name, text }); files.push({ name, kind: "profile-json" }); }
          } catch { }
          continue;
        }
        if (basename.endsWith(".md") || basename.endsWith(".txt")) {
          try {
            const text = new TextDecoder().decode(buffer);
            if (text.trim()) { texts.push({ name, text }); files.push({ name, kind: "text" }); }
          } catch { }
          continue;
        }
        if (IMAGE_EXTS.includes(ext)) { files.push({ name, kind: "image" }); continue; }
        if (ext && !["json", "html", "css", "js"].includes(ext)) {
          files.push({ name, kind: ext });
        }
      }
      contextFiles.value = texts;
      allFiles.value     = files;
      return;
    }

    if (!dirHandle.value) return;

    const texts = [];
    const files = [];

    if (profileUrl.value?.startsWith("blob:")) URL.revokeObjectURL(profileUrl.value);
    profileUrl.value    = null;
    profileBase64.value = null;

    // Hilfsfunktion: rekursiv alle Dateien eines Directory-Handles einlesen
    async function scanDir(handle, prefix) {
      try {
        for await (const [name, entry] of handle.entries()) {
          const path  = prefix ? `${prefix}/${name}` : name;
          const lower = name.toLowerCase();
          const ext   = lower.split(".").pop() ?? "";

          if (entry.kind === "directory") {
            await scanDir(entry, path);
            continue;
          }

          // Profilbild (root-level, exakter Name)
          if (!prefix && (lower === "profile.jpg" || lower === "profile.png" || lower === "profile.webp")) {
            try {
              const f = await entry.getFile();
              profileUrl.value    = URL.createObjectURL(f);
              profileBase64.value = await preprocessImageForVision(f);
              files.push({ name: path, kind: "profile" });
            } catch { /* */ }
            continue;
          }

          // Archivierte Profilbilder (root-level)
          if (!prefix && /^profile_\d+\.(jpg|jpeg|png|webp)$/.test(lower)) {
            files.push({ name: path, kind: "profile-archive" });
            continue;
          }

          // KI-Profile: alle Dateien in profile/ (auch ohne .json-Endung)
          if (prefix === "profile") {
            try {
              const f    = await entry.getFile();
              const text = await f.text();
              if (text.trim()) {
                texts.push({ name: path, text });
                files.push({ name: path, kind: "profile-json" });
              }
            } catch { /* */ }
            continue;
          }

          // Kontext-Textdateien (.md, .txt) – root + context/
          // .md-Dateien im Root: per Inhalt prüfen ob Identity-Datei (SYS-Frontmatter)
          if (lower.endsWith(".md") || lower.endsWith(".txt")) {
            try {
              const f    = await entry.getFile();
              const text = await f.text();
              if (text.trim()) {
                // Identity-Datei erkennen: muss soul_id und soul_cert im Frontmatter haben
                const isSoulFile = !prefix && lower.endsWith(".md")
                  && /^---[\s\S]*?soul_id:\s*\S+[\s\S]*?soul_cert:\s*[a-f0-9]{20,}[\s\S]*?---/m.test(text);
                if (isSoulFile) {
                  files.push({ name: path, kind: "soul", soulName: name });
                } else {
                  texts.push({ name: path, text });
                  files.push({ name: path, kind: "text" });
                }
              }
            } catch { /* */ }
            continue;
          }

          // Bilddateien
          if (IMAGE_EXTS.includes(ext)) {
            files.push({ name: path, kind: "image" });
            continue;
          }

          // Audio / Video / sonstige Binärdateien – nur in allFiles aufnehmen
          if (ext && !["json", "html", "css", "js"].includes(ext)) {
            files.push({ name: path, kind: ext });
          }
        }
      } catch (e) { console.error("[useVault] scanDir:", prefix, e); }
    }

    try {
      await scanDir(dirHandle.value, "");
    } catch (e) { console.error("[useVesty] scanVault:", e); }

    contextFiles.value = texts;
    allFiles.value     = files;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Legt vollständige Unterordner-Struktur im Vault an (idempotent) */
  async function ensureVaultDirs(handle) {
    for (const dir of ["audio", "video", "images", "context", "profile"]) {
      try { await handle.getDirectoryHandle(dir, { create: true }); } catch { /* */ }
    }
  }

  /** Öffnet den Directory Picker und verbindet den Vault-Ordner */
  async function connectVault(soulId) {
    if (!isSupported.value) return false;
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      dirHandle.value   = handle;
      vaultSoulId.value = soulId;
      await ensureVaultDirs(handle);
      await saveHandle(soulId, handle);
      await scanVault();
      return true;
    } catch (e) {
      if (e.name !== "AbortError") console.error("[useVault] connectVault:", e);
      return false;
    }
  }

  /** Versucht den gespeicherten Handle wiederherzustellen */
  async function restoreVault(soulId) {
    if (!isClient) return false;
    const handle = await loadHandle(soulId);
    if (!handle) return false;
    try {
      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") return false;
      dirHandle.value   = handle;
      vaultSoulId.value = soulId;
      await scanVault();
      return true;
    } catch { return false; }
  }

  /**
   * Schreibt eine beliebige Datei in den Vault (inkl. Unterordner).
   * subpath kann "datei.ext" oder "ordner/datei.ext" sein.
   * @param {string} subpath   z.B. "voice_samples/voice_jan_2026-03-02.webm"
   * @param {Blob|ArrayBuffer|string} data
   */
  async function writeFile(subpath, data) {
    if (memoryMode.value) {
      try {
        let buffer;
        if (data instanceof ArrayBuffer)       buffer = data;
        else if (ArrayBuffer.isView(data))     buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        else if (data instanceof Blob)         buffer = await data.arrayBuffer();
        else if (typeof data === "string")     buffer = new TextEncoder().encode(data).buffer;
        else                                   buffer = data;
        const next = new Map(memoryFiles.value);
        next.set(subpath, buffer);
        memoryFiles.value = next;
        await scanVault();
        return true;
      } catch (e) { console.error("[useVault] writeFile (memory):", e); return false; }
    }
    if (!dirHandle.value) return false;
    try {
      const parts = subpath.split("/");
      let handle = dirHandle.value;
      // Unterordner anlegen falls nötig
      for (let i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i], { create: true });
      }
      const fh = await handle.getFileHandle(parts[parts.length - 1], { create: true });
      const w  = await fh.createWritable();
      await w.write(data);
      await w.close();
      return true;
    } catch (e) { console.error("[useVault] writeFile:", e); return false; }
  }

  /** Schreibt Soul-Inhalt als .md in den Vault-Ordner */
  async function writeSoulMd(content, safeName = "sys") {
    if (memoryMode.value) return writeFile(`${safeName}.md`, content);
    if (!dirHandle.value) return false;
    try {
      const fh = await dirHandle.value.getFileHandle(`${safeName}.md`, { create: true });
      const w  = await fh.createWritable();
      await w.write(content);
      await w.close();
      return true;
    } catch (e) { console.error("[useVault] writeSoulMd:", e); return false; }
  }

  /** Speichert ein Profilbild im Vault-Ordner und preprocesst es für Vision.
   *  Bestehende profile.jpg wird als profile_N.jpg archiviert. */
  async function writeProfileImage(file) {
    if (!dirHandle.value) return false;
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    try {
      // Bestehendes Profilbild archivieren
      const existing = allFiles.value.find(f => f.kind === "profile");
      if (existing) {
        try {
          const existingFh   = await dirHandle.value.getFileHandle(existing.name);
          const existingFile = await existingFh.getFile();
          // Nächste freie Archiv-Nummer finden
          let n = 1;
          while (true) {
            try { await dirHandle.value.getFileHandle(`profile_${n}.jpg`); n++; }
            catch { break; }
          }
          const archiveFh = await dirHandle.value.getFileHandle(`profile_${n}.jpg`, { create: true });
          const aw = await archiveFh.createWritable();
          await aw.write(existingFile);
          await aw.close();
          allFiles.value.push({ name: `profile_${n}.jpg`, kind: "profile-archive" });
        } catch { /* Archivierung fehlgeschlagen → trotzdem weitermachen */ }
      }

      // Neues Profilbild speichern
      const fh = await dirHandle.value.getFileHandle(`profile.${ext}`, { create: true });
      const w  = await fh.createWritable();
      await w.write(file);
      await w.close();
      if (profileUrl.value?.startsWith("blob:")) URL.revokeObjectURL(profileUrl.value);
      profileUrl.value    = URL.createObjectURL(file);
      profileBase64.value = await preprocessImageForVision(file);
      const profileName = `profile.${ext}`;
      allFiles.value = [
        { name: profileName, kind: "profile" },
        ...allFiles.value.filter(f => f.kind !== "profile")
      ];
      return true;
    } catch (e) { console.error("[useVault] writeProfileImage:", e); return false; }
  }

  /** Speichert Profilbild als base64 in sessionStorage (Fallback ohne Vault) */
  async function setProfileLocal(file, soulId) {
    if (!isClient) return;
    const sid = soulId || vaultSoulId.value;
    const key        = sid ? `sys.soul_profile.${sid}`        : "sys.soul_profile";
    const keyVision  = sid ? `sys.soul_profile_vision.${sid}` : "sys.soul_profile_vision";
    // Vollbild für Anzeige
    const reader = new FileReader();
    const fullDataUrl = await new Promise((res) => {
      reader.onload = (e) => res(e.target?.result ?? null);
      reader.readAsDataURL(file);
    });
    if (typeof fullDataUrl === "string") {
      profileUrl.value = fullDataUrl;
      try { sessionStorage.setItem(key, fullDataUrl); } catch { /* */ }
    }
    // Preprocesst für Vision API
    const b64 = await preprocessImageForVision(file);
    if (b64) {
      profileBase64.value = b64;
      try { sessionStorage.setItem(keyVision, b64); } catch { /* */ }
    }
  }

  /** Lädt Profilbild + Vision-Base64 aus sessionStorage */
  function loadProfileLocal(soulId) {
    if (!isClient) return;
    const sid = soulId || vaultSoulId.value;
    const key        = sid ? `sys.soul_profile.${sid}`        : "sys.soul_profile";
    const keyVision  = sid ? `sys.soul_profile_vision.${sid}` : "sys.soul_profile_vision";
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) profileUrl.value = stored;
      const vision = sessionStorage.getItem(keyVision);
      if (vision) profileBase64.value = vision;
    } catch { /* */ }
  }

  /**
   * Liest ALLE Dateien aus dem Vault-Ordner (rekursiv) als ArrayBuffer.
   * Liefert auch Bilder, Audio- und Videoaufnahmen (.webm) – nicht nur Textdateien.
   * @returns {Promise<Array<{ name: string, buffer: ArrayBuffer }>>}
   */
  /** Listet alle Dateipfade rekursiv – ohne Dateiinhalt zu lesen (schnell) */
  async function listVaultPaths() {
    if (!dirHandle.value) return [];
    // Re-request permission (needed on mobile after page reload)
    try {
      const perm = await dirHandle.value.queryPermission({ mode: "read" });
      if (perm !== "granted") {
        const granted = await dirHandle.value.requestPermission({ mode: "read" });
        if (granted !== "granted") return [];
      }
    } catch { /* queryPermission not supported in all browsers */ }
    async function recurse(handle, prefix) {
      const result = [];
      try {
        for await (const [name, entry] of handle.entries()) {
          const path = prefix ? `${prefix}/${name}` : name;
          if (entry.kind === "directory") result.push(...await recurse(entry, path));
          else result.push(path);
        }
      } catch (e) { console.error("[useVault] listVaultPaths:", e); }
      return result;
    }
    return recurse(dirHandle.value, "");
  }

  async function readAllVaultFiles() {
    if (memoryMode.value) {
      return Array.from(memoryFiles.value.entries()).map(([name, buffer]) => ({ name, buffer }));
    }
    if (!dirHandle.value) return [];

    async function recurse(handle, prefix) {
      const result = [];
      try {
        for await (const [name, entry] of handle.entries()) {
          const path = prefix ? `${prefix}/${name}` : name;
          if (entry.kind === "directory") {
            const sub = await recurse(entry, path);
            result.push(...sub);
          } else {
            try {
              const f      = await entry.getFile();
              const buffer = await f.arrayBuffer();
              result.push({ name: path, buffer });
            } catch { /* nicht lesbare Datei überspringen */ }
          }
        }
      } catch (e) { console.error("[useVault] readAllVaultFiles recurse:", e); }
      return result;
    }

    return recurse(dirHandle.value, "");
  }

  /**
   * Sucht eine Datei anhand des Basisnamens rekursiv im Vault und gibt das File-Objekt zurück.
   */
  async function readVaultFile(baseName) {
    if (memoryMode.value) {
      for (const [name, buffer] of memoryFiles.value.entries()) {
        if (name.split("/").pop() === baseName) return new File([buffer], baseName);
      }
      return null;
    }
    if (!dirHandle.value) return null;
    async function find(handle) {
      try {
        for await (const [name, entry] of handle.entries()) {
          if (entry.kind === "directory") {
            const f = await find(entry);
            if (f) return f;
          } else if (name === baseName) {
            return await entry.getFile();
          }
        }
      } catch { /* ignore */ }
      return null;
    }
    return find(dirHandle.value);
  }

  /**
   * Liest eine Bilddatei aus dem Vault-Root und gibt das File-Objekt zurück.
   * Wird für den Vault-Bild-Picker in ChatInterface verwendet.
   */
  /** Liest ein Bild aus dem Vault und gibt preprocesstes JPEG-base64 zurück */
  async function readImageAsBase64(name) {
    const file = await readImageFile(name);
    if (!file) return null;
    return preprocessImageForVision(file);
  }

  async function readImageFile(name) {
    if (!dirHandle.value) return null;
    try {
      const fh   = await dirHandle.value.getFileHandle(name);
      return await fh.getFile();
    } catch { return null; }
  }

  // ── Public-Share-Konfiguration ───────────────────────────────────────────

  /**
   * Liest vault-share.json aus dem Vault-Root.
   * Enthält: public_files, api_grants, soul_grants, enabled
   * @returns {Promise<object|null>}
   */
  async function readShareConfig() {
    if (!dirHandle.value) return null;
    try {
      const fh   = await dirHandle.value.getFileHandle("vault-share.json");
      const file = await fh.getFile();
      const text = await file.text();
      return JSON.parse(text);
    } catch { return null; }
  }

  /**
   * Schreibt vault-share.json in den Vault-Root.
   * @param {object} config
   * @returns {Promise<boolean>}
   */
  async function writeShareConfig(config) {
    if (!dirHandle.value) return false;
    try {
      const fh = await dirHandle.value.getFileHandle("vault-share.json", { create: true });
      const w  = await fh.createWritable();
      await w.write(JSON.stringify(config, null, 2));
      await w.close();
      return true;
    } catch (e) { console.error("[useVault] writeShareConfig:", e); return false; }
  }

  /**
   * Verbindet einen bereits geöffneten Directory-Handle als Vault.
   * Wird nach dem Decrypt-Restore aufgerufen — kein showDirectoryPicker() nötig.
   * @param {string} soulId - Soul-ID aus dem sys.md Frontmatter
   * @param {FileSystemDirectoryHandle} handle - Bereits geöffneter Handle mit readwrite-Berechtigung
   * @returns {Promise<boolean>}
   */
  async function attachHandle(soulId, handle) {
    try {
      // Berechtigung bestätigen (sollte bereits granted sein, da wir den Handle gerade geöffnet haben)
      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") return false;
      dirHandle.value   = handle;
      vaultSoulId.value = soulId;
      await ensureVaultDirs(handle);
      await saveHandle(soulId, handle);
      await scanVault();
      return true;
    } catch (e) {
      console.error("[useVault] attachHandle:", e);
      return false;
    }
  }

  /** Löscht eine Datei aus dem lokalen Vault (rekursive Suche in Unterordnern) */
  async function deleteLocalFile(name) {
    if (!dirHandle.value) return false;
    async function findAndDelete(handle) {
      try {
        for await (const [entryName, entry] of handle.entries()) {
          if (entry.kind === "file" && entryName === name) {
            await handle.removeEntry(entryName);
            return true;
          }
          if (entry.kind === "directory") {
            const found = await findAndDelete(entry);
            if (found) return true;
          }
        }
      } catch (e) { console.error("[useVault] deleteLocalFile find:", e); }
      return false;
    }
    const ok = await findAndDelete(dirHandle.value);
    if (ok) allFiles.value = allFiles.value.filter((f) => f.name !== name);
    return ok;
  }

  /**
   * Aktiviert den Memory-Vault-Modus mit bereits entschlüsselten Dateien.
   * Kein lokaler Ordner erforderlich — Dateien leben in-memory bis zum Seitenabschluss.
   * @param {Array<{name: string, buffer: ArrayBuffer|Uint8Array}>} files
   * @param {string} [sourceUrl] – Cloud-URL der .soul-Datei (für Re-Export-Hinweis)
   */
  async function attachMemory(files, sourceUrl = "") {
    // Memory-Modus aktivieren (dirHandle bleibt null)
    memoryMode.value  = true;
    cloudSource.value = sourceUrl;
    const map = new Map();
    for (const f of files) {
      const buf = f.buffer instanceof ArrayBuffer
        ? f.buffer
        : ArrayBuffer.isView(f.buffer) ? f.buffer.buffer.slice(f.buffer.byteOffset, f.buffer.byteOffset + f.buffer.byteLength)
        : f.buffer;
      map.set(f.name, buf);
    }
    memoryFiles.value = map;
    await scanVault();
    return true;
  }

  /** Löscht Vault-Verbindung und alle zugehörigen Daten */
  async function clearVault() {
    // Memory-Modus zurücksetzen
    memoryMode.value  = false;
    memoryFiles.value = new Map();
    cloudSource.value = "";
    // Synchrones Cleanup zuerst — verhindert Race-Condition wenn clearVault()
    // nicht awaited wird (z.B. handleReset) und die neue Soul sofort lädt.
    if (profileUrl.value?.startsWith("blob:")) URL.revokeObjectURL(profileUrl.value);
    profileUrl.value    = null;
    profileBase64.value = null;
    dirHandle.value     = null;
    contextFiles.value  = [];
    allFiles.value      = [];
    // Keep soul-specific sessionStorage profile keys so switching back to a soul
    // still shows its profile. Only remove the legacy generic keys.
    try {
      sessionStorage.removeItem("sys.soul_profile");
      sessionStorage.removeItem("sys.soul_profile_vision");
    } catch { /* */ }
    // Async: Handle aus IndexedDB löschen (unkritisch für UI-Zustand)
    const sid = vaultSoulId.value;
    vaultSoulId.value = null;
    if (sid) await deleteHandle(sid);
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  /** Alle Kontext-Textdateien als formatierten Text für den System-Prompt */
  const contextText = computed(() =>
    contextFiles.value.map((f) => `### ${f.name}\n${f.text}`).join("\n\n")
  );

  const fileManifest = computed(() => ({
    profile:         allFiles.value.find(f => f.kind === "profile")?.name ?? null,
    profileArchives: allFiles.value.filter(f => f.kind === "profile-archive").map(f => f.name),
    textFiles:       allFiles.value.filter(f => f.kind === "text").map(f => f.name),
    imageFiles:      allFiles.value.filter(f => f.kind === "image").map(f => f.name),
    audioFiles:      allFiles.value.filter(f => /^(mp3|ogg|wav|flac|aac|m4a|opus|weba)$/.test(f.kind)).map(f => f.name),
    videoFiles:      allFiles.value.filter(f => /^(mp4|webm|mov|avi|mkv|m4v)$/.test(f.kind)).map(f => f.name),
  }));

  const isConnected = computed(() => !!dirHandle.value || memoryMode.value);
  const hasProfile  = computed(() => !!profileUrl.value);

  return {
    isSupported,
    isConnected,
    hasProfile,
    profileUrl,
    profileBase64,
    contextFiles,
    allFiles,
    fileManifest,
    contextText,
    connectVault,
    restoreVault,
    writeFile,
    writeSoulMd,
    writeProfileImage,
    setProfileLocal,
    loadProfileLocal,
    deleteLocalFile,
    clearVault,
    scanVault,
    listVaultPaths,
    readAllVaultFiles,
    readVaultFile,
    readImageFile,
    readImageAsBase64,
    attachHandle,
    attachMemory,
    memoryMode,
    cloudSource,
    readShareConfig,
    writeShareConfig
  };
}
