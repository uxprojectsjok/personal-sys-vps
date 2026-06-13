# Verification Hub — Spec & Weiterentwicklung

Stand: 2026-06-13 · Seite: `/verbindung`

---

## Überblick

Die Verbindung-Seite ist ein **Verifikations-Hub**: Der Soul-Inhaber kann seine Identität biometrisch nachweisen — entweder auf eigene Initiative oder ausgelöst durch ein MCP-Tool (Claude AI).

Vier Stufen, aufsteigend nach Sicherheit:

| Stufe | Methode | Mechanismus | Datentransfer |
|---|---|---|---|
| 1 | Fingerabdruck | WebAuthn (Face ID / Touch ID / Windows Hello) | keiner — Secure Enclave |
| 2 | Gesicht | Kamera-Frame → Claude Haiku Vision | JPEG an eigenen Server |
| 3 | Stimme | Web Audio FFT-Spektrum vs. Vault-Audio | keiner — lokal im Browser |
| 4 | 2FA | Biometrik + Wallet-Signatur (ethers.js) | Signatur an eigenen Server |

---

## Dateistruktur

```
app/pages/verbindung.vue          UI — QR-Connect + 3 Tiles + 2FA-Karte
lua/verify_challenge.lua          POST /api/verify/challenge
lua/verify_pending.lua            GET  /api/verify/pending
lua/verify_complete.lua           POST /api/verify/complete
lua/verify_face_check.lua         POST /api/verify/face-check
lua/verify_2fa.lua                POST /api/verify/2fa
lua/verify_status.lua             GET  /api/verify/status?id=
soul-mcp/tools/verify_identity.mjs  MCP Tool
```

Challenge-Dateien: `/var/lib/sys/verify/<soul_id>_<challenge_id>.json` · TTL 300s

---

## API-Endpunkte

### `POST /api/verify/challenge`
Auth: soul_cert  
Body: `{ method: "fingerprint" | "face" | "voice" }`  
Response: `{ challenge_id, method, status: "pending", expires_at, verify_url }`

Erstellt eine Challenge. Wird sowohl vom MCP-Tool als auch vom Browser direkt aufgerufen (wenn der Nutzer ohne MCP-Kontext auf "Verifizieren" tippt).

---

### `GET /api/verify/pending`
Auth: soul_cert  
Response: `{ pending: [{ challenge_id, method, created_at, expires_at }] }`

App pollt alle 8 Sekunden. Zeigt einen Banner wenn Claude eine offene Challenge erstellt hat.

---

### `POST /api/verify/complete`
Auth: soul_cert  
Body: `{ challenge_id, method, verified: bool }`  
Response: `{ ok, challenge_id, verified, method, verified_at }`

Browser sendet das biometrische Ergebnis. `verified_level` bleibt `"biometric"` bis `verify_2fa` aufgerufen wird.

---

### `POST /api/verify/face-check`
Auth: soul_cert  
Body: `{ image_base64: "<JPEG base64>", mime: "image/jpeg" }`  
Response: `{ match: bool, confidence: "high"|"low", message }`

Liest `vault/images/profile.png` (entschlüsselt falls vault_key im Kontext). Sendet beide Bilder an `claude-haiku-4-5-20251001` mit Prompt: `"Do these two photos show the same person? Reply with exactly one word: MATCH or NO_MATCH."` Modell kann jederzeit in `verify_face_check.lua` auf Opus/Sonnet hochgestuft werden.

---

### `POST /api/verify/2fa`
Auth: soul_cert  
Body: `{ challenge_id, signature: "0x...", address: "0x..." }`  
Response: `{ ok, challenge_id, verified_level: "2fa" }`

Speichert Wallet-Signatur in der Challenge-Datei. Keine kryptografische Verifikation in Lua — das erledigt das MCP-Tool via ethers.js. Wenn `challenge_id` nicht existiert (standalone-2FA ohne biometrische Challenge), wird ein neues Challenge-File angelegt.

---

### `GET /api/verify/status?id=<challenge_id>`
Auth: soul_cert  
Response: vollständiges Challenge-JSON + `registered_wallet` aus `api_context.json`

Für das MCP-Tool: liefert alle Daten inkl. `wallet_2fa.signature` für ethers.js `verifyMessage`.

---

## Browser-Logik (`verbindung.vue`)

### Stimme — Web Audio FFT

```
Vault-Audio laden (/api/vault/audio → active_url)
  ↓ ArrayBuffer → AudioContext.decodeAudioData()
Mikrofon aufnehmen (3 Sekunden, MediaRecorder)
  ↓ Blob → ArrayBuffer → decodeAudioData()
Spektral-Envelope beider Audios
  ↓ FFT (Cooley-Tukey, frameSize=2048, hop=512)
  ↓ log(1 + magnitude) gemittelt über alle Frames
Kosinus-Ähnlichkeit der Envelopes
  ↓ score > 0.78 → verified
```

Schwellenwert 0.78 kann in `doVoice()` justiert werden. Score wird in % angezeigt.

**Bekannte Grenzen:**
- Encrypted Vault-Audio (SYS\x01 magic) schlägt fehl wenn Vault gesperrt ist
- Sehr unterschiedliche Mikrofonqualitäten können Score senken
- Hintergrundlärm beeinflusst hohe Frequenzen (< kritisch für Formanten)

**Verbesserungspfad:** Mel-Filterbank (40 Bänder, 100–8000 Hz) vor der Kosinusberechnung → MFCC-ähnliche Features → bessere Sprecheridentifikation unabhängig vom Inhalt.

---

### Gesicht — Claude Vision

