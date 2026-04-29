// app/composables/useConnectedVault.js
// Lädt Dateien aus den Public Vaults verbundener Souls für den Chat-Kontext.
//
// Ablauf pro verbundener Soul:
//  1. GET /api/vault/public/{soul_id}          → Manifest (kein Auth)
//  2. GET /api/vault/public/{soul_id}/{file}   → Datei mit eigenem Soul-Cert als Bearer

// Bild-Blob auf max. 1024px komprimieren → JPEG base64 (ohne data:-Präfix)
async function compressImageBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1024
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round((height * MAX) / width); width = MAX }
        else { width = Math.round((width * MAX) / height); height = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1])
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load')) }
    img.src = url
  })
}

/**
 * Holt das Manifest + Textdateien einer einzelnen verbundenen Soul.
 * Verschlüsselte Dateien werden übersprungen (kein lokaler Key verfügbar).
 */
async function fetchOneSoulVault(soulCert, soul_id, alias) {
  try {
    const mRes = await fetch(`/api/vault/public/${soul_id}`)
    if (!mRes.ok) return null
    const manifest = await mRes.json()
    if (!Array.isArray(manifest.files) || !manifest.files.length) return null

    const result = {
      soul_id,
      alias,
      textContent:       '',
      imageFiles:        [],   // Dateinamen (für Display-Tags, on-demand geladen)
      cipheredImageFiles:[],
      audioFiles:        [],
      videoFiles:        [],
      documentFiles:     [],   // { name, base64|null } für Claude Document-Blöcke
    }

    await Promise.all(manifest.files.map(async (file) => {
      if (file.type === 'context_files') {
        if (file.cipher === 'ciphered') return
        const ext = (file.name.split('.').pop() || '').toLowerCase()
        if (ext === 'pdf') {
          // Nur Dateiname registrieren – kein Binary-Download beim Hintergrund-Fetch.
          // Base64 wird on-demand geladen wenn der User explizit danach fragt.
          result.documentFiles.push({ name: file.name, base64: null })
          return
        }
        // Textdatei (md / txt) inline laden – nur Text, kein Binary
        try {
          const fRes = await fetch(`/api/vault/public/${soul_id}/${file.name}`, {
            headers: { Authorization: `Bearer ${soulCert}` }
          })
          if (fRes.ok) {
            const text = await fRes.text()
            result.textContent += `\n\n**${file.name}**\n${text.trim()}`
          }
        } catch { /* nicht kritisch */ }
      } else if (file.type === 'images') {
        if (file.cipher === 'ciphered') {
          result.cipheredImageFiles.push(file.name)
        } else {
          // Nur Dateiname registrieren – kein Base64-Download.
          // Bilder werden on-demand per fetchPublicVaultImage() geladen (Tag-Rendering).
          result.imageFiles.push(file.name)
        }
      } else if (file.type === 'audio') {
        if (file.cipher !== 'ciphered') result.audioFiles.push(file.name)
      } else if (file.type === 'video') {
        if (file.cipher !== 'ciphered') result.videoFiles.push(file.name)
      }
    }))

    return result
  } catch { return null }
}

/**
 * Holt Public Vault Kontext für alle verbundenen Souls.
 *
 * @param {string} soulCert       - Eigenes Soul-Cert (Bearer-Auth)
 * @param {Array}  connections    - Array von { soul_id, alias } aus useVaultConnections
 * @returns {{ publicVaultContext: string|null, imageManifest: Object, networkPdfBlocks: Array, networkImageBlocks: Array }}
 *   imageManifest: {
 *     [soul_id]: { alias, files, cipheredFiles, audio, video, documents }
 *   }
 *   networkPdfBlocks:   Array von { alias, name, base64 } für Claude Document-Blöcke
 *   networkImageBlocks: Array von { alias, name, base64 } für Claude Vision-Blöcke
 */
export async function fetchAllPublicVaults(soulCert, connections) {
  if (!soulCert || !Array.isArray(connections) || !connections.length) {
    return { publicVaultContext: null, imageManifest: {}, networkPdfBlocks: [], networkImageBlocks: [] }
  }

  const results = await Promise.all(
    connections.map(c => fetchOneSoulVault(soulCert, c.soul_id, c.alias))
  )

  const contextParts = []
  const imageManifest = {}
  const networkPdfBlocks = []
  const networkImageBlocks = []

  for (const r of results) {
    if (!r) continue
    if (r.textContent) {
      contextParts.push(`### ${r.alias} – Geteilte Kontextdateien\n${r.textContent.trim()}`)
    }
    // Binaries (PDFs, Bilder) werden on-demand geladen – kein Pre-Download
    const hasMedia = r.imageFiles.length || r.cipheredImageFiles.length ||
                     r.audioFiles.length || r.videoFiles.length || r.documentFiles.length
    if (hasMedia) {
      imageManifest[r.soul_id] = {
        alias:         r.alias,
        files:         r.imageFiles,         // Bilder (für Display-Tags)
        cipheredFiles: r.cipheredImageFiles,
        audio:         r.audioFiles,
        video:         r.videoFiles,
        documents:     r.documentFiles.map(d => d.name),
      }
    }
  }

  return {
    publicVaultContext: contextParts.length ? contextParts.join('\n\n') : null,
    imageManifest,
    networkPdfBlocks,
    networkImageBlocks,
  }
}

/**
 * Lädt eine einzelne Datei aus dem Public Vault (Blob-URL).
 * Funktioniert für Bilder, Audio, Video – jeder Dateityp.
 * @returns {Promise<string|null>} Blob-URL oder null
 */
export async function fetchPublicVaultImage(soulCert, soul_id, filename) {
  try {
    const res = await fetch(`/api/vault/public/${soul_id}/${filename}`, {
      headers: { Authorization: `Bearer ${soulCert}` }
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch { return null }
}
