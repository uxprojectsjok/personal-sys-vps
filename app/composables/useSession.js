// app/composables/useSession.js
// Singleton-State: refs im Modul-Scope – alle Komponenten teilen dieselbe Session
import { ref } from "vue";

// Singleton-State (Modul-Scope, nicht Component-Scope)
const messages = ref([]);
const sessionId = ref(null);
const isActive = ref(false);
// Komprimierte Zusammenfassung älterer Nachrichten (Kurzzeitgedächtnis)
const conversationSummary = ref("");

export function useSession() {

  function genId() {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  }

  function startSession() {
    sessionId.value = `session_${Date.now()}`;
    isActive.value = true;
    messages.value = [];
  }

  /**
   * Fügt eine Nachricht zur Session hinzu
   * @param {'user'|'assistant'|'system'} role
   * @param {string} text
   * @param {Object} [meta] - Optionale Metadaten (z.B. streaming: true)
   * @returns {Object} Die neue Nachricht
   */
  function addMessage(role, text, meta = {}) {
    const msg = {
      id: genId(),
      role,
      text,
      ts: Date.now(),
      ...meta
    };
    messages.value.push(msg);
    return msg;
  }

  /**
   * Aktualisiert den Text der letzten Nachricht (für Streaming)
   * @param {string} text
   */
  function updateLastMessage(text) {
    if (messages.value.length === 0) return;
    messages.value[messages.value.length - 1].text = text;
  }

  /**
   * Setzt ein Flag auf der letzten Nachricht
   * @param {string} key
   * @param {any} value
   */
  function setLastMessageMeta(key, value) {
    if (messages.value.length === 0) return;
    messages.value[messages.value.length - 1][key] = value;
  }

  /**
   * Setzt ein Flag auf einer bestimmten Nachricht (per ID)
   * @param {string} id
   * @param {string} key
   * @param {any} value
   */
  function setMessageMetaById(id, key, value) {
    const msg = messages.value.find((m) => m.id === id);
    if (msg) msg[key] = value;
  }

  function clearSession() {
    messages.value = [];
    sessionId.value = null;
    isActive.value = false;
    conversationSummary.value = "";
  }

  /**
   * Konvertiert Messages in das Claude API Format.
   * Unterstützt contentBlocks (Array) für Bild/PDF-Nachrichten.
   * @param {number} [maxHistory=40] - Maximale Anzahl an Nachrichten im aktiven Fenster
   * @returns {Array<{ role: string, content: string|Array }>}
   */
  function toApiMessages(maxHistory = 40) {
    return messages.value
      .slice(-maxHistory)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => m.contentBlocks || (m.text && m.text.trim().length > 0))
      .map((m) => ({ role: m.role, content: m.contentBlocks || m.text }));
  }

  /**
   * Gibt die Nachrichten zurück, die für eine Zusammenfassung bereit sind
   * (alles außer den letzten 20 aktiven Nachrichten).
   * @returns {Array}
   */
  function getMessagesToSummarize() {
    const all = messages.value.filter(
      (m) => (m.role === "user" || m.role === "assistant") &&
             (m.text && m.text.trim().length > 0)
    );
    if (all.length <= 40) return [];
    return all.slice(0, -20);
  }

  /**
   * Ersetzt alte Nachrichten durch eine Zusammenfassung.
   * Behält die letzten 20 Nachrichten vollständig.
   * @param {string} summary
   */
  function pruneWithSummary(summary) {
    conversationSummary.value = summary;
    // Nur die letzten 20 user/assistant-Nachrichten behalten
    const keep = messages.value
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map((m) => m.id);
    messages.value = messages.value.filter((m) => keep.includes(m.id));
  }

  /**
   * Erstellt eine komprimierte Session-Zusammenfassung für den Soul-Log
   * @returns {string}
   */
  function getSessionSummary() {
    const userMessages = messages.value
      .filter((m) => m.role === "user")
      .map((m) => m.text)
      .join(" · ");
    // Auf 300 Zeichen kürzen
    return userMessages.length > 300 ? userMessages.slice(0, 297) + "…" : userMessages;
  }

  /**
   * Anzahl der User-Nachrichten in dieser Session
   */
  function userMessageCount() {
    return messages.value.filter((m) => m.role === "user").length;
  }

  return {
    messages,
    sessionId,
    isActive,
    conversationSummary,
    startSession,
    addMessage,
    updateLastMessage,
    setLastMessageMeta,
    setMessageMetaById,
    clearSession,
    toApiMessages,
    getSessionSummary,
    getMessagesToSummarize,
    pruneWithSummary,
    userMessageCount
  };
}
