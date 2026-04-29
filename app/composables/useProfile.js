// app/composables/useProfile.js
// Singleton-Composable für das Profilbild im Dashboard
// Strategie: vault (File System) → localStorage (persistent fallback)

import { ref, watch } from 'vue'

const LS_KEY = 'sys.profile.dataUrl'
const MAX_PX = 256 // Display-Thumbnail-Größe für localStorage

// ── Singleton-State ───────────────────────────────────────────────────────
const hasProfile = ref(false)
const profileUrl = ref('')

// ── Hilfsfunktion: Bild auf MAX_PX verkleinern (Canvas) ──────────────────
function resizeToDataUrl(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

// ── localStorage wiederherstellen beim ersten Load ────────────────────────
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) {
      profileUrl.value = stored
      hasProfile.value = true
    }
  } catch {}
}

export function useProfile() {
  // Vault-Profil-URL beobachten und in das UI-Ref übernehmen
  // (lazy import um zirkuläre Abhängigkeiten zu vermeiden)
  if (typeof window !== 'undefined') {
    try {
      const { profileUrl: vaultProfileUrl } = useVault()
      watch(vaultProfileUrl, (url) => {
        if (url) {
          profileUrl.value = url
          hasProfile.value = true
        }
      }, { immediate: true })
    } catch {}
  }

  /**
   * @param {Event} event — Change-Event von <input type="file">
   */
  async function handleUpload(event) {
    const file = event?.target?.files?.[0]
    if (!file || !file.type.startsWith('image/')) return

    // Vault verfügbar → dort speichern (persistente lokale Datei)
    try {
      const { isConnected, writeProfileImage } = useVault()
      if (isConnected.value) {
        const ok = await writeProfileImage(file)
        if (ok) return // vault setzt profileUrl selbst über seinen eigenen ref
      }
    } catch {}

    // Fallback: Bild auf 256px verkleinern und in localStorage speichern
    const dataUrl = await resizeToDataUrl(file)
    if (!dataUrl) return
    profileUrl.value = dataUrl
    hasProfile.value = true
    try {
      localStorage.setItem(LS_KEY, dataUrl)
    } catch {}
  }

  return { hasProfile, profileUrl, handleUpload }
}
