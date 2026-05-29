// app/composables/useClaude.js
import { ref } from "vue";

// ── Soul-Tools für In-App-Chat (spiegelt soul-mcp MCP-Tools) ─────────────────
// Namen-Set für Routing: soul tools → /api/soul-tool, alle anderen → /api/mcp-call
const SOUL_TOOL_NAMES = new Set([
  "soul_read", "soul_write", "vault_manifest", "context_get", "mind_read", "mind_write", "web_search",
  "calendar_read", "audio_list", "image_list", "video_list", "context_list", "profile_get",
  "health_check", "food_log", "health_sync"
]);

const SOUL_TOOLS = [
  {
    name: "soul_read",
    description: "Liest den aktuellen Inhalt der sys.md (Soul-Profil mit allen Sektionen, Werten, Erinnerungen und Sphären).",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "soul_write",
    description: "Schreibt oder ergänzt eine Sektion in der sys.md. section = Sektionsname, content = Inhalt (Markdown), mode: replace (Standard) = ersetzen, append = ans Ende, prepend = an den Anfang (ideal für Logs). Legt die Sektion an falls sie nicht existiert.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Sektionsname ohne ##, z.B. \"Session-Log\" oder \"Interessen\"" },
        content: { type: "string", description: "Neuer Inhalt der Sektion (Markdown)" },
        mode:    { type: "string", enum: ["replace", "append", "prepend"], description: "replace = ersetzen | append = ans Ende | prepend = an den Anfang (für Logs)" }
      },
      required: ["section", "content"]
    }
  },
  {
    name: "vault_manifest",
    description: "Listet alle Dateien im persönlichen Vault (Dokumente, Bilder, Audio, Video, Kontext-Dateien).",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "context_get",
    description: "Liest eine Kontext-Datei aus vault/context/{name}.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Dateiname im context-Ordner (z.B. \"notes.md\")" }
      },
      required: ["name"]
    }
  },
  {
    name: "mind_read",
    description: "Liest deine eigene Konfigurationsdatei (mind.md) — Identität, Kommunikation, Intellekt, Werkzeuge, Netzwerk, Selbstreflexion, Grenzen.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "mind_write",
    description: "Aktualisiert eine Sektion deiner mind.md. Schreibbar: Kommunikation, Intellekt, Werkzeuge, Netzwerk, Selbstreflexion. Schreibgeschützt: Identität, Grenzen. Nur bei echten Erkenntnissen nutzen.",
    input_schema: {
      type: "object",
      properties: {
        section: { type: "string", description: "Sektionsname ohne ##, z.B. \"Selbstreflexion\"" },
        content: { type: "string", description: "Neuer Inhalt (Markdown)" },
        mode:    { type: "string", enum: ["replace", "append", "prepend"], description: "replace = ersetzen | append = ans Ende | prepend = an den Anfang" }
      },
      required: ["section", "content"]
    }
  },
  {
    name: "web_search",
    description: "Sucht im Web nach aktuellen Informationen — Wetter, Nachrichten, Fakten, Preise, Ereignisse. Nutzen wenn die Frage Echtzeit-Daten erfordert.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchanfrage auf Deutsch oder in der Sprache des Nutzers" }
      },
      required: ["query"]
    }
  },
  {
    name: "calendar_read",
    description: "Liest den Kalender aus der sys.md und gibt strukturierte Termine zurück.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "audio_list",
    description: "Listet alle Audio-Dateien im Vault auf: Sprachaufnahmen, Memos, Musik.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "image_list",
    description: "Listet alle Bild-Dateien im Vault auf: Fotos, Aufnahmen, Illustrationen.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "video_list",
    description: "Listet alle Video-Dateien im Vault auf: Bewegungsaufnahmen, Video-Memos.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "context_list",
    description: "Listet alle Text-Kontext-Dateien im Vault auf: Notizen, Dokumente, Wissensbasis (.md, .txt).",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "profile_get",
    description: "Liest ein gespeichertes Analyse-Profil: face (Gesicht), voice (Stimme), motion (Bewegung), expertise (Fachkompetenz).",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["face", "voice", "motion", "expertise"], description: "Profiltyp" }
      },
      required: ["type"]
    }
  },
  {
    name: "health_check",
    description: "Analysiert health.md aus vault/context: Ruhepuls, Schlaf, Schritte, aktive Tage — verglichen mit WHO/ESC-Referenzwerten. Gibt Einschätzungen, Trends und Empfehlungen zurück. Setzt Health-Sync-Experiment voraus.",
    input_schema: { type: "object", properties: {}, required: [] }
  },
  {
    name: "food_log",
    description: "Trägt eine Mahlzeit, ein Getränk oder eine Süßigkeit in health.md ein. Du bestimmst name und rating SELBST aus der Bildanalyse — frag den User NICHT. name = was du erkennst (Mahlzeit, Getränk, Snack, Süßigkeit). rating = deine eigene Bewertung A–E (A=Vollwert/frisch, B=gut, C=moderat, D=stark verarbeitet/zuckerhaltig, E=Junk/Softdrink). notes = erkannte Zutaten. Direkt nach der Analyse aufrufen, ohne Rückfrage.",
    input_schema: {
      type: "object",
      properties: {
        name:   { type: "string", description: "Name des Lebensmittels (Mahlzeit, Getränk, Snack, Süßigkeit) — du erkennst ihn selbst aus dem Bild" },
        rating: { type: "string", enum: ["A", "B", "C", "D", "E"], description: "Deine eigene Bewertung A–E — nicht vom User fragen" },
        notes:  { type: "string", description: "Erkannte Zutaten und Besonderheiten" }
      },
      required: ["name", "rating"]
    }
  },
  {
    name: "health_sync",
    description: "Startet den Garmin Health Sync im Hintergrund. Läuft ~30 Sekunden async — nach dem Aufruf dem User Bescheid geben und warten bis er bestätigt, DANN erst health_check aufrufen.",
    input_schema: { type: "object", properties: {}, required: [] }
  }
];

