// app/composables/useCamera.js
// Kamera-Composable – Permission-Management, Singleton-State
import { ref } from "vue";

// Singleton-State (Modul-Scope)
const cameraPermission = ref("unknown"); // 'unknown' | 'granted' | 'denied'

export function useCamera() {
  /**
   * Fragt Kamera- und Mikrofon-Erlaubnis ab.
   * Sollte beim Session-Start aufgerufen werden.
   */
  async function requestPermissions() {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraPermission.value = "denied";
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach((t) => t.stop());
      cameraPermission.value = "granted";
      return true;
    } catch {
      cameraPermission.value = "denied";
      return false;
    }
  }

  return { cameraPermission, requestPermissions };
}
