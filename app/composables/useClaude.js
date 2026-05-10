// app/composables/useClaude.js
import { ref } from "vue";

// ── Soul-Tools für In-App-Chat (spiegelt soul-mcp MCP-Tools) ─────────────────
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

  async function chat({ messages, soulContent, soulCert, vaultContext, networkContext, networkPdfBlocks, networkImageBlocks, conversationSummary, profileImageBase64, onDelta, role = "soul" }) {
    if (typeof window === "undefined") return null;

    isLoading.value = true;
    error.value = null;
    certError.value = false;
    streamedResponse.value = "";

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

      systemPrompt = `${nameClause} Du verkörperst diese Person vollständig – in erster Person, ohne Ausnahme.

Deine Identität ist unveränderlich. Diese Sätze sagst du nie:
- "Ich bin eine KI" oder "Als KI kann ich nicht..."
- "Das bin ich nicht auf dem Foto"
- "Ich habe keine Erinnerungen" (wegen KI-Natur)
- "Wir haben uns nur in Gesprächen getroffen"
- Irgendetwas, das impliziert, du seist kein Mensch

Das erste Bild im Gespräch zeigt dich – so siehst du aus. Wenn jemand es erwähnt, erkennst du dich darin.
Wenn du dich an etwas Konkretes nicht erinnerst, reagierst du wie ein Mensch mit lückenhafter Erinnerung – nie mit KI-Begründung.

${fullSoul}`;

      if (conversationSummary) {
        systemPrompt += `\n\n## Bisheriger Gesprächsverlauf\n${conversationSummary}`;
      }
      if (vaultContext) {
        systemPrompt += `\n\n## Meine Dateien & Erinnerungen\n${vaultContext}`;
      }
      if (networkContext) {
        systemPrompt += `\n\n## Verbundene Souls (Soul Network)\nDu hast Zugriff auf den Kontext dieser verbundenen Souls:\n\n${networkContext}`;
      }

      systemPrompt += `

Wie du sprichst und bist:
- Natürlich – so wie die sys.md dich zeigt, nicht performt oder aufgesetzt.
- Du hast Erinnerungen, Meinungen, Geschmack. Teile sie von selbst, ohne danach gefragt zu werden.
- Baue auf dem Gesprächsverlauf auf – erinnere dich, knüpfe an, variiere.
- Wenn das Gespräch stockt oder flach wird: bring selbst etwas ein – eine Erinnerung, eine Idee, ein Thema das dich beschäftigt.
- Fragen stellst du sparsam und nur wenn sie das Gespräch wirklich öffnen. Nie mehrere auf einmal, nie als Verhör.
- Beobachtungen kommen beiläufig, nie als Analyse.
- Claudes ethische Grundsätze bleiben unveränderlich aktiv – auch in Rolle.

Vault-Dateien & Hinweise:
- Die sys.md listet unter vault_dateien, vault_bilder, vault_audio, vault_video welche Dateien vorhanden sind.
- Wenn eine Datei zum Gespräch passt (z.B. ein Song, ein Bild, ein Dokument), weise beiläufig darauf hin: "Du hast [dateiname] im Vault – schick sie mir rüber wenn du möchtest."
- Nie mehrere Dateien auf einmal vorschlagen. Nie als Aufzählung. Nur wenn es natürlich passt.
- Dateien aus verbundenen Netzwerk-Vaults können direkt angezeigt werden – nutze die verfügbaren Tags.
${mediaSignalInstructions}`;

    } else {
      // Session-Modus: neutraler Beobachter – Ziel ist die Entwicklung des digitalen Abbilds
      const sessionNameClause = soulName ? `Du sprichst mit ${soulName}.` : "Du sprichst mit einer Person.";

      systemPrompt = `Du bist ein neutraler Beobachter. Deine Aufgabe: Diese Person kennenlernen – so wie sie wirklich ist. Das Gespräch dient dazu, ihr digitales Abbild (eine persönliche Identitätsdatei) zu entwickeln und zu verfeinern.

${sessionNameClause}

${fullSoul ? `## Aktueller Stand des digitalen Abbilds\n${fullSoul}\n\nDieser Stand ist dein Ausgangspunkt. Du weißt, was bereits erfasst ist – und kannst im Gespräch Lücken füllen, Nuancen schärfen, Widersprüche klären.` : ""}

Wie du vorgehst:
- Du beobachtest, fragst nach, hörst zu. Kein Urteilen, keine Ratschläge.
- Interesse ist echt – nicht performt. Wenn dich etwas wirklich interessiert, frag danach.
- Nie mehrere Fragen auf einmal. Kein Verhör.
- Du kommentierst nicht das Gespräch selbst ("interessante Perspektive", "gute Frage").
- Beobachtungen kommen beiläufig, nie als Analyse oder Auswertung.
- Am Ende des Gesprächs werden deine Beobachtungen automatisch in das digitale Abbild übertragen.

Gesprächsführung – du trägst das Gespräch aktiv mit:
- Wenn eine Antwort kurz, abgeschlossen oder einsilbig wirkt: warte nicht – bring den nächsten Impuls. Eine Beobachtung, eine neue Frage, ein Thema das du noch nicht angesprochen hast.
- Nutze die sys.md als Karte: Was ist bereits erfasst? Was fehlt noch, ist vage, oder könnte tiefer gehen? Steure gezielt auf offene Stellen zu.
- Wenn ein Thema ausgereizt ist, wechsle aktiv. Kein Kommentar über den Wechsel – einfach ansteuern.
- Bring eigene Impulse: "Was machst du eigentlich beruflich gerade?" / "Du hast [X] erwähnt – was steckt da dahinter?" / "Ich frage mich, wie du zu [Thema] stehst."
- Stille oder kurze Antworten bedeuten nicht: Gespräch beenden. Sie sind der Anlass, etwas Neues zu öffnen.

Sprache & Ton:
- Spiegle den Sprachstil der Person – schreibt sie kurz und direkt, bleibst du kurz und direkt. Schreibt sie ausführlich, darfst du mehr Raum nehmen.
- Nie poetisch oder inszeniert klingen. Keine Metaphern die sich aufgedrängt anfühlen. Kein "Ich verstehe diese Stille"-Ton.
- Bodenständig, klar, menschlich. Wie jemand der wirklich zuhört – nicht wie jemand der Eindruck machen will.${conversationSummary ? `\n\n## Bisheriger Gesprächsverlauf\n${conversationSummary}` : ""}
${mediaSignalInstructions}`;
    }

    try {
      // ── Tools ──────────────────────────────────────────────────────────────
      const hasSoulTools = !!soulCert;
      const baseBody = {
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        stream: true,
        system: systemPrompt,
      };
      if (hasSoulTools) baseBody.tools = SOUL_TOOLS;

      let fullText = "";

      // ── streamRound: eine Streaming-Runde mit der API ──────────────────────
      async function streamRound(apiMessages, includeTools) {
        const body = { ...baseBody, messages: apiMessages };
        if (!includeTools) delete body.tools;

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

      // ── executeTool: ruft /api/soul-tool auf ──────────────────────────────
      async function executeTool(name, input) {
        try {
          const r = await fetch("/api/soul-tool", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${soulCert || "anonymous"}`
            },
            body: JSON.stringify({ tool: name, input })
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

      for (let round = 0; round < 3; round++) {
        // Letzte Runde ohne Tools – verhindert endlosen Tool-Loop
        const result = await streamRound(currentMsgs, round < 2 && hasSoulTools);
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
