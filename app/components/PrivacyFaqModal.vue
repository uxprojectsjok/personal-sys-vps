<template>
  <Transition name="modal-fade">
    <div
      v-if="isOpen"
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-faq-title"
      class="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <div
        class="relative w-full max-w-2xl max-h-[90vh] rounded-2xl border shadow-2xl overflow-hidden bg-[var(--sys-bg-elevated)] border-[var(--sys-border)]"
      >
        <!-- Close Button -->
        <button
          ref="closeButtonRef"
          @click="emitClose"
          aria-label="Privacy FAQ schließen"
          class="absolute top-4 right-5 z-10 w-11 h-11 flex items-center justify-center rounded-xl border border-[var(--sys-border)] text-[var(--sys-fg-dim)] hover:text-[var(--sys-fg)] hover:border-[rgba(255,255,255,0.15)] hover:bg-[var(--sys-bg-surface)] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sys-accent)]"
        >
          <X class="w-4 h-4" aria-hidden="true" />
        </button>

        <!-- Content -->
        <div
          class="font-content overflow-y-auto overflow-x-hidden max-h-[90vh] p-6 sm:p-8 pr-16 text-base leading-relaxed text-[var(--sys-fg-muted)]"
        >
          <section class="space-y-5">
            <header class="pr-2">
              <h2 id="privacy-faq-title" class="text-base font-semibold text-[var(--sys-fg)] tracking-wide">
                Datenschutz – kurz &amp; transparent
              </h2>
              <p class="text-xs mt-1 text-[var(--sys-fg-dim)]">
                Verständliche Kurzfassung · keine juristische Ersatzfassung
              </p>
            </header>

            <!-- FAQ 1 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Werde ich auf dieser Website getrackt?</h3>
              <p>
                Nein. Ich betreibe kein personenbezogenes Tracking. Es werden keine Nutzerprofile erstellt und
                Besucherinnen und Besucher werden nicht über mehrere Websites hinweg verfolgt.
              </p>
            </div>

            <!-- FAQ 2 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Werden Cookies gesetzt?</h3>
              <p>
                Nein. Diese Website verwendet keine Tracking-Cookies. Im Browser werden ausschließlich
                funktionale Einstellungen gespeichert: Statistik-Präferenz, Onboarding-Status und die
                Soul-Session — kein Tracking, kein Profiling.
              </p>
            </div>

            <!-- FAQ 3 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Welche Statistik wird genutzt?</h3>
              <p>
                Ich nutze eine
                <strong class="text-[var(--sys-fg)]">anonyme, cookielose Reichweitenmessung</strong>
                (Plausible Analytics), um zu verstehen, welche Inhalte genutzt werden und wo ich diese Website
                verbessern kann.
              </p>
            </div>

            <!-- FAQ 4 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Welche Daten werden dabei erfasst?</h3>
              <p>
                Es werden ausschließlich anonymisierte, zusammengefasste Nutzungsdaten verarbeitet, z.&nbsp;B.
                aufgerufene Seiten oder grobe Geräteinformationen. IP-Adressen werden nicht im Klartext gespeichert.
              </p>
            </div>

            <!-- FAQ 5 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Kann ich das deaktivieren?</h3>
              <p>
                Ja. Über den Datenschutz-Dialog kannst du die anonyme Statistik jederzeit ablehnen oder wieder
                aktivieren. Deine Entscheidung wird ausschließlich lokal auf deinem Gerät gespeichert.
              </p>
            </div>

            <!-- FAQ 6 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Wo werden Daten verarbeitet?</h3>
              <p>
                Diese Website und die anonyme Statistik laufen auf Servern in Deutschland. Es findet kein Datentransfer
                in Drittstaaten statt.
              </p>
            </div>

            <!-- FAQ 7 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Wer hat Zugriff auf die Daten?</h3>
              <p>
                Ausschließlich ich als Betreiber dieser Website. Es erfolgt keine Weitergabe an Werbenetzwerke,
                Datenhändler oder sonstige Dritte.
              </p>
            </div>

            <!-- FAQ 8 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Sind meine Soul-Daten auf dem Server verschlüsselt?</h3>
              <p>
                Ja — Verschlüsselung ist Standard. sys.md und alle Vault-Dateien werden
                <strong class="text-[var(--sys-fg)]">standardmäßig mit AES-256-CBC verschlüsselt</strong>,
                bevor sie den Browser verlassen. Der Server speichert niemals Klartext — außer du aktivierst
                bewusst den Open-Modus (für Public-Network-Souls).
              </p>
            </div>

            <!-- FAQ 8b -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Kann ich den Vault ohne Verschlüsselung öffnen?</h3>
              <p>
                Nein. Der Vault-Zugang erfordert immer einen Schlüssel —
                <strong class="text-[var(--sys-fg)]">Passkey</strong> (biometrisch, gerätgebunden) oder
                <strong class="text-[var(--sys-fg)]">12 Wörter</strong> (BIP39, portabel und gerätunabhängig).
                Eine unverschlüsselte Vault-Session ist nicht möglich.
              </p>
            </div>

            <!-- FAQ 9 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Was bedeutet das für Cloud-Backups?</h3>
              <p>
                Cloud-Backups (Arweave, S3, eigener VPS) enthalten ausschließlich verschlüsselte Bytes —
                niemals Klartext. Das gilt auch bei KI-gesteuerten Backups via MCP-Tool
                (<code class="font-mono text-xs" style="color:var(--sys-violet)">soul_cloud_push</code>).
                Entschlüsseln ist nur lokal mit deinem Vault-Schlüssel möglich.
              </p>
            </div>

            <!-- FAQ 10 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Kann der Betreiber meine verschlüsselten Daten lesen?</h3>
              <p>
                Für den normalen API-Betrieb (MCP-Agenten, Webhooks, externe Dienste) speichert der Server einen abgeleiteten
                Vault-Schlüssel — das ermöglicht die serverseitige Entschlüsselung für autorisierte Dienste.
                Für maximale Privatsphäre ohne Serverbeteiligung gilt:
                <strong class="text-[var(--sys-fg)]">Bundle-Download (AES-256-GCM, 12 Wörter)</strong>
                — hier berührt der Schlüssel den Server nie. Portabel, langlebig, nachlasstauglich.
              </p>
            </div>

            <!-- FAQ 11 -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Mehrere Geräte – worauf muss ich achten?</h3>
              <p>
                Alle Geräte, mit denen du dich einloggst, müssen denselben Vault-Stand teilen.
                <strong class="text-[var(--sys-fg)]">Empfehlung:</strong> Nutze ein Gerät als primäres Gerät, lade dort
                deinen Vault-Ordner herunter und übertrage ihn auf alle anderen Geräte. Nur wenn sys.md und die
                Vault-Dateien identisch sind, funktionieren Ver- und Entschlüsselung zuverlässig — andernfalls entstehen
                Schlüssel-Konflikte, die Upload, Download und Sync blockieren können.
              </p>
              <p class="mt-2">
                Wenn Upload, Download oder Sync fehlschlagen: Schließe den Vault auf dem Server, wähle denselben
                Verschlüsselungsschlüssel wie beim ersten Einrichten, und synchronisiere erneut. Das stellt die
                Konsistenz zwischen lokalem Vault und Server wieder her.
              </p>
            </div>

            <!-- FAQ 12: POL-Zahlung -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Was wird bei POL-Zahlungen gespeichert?</h3>
              <p>
                Wenn externe KI-Agenten für den MCP-Zugang zahlen (optionaler Amortisierungs-Stack), werden
                <strong class="text-[var(--sys-fg)]">tx_hash, Absender-Wallet-Adresse, POL-Betrag und Zeitstempel</strong>
                in einer <code class="font-mono text-xs" style="color:var(--sys-violet)">earnings.json</code> auf dem VPS gespeichert.
                Diese Daten sind keine personenbezogenen Daten im engeren Sinne — sie bestehen ausschließlich aus
                öffentlichen Blockchain-Informationen. Sie sind über <code class="font-mono text-xs" style="color:var(--sys-violet)">GET /api/soul/earnings</code>
                nur mit soul_cert abrufbar (ausschließlich für dich).
              </p>
            </div>

            <!-- FAQ 13: IPFS-Registrierung -->
            <div>
              <h3 class="text-base font-semibold text-[var(--sys-fg)] mb-1">Was wird bei der IPFS-Registrierung veröffentlicht?</h3>
              <p>
                Die optionale IPFS-Registrierung (Agent-Marketplace) pinnt einen JSON-Blob auf Pinata/IPFS.
                Dieser enthält: <strong class="text-[var(--sys-fg)]">soul_id, Name (Plaintext), MCP-Endpunkt, Zahlungskonditionen und Wallet-Adresse</strong>.
                Diese Daten sind öffentlich und dauerhaft auf IPFS gespeichert — sie können nicht nachträglich
                gelöscht werden (IPFS ist content-addressed). Die Registrierung ist vollständig optional und wird
                nur auf deine ausdrückliche Anfrage (POST /api/soul/register) ausgeführt.
              </p>
            </div>

            <!-- Hinweis -->
            <div class="pt-4 border-t border-[var(--sys-border)]">
              <p class="text-xs text-[var(--sys-fg-dim)]">
                Diese Kurzfassung dient der Transparenz und besseren Verständlichkeit. Maßgeblich ist die vollständige
                Datenschutzerklärung.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch, nextTick, onUnmounted } from "vue";
import { X } from "lucide-vue-next";

const props = defineProps({ isOpen: Boolean });
const emit = defineEmits(["close"]);

const dialogRef = ref(null);
const closeButtonRef = ref(null);
let lastFocusedElement = null;

function emitClose() {
  emit("close");
}

function onKeydown(e) {
  if (e.key === "Escape") {
    emitClose();
  }
}

watch(
  () => props.isOpen,
  async (open) => {
    if (open) {
      lastFocusedElement = document.activeElement;
      await nextTick();
      closeButtonRef.value?.focus();
      document.addEventListener("keydown", onKeydown);
    } else {
      document.removeEventListener("keydown", onKeydown);
      lastFocusedElement?.focus();
    }
  }
);

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
});
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
