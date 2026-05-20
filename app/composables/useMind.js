// app/composables/useMind.js
// Lädt die KI-Konfigurationsdatei (mind.md) einmal pro Session.
import { ref } from 'vue'

let _cached = null  // Modul-Level-Cache — bleibt für die Lebensdauer der App

export function useMind() {
  const mindContent = ref(_cached ?? '')

  async function loadMind(soulCert) {
    if (_cached !== null) {
      mindContent.value = _cached
      return
    }
    if (!soulCert) return
    try {
      const res = await fetch('/api/mind', {
        headers: { Authorization: `Bearer ${soulCert}` },
      })
      if (res.ok) {
        _cached = await res.text()
        mindContent.value = _cached
      }
    } catch { /* silent — fehlende mind.md ist kein Fehler */ }
  }

  function clearMindCache() {
    _cached = null
    mindContent.value = ''
  }

  return { mindContent, loadMind, clearMindCache }
}
