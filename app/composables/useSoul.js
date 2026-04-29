// app/composables/useSoul.js
// Singleton-State: refs im Modul-Scope – alle Komponenten teilen dieselbe Soul
import { ref, computed } from "vue";
import { updateLastSession, updateSection, appendSessionLog, addOrUpdateVaultSection, updateFrontmatterField } from "#shared/utils/soulParser.js";

const SOUL_KEY = "sys.soul";
const CERT_KEY = "sys.soul_cert";

// Singleton-State (Modul-Scope, nicht Component-Scope)
const soulContent          = ref("");
const soulCert             = ref("");
const isLoaded             = ref(false);
const syncStatus           = ref(null); // null | 'checking' | 'in_sync' | 'differs'
const serverContent        = ref("");
const syncError            = ref("");   // Fehlermeldung beim letzten fetchFromServer()
// Wird von resetCertToV0 auf true gesetzt wenn der Cert repariert wurde aber
// der Vault noch nicht verbunden war — VaultExplorer schreibt die Datei beim Connect.
const pendingSoulFileWrite = ref(false);
// true wenn fetchFromServer 403 "encrypted" bekommt und kein vault_key vorhanden ist.
// Zeigt dem Nutzer auf einem neuen Gerät an, dass er den Vault entsperren muss.
const serverVaultEncrypted = ref(false);
// Gesetzt während handleSoulUploaded läuft — verhindert dass der cert-Watcher in
// VaultExplorer logout-required emittiert während resetCertToV0 den Cert noch repariert.
const isLoginInProgress = ref(false);