```
Kamera öffnen (getUserMedia, facingMode: user)
  ↓ Live-Vorschau (gespiegelt für natürlichen Eindruck)
Nutzer klickt "Aufnehmen"
  ↓ Canvas.drawImage(video) → toDataURL('image/jpeg', 0.85)
  ↓ Base64 ohne data-URI-Prefix
POST /api/verify/face-check
  ↓ Server: liest vault/images/profile.png (decrypt if needed)
  ↓ Claude Haiku: MATCH / NO_MATCH
Ergebnis → verified / failed
```

**Verbesserungspfad (Liveness-Check):**  
Aktuell kein Anti-Spoofing gegen Foto-Angriffe. Optionen:
1. **Blink-Detection ohne ML**: Helligkeit im Augenbereich (oberes 1/4, mittlere 40% der Breite) tracken → 2 Helligkeitseinbrüche < 0.7 × EMA innerhalb 5s = 2 Blinzeln → capture
2. **face-api.js** `SsdMobilenetv1` + 68 Landmarks → Eye Aspect Ratio (EAR) < 0.25 = Blinzeln (erfordert ~12 MB Modelle in `/public/models/`)
3. **MediaPipe Face Mesh** (WASM, ~400 KB Modell) → präzisere Landmarks, leichtgewichtiger

---

### Fingerabdruck — WebAuthn

Ruft `authenticatePasskey()` aus `useSoulPasskey.js` auf. Gibt PRF-Output zurück (ArrayBuffer) — wird als Truthy-Check für `verified: true` verwendet. Der PRF-Output wird nicht gespeichert oder übertragen.

---

### 2FA Wallet

```
anyBiometricVerified === true → 2FA-Karte sichtbar
Nutzer klickt "Wallet verbinden & signieren"
  ↓ import('ethers') → BrowserProvider(window.ethereum)
  ↓ eth_requestAccounts
  ↓ signer.signMessage(activeChallengeId)
  ↓ signer.getAddress()
POST /api/verify/2fa { challenge_id, signature, address }
verifiedLevel = '2fa', walletShort anzeigen
```

`activeChallengeId` = entweder MCP-Challenge-ID oder frisch erstellte Challenge (aus `POST /api/verify/challenge`).

**Kryptografische Verifikation (noch offen):**  
Lua kann kein secp256k1 `ecrecover`. Aktuell vertraut der Server der übermittelten Adresse. Die Verifikation liegt beim MCP-Tool (`verify_identity.mjs`):

```js
import { verifyMessage } from 'ethers'
const recovered = verifyMessage(challenge_id, wallet_2fa.signature)
const valid = recovered.toLowerCase() === wallet_2fa.address.toLowerCase()
// Optional: gegen status.registered_wallet abgleichen
```

→ **TODO**: In `verify_identity.mjs` ethers.js `verifyMessage` aktivieren sobald ethers als direkte soul-mcp Dependency verfügbar ist (aktuell transitiv über @reown/appkit-adapter-ethers im Frontend).

---

## MCP Tool `verify_identity`

```
verify_identity({ method: "fingerprint" })
→ { challenge_id, verify_url, expires_at, ... }

verify_identity({ challenge_id: "abc123..." })
→ { status: "pending" | "verified" | "failed", verified_level, ... }
```

`verified_level`:
- `"biometric"` — eine Methode erfolgreich
- `"2fa"` — Biometrik + Wallet-Signatur

Typischer Claude-Flow:
1. `verify_identity({ method: "fingerprint" })` → Challenge erstellen, URL ausgeben
2. Nutzer öffnet App, verifiziert
3. `verify_identity({ challenge_id: "..." })` → Status prüfen
4. Optional: `verify_identity({ challenge_id: "..." })` nach 2FA erneut → `verified_level: "2fa"`

---

## Challenge-Datei Format

```json
{
  "soul_id": "2c81aa74-...",
  "challenge_id": "a3f8b2c1...",
  "method": "fingerprint",
  "status": "verified",
  "verified_level": "2fa",
  "created_at": "2026-06-13T12:00:00Z",
  "expires_at": "2026-06-13T12:05:00Z",
  "verified_at": "2026-06-13T12:01:23Z",
  "wallet_2fa": {
    "address": "0xAbCd...1234",
    "signature": "0x...",
    "signed_at": "2026-06-13T12:02:10Z"
  }
}
```

---

## Offene TODOs / Weiterentwicklung

- [ ] **Liveness-Check Gesicht** — Blinzel-Detection (s. o.)
- [ ] **MFCC-Stimme** — Mel-Filterbank für bessere Sprecheridentifikation
- [ ] **ethers.js verifyMessage** in `verify_identity.mjs` aktivieren (soul-mcp package.json)
- [ ] **Vault-Audio Fallback** — wenn vault gesperrt: Fehler mit Anleitung zum Entsperren
- [ ] **Challenge-Cleanup** — abgelaufene JSON-Dateien in `/var/lib/sys/verify/` löschen (Cron oder bei `verify_pending`)
- [ ] **Bewegungs-Verifikation** (motion_face / motion_body aus Vault) — verschoben, da Liveness via Blinzeln ausreichend
- [ ] **registered_wallet-Abgleich** — `verified_wallet` aus `api_context.json` gegen 2FA-Adresse prüfen

---

## Vault-Referenzdaten

| Typ | Pfad | Verwendet für |
|---|---|---|
| Gesicht | `vault/images/profile.png` | Claude Vision Vergleich |
| Stimme | `vault/audio/voice_<soul_id>_<datum>.mp3` | FFT Spektralvergleich |
| Bewegung | `vault/video/motion_face_*.mp4` | (noch nicht implementiert) |
| Profil-JSON | `vault/profile/face.json` etc. | strukturierte Metadaten |