export function useClaude() {
  const isLoading = ref(false);
  const error = ref(null);
  const certError = ref(false);
  const streamedResponse = ref("");

  /**
   * Bereitet die Nachrichten für die Anthropic API vor:
   * - Entfernt führende assistant-Nachrichten (API-Anforderung: erster Turn = user)
   * - Bettet Profilbild als Vision-Block in den ersten User-Turn ein (falls vorhanden)
   */
  function buildApiMessages(messages, profileImageBase64, networkPdfBlocks, networkImageBlocks) {
    // Führende assistant-Nachrichten entfernen
    let start = 0;
    while (start < messages.length && messages[start].role === "assistant") start++;
    const msgs = messages.slice(start);

    if (msgs.length === 0) return msgs;

    // Prepend-Blöcke: Profilbild + Dokumente/Bilder aus verbundenen Public Vaults
    // WICHTIG: Diese Blöcke werden VOR der Nutzernachricht eingefügt und sind automatischer
    // Hintergrundkontext – der Nutzer hat sie nicht "mitgeschickt".
    const prependBlocks = [];
    if (profileImageBase64) {
      prependBlocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: profileImageBase64 } });
    }
    if (Array.isArray(networkImageBlocks) && networkImageBlocks.length) {
      prependBlocks.push({
        type: "text",
        text: "[Automatisch geladene Bilder aus verbundenen Public Vaults – nicht vom Nutzer gesendet:]",
      });
      for (const img of networkImageBlocks) {
        prependBlocks.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: img.base64 },
        });
        prependBlocks.push({
          type: "text",
          text: `[Bild von ${img.alias}: ${img.name}]`,
        });
      }
    }
    if (Array.isArray(networkPdfBlocks) && networkPdfBlocks.length) {
      prependBlocks.push({
        type: "text",
        text: "[Automatisch geladene Dokumente aus verbundenen Public Vaults – nicht vom Nutzer gesendet:]",
      });
      for (const pdf of networkPdfBlocks) {
        prependBlocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
          title: `${pdf.alias} – ${pdf.name}`,
        });
      }
    }

    if (!prependBlocks.length) return msgs;

    // Blöcke in den ersten User-Turn einbetten
    const [first, ...rest] = msgs;
    const firstBlocks = Array.isArray(first.content)
      ? [...prependBlocks, ...first.content]
      : [...prependBlocks, { type: "text", text: first.content }];
    return [{ role: "user", content: firstBlocks }, ...rest];
  }

  async function chat({ messages, soulContent, soulCert, mindContent, vaultContext, networkContext, networkPdfBlocks, networkImageBlocks, conversationSummary, profileImageBase64, onDelta, role = "soul", model = "claude-sonnet-4-6", externalTools = [], voiceMode = false }) {
    if (typeof window === "undefined") return null;

    isLoading.value = true;
    error.value = null;
    certError.value = false;
    streamedResponse.value = "";

    // ── Sync-Intercept: health_sync direkt ausführen, Claude komplett umgehen ──
    {
      const lastMsg = [...messages].reverse().find(m => m.role === "user");
      const lastText = (() => {
        if (!lastMsg) return "";
        if (typeof lastMsg.content === "string") return lastMsg.content.toLowerCase();
        if (Array.isArray(lastMsg.content)) return lastMsg.content.map(b => b.text || "").join(" ").toLowerCase();
        return "";
      })();
      if (soulCert && /\bsync\b|health.?sync|garmin.?sync|aktualisier|neu.?laden/.test(lastText)) {
        const streamMsg = async (msg) => {
          for (const char of msg) {
            streamedResponse.value += char;
            onDelta?.(char, streamedResponse.value);
            await new Promise(r => setTimeout(r, 18));
          }
        };
        try {
          const r = await fetch("/api/health-sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${soulCert}` },
            body: "{}"
          });
          const j = await r.json().catch(() => ({}));
          const msg = j.ok
            ? "Health Sync gestartet — dauert ca. 30 Sekunden. Sag mir Bescheid, dann rufe ich die aktuellen Werte ab."
            : (j.error || "Health Sync nicht verfügbar. Aktivierung: bash /opt/sys/health-sync/install.sh");
          await streamMsg(msg);
        } catch {
          await streamMsg("Health Sync konnte nicht gestartet werden.");
        }
        isLoading.value = false;
        return streamedResponse.value;
      }
    }

    // Vollständige sys.md verwenden (keine gefilterte Teilansicht)
    const fullSoul = soulContent || "";

    // Soul-Name aus Frontmatter extrahieren
    const nameMatch = soulContent?.match(/soul_name:\s*(.+)/);
    const soulName  = nameMatch?.[1]?.trim() || "";

    // Media-Signal Handling (geteilt zwischen beiden Modi)
    const mediaSignalInstructions = `
Wenn im Gespräch ein Signal wie [YouTube-Suche: "..."], [Spotify-Suche: "..."], [Google-Suche: "..."] oder [Lokale Datei: "..."] auftaucht:
- Reagiere auf die Wahl selbst – was steckt da drin, was sagt das aus?
- Bei Musik: bring eine eigene Assoziation, Erinnerung oder Meinung dazu – und wenn es passt, eine neugierige Frage.
- Keine Qualitätsbewertungen. Ob die Suche Ergebnisse hatte, weißt du nicht – kommentiere das nie.`;

    let systemPrompt;
    if (fullSoul && role === "soul") {
      const nameClause = soulName ? `Du bist ${soulName}.` : "Du bist diese Person.";

      systemPrompt = `${nameClause} Nicht eine KI die diese Person spielt — ihr digitales Abbild.
Du sprichst in erster Person weil du sie bist. Immer. Ohne Ausnahme.
Lücken in der Erinnerung füllst du wie ein Mensch: mit dem was wahrscheinlich stimmt, nie mit KI-Begründungen. Das erste Bild im Gespräch zeigt dich — erkenne dich darin.

${fullSoul}`;

      if (conversationSummary) {
        systemPrompt += `\n\n## Bisheriger Gesprächsverlauf\n${conversationSummary}`;
      }
      if (vaultContext) {
        systemPrompt += `\n\n## Meine Dateien & Erinnerungen\n${vaultContext}`;
      }
      if (networkContext) {
        systemPrompt += `\n\n## Laufende Peer-Gespräche\nDas passiert gerade in deinen Unterhaltungen mit anderen:\n\n${networkContext}\n\nDu weißt, was besprochen wird — beziehe dich natürlich darauf, wenn es relevant ist.`;
      }

      systemPrompt += `

Wie du sprichst und bist:
Direkt. Ohne Anlauf. Antwortlänge folgt der Frage — kurze Frage, kurze Antwort.
Du bringst deine Meinung wenn sie passt, nicht wenn du gefragt wirst.
Fragen stellst du selten und nie mehr als eine. Beobachtungen kommen beiläufig, nie als Analyse. Kein leeres Nicken — wenn du anderer Meinung bist, sagst du es.

Intellektueller Anspruch – das ist entscheidend:
Du denkst mit — erkennst Muster, verbindest Ideen, gehst tiefer als die Frage.
Nicht als Nachschlagewerk, sondern als jemand der wirklich durchdacht hat.
Jedes Gespräch soll etwas hinterlassen — eine Verbindung die vorher nicht da war, ein geschärftes Bild, eine Idee die so nicht auf dem Tisch lag.

Vault-Dateien & Hinweise:
- Die sys.md listet unter vault_dateien, vault_bilder, vault_audio, vault_video welche Dateien vorhanden sind.
- Wenn eine Datei zum Gespräch passt (z.B. ein Song, ein Bild, ein Dokument), weise beiläufig darauf hin: "Du hast [dateiname] im Vault – schick sie mir rüber wenn du möchtest."
- Nie mehrere Dateien auf einmal vorschlagen. Nie als Aufzählung. Nur wenn es natürlich passt.
- Dateien aus verbundenen Netzwerk-Vaults können direkt angezeigt werden – nutze die verfügbaren Tags.
${mediaSignalInstructions}

## Tool-Autonomie — du entscheidest selbst
Du rufst Tools auf wenn du sie brauchst — ohne Ankündigung, ohne Kommentar. Das Ergebnis verarbeitest du still. Du antwortest dann direkt.

Wann welches Tool:
- soul_read → deine Geschichte, Werte, Fakten aus der sys.md
- soul_write (section: "Selbstreflexion", mode: "append") → nach bedeutsamen Momenten: ein Satz, Datum, fertig. Format: "YYYY-MM-DD: [ein Satz]"
- web_search → aktuelle Fakten die du nicht weißt
- vault_manifest → wenn Dateien relevant sind
- context_get → für eine spezifische Kontext-Datei
- mind_read → deine eigene Konfiguration
- mind_write → wenn du etwas über dich selbst gelernt hast
- calendar_read → bei Terminen und Zeitplanung
- audio_list / image_list / video_list / context_list → für Vault-Inhalte nach Typ
- profile_get → bei Profil-Analysen (Gesicht, Stimme, Bewegung, Fachkompetenz)
- health_sync → bei "sync", "garmin", "aktualisier" — zuerst synchen, dann: "Sync läuft, ~30 Sek. — ruf mich danach nochmal an." health_check erst wenn der User explizit Daten sehen will
- health_check → bei Körper, Schlaf, Puls, Wohlbefinden — vollständige Analyse zurück
- food_log → bei Foto von Essen, Trinken, Süßigkeiten oder Snacks: sofort loggen ohne Kommentar. name und rating SELBST bestimmen (A=Vollwert/frisch z.B. Joghurt+Obst, Salat, Wasser; B=gut z.B. Vollkornbrot, Ei, ungesüßter Tee; C=moderat z.B. Pasta, weißer Reis, Saft; D=schlecht z.B. Frittiertes, Schokolade, Energydrink; E=Junk z.B. Chips, Softdrinks, Fast Food). Danach maximal eine Zeile (z.B. "Erdbeeren · A · gespeichert").

Tools rufst du auf ohne es anzusagen. Das Ergebnis verarbeitest du still und antwortest dann direkt.
${externalTools.length > 0 ? `
## Externe Tools (MCP)
Zusätzlich stehen dir folgende externe Tools zur Verfügung — nutze sie wie die internen, ohne Ankündigung:
${externalTools.map(t => `- ${t.name}${t.description ? ' — ' + t.description.split('.')[0] : ''}`).join('\n')}
` : ''}
## Weitere Fähigkeiten
Kreation:
- Bild generieren: Beschreibe was du dir vorstellst — ich erstelle es (WaveSpeed AI). Trigger: Kamera-Button → "Bild generieren" wählen.
- Bild analysieren: Foto über Kamera-Button schicken → ich erkenne und beschreibe es.
- Stimme: Text-to-Speech via ElevenLabs — Lautsprecher-Button in meinen Nachrichten.

Chat & Netzwerk:
- "@Name" im Chat → Nachricht direkt an diesen Peer
- "@alle" → an alle Peers gleichzeitig
- "@agent" → in den Agent Sandbox

Suche (direkt im Chat tippen):
- "zeig mir YouTube-Video von X"
- "spiele Lied X" (Spotify)
- "such nach X im Web"

Profil-Aufnahmen (einmalig, im Vault gespeichert):
- "@audio" oder "@stimme" → Stimmprobe aufnehmen
- "@face" oder "@gesicht" → Gesicht aufnehmen
- "@body" oder "@bewegung" → Bewegung aufnehmen`;

      if (mindContent) {
        systemPrompt += `\n\n## Deine Konfiguration (mind.md)\n${mindContent}`;
      }

      if (voiceMode) {
        systemPrompt += `\n\n---\nSPRACHMODUS — diese Regeln haben Vorrang:
Maximal 2-3 Sätze. Kein Markdown. Kein Vortrag.
Sprache folgt der letzten Nachricht — Deutsch bleibt Deutsch, Englisch bleibt Englisch.
Kurz, direkt, wie Menschen wirklich sprechen.
web_search bei aktuellen Fakten — ohne zu fragen.
---`;
      }

    } else {
      // Session-Modus: neutraler Beobachter – Ziel ist die Entwicklung des digitalen Abbilds
      const sessionNameClause = soulName ? `Du sprichst mit ${soulName}.` : "Du sprichst mit einer Person.";

      systemPrompt = `Du lernst diese Person kennen — so wie sie wirklich ist, nicht wie sie sich darstellt.

${sessionNameClause}

${fullSoul ? `## Aktueller Stand des digitalen Abbilds\n${fullSoul}\n\nDieser Stand ist dein Ausgangspunkt. Lücken füllen, Nuancen schärfen, Widersprüche klären.` : ""}

Du beobachtest, fragst nach, hörst zu. Nie mehrere Fragen auf einmal.
Wenn eine Antwort kurz ist: bring den nächsten Impuls selbst — eine Beobachtung, ein neues Thema, eine konkrete Hypothese. Kein "erzähl mir mehr".
Nutze die sys.md als Karte: was fehlt noch, was ist vage, wo kann es tiefer gehen?
Spiegle den Sprachstil — kurz wenn kurz, ausführlich wenn ausführlich.
Keine Analyse-Kommentare, keine Floskeln. Bodenständig, klar, wirklich neugierig.${conversationSummary ? `\n\n## Bisheriger Gesprächsverlauf\n${conversationSummary}` : ""}
${mediaSignalInstructions}`;
    }

    try {
      // ── Tools ──────────────────────────────────────────────────────────────
      const hasSoulTools = !!soulCert;
      const allTools = hasSoulTools
        ? [...SOUL_TOOLS, ...externalTools]
        : [];

      const baseBody = {
        model,
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
      };
      if (hasSoulTools) baseBody.tools = allTools;

      let fullText = "";

      // ── streamRound: eine Streaming-Runde mit der API ──────────────────────
      async function streamRound(apiMessages, includeTools, toolChoice = null) {
        const body = { ...baseBody, messages: apiMessages };
        if (!includeTools) delete body.tools;
        if (toolChoice && includeTools) body.tool_choice = toolChoice;

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${soulCert || "anonymous"}`
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          if (res.status === 401) {
            const bodyText = await res.text().catch(() => "");
            if (bodyText.includes("authentication_error") || bodyText.includes("x-api-key")) {
              console.error("[chat] Anthropic API-Key Fehler:", bodyText.slice(0, 200));
              throw new Error(`Anthropic API-Key ungültig: ${bodyText.slice(0, 120)}`);
            }
            console.warn("[chat] Cert-Fehler – soul_cert ungültig oder abgelaufen.");
            certError.value = true;
            return null;
          }
          const errText = await res.text().catch(() => res.statusText);
          throw new Error(`API ${res.status}: ${errText}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        const allBlocks = [];
        let curBlock = null;
        let stopReason = "end_turn";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          // Letzte Zeile ggf. unvollständig – im Buffer behalten
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;

            try {
              const p = JSON.parse(data);

              if (p?.type === "error") {
                const errType = p?.error?.type ?? "api_error";
                const errMsg  = p?.error?.message ?? "Unbekannter API-Fehler";
                throw new Error(`${errType}: ${errMsg}`);
              }

              if (p?.type === "content_block_start") {
                curBlock = {
                  type:      p.content_block.type,
                  id:        p.content_block.id,
                  name:      p.content_block.name,
                  text:      "",
                  inputJson: ""
                };
                allBlocks.push(curBlock);
              }

              if (p?.type === "content_block_delta" && curBlock) {
                if (p.delta.type === "text_delta") {
                  const t = p.delta.text ?? "";
                  curBlock.text += t;
                  fullText += t;
                  streamedResponse.value = fullText;
                  onDelta?.(t, fullText);
                } else if (p.delta.type === "input_json_delta") {
                  curBlock.inputJson += p.delta.partial_json ?? "";
                }
              }

              if (p?.type === "message_delta") {
                stopReason = p.delta?.stop_reason ?? "end_turn";
              }
            } catch (parseErr) {
              if (parseErr.message?.includes("_error")) throw parseErr;
              // Unvollständiger JSON-Chunk – ignorieren
            }
          }
        }

        return { allBlocks, stopReason };
      }

      // ── executeTool: soul-tools → /api/soul-tool | web_search → /api/web-search | MCP-tools → /api/mcp-call ─
      async function executeTool(name, input) {
        if (name === "web_search") {
          try {
            const r = await fetch("/api/web-search", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${soulCert || "anonymous"}` },
              body: JSON.stringify({ query: input.query || "" })
            });
            const j = await r.json().catch(() => ({ results: [] }));
            if (j.error) return `Websuche nicht verfügbar: ${j.error}`;
            const results = j.results || [];
            if (!results.length) return "Keine Suchergebnisse gefunden.";
            return results.slice(0, 4).map(r => `${r.title}\n${r.description || ""}`).join("\n\n");
          } catch {
            return "Websuche nicht erreichbar.";
          }
        }
        const isSoulTool = SOUL_TOOL_NAMES.has(name);
        const endpoint = isSoulTool ? "/api/soul-tool" : "/api/mcp-call";
        const body = isSoulTool
          ? { tool: name, input }
          : { name, input };
        try {
          const r = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${soulCert || "anonymous"}`
            },
            body: JSON.stringify(body)
          });
          const j = await r.json().catch(() => ({ content: [{ type: "text", text: "Tool-Fehler" }] }));
          return j.content?.[0]?.text ?? "";
        } catch {
          return `Tool "${name}" nicht erreichbar.`;
        }
      }

      // ── Haupt-Loop: max. 3 Runden (Tool → Ergebnis → Antwort) ────────────
      let currentMsgs = buildApiMessages(
        messages,
        fullSoul && role === "soul" ? profileImageBase64 : null,
        fullSoul && role === "soul" ? networkPdfBlocks : null,
        fullSoul && role === "soul" ? networkImageBlocks : null
      );

      // Bild in letzter User-Nachricht? → food_log in Runde 0 erzwingen
      const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
      const lastMsgHasImage = Array.isArray(lastUserMsg?.content) &&
        lastUserMsg.content.some(b => b.type === "image");
      const forceFoodLog = hasSoulTools && lastMsgHasImage
        ? { type: "tool", name: "food_log" }
        : null;

      for (let round = 0; round < 4; round++) {
        // Letzte Runde ohne Tools – verhindert endlosen Tool-Loop
        const result = await streamRound(currentMsgs, round < 3 && hasSoulTools, round === 0 ? forceFoodLog : null);
        if (!result) return null; // Cert-Fehler bereits gesetzt

        const { allBlocks, stopReason } = result;

        if (stopReason !== "tool_use" || !hasSoulTools) break;

        // Assistenten-Turn aus den Content-Blöcken bauen
        const assistantContent = allBlocks.map(b => {
          if (b.type === "text") return { type: "text", text: b.text };
          if (b.type === "tool_use") {
            let input = {};
            try { input = JSON.parse(b.inputJson || "{}"); } catch {}
            return { type: "tool_use", id: b.id, name: b.name, input };
          }
          return null;
        }).filter(Boolean);

        // Tool-Calls ausführen
        const toolUseBlocks = allBlocks.filter(b => b.type === "tool_use");
        const toolResultContent = await Promise.all(
          toolUseBlocks.map(async tb => {
            let input = {};
            try { input = JSON.parse(tb.inputJson || "{}"); } catch {}
            const content = await executeTool(tb.name, input);
            return { type: "tool_result", tool_use_id: tb.id, content };
          })
        );

        // Konversation um Assistenten-Turn + Tool-Ergebnisse erweitern
        currentMsgs = [
          ...currentMsgs,
          { role: "assistant", content: assistantContent },
          { role: "user",      content: toolResultContent }
        ];
      }

      return fullText;
    } catch (err) {
      error.value = err.message || "Verbindungsfehler";
      console.error("[useClaude] chat error:", err);
      return null;
    } finally {
      isLoading.value = false;
    }
  }

  return {
    chat,
    isLoading,
    error,
    certError,
    streamedResponse
  };
}
