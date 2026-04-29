// app/composables/useVerifySpecial.js
// Verifiziert herausragende Persönlichkeitsmerkmale via Claude + Web-Search.
// Claude liest die Soul-Identität, sucht im Web nach der Person und gibt
// einen verifizierten Special-Skills-Score (0–14) zurück.
//
// Singleton – Status bleibt über Komponenten hinweg erhalten.

import { ref } from "vue";

const verifying   = ref(false);
const verified    = ref(false);
const score       = ref(null);   // null = nicht geprüft | 0–14 = Ergebnis
const hints       = ref([]);     // gefundene Belege (Strings)
const error       = ref(null);

export function useVerifySpecial() {

  /**
   * Sendet die Soul-Identität an Claude (web_search tool via /api/chat).
   * Claude sucht die Person im Web und gibt strukturiert zurück:
   *   { score: 0–14, hints: ["..."] }
   *
   * @param {string} soulToken  – Bearer-Token
   * @param {string} soulContent – Inhalt der sys.md (wird auf Kern-Identität reduziert)
   */
  async function verifySoul(soulToken, soulContent) {
    if (verifying.value) return;
    verifying.value = true;
    error.value     = null;

    try {
      // Nur Kern-Identität und Werte senden – kein Session-Log, kein Cert
      const identity = extractIdentitySections(soulContent);
      if (!identity.trim()) {
        error.value = "Kein Identitätsinhalt gefunden.";
        return;
      }

      const systemPrompt = `Du bist ein Soul-Verifikations-System.
Deine Aufgabe: Prüfe, ob die beschriebene Person öffentlich bekannte herausragende Leistungen hat.

Nutze dein Wissen und suche wenn nötig im Web nach der Person.

Bewerte auf einer Skala 0–14:
- 0–3:  Keine nachweisbaren besonderen öffentlichen Merkmale
- 4–6:  Lokale/regionale Bekanntheit oder Fachkompetenz
- 7–9:  Nationale Relevanz, nachweisbare Leistungen (Preise, Publikationen, Karriere)
- 10–12: Überregionale Bekanntheit oder besondere Expertise
- 13–14: Ausnahmetalent, weltweite Anerkennung, viral oder preisgekrönt

Antworte ausschließlich in diesem JSON-Format (kein Markdown darum):
{
  "score": <Zahl 0–14>,
  "hints": ["<Beleg 1>", "<Beleg 2>"]
}

hints sind kurze Belege (max 60 Zeichen je). Wenn nichts gefunden: leeres Array.`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${soulToken}`,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          stream: false,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: `Prüfe diese Person:\n\n${identity}`,
          }],
        }),
      });

      if (!res.ok) {
        error.value = `API Fehler ${res.status}`;
        return;
      }

      const data = await res.json();
      const text = data?.content?.[0]?.text ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        error.value = "Ungültige API-Antwort";
        return;
      }

      const parsed = JSON.parse(match[0]);
      score.value   = Math.min(Math.max(0, Math.round(parsed.score ?? 0)), 14);
      hints.value   = Array.isArray(parsed.hints) ? parsed.hints.slice(0, 5) : [];
      verified.value = true;

    } catch (e) {
      error.value = e.message;
    } finally {
      verifying.value = false;
    }
  }

  /** Nur Kern-Identität + Werte aus sys.md extrahieren */
  function extractIdentitySections(md) {
    const sections = ["Kern-Identität", "Werte & Überzeugungen", "Wiederkehrende Themen & Obsessionen"];
    const lines = md.split("\n");
    const result = [];
    let inSection = false;

    for (const line of lines) {
      const isHeader = line.startsWith("## ");
      if (isHeader) {
        const name = line.replace("## ", "").trim();
        inSection = sections.includes(name);
        if (inSection) result.push(line);
      } else if (inSection) {
        result.push(line);
      }
    }
    return result.join("\n");
  }

  function reset() {
    verified.value  = false;
    score.value     = null;
    hints.value     = [];
    error.value     = null;
  }

  return {
    verifying,
    verified,
    score,
    hints,
    error,
    verifySoul,
    reset,
  };
}
