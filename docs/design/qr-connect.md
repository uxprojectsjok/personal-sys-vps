# QR-Connect — Design Spec

> Visueller Bereich für den QR-Connect-Flow (Google-Pay-Stil).  
> Logik und API-Implementierung folgen separat — hier nur UI/UX-Struktur und States.

---

## Kontext

SYS ist eine persönliche KI-Node. Der Inhaber kann seinen MCP-Endpoint per QR-Code freigeben. Jemand scannt den Code, der Inhaber bestätigt per Tap in der App. Proof-of-Concept: der Fremde erhält ein „Hello from [Name]!" zurück.

---

## 1. Einstiegspunkt — Button im Dashboard

Neuer Button im Profil-Bereich oder als eigene Karte.

- Label: `Verbindung freigeben`
- Subtext: `MCP-Endpoint via QR teilen`
- Icon: QR-Code

---

## 2. QR-Code Modal

Öffnet sich nach Button-Klick.

```
┌─────────────────────────────┐
│  SYS · Verbindung freigeben │
│                             │
│    ┌───────────────────┐    │
│    │                   │    │
│    │    [QR-CODE]      │    │
│    │    240×240 px     │    │
│    │                   │    │
│    └───────────────────┘    │
│                             │
│  Scanne diesen Code         │
│  Läuft ab in 01:58 ●        │
│                             │
│         [Schließen]         │
└─────────────────────────────┘
```

- Countdown wird rot wenn < 30 Sekunden
- TTL gesamt: 120 Sekunden

---

## 3. Bestätigungs-State (jemand hat gescannt)

Modal wechselt automatisch.

```
┌─────────────────────────────┐
│  ● Verbindungsanfrage        │
│                             │
│  Jemand möchte sich         │
│  verbinden                  │
│                             │
│  ┌──────────┐ ┌──────────┐  │
│  │ Ablehnen │ │ Zulassen │  │
│  └──────────┘ └──────────┘  │
└─────────────────────────────┘
```

- Pulsierender Punkt neben „Verbindungsanfrage"
- `Zulassen`: primärer Button
- `Ablehnen`: sekundärer Button

---

## 4. Erfolgs-State

```
┌─────────────────────────────┐
│  ✓ Verbunden                │
│                             │
│  Verbindung bestätigt       │
│                             │
│         [Fertig]            │
└─────────────────────────────┘
```

---

## 5. Neue Seite `/connect` — für den Fremden

Öffnet sich im Browser nach QR-Scan.

### Warte-State

```
┌─────────────────────────────┐
│  SYS.                       │
│                             │
│  Verbindungsanfrage         │
│  wird gesendet…             │
│                             │
│    ◌  (Spinner)             │
│                             │
│  Warte auf Bestätigung      │
│  durch den Node-Inhaber     │
└─────────────────────────────┘
```

### Erfolgs-State

```
┌─────────────────────────────┐
│  SYS.                       │
│                             │
│  ✓  Verbunden               │
│                             │
│  Hello from [Name]!         │
│                             │
│  Node verifiziert · ●       │
└─────────────────────────────┘
```

### Fehler-State

```
┌─────────────────────────────┐
│  SYS.                       │
│                             │
│  ✗  Verbindung abgelehnt    │
│     oder Code abgelaufen    │
│                             │
│    [Erneut versuchen]       │
└─────────────────────────────┘
```

---

## Komponenten

| Komponente | Datei | Beschreibung |
|------------|-------|--------------|
| QR-Button | `app/pages/index.vue` | Einstiegspunkt im Dashboard |
| QR-Modal | `app/components/QrConnectModal.vue` | States: `idle → qr → pending → approved` |
| Connect-Page | `app/pages/connect.vue` | Scan-Zielseite für den Fremden |

**Status-Prop für das Modal:** `"idle" | "qr" | "pending" | "approved" | "rejected" | "expired"`  
**QR-Placeholder:** `<div class="qr-placeholder" />` 240×240px — wird zur Laufzeit befüllt  
**Countdown:** als Variable `{timeLeft}` — kein hardcodierter Wert