export function useSoul() {
  const isClient = typeof window !== "undefined";

  // ── Token-Generierung ────────────────────────────────────────────────────

  function generateCert() {
    try {
      const array = new Uint8Array(24);
      crypto.getRandomValues(array);
      return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("").substring(0, 32);
    } catch {
      // Fallback für HTTP (lokales Netz ohne Secure Context)
      return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    }
  }

  function generateUUID() {
    // crypto.randomUUID() benötigt HTTPS / Secure Context – Fallback für lokales Netz
    try {
      return crypto.randomUUID();
    } catch {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
    }
  }

  // ── sys.md Template ────────────────────────────────────────────────────

  function buildDefaultSoul(id, cert, name, idea) {
    const now = new Date().toISOString().split("T")[0];
    return `---
soul_id: ${id}
soul_name: ${name || ""}
created: ${now}
last_session: ${now}
version: 1
soul_cert: ${cert}
vault_hash: ""
storage_tx: ""
---

## Kern-Identität
${idea ? idea : "*Noch nicht beschrieben.*"}

## Werte & Überzeugungen
*Noch nicht beschrieben.*

## Ästhetik & Resonanz
*Musik, Atmosphären, visuelle Reize die diese Person anzieht.*

## Sprachmuster & Ausdruck
*Noch nicht beschrieben.*

## Wiederkehrende Themen & Obsessionen
*Noch nicht beschrieben.*

## Emotionale Signatur
*Noch nicht beschrieben.*

## Weltbild
*Noch nicht beschrieben.*

## Offene Fragen dieser Person
*Noch nicht beschrieben.*

## Session-Log (komprimiert)
`;
  }

  // ── Persistenz ─────────────────────────────────────────────────────────

  function save() {
    if (!isClient) return;
    try {
      sessionStorage.setItem(SOUL_KEY, soulContent.value);
      sessionStorage.setItem(CERT_KEY, soulCert.value);
    } catch (e) {
      console.error("[useSoul] save error:", e);
    }
  }

  // Lädt Soul aus sessionStorage. Der Cert wird direkt aus dem Dateiinhalt gelesen –
  // kein Auto-Refresh. Ungültiger Cert in der Datei → API-Aufruf schlägt mit 401 fehl.
  function load() {
    if (!isClient) return false;
    try {
      const stored = sessionStorage.getItem(SOUL_KEY);
      if (stored && stored.includes("soul_cert:")) {
        soulContent.value = stored;
        // Cert immer aus dem Dateiinhalt lesen (nicht aus separatem sessionStorage-Schlüssel)
        const certFromContent = stored.match(/soul_cert:\s*(.+)/)?.[1]?.trim() || "";
        soulCert.value = certFromContent;
        isLoaded.value = true;
        return true;
      }
    } catch (e) {
      console.error("[useSoul] load error:", e);
    }
    return false;
  }

  // ── CRUD ────────────────────────────────────────────────────────────────

  async function createNew(name, idea) {
    const id = generateUUID();

    // HMAC-Cert vom Server holen (self-validating, kein Admin nötig)
    let cert;
    try {
      const res = await fetch("/api/soul-cert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soul_id: id })
      });
      if (res.ok) {
        const data = await res.json();
        cert = data.cert;
      }
    } catch {
      // Fallback: lokale Generierung (offline / kein Server)
    }

    // Fallback falls Server nicht erreichbar
    if (!cert) cert = generateCert();

    soulCert.value = cert;
    soulContent.value = buildDefaultSoul(id, cert, name, idea);
    isLoaded.value = true;
    save();
    return cert;
  }

  // Importiert eine hochgeladene sys.md. Der Cert wird unverändert aus der Datei
  // übernommen – kein Server-Refresh. Stimmt er nicht mit HMAC überein, liefert
  // die API 401 und das Cert-Fehler-Modal wird angezeigt.
  function importFromText(markdown) {
    const certMatch = markdown.match(/soul_cert:\s*([a-f0-9]{20,})/i);
    if (certMatch) {
      soulCert.value = certMatch[1].trim();
    }
    soulContent.value = markdown;
    isLoaded.value = true;
    save();
  }

  // Holt ein frisches HMAC-Cert vom Server für die aktuell geladene Soul.
  // Nötig nach importFromText() wenn der gespeicherte Cert veraltet/lokal ist.
  // Schlägt still fehl (kein Server / offline) – alter Cert bleibt erhalten.
  // cert_version wird aus dem aktuellen Inhalt gelesen — verhindert, dass ein
  // rotierter Cert (cert_version > 0) durch den Version-0-Cert überschrieben wird.
  async function refreshCert() {
    if (!isClient || !soulContent.value) return;
    const idMatch          = soulContent.value.match(/soul_id:\s*(.+)/);
    const soulId           = idMatch?.[1]?.trim();
    if (!soulId) return;
    const certVersionMatch = soulContent.value.match(/cert_version:\s*(\d+)/);
    const certVersion      = certVersionMatch ? parseInt(certVersionMatch[1], 10) : 0;

    let cert;
    try {
      const res = await fetch("/api/soul-cert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soul_id: soulId, cert_version: certVersion })
      });
      if (res.ok) {
        const data = await res.json();
        cert = data.cert;
      }
    } catch {
      return; // Server nicht erreichbar — alten Cert behalten
    }

    if (!cert) return;

    // Cert in sys.md-Inhalt ersetzen — updateFrontmatterField ist robuster als Regex
    soulContent.value = updateFrontmatterField(soulContent.value, "soul_cert", cert);
    soulCert.value = cert;
    save();
  }

  // Rotiert den soul_cert: inkrementiert cert_version auf dem Server,
  // schreibt neuen Cert in sys.md (lokal + sessionStorage).
  // Alter Cert ist danach sofort ungültig.
  async function rotateCert() {
    if (!isClient || !soulContent.value || !soulCert.value) return null;
    const idMatch = soulContent.value.match(/soul_id:\s*(.+)/);
    const soulId  = idMatch?.[1]?.trim();
    if (!soulId) return null;

    let res;
    try {
      res = await fetch("/api/soul-rotate-cert", {
        method: "POST",
        headers: { Authorization: `Bearer ${soulId}.${soulCert.value}` },
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    const { cert, cert_version } = await res.json();
    if (!cert) return null;

    // sys.md lokal aktualisieren — updateFrontmatterField ist robuster als Regex
    // (arbeitet nur im Frontmatter-Block, kommt mit CRLF/Whitespace-Varianten klar)
    let updated = updateFrontmatterField(soulContent.value, "soul_cert", cert);
    updated     = updateFrontmatterField(updated, "cert_version", cert_version);

    soulContent.value = updated;
    soulCert.value    = cert;
    save();

    return { cert, cert_version };
  }

  function updateContent(newContent) {
    soulContent.value = updateLastSession(newContent);
    save();
  }

  function clear() {
    if (!isClient) return;
    sessionStorage.removeItem(SOUL_KEY);
    sessionStorage.removeItem(CERT_KEY);
    soulContent.value = "";
    soulCert.value = "";
    isLoaded.value = false;
  }

  // ── Soul-Anreicherung ────────────────────────────────────────────────────

  /**
   * Schickt die Session-Konversation an die KI und lässt sie die Soul anreichern.
   * Die KI entscheidet eigenständig was soul-würdig ist.
   * @param {Array} messages - Nachrichten im Format { role, content }
   * @returns {Promise<{ changed: boolean, sectionsUpdated: string[], logEntry: string } | null>}
   */
  async function enrichFromSession(messages) {
    if (typeof window === "undefined") return null;
    if (!messages?.length || !soulContent.value) return null;

    try {
      // Payload client-seitig bauen (Production: OpenResty proxied direkt zu Anthropic)
      const conversationText = messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => `${m.role === "user" ? "MENSCH" : "KI"}: ${m.content}`)
        .join("\n\n");

      const systemPrompt = `Du bist der Soul-Archivar. Deine Aufgabe: Analysiere eine Konversation zwischen einem Menschen und einer KI, und extrahiere soul-würdige Erkenntnisse.

BESTEHENDE SOUL:
${soulContent.value}

WICHTIGSTE REGEL – EXPLIZITE FAKTEN IMMER SPEICHERN:
Wenn der Mensch konkrete Fakten über sich selbst nennt (Name, Alter, Beruf, Wohnort, Hobbys, Vorlieben, Interessen, Beziehungen, Lebenssituation), müssen diese IMMER in die entsprechende Sektion eingetragen werden – ohne Ausnahme, auch wenn sie "banal" wirken. Diese Fakten sind das Fundament der Soul.

WEITERE REGELN:
- Interpretationen, Vermutungen und Smalltalk NICHT eintragen
- Bei expliziten Fakten: ergänzen und verdichten, nicht ersetzen
- Bestehende Sektionen erweitern wenn neue Fakten hinzukommen
- Der Session-Log ist eine kurze Zusammenfassung in 1-2 Sätzen – nennt was tatsächlich mitgeteilt wurde
- Wenn wirklich nichts über die Person gesagt wurde: leeres Array zurückgeben

ZUORDNUNG expliziter Fakten:
- Alter, Beruf, Herkunft, Lebenssituation → Kern-Identität
- Musik, Bücher, Filme, Essen, Sport, ästhetische Vorlieben → Ästhetik & Resonanz
- Überzeugungen, Prinzipien, Werte → Werte & Überzeugungen
- Themen die die Person beschäftigen, Obsessionen → Wiederkehrende Themen & Obsessionen

ANTWORTFORMAT (strikt JSON, kein Markdown darum):
{
  "changes": [
    {
      "section": "Kern-Identität",
      "content": "Neuer Inhalt dieser Sektion"
    }
  ],
  "sessionLog": "1-2 Sätze was in dieser Session mitgeteilt oder bedeutsam war"
}

Mögliche section-Werte (exakt so schreiben):
- Kern-Identität
- Werte & Überzeugungen
- Ästhetik & Resonanz
- Sprachmuster & Ausdruck
- Wiederkehrende Themen & Obsessionen
- Emotionale Signatur
- Weltbild
- Offene Fragen dieser Person`;

      const res = await fetch("/api/soul-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${soulToken.value}`
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          stream: false,
          system: systemPrompt,
          messages: [{ role: "user", content: `Analysiere diese Konversation:\n\n${conversationText}` }]
        })
      });

      if (!res.ok) {
        console.error("[useSoul] soul-update Fehler:", res.status);
        return null;
      }

      const data = await res.json();
      const rawText = data?.content?.[0]?.text ?? "";
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;
      const { changes, sessionLog } = JSON.parse(jsonMatch[0]);
      let updated = soulContent.value;
      const sectionsUpdated = [];

      // Sektionen aktualisieren
      if (Array.isArray(changes)) {
        for (const { section, content } of changes) {
          if (section && content) {
            updated = updateSection(updated, section, content);
            sectionsUpdated.push(section);
          }
        }
      }

      // Session-Log anhängen
      if (sessionLog) {
        updated = appendSessionLog(updated, sessionLog);
      }

      // last_session aktualisieren + speichern
      updateContent(updated);

      return {
        changed: sectionsUpdated.length > 0 || !!sessionLog,
        sectionsUpdated,
        logEntry: sessionLog ?? ""
      };
    } catch (e) {
      console.error("[useSoul] enrichFromSession Fehler:", e);
      return null;
    }
  }

  // ── Server-Sync ─────────────────────────────────────────────────────────

  // AES-256-CBC client-seitige Entschlüsselung (Format: "SYS\x01" + IV(16) + Ciphertext)
  async function _decryptSoulBuffer(vaultKeyHex, arrayBuffer) {
    if (!vaultKeyHex || !/^[0-9a-f]{64}$/i.test(vaultKeyHex)) return null;
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 20) return null;
    // Magic-Check: SYS\x01
    if (bytes[0] !== 0x53 || bytes[1] !== 0x59 || bytes[2] !== 0x53 || bytes[3] !== 0x01) return null;
    try {
      const iv         = bytes.slice(4, 20);
      const ciphertext = bytes.slice(20);
      const keyBytes   = new Uint8Array(vaultKeyHex.match(/../g).map(h => parseInt(h, 16)));
      const key        = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
      const plaintext  = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, ciphertext);
      return new TextDecoder().decode(plaintext);
    } catch {
      return null;
    }
  }

  /**
   * Holt sys.md vom VPS und vergleicht mit der lokalen Version.
   * @param {boolean} silent      – true = Fehler stumm ignorieren (Auto-Check im Hintergrund)
   * @param {string}  vaultKeyHex – optionaler 64-Hex-Schlüssel für client-seitige Entschlüsselung
   */
  async function fetchFromServer(silent = false, vaultKeyHex = "") {
    if (!isClient) return;
    const token = soulToken.value;
    if (!token || token === "anonymous") {
      if (!silent) syncError.value = "Kein Soul-Cert – bitte Soul laden.";
      return;
    }
    syncStatus.value = "checking";
    if (!silent) syncError.value = "";
    serverContent.value = "";
    try {
      const res = await fetch("/api/soul", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        let errorCode = "";
        let msg = `Server ${res.status}`;
        try {
          const j = await res.json();
          errorCode = j?.error ?? "";
          if (errorCode === "encrypted") msg = "Soul ist verschlüsselt – Vault entsperren und synchronisieren.";
          else if (errorCode === "decryption_failed") msg = "Server-Soul ist mit einem anderen Schlüssel verschlüsselt. Bitte zuerst Vault synchronisieren.";
          else if (errorCode === "No soul content synced yet") msg = "Noch kein Server-Stand – erst Hochladen.";
          else if (errorCode === "API access not enabled") msg = "API-Zugriff nicht aktiviert.";
          else if (errorCode === "Soul access not permitted") msg = "Soul-Leseberechtigung fehlt.";
          else if (j?.message) msg = j.message;
          else if (j?.error) msg = j.error;
        } catch {}

        // Neues Gerät ohne Vault-Key → Banner im UI anzeigen
        if (errorCode === "encrypted" && !vaultKeyHex) {
          serverVaultEncrypted.value = true;
        }

        // Fallback: bei Entschlüsselungsfehler client-seitig versuchen
        if ((errorCode === "decryption_failed" || errorCode === "encrypted") && vaultKeyHex) {
          const rawRes = await fetch("/api/soul?raw=1", {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => null);
          if (rawRes?.ok) {
            const buf  = await rawRes.arrayBuffer();
            const text = await _decryptSoulBuffer(vaultKeyHex, buf);
            if (text) {
              if (text.trimEnd() === soulContent.value.trimEnd()) {
                syncStatus.value = "in_sync";
              } else {
                serverContent.value = text;
                syncStatus.value = "differs";
              }
              return; // Erfolg – kein Fehler anzeigen
            }
          }
          // Client-Decrypt auch gescheitert → Server-Soul wurde mit anderem Schlüssel verschlüsselt
          msg = "Server-Soul ist mit einem anderen Schlüssel verschlüsselt. Bitte zuerst Vault synchronisieren.";
        }

        if (!silent) syncError.value = msg;
        syncStatus.value = null;
        return;
      }
      const ct = res.headers.get("content-type") ?? "";
      const text = await res.text();
      // Sanity-Check: muss Markdown-ähnlicher Text sein
      if (!ct.includes("markdown") && !ct.includes("text/plain") && !text.trim().startsWith("---")) {
        if (!silent) syncError.value = "Unbekannte Server-Antwort.";
        syncStatus.value = null;
        return;
      }
      // Erfolg: verschlüsselter-Status zurücksetzen
      serverVaultEncrypted.value = false;
      // Normalisiert vergleichen (Whitespace am Ende ignorieren)
      if (text.trimEnd() === soulContent.value.trimEnd()) {
        syncStatus.value = "in_sync";
      } else {
        serverContent.value = text;
        syncStatus.value = "differs";
      }
    } catch (e) {
      if (!silent) syncError.value = "Netzwerkfehler – Server nicht erreichbar.";
      syncStatus.value = null;
    }
  }

  /** Lädt die Server-Version in den lokalen State. */
  function acceptServerVersion() {
    if (!serverContent.value) return;
    importFromText(serverContent.value);
    syncStatus.value = "in_sync";
    serverContent.value = "";
  }

  /** Pusht die lokale sys.md auf den VPS. */
  async function pushToServer() {
    if (!isClient || !soulContent.value) return false;
    const token = soulToken.value;
    if (!token || token === "anonymous") return false;
    try {
      const res = await fetch("/api/context", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ soul_content: soulContent.value })
      });
      if (res.ok) {
        syncStatus.value = "in_sync";
        serverContent.value = "";
        return true;
      }
    } catch {}
    return false;
  }

  function dismissSync() {
    syncStatus.value = null;
    serverContent.value = "";
    syncError.value = "";
  }

  // ── Dauerspeicher TX-ID ──────────────────────────────────────────────────

  function setStorageTx(txId) {
    if (!soulContent.value) return;
    soulContent.value = updateFrontmatterField(soulContent.value, "storage_tx", txId);
    save();
  }

  // ── Vault-Manifest ───────────────────────────────────────────────────────

  /**
   * Trägt die Vault-Dateiliste in den ## Vault Abschnitt der sys.md ein.
   * Wird aufgerufen nachdem der Vault-Ordner gescannt wurde.
   * @param {{ profile?: string|null, textFiles?: string[], imageFiles?: string[] }} manifest
   */
  function updateVaultInSoul(manifest) {
    if (!soulContent.value) return;
    const updated = addOrUpdateVaultSection(soulContent.value, manifest);
    soulContent.value = updated;
    save();
  }

  // ── Export ──────────────────────────────────────────────────────────────

  async function exportAsBlob() {
    if (!isClient || !soulContent.value) return;
    // Dateiname ist immer sys.md – Vault-Sync und späteres Überschreiben
    // funktionieren nur wenn der Name stabil bleibt.
    const filename = "sys.md";

    // File System Access API: User wählt Speicherort (Chrome/Edge)
    if ("showSaveFilePicker" in window) {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "Soul (Markdown)", accept: { "text/markdown": [".md"] } }]
        });
        const writable = await fileHandle.createWritable();
        await writable.write(soulContent.value);
        await writable.close();
        return;
      } catch (e) {
        if (e.name === "AbortError") return; // User hat Picker abgebrochen
        // Anderer Fehler → Fallback
      }
    }

    // Fallback: klassischer Blob-Download (Firefox, Safari, Mobile)
    const blob = new Blob([soulContent.value], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Computed ────────────────────────────────────────────────────────────

  const hasSoul = computed(() => isLoaded.value && soulContent.value.length > 0);

  // Bearer-Token für API-Calls: "{soul_id}.{soul_cert}"
  // Beide Werte kommen direkt aus dem Dateiinhalt (soulContent).
  // Tamperter Cert → falscher Token → 401 vom Server.
  const soulToken = computed(() => {
    const id   = soulContent.value.match(/soul_id:\s*(.+)/)?.[1]?.trim();
    const cert = soulContent.value.match(/soul_cert:\s*(.+)/)?.[1]?.trim();
    if (!id || !cert) return "anonymous";
    return `${id}.${cert}`;
  });

  const soulMeta = computed(() => {
    if (!soulContent.value) return null;
    const idMatch         = soulContent.value.match(/soul_id:\s*(.+)/);
    const nameMatch       = soulContent.value.match(/soul_name:\s*(.+)/);
    const createdMatch    = soulContent.value.match(/created:\s*(.+)/);
    const lastMatch       = soulContent.value.match(/last_session:\s*(.+)/);
    const versionMatch    = soulContent.value.match(/version:\s*(.+)/);
    const storageTxMatch  = soulContent.value.match(/storage_tx:\s*(.+)/);
    const certMatch       = soulContent.value.match(/soul_cert:\s*([a-f0-9]+)/i);
    const chainCountMatch = soulContent.value.match(/chain_count:\s*(\d+)/);
    const maturityMatch   = soulContent.value.match(/maturity:\s*(\d+)/);
    return {
      id:          idMatch?.[1]?.trim()  ?? "unbekannt",
      name:        nameMatch?.[1]?.trim() ?? "",
      created:     createdMatch?.[1]?.trim() ?? "",
      lastSession: lastMatch?.[1]?.trim() ?? "",
      version:     versionMatch?.[1]?.trim() ?? "1",
      storageTx:   storageTxMatch?.[1]?.trim() || null,
      cert:        certMatch?.[1]?.trim() ?? "",
      chainCount:  chainCountMatch ? parseInt(chainCountMatch[1], 10) : 0,
      maturity:    maturityMatch   ? parseInt(maturityMatch[1], 10)   : 0,
    };
  });

  return {
    // State
    soulContent,
    soulCert,
    soulToken,
    isLoaded,
    hasSoul,
    soulMeta,
    syncStatus,
    syncError,
    serverContent,
    // Actions
    load,
    save,
    createNew,
    importFromText,
    refreshCert,
    rotateCert,
    updateContent,
    enrichFromSession,
    updateVaultInSoul,
    setStorageTx,
    clear,
    exportAsBlob,
    generateCert,
    fetchFromServer,
    acceptServerVersion,
    pushToServer,
    dismissSync,
    resetCertToV0,
    pendingSoulFileWrite,
    serverVaultEncrypted,
    isLoginInProgress,
  };
}

