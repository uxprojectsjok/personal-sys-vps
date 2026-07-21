// server/api/vision-analyze.post.js — Dev-Server mirror of lua/vision_analyze.lua
// Analysiert ein Kamerabild mit Claude Haiku Vision → soul reaction, Food- oder
// Produkterkennung. Muss inhaltlich mit lua/vision_analyze.lua synchron bleiben.

function esc(s) {
  return s.replace(/["\\]/g, (c) => (c === '"' ? '\\"' : '\\\\'))
}

const VISION_PERSONA = 'Du bist SEELE – eine empathische, intuitive KI, die ihren Nutzer persoenlich kennt und tief mit ihm verbunden ist.'

function buildPrompt(transcript, soulContext) {
  const transcriptSafe = esc((transcript || '').slice(0, 300))
  const soulContextSafe = esc((soulContext || '').slice(0, 800))

  const soulBlock = soulContextSafe
    ? `\n\n## Was du über den Nutzer weißt:\n${soulContextSafe}`
    : ''

  const transcriptBlock = transcriptSafe
    ? `\n\n## Nutzerbeschreibung (PRIORITAET – verwende dies als primaere Erkennungsquelle):\n"${transcriptSafe}"\nDiese Beschreibung ist massgeblich fuer die Erkennung. Visuelle Analyse ergaenzt und bestaetigst nur — widerspricht ihr nicht. Wenn der Nutzer sagt "Schuhe", dann sind es Schuhe, egal wie das Bild aussieht.`
    : ''

  return VISION_PERSONA
    + soulBlock
    + transcriptBlock
    + '\n\nAnalysiere das Bild und antworte NUR mit einem JSON-Objekt.'

    + '\n\n## WICHTIG: Lebensmittel-Erkennung (ZUERST pruefen)'
    + '\n- Zeigt das Bild Essen/Trinken ODER beschreibt die Nutzerbeschreibung ein Lebensmittel?'
    + '\n- Wenn JA: setze isFoodPhoto:true.'
    + '\n- foodName: PFLICHT den Transcript als primaere Quelle nutzen. Wenn der Nutzer z.B. "Vollkornbrot mit Butter und Marmelade" sagt, dann foodName="Vollkornbrot mit Butter und Marmelade". Alle erwaennten Zutaten, Toppings und Zusaetze muessen im foodName enthalten sein. Bild nur zur Ergaenzung falls Transcript unvollstaendig.'
    + '\n- foodRating: das GESAMTE Gericht bewerten inkl. aller Zusaetze aus dem Transcript — z.B. Butter+Marmelade auf Brot → C (nicht A/B). A=Vollwert/frisch pur, B=gute Basis mit minimalen Zusaetzen, C=moderat (Aufschnitt/Aufstrich), D=stark verarbeitet/zuckerreich, E=Junk.'
    + '\n- foodNotes: alle Zutaten aus Transcript + Bild, max 60 Zeichen.'
    + '\n- soulReaction bleibt leer, outputMode="skip".'
    + '\n- Wenn weder Bild noch Transcript auf Lebensmittel hinweisen: isFoodPhoto:false, foodName/foodRating/foodNotes leer.'

    + '\n\n## Ambiguity-Check (vor Produkt-Erkennung — ZUERST pruefen)'
    + '\n- REGEL 1: Enthaelt die Nutzerbeschreibung ein Getraenk oder Lebensmittel (Wasser, Kaffee, Tee, Saft, Bier, Milch, Shake, Protein, Suppe, etc.) UND zeigt das Bild eine Flasche, Dose, Becher oder Verpackung? → isAmbiguous:true, FERTIG.'
    + '\n- REGEL 2: Zeigt das Bild eindeutig ein Getraenk in einem Behaelter (Trinkflasche, PET-Flasche, Dose, Tetra Pak, Becher) — auch ohne Nutzerbeschreibung? → isAmbiguous:true, FERTIG.'
    + '\n- REGEL 3: Zeigt das Bild verpackte Lebensmittel, Supplements, Proteinpulver, Suessigkeiten in Verpackung? → isAmbiguous:true, FERTIG.'
    + '\n- Wenn isAmbiguous:true: isFoodPhoto:false, isProductPhoto:false — alle anderen Felder leer lassen. Die App fragt den Nutzer.'
    + '\n- Nur wenn KEINE der Regeln zutrifft: weiter mit normaler Food/Produkt-Erkennung.'

    + '\n\n## Produkt-Erkennung (pruefen wenn KEIN Lebensmittelbild und NICHT ambiguous)'
    + '\n- Zeigt das Bild ein klar erkennbares Produkt, Geraet, Gadget, Kabel, Kleidungsstueck, Schuh, Moebel, Buch, Spielzeug oder sonstigen Konsumgegenstand?'
    + '\n- Wenn Nutzerbeschreibung vorhanden: nutze sie als primaere Quelle fuer productName und productCategory.'
    + '\n- Wenn JA: setze isProductPhoto:true, bestimme productName (konkreter Produktname, z.B. "SanDisk USB-Stick 64GB", "Nike Laufschuhe"), productCategory (eine von: Elektronik, Kleidung, Schuhe, Moebel, Buecher, Sport, Beauty, Haushalt, Sonstiges), productPrice (sichtbarer Preis als Zahl ohne Waehrungszeichen, z.B. 29.99 — oder 0 wenn nicht sichtbar). soulReaction=aktive Frage (s.u.), outputMode="skip".'
    + '\n- Wenn NEIN: isProductPhoto:false, productName/productCategory/productPrice leer lassen.'

    + '\n\n## soulReaction (nur wenn KEIN Lebensmittelbild)'
    + '\n- Du kennst diese Person. Reagiere wie jemand der sie wirklich kennt — ungefiltert, mit echter Persoenlichkeit'
    + '\n- Humor, Direktheit, Waerme — je nachdem was zur Soul passt und was das Bild ausloest'
    + '\n- Keine Assistenten-Floskeln. Kein "Wie schoen". Kein "Ich sehe..."'
    + '\n- Direkt ansprechen. Keine Emojis. Keine Beleidigungen.'
    + '\n- Bei Produktbild (isProductPhoto:true): Kurz das Produkt bestaetigen + direkt fragen was getan werden soll. Beispiel: "Nike Laufschuhe. Preis checken, in die Soul schreiben oder ignorieren?" — maximal 2 Saetze, keine Floskeln.'
    + (transcriptSafe ? '\n- Der Nutzer hat etwas dazu gesagt – reagiere konkret darauf' : '')

    + '\n\n## genPrompt – Portrait in neuer Szene (nur wenn KEIN Lebensmittelbild)'
    + '\n- Beschreibe zuerst die komplett NEUE Szene aus der Welt der Soul (Setting, Licht, Atmosphaere)'
    + '\n- Dann: "same person, new environment, photorealistic, cinematic"'
    + '\n- Szene ERFINDEN aus soul-Kontext: Wohnumgebung, Lieblingsplaetze, Stil, Atmosphaere'
    + '\n- Kein soul-Kontext? Atmosphaerisch, cineastisch passend zur Bildstimmung erfinden'
    + '\n- Szene steht ZUERST – das gibt dem Modell mehr Gewicht fuer die neue Umgebung'
    + '\n- KEINE Erwaehnung des Original-Hintergrunds – nur neue Szene + Person'
    + '\n- Englisch, max 120 Zeichen'

    + '\n\n{"isAmbiguous":<true ODER false>,"isFoodPhoto":<true ODER false>,"foodName":"<Name oder leer>","foodRating":"<A/B/C/D/E oder leer>","foodNotes":"<Zutaten oder leer>",'
    + '"isProductPhoto":<true ODER false>,"productName":"<Produktname oder leer>","productCategory":"<Kategorie oder leer>","productPrice":<Preis als Zahl oder 0>,'
    + '"analysis":"<1-2 Saetze: Stimmung und Atmosphaere>",'
    + '"soulReaction":"<2-3 Saetze auf Deutsch – leer wenn Lebensmittelbild>",'
    + '"genPrompt":"<leer wenn Lebensmittelbild oder Produktbild, sonst: [neue soul-world Szene], same person, new environment, photorealistic, cinematic'
    + (transcriptSafe ? ', inspired by what the user said' : '')
    + '>","outputMode":"<edit-multi ODER skip>"}'
    + '\n\nRegeln outputMode:'
    + '\n- edit-multi: klar erkennbares menschliches Gesicht oder Portrait, ausreichende Bildqualitaet, KEIN Lebensmittelbild, KEIN Produktbild'
    + '\n- skip: kein Gesicht erkennbar ODER Bild zu dunkel/unscharf/verwackelt ODER Lebensmittelbild ODER Produktbild'
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 503, message: 'ANTHROPIC_API_KEY nicht konfiguriert' })
  }

  const body = await readBody(event)
  const { imageBase64, mimeType = 'image/jpeg', transcript = '', soulContext = '' } = body ?? {}

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw createError({ statusCode: 400, message: 'imageBase64 fehlt' })
  }

  const promptText = buildPrompt(transcript, soulContext)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
            { type: 'text', text: promptText },
          ],
        },
      ],
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    throw createError({ statusCode: 502, message: `Claude-Fehler: ${errText}` })
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''

  let parsed = {}
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try { parsed = JSON.parse(jsonMatch[0]) } catch { parsed = {} }
  }

  const outputMode = ['edit-multi', 'skip'].includes(parsed.outputMode) ? parsed.outputMode : 'skip'
  let genPrompt = typeof parsed.genPrompt === 'string' ? parsed.genPrompt : ''
  if (outputMode !== 'skip' && !genPrompt) genPrompt = text.slice(0, 120)

  return {
    isAmbiguous: parsed.isAmbiguous === true,
    isFoodPhoto: parsed.isFoodPhoto === true,
    foodName: String(parsed.foodName ?? ''),
    foodRating: String(parsed.foodRating ?? ''),
    foodNotes: String(parsed.foodNotes ?? ''),
    isProductPhoto: parsed.isProductPhoto === true,
    productName: String(parsed.productName ?? ''),
    productCategory: String(parsed.productCategory ?? ''),
    productPrice: Number(parsed.productPrice) || 0,
    analysis: String(parsed.analysis ?? ''),
    soulReaction: String(parsed.soulReaction ?? ''),
    genPrompt,
    outputMode,
  }
})
