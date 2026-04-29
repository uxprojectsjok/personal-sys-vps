// app/composables/useSoulDecrypt.js
// AES-256-GCM Entschlüsselung für .soul-Bundles
// Spiegelimage von useSoulEncrypt.js – ausschließlich Web Crypto API, keine Bibliotheken.

import { ref } from "vue";

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/**
 * Base64-String → ArrayBuffer (chunk-safe)
 */
function fromBase64(b64) {
  const binary = atob(b64);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer.buffer;
}

/**
 * Leitet den AES-256-GCM-Schlüssel aus der Mnemonic-Phrase ab.
 * Identisch mit useSoulEncrypt.deriveKey – gleicher Salt, gleiche Parameter.
 */
async function deriveKey(words) {
  const enc         = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(words.join(" ")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name:       "PBKDF2",
      salt:       enc.encode("SaveYourSoul-v1"),
      iterations: 100_000,
      hash:       "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

/**
 * Entschlüsselt eine einzelne Datei aus dem Bundle.
 * Web Crypto AES-GCM erwartet [ciphertext || auth-tag (16 Byte)] – genau unser Format.
 * @returns {Promise<Uint8Array>} Klartext-Bytes
 */
async function decryptFile(cryptoKey, { iv: ivB64, data: dataB64 }) {
  const iv        = fromBase64(ivB64);
  const data      = fromBase64(dataB64);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    data
  );
  return new Uint8Array(plaintext);
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useSoulDecrypt() {
  const bundle         = ref(null);   // Geparste Bundle-JSON
  const isDecrypting   = ref(false);
  const decryptError   = ref(null);
  const decryptedFiles = ref([]);     // [{ name: string, buffer: Uint8Array }]

  /**
   * Liest eine .soul-Datei ein und validiert das Schema.
   * @param {File} file - Die hochgeladene .soul-Datei
   * @returns {Promise<boolean>}
   */
  async function loadBundle(file) {
    decryptError.value   = null;
    bundle.value         = null;
    decryptedFiles.value = [];

    try {
      const text   = await file.text();
      const parsed = JSON.parse(text);

      if (
        !parsed.schema?.startsWith("saveyoursoul/") ||
        !Array.isArray(parsed.files) ||
        !parsed.kdf_params
      ) {
        decryptError.value = "Keine gültige .soul-Datei (Schema unbekannt).";
        return false;
      }

      bundle.value = parsed;
      return true;
    } catch (e) {
      decryptError.value =
        e instanceof SyntaxError
          ? "Datei ist kein gültiges JSON."
          : "Datei konnte nicht gelesen werden.";
      return false;
    }
  }

  /**
   * Entschlüsselt alle Dateien im Bundle mit den 12 Wörtern.
   * Bei falschen Wörtern schlägt AES-GCM (Auth-Tag) mit OperationError fehl.
   * @param {string[]} words - 12 Schlüsselwörter
   * @returns {Promise<boolean>}
   */
  async function decrypt(words) {
    if (!bundle.value) {
      decryptError.value = "Keine .soul-Datei geladen.";
      return false;
    }
    if (!words || words.length !== 12 || words.some(w => !w)) {
      decryptError.value = "Genau 12 Wörter erforderlich.";
      return false;
    }
    if (!crypto?.subtle) {
      decryptError.value = "Entschlüsselung erfordert HTTPS.";
      return false;
    }

    isDecrypting.value   = true;
    decryptError.value   = null;
    decryptedFiles.value = [];

    try {
      const key     = await deriveKey(words);
      const results = [];

      for (const file of bundle.value.files) {
        const buffer = await decryptFile(key, file);
        results.push({ name: file.name, buffer });
      }

      decryptedFiles.value = results;
      return true;
    } catch (e) {
      console.error("[useSoulDecrypt] decrypt error:", e);
      decryptError.value =
        e.name === "OperationError"
          ? "Falsche Wörter – Entschlüsselung fehlgeschlagen. Bitte Wörter prüfen."
          : "Fehler bei der Entschlüsselung.";
      return false;
    } finally {
      isDecrypting.value = false;
    }
  }

  /**
   * Entschlüsselt mit einem bereits abgeleiteten CryptoKey (Passkey-Pfad).
   * @param {CryptoKey} cryptoKey
   */
  async function decryptWithKey(cryptoKey) {
    if (!bundle.value) { decryptError.value = "Keine .soul-Datei geladen."; return false; }
    if (!cryptoKey)    { decryptError.value = "Kein Schlüssel vorhanden.";  return false; }

    isDecrypting.value   = true;
    decryptError.value   = null;
    decryptedFiles.value = [];

    try {
      const results = [];
      for (const file of bundle.value.files) {
        const buffer = await decryptFile(cryptoKey, file);
        results.push({ name: file.name, buffer });
      }
      decryptedFiles.value = results;
      return true;
    } catch (e) {
      console.error("[useSoulDecrypt] decryptWithKey error:", e);
      decryptError.value = e.name === "OperationError"
        ? "Falscher Passkey – Entschlüsselung fehlgeschlagen."
        : "Fehler bei der Entschlüsselung.";
      return false;
    } finally {
      isDecrypting.value = false;
    }
  }

  /**
   * Gibt den UTF-8-dekodieren Inhalt der sys.md zurück.
   * @returns {string|null}
   */
  function getSoulMd() {
    const f = decryptedFiles.value.find(f => f.name === "sys.md");
    if (!f) return null;
    return new TextDecoder().decode(f.buffer);
  }

  /**
   * Alle entschlüsselten Dateien außer sys.md (Bilder, .webm, Texte …)
   * @returns {Array<{ name: string, buffer: Uint8Array }>}
   */
  function getNonSoulFiles() {
    return decryptedFiles.value.filter(f => f.name !== "sys.md");
  }

  /** Gibt MIME-Type anhand der Dateiendung zurück */
  function mimeFor(name) {
    const ext = name.split(".").pop().toLowerCase();
    const map = {
      webm: "video/webm",
      mp4:  "video/mp4",
      mp3:  "audio/mpeg",
      ogg:  "audio/ogg",
      jpg:  "image/jpeg",
      jpeg: "image/jpeg",
      png:  "image/png",
      webp: "image/webp",
      gif:  "image/gif",
      md:   "text/plain",
      txt:  "text/plain",
      pdf:  "application/pdf",
      json: "application/json",
    };
    return map[ext] ?? "application/octet-stream";
  }

  /**
   * Löst Browser-Download für eine entschlüsselte Datei aus.
   * @param {{ name: string, buffer: Uint8Array }} file
   */
  function downloadFile(file) {
    const blob = new Blob([file.buffer], { type: mimeFor(file.name) });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    // Nur Dateiname ohne Pfad (z.B. "voice_samples/voice.webm" → "voice.webm")
    a.download = file.name.split("/").pop();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Formatiert Bytes lesbar (B / KB / MB) */
  function formatSize(bytes) {
    if (bytes < 1024)         return `${bytes} B`;
    if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  /** Reset für erneuten Versuch */
  function reset() {
    bundle.value         = null;
    decryptError.value   = null;
    decryptedFiles.value = [];
  }

  return {
    bundle,
    isDecrypting,
    decryptError,
    decryptedFiles,
    loadBundle,
    decrypt,
    decryptWithKey,
    getSoulMd,
    getNonSoulFiles,
    mimeFor,
    downloadFile,
    formatSize,
    reset,
  };
}
