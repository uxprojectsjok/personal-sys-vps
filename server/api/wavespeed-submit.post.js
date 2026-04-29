// server/api/wavespeed-submit.post.js
// Sendet einen Generierungs-Auftrag an WaveSpeed AI.
//
// Modelle:
//   text-to-image   → google/nano-banana/text-to-image  (kreative Neuschöpfung)
//   edit-multi      → google/nano-banana-pro/edit-multi  (Transformation des Originalbilds)
//   image-to-video  → kwaivgi/kling-v3.0-pro/image-to-video  (Kling Pro Video)
//
// Gibt {taskId} zurück – Client pollt /api/wavespeed-result.

const WAVESPEED_BASE = "https://api.wavespeed.ai/api/v3";

const MODELS = {
  "text-to-image":   "google/nano-banana/text-to-image",
  "edit-multi":      "google/nano-banana-pro/edit-multi",
  "image-to-video":  "kwaivgi/kling-v3.0-pro/image-to-video",
};

export default defineEventHandler(async (event) => {
  const apiKey = process.env.WAVESPEED_KEY;
  if (!apiKey) {
    throw createError({ statusCode: 503, message: "WAVESPEED_KEY nicht konfiguriert." });
  }

  const body = await readBody(event);
  const {
    outputMode = "text-to-image",   // 'text-to-image' | 'edit-multi' | 'image-to-video'
    prompt = "",
    imageBase64 = null,             // JPEG base64 – für edit-multi und image-to-video benötigt
  } = body ?? {};

  if (!prompt) {
    throw createError({ statusCode: 400, message: "prompt fehlt." });
  }

  const modelPath = MODELS[outputMode] ?? MODELS["text-to-image"];
  const endpoint = `${WAVESPEED_BASE}/${modelPath}`;
  let payload;

  if (outputMode === "image-to-video") {
    // ── Kling v3.0 Pro image-to-video ────────────────────────────────────────
    if (!imageBase64) {
      throw createError({ statusCode: 400, message: "imageBase64 für image-to-video benötigt." });
    }
    payload = {
      prompt,
      image: `data:image/jpeg;base64,${imageBase64}`,
      duration: 5,
      cfg_scale: 0.5,
      negative_prompt: "blurry, shaky, low quality, distorted",
    };

  } else if (outputMode === "edit-multi") {
    // ── Nano Banana Pro – Bild-Editing ────────────────────────────────────────
    if (!imageBase64) {
      throw createError({ statusCode: 400, message: "imageBase64 für edit-multi benötigt." });
    }
    payload = {
      prompt,
      images: [`data:image/jpeg;base64,${imageBase64}`],
      num_images: 1,
      output_format: "jpeg",
      aspect_ratio: "1:1",
    };

  } else {
    // ── Nano Banana – Text-to-Image ───────────────────────────────────────────
    payload = {
      prompt,
      output_format: "jpeg",
      aspect_ratio: "1:1",
    };
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw createError({ statusCode: 502, message: `WaveSpeed-Fehler (${outputMode}): ${errText}` });
  }

  const data = await res.json();

  // WaveSpeed liefert data.data.id oder data.id
  const taskId = data?.data?.id ?? data?.id;

  if (!taskId) {
    throw createError({ statusCode: 502, message: "WaveSpeed: Keine Task-ID erhalten." });
  }

  return { taskId, model: modelPath };
});
