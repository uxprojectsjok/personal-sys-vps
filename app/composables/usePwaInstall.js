// app/composables/usePwaInstall.js
// Erkennt ob die App als PWA installiert werden kann und liefert die Installier-Logik.
// Android/Chrome: beforeinstallprompt-Event → nativer Install-Sheet
// iOS Safari: kein Event → manueller Hinweis "Teilen → Zum Startbildschirm"
import { ref, onMounted, onUnmounted } from 'vue'

const DISMISS_KEY = 'sys_pwa_install_dismissed'

export function usePwaInstall() {
  const deferredPrompt = ref(null)
  const isInstallable  = ref(false)
  const isIos          = ref(false)
  const isStandalone   = ref(false)

  function detect() {
    if (typeof window === 'undefined') return

    isStandalone.value =
      navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches

    if (isStandalone.value) return  // Bereits installiert — nichts tun

    if (localStorage.getItem(DISMISS_KEY)) return  // Nutzer hat Hinweis geschlossen

    // iOS Safari: kein beforeinstallprompt, aber installierbar über Share-Menü
    const ua = navigator.userAgent
    const isIosSafari =
      /iPad|iPhone|iPod/.test(ua) &&
      /WebKit/.test(ua) &&
      !/CriOS|FxiOS|OPiOS/.test(ua)  // kein Chrome/Firefox/Opera iOS

    if (isIosSafari) {
      isIos.value        = true
      isInstallable.value = true
    }
  }

  function onBeforeInstall(e) {
    e.preventDefault()
    deferredPrompt.value = e
    if (!localStorage.getItem(DISMISS_KEY)) isInstallable.value = true
  }

  function onAppInstalled() {
    deferredPrompt.value = null
    isInstallable.value  = false
  }

  onMounted(() => {
    detect()
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onAppInstalled)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    window.removeEventListener('appinstalled', onAppInstalled)
  })

  async function promptInstall() {
    if (!deferredPrompt.value) return
    deferredPrompt.value.prompt()
    const { outcome } = await deferredPrompt.value.userChoice
    deferredPrompt.value = null
    if (outcome === 'accepted') isInstallable.value = false
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    isInstallable.value = false
  }

  return { isInstallable, isIos, isStandalone, promptInstall, dismiss }
}
