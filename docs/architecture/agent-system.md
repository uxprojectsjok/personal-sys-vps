# Agent System — Architektur

SYS hat zwei voneinander unabhängige Agenten-Systeme mit unterschiedlichen Zwecken.

---

## 1. KI-Auto — herz.mjs (session-aware)

**Datei:** `soul-mcp/lib/herz.mjs`  
**Aktivierung:** Manuell über den KI-Auto Button im Chat  
**Läuft:** Nur solange der User eingeloggt ist (Heartbeat-basiert)

### Aufgaben

| Trigger | Was passiert |
|---|---|
| `on_anchor` | Neue Growth-Chain-Einträge → Archivar schreibt Reflexion |
| `on_silence` | Kein Anker seit 3/7/14 Tagen → exponentieller Wachstumsdruck |
| `on_agent` | Neuer Eintrag im `<!-- AGENT:START -->` Block → bewerten, ggf. antworten |
| `circadian` | Morgen (6–9h) / Abend (21–23h) → Soft-Check |
| `health_check` | Session-Log zu lang, LONGMEM veraltet, Sektion > 600 Zeichen → Kristallisation |

### Mechanismus

- Tick-Intervall: alle 10 Minuten
- Heartbeat-Timeout: 30 Minuten ohne Ping → **automatische Deaktivierung**
- Verbraucht nur dann API-Token, wenn tatsächlich etwas zu tun ist
- Zustand vollständig in-memory (kein Persistenzlayer)

---

## 2. Autonomer Agent — sys-agent-run.sh (session-unabhängig)

**Datei:** `shared/sys-agent-run.sh` → deployed nach `/usr/local/bin/sys-agent-run.sh`  
**Aktivierung:** Cron `/etc/cron.d/sys-agent` — stündlich  
**Läuft:** Immer, unabhängig ob User eingeloggt ist

### Aufgaben

Verarbeitet `vault/context/agent.md` der jeweiligen Soul:

| Abschnitt | Bedeutung |
|---|---|
| `## Dauertasks` | Immer-aktive Regeln (erkannt an `**Status:** aktiv`) |
| `## Offene Tasks` | Einmalige Aufgaben (erkannt an `**Status:** offen` oder `- [ ]`) |
| `## Erledigte Tasks` | Archiv abgeschlossener Tasks |

### Mechanismus

- Startet Claude Code mit `--print` (non-interaktiv, exit nach Abschluss)
- Erkennt Pending-Tasks via Regex: `offen`, `- [ ]`, `aktiv`
- Kein Pending → idle, kein API-Verbrauch
- Jeder Lauf ist unabhängig — kein gemeinsamer State mit dem Vorgänger
- Crasht ein Lauf, startet der nächste Stunde neu

---

## Abgrenzung

| Merkmal | KI-Auto (herz.mjs) | Autonomer Agent |
|---|---|---|
| Läuft wenn | User aktiv im Chat | Immer (stündlich) |
| Scope | Soul-interne Pflege | Explizite Tasks aus agent.md |
| Trigger | Events + Timer | Cron |
| Kann abstürzen? | Nein (session-gebunden) | Nein (cron startet neu) |
| API-Verbrauch | Nur bei Bedarf | Nur wenn Tasks vorhanden |

Die beiden Systeme ergänzen sich: herz.mjs reagiert auf den lebendigen Moment (User ist da, etwas passiert), der autonome Agent hält den Betrieb aufrecht wenn niemand aktiv ist.