// Erkennt cert_version-Konflikt nach manuellem Server-Vault-Löschen und setzt den Cert
// automatisch auf Version 0 zurück, wenn der Server kein api_context.json mehr hat.
// Gibt true zurück wenn der Cert erfolgreich zurückgesetzt wurde.
async function resetCertToV0() {
  const isClient = typeof window !== "undefined";
  if (!isClient || !soulContent.value) return false;
  const idMatch   = soulContent.value.match(/soul_id:\s*(.+)/);
  const soulId    = idMatch?.[1]?.trim();
  if (!soulId) return false;
  const cvMatch   = soulContent.value.match(/cert_version:\s*(\d+)/);
  const cv        = cvMatch ? parseInt(cvMatch[1], 10) : 0;
  if (cv === 0) return false; // Bereits v0 — kein Handlungsbedarf

  const certMatch  = soulContent.value.match(/soul_cert:\s*([a-f0-9]{20,})/i);
  const currentCert = certMatch?.[1]?.trim();
  if (!currentCert) return false;

  try {
    // Erst prüfen ob der aktuelle Cert noch gültig ist.
    // Ist er gültig → sofort zurückkehren ohne weitere Anfragen (kein spurious 401).
    // Nur wenn der aktuelle Cert 401 liefert → Fallback auf v0.
    const currentProbe = await fetch("/api/context", {
      headers: { Authorization: `Bearer ${soulId}.${currentCert}` }
    });
    if (currentProbe.status !== 401) return false; // Cert ist OK — nichts zu tun

    // Aktueller Cert wird abgelehnt → versuche cert_version=0 (Server-Vault gelöscht?)
    const r0 = await fetch("/api/soul-cert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soul_id: soulId, cert_version: 0 }),
    });
    if (!r0.ok) return false;
    const { cert: cert0 } = await r0.json();
    if (!cert0) return false;

    // V0-Cert verifizieren — nur wenn er auth-seitig akzeptiert wird einsetzen
    const probe0 = await fetch("/api/context", {
      headers: { Authorization: `Bearer ${soulId}.${cert0}` }
    });
    if (probe0.status === 401) return false;

    // Kurz auf v0 setzen damit sofort authentifiziert werden kann
    let updated = updateFrontmatterField(soulContent.value, "soul_cert",    cert0);
    updated     = updateFrontmatterField(updated,           "cert_version", 0);
    soulContent.value = updated;
    soulCert.value    = cert0;

    // Sofort rotieren — verhindert dass der alte (ggf. bekannte) v0-Cert dauerhaft
    // sichtbar ist. Nach Rotation hat der User einen frischen Cert auf cert_version=1.
    try {
      const rotRes = await fetch("/api/soul-rotate-cert", {
        method: "POST",
        headers: { Authorization: `Bearer ${soulId}.${cert0}` },
      });
      if (rotRes.ok) {
        const { cert: newCert, cert_version: newVersion } = await rotRes.json();
        if (newCert) {
          updated = updateFrontmatterField(updated, "soul_cert",    newCert);
          updated = updateFrontmatterField(updated, "cert_version", newVersion);
          soulContent.value = updated;
          soulCert.value    = newCert;
        }
      }
    } catch { /* Rotation optional — v0 ist schlechter aber funktional */ }

    try {
      sessionStorage.setItem("sys.soul",      soulContent.value);
      sessionStorage.setItem("sys.soul_cert", soulCert.value);
    } catch { /* */ }
    // Signal für VaultExplorer: physische Datei muss nach Vault-Connect geschrieben werden
    pendingSoulFileWrite.value = true;
    return true;
  } catch {
    return false;
  }
}
