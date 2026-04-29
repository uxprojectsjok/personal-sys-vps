// server/api/wavespeed-result.get.js
// Fragt den Status einer WaveSpeed-Aufgabe ab (einmaliger Poll).
// Der Client ruft diesen Endpoint alle 2 Sekunden auf bis status = 'completed' | 'failed'.

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";

export default defineEventHandler(async (event) => {
  const apiKey = process.env.WAVESPEED_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 503, message: "WAVESPEED_KEY nicht konfiguriert." });
  }

  const { id } = getQuery(event);
  if (!id) {
    throw createError({ statusCode: 400, message: "id fehlt." });
  }

  const res = await fetch(`${WAVESPEED_BASE}/predictions/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw createError({ statusCode: 502, message: `WaveSpeed-Fehler: ${errText}` });
  }

  const data = await res.json();
  const taskData = data?.data ?? data;

  const status = taskData?.status ?? "unknown";
  const outputs = taskData?.outputs ?? [];
  const url = Array.isArray(outputs) ? (outputs[0] ?? null) : null;
  const error = taskData?.error ?? null;

  return { status, url, error };
});
