// server/api/vision-analyze.post.js
// Analysiert ein Kamerabild mit Claude claude-3-haiku (Vision).
// Entscheidet welches WaveSpeed-Modell genutzt werden soll:
//   'text-to-image' → google/nano-banana  (kreative Neuinterpretation als Text-Prompt)
//   'edit-multi'    → google/nano-banana-pro  (stilistische Transformation des Originalbilds)
//   'image-to-video'→ kwaivgi/kling-v3.0-pro  (wird client-seitig für Video-Aufnahmen gesetzt)

export default defineEventHandler(async (event) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 503, message: "ANTHROPIC_API_KEY nicht konfiguriert." });
  }

  const body = await readBody(event);
  const { imageBase64, mimeType = "image/jpeg" } = body ?? {};

  if (!imageBase64) {
    throw createError({ statusCode: 400, message: "imageBase64 fehlt." });
  }

  const systemPrompt = `Du bist ein präziser Bild-Analyst für eine KI-Kreativ-Pipeline.

Analysiere das Bild und antworte NUR mit einem JSON-Objekt (kein Markdown, kein Text davor/danach):

{
  "analysis": "<2–3 Sätze Beschreibung auf Deutsch: was ist zu sehen, Stimmung, Kontext>",
  "genPrompt": "<optimierter Generierungs-Prompt auf Englisch, cineastisch und präzise, max. 150 Zeichen>",
  "outputMode": "<'text-to-image' ODER 'edit-multi'>",
  "outputModeReason": "<1 Satz warum>"
}

Entscheidungsregeln für outputMode:
- 'edit-multi': Das Bild selbst soll transformiert/stilisiert werden (Personen, Porträts, konkrete Objekte die sichtbar verändert werden sollen, Stilübertragung auf das Originalbild)
- 'text-to-image': Das Bild inspiriert etwas Neues (abstrakte Szenen, Landschaften, Konzepte, wenn das Original nur als Inspiration dient und etwas Völlig Neues entstehen soll)`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType, data: imageBase64 },
            },
            { type: "text", text: systemPrompt },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw createError({ statusCode: 502, message: `Claude-Fehler: ${errText}` });
  }

  const data = await res.json();
  const raw = data.content?.[0]?.text ?? "{}";

  let parsed = {};
  try {
    // JSON aus der Antwort extrahieren (Claude hält sich meistens daran, aber zur Sicherheit)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? raw);
  } catch {
    parsed = { analysis: raw.slice(0, 300), genPrompt: raw.slice(0, 150), outputMode: "text-to-image" };
  }

  return {
    analysis: parsed.analysis ?? "",
    genPrompt: parsed.genPrompt ?? "",
    outputMode: ["text-to-image", "edit-multi"].includes(parsed.outputMode)
      ? parsed.outputMode
      : "text-to-image",
  };
});
