# Feature: Voice Agent (ElevenLabs Integration)

## Vision

Der Nutzer ruft über einen ElevenLabs-Link an — spricht mit einer KI-Stimme, die seine eigene ist — und interagiert dabei live mit seiner Soul, seinem Kalender, seinen Peers. Nach dem Gespräch werden Erkenntnisse automatisch gespeichert.

Kein Tippen. Kein App-Öffnen. Es passiert einfach.

---

## Architektur

```
Nutzer
  → ElevenLabs Link (extern, kein SYS-UI nötig)
    → ElevenLabs Conversational AI Agent
      → verify_identity (WebAuthn / Voice / Face)
      → Tool-Webhooks auf VPS
        → bestehende MCP-Logik (soul, mind, calendar, peers)
      → Post-Call Webhook
        → Claude analysiert Transkript
        → auto-write in Soul, Kalender, Peers
```

---

## Was bereits existiert

| Baustein | Tool / Datei | Bereit |
|---|---|---|
| Agent erstellen + Voice Clone | `create_agent` MCP | ✅ |
| Verifikation (WebAuthn, Face, Voice) | `verify_identity` MCP | ✅ |
| Soul lesen/schreiben | `soul_read` / `soul_write` MCP | ✅ |
| Gedanken | `mind_read` / `mind_write` MCP | ✅ |
| Kalender | `calendar_read` / `calendar_write` MCP | ✅ |
| Peer-Nachrichten | `peer_send` MCP | ✅ |
| Kontext-Dateien | `context_get` / `context_write` MCP | ✅ |

---

## Was gebaut wird

### 1 — VPS: Agent-Tool-Webhooks

ElevenLabs kann keine MCP-Tools direkt aufrufen. Jeder Endpunkt ist ein dünner Wrapper zur bestehenden Logik.

```
POST /api/agent/verify         → verify_identity (Gate — erstes Tool je Gespräch)
GET  /api/agent/context        → soul_read + mind_read
POST /api/agent/soul-write     → soul_write
POST /api/agent/mind-write     → mind_write
POST /api/agent/calendar       → calendar_write
POST /api/agent/peer-send      → peer_send
POST /api/agent/post-call      → Post-Call Filter (Transkript-Analyse)
```

**Auth:** Jeder Request trägt einen `agent_session_token` (HMAC-signiert, TTL 60 min, gebunden an `soul_id`). Kein Zugriff ohne gültige Session.

**Implementierung:** Lua-Handler in der bestehenden Nginx-Konfiguration.

### 2 — Tool-Definitionen in `create_agent`

`create_agent` bekommt die Webhook-URLs als Tool-Definitionen mitgegeben und registriert sie im ElevenLabs-Agenten. Einmaliger Setup-Schritt.

### 3 — Post-Call Filter

```
POST /api/agent/post-call
  ← ElevenLabs Webhook (nach Gesprächsende)
  → HMAC-Signatur von ElevenLabs prüfen
  → Claude analysiert Transkript:
       soul_write  ← Ideen, Entscheidungen, Erkenntnisse
       mind_write  ← offene Gedanken, Fragen
       calendar    ← erkannte Termine / Events
       peer_send   ← explizite Nachrichten ("Sag Till...")
  → fertig — vollautomatisch, kein UI
```

---

## Verifikations-Gate

`verify_identity` ist das **erste Tool** das der Agent in jedem Gespräch aufruft.

- Nutzt den **bestehenden `/api/verify/` Endpunkt** — kein Neubau, direkte Integration
- Methoden: `fingerprint` (WebAuthn) · `face` · `voice` — Nutzer wählt auf der Verify-Seite
- Kein sys.md, kein Wallet nötig
- Schlägt Verifikation fehl → Agent beendet Gespräch, keine weiteren Tool-Aufrufe

---

## Umsetzungsreihenfolge

```
1. create_agent aufrufen → Agent-ID + Voice Clone + ElevenLabs-Link
2. 7 Lua-Endpunkte auf VPS (inkl. Session-Token-Logik)
3. Tool-Definitionen in ElevenLabs-Agenten eintragen
4. System-Prompt konfigurieren (Soul-Kontext beim Start)
5. Post-Call Webhook
6. End-to-End Test: Anruf → Gespräch → Soul prüfen
```

---

## Phasen

### Phase 1 — Basis
Anruf funktioniert, Tools reagieren, Verifikation läuft. Soul und Kalender können per Sprache beschrieben werden.

### Phase 2 — Post-Call Filter
Gespräch endet → alles landet automatisch in der Soul. Kein Nacharbeiten.

### Phase 3 — Proaktiv *(später)*
Agent ruft den Nutzer aktiv an: Morgen-Briefing, Reminder vor Terminen. verify_identity als Gesprächseinstieg.

---

## Philosophischer Kern

Die Stimme des Agenten ist die eigene. Der Inhalt kommt aus der eigenen Soul. Das Ergebnis geht zurück in die eigene Soul.

Ein geschlossener Kreis — keine fremden Server, kein Vendor Lock-in, keine Daten die woanders landen.
