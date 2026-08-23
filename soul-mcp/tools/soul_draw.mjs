/**
 * soul_draw — Rendert eine Zeichnung headless (ohne Maus/Mensch) aus wenigen
 * groben Kontrollpunkten pro Pinselstrich. Grundlage dafür, dass eine Soul
 * (z.B. KRO) über Tage/Wochen/Monate/Jahre an einem Werk weitermalen kann.
 *
 * Persistenz-Modell (zwei Orte pro canvas_id, getrennte Schutzstufen):
 *   vault_shared/{canvas_id}/{canvas_id}.png — flaches Raster, unverschlüsselt
 *                      (wie vault_shared_upload.mjs — Peer-Freigabe-Staging-
 *                      Bereich), in einem eigenen Ordner pro Werk statt lose in
 *                      vault_shared/ (siehe lib/artwork_log.mjs's artworkDir())
 *                      — dort sammeln sich auch archivierte Zwischenstufen
 *                      ({canvas_id}_stageN.png, von soul_generate.mjs) und
 *                      log.md (Klartext-Fortschrittslog) als "Beleg der
 *                      Arbeit"-Bündel, komplett über /api/vault/artwork
 *                      verwaltbar (Datei-Upload/-Löschung, Ordner-Löschung).
 *                      Wird bei jedem Aufruf geladen, neue Striche oben
 *                      draufgezeichnet, neu gespeichert. Für Vorschau/Teilen.
 *   vault/context/{canvas_id}.svg — echtes Vektor-Dokument (offener W3C-
 *                      Standard), VERSCHLÜSSELT wie mind.md/sys.md (AES-256-CBC,
 *                      SYS\x01-Header). Bewusst NICHT in vault_shared: dort
 *                      könnte grundsätzlich jeder mit Zugriff auf die geteilte
 *                      Datei "mitmalen" (Upload gleichen Dateinamens würde die
 *                      Quelle ersetzen) — vault/context ist der geschützte
 *                      Owner-Bereich, nur über context_get lesbar, nicht über
 *                      die Peer-Sharing-Infrastruktur erreichbar. Neue Striche
 *                      werden als zusätzliche <path>-Elemente vor dem
 *                      schließenden </svg>-Tag eingefügt (append-only) — kein
 *                      Parsen/Rekonstruieren alter Striche nötig.
 *
 * Zugriffsschutz: KEINE Domain-Whitelist mehr (eine frühere Version hatte
 * eine — verworfen, weil sie nichts Echtes beweisen konnte: sobald einmal
 * geschrieben, ist das <metadata>-Element im SVG eine ganz normale Textstelle
 * in einer Datei, die jeder mit Entschlüsselungs-/Schreibzugriff später
 * beliebig ändern kann — kein Signatur-/Tamper-Schutz auf dem Feld selbst.
 * Eine Whitelist hätte also höchstens Fehlkonfiguration beim SCHREIBEN
 * verhindert, aber nie eine echte Manipulationssicherheit hergestellt).
 * Stattdessen zählt, WER überhaupt bis hierher kommt: soul_draw ist nur über
 * zwei Pfade erreichbar, beide verlangen bereits echte soul_cert-Auth —
 *   1. MCP (Claude.ai/Claude Desktop): nur in registerTools() registriert
 *      (siehe tools/index.mjs), dem Owner-Pfad — der service_token dort wird
 *      ausschließlich über den OAuth-Flow ausgestellt, der seinerseits einen
 *      gültigen soul_cert verlangt (siehe oauth.mjs, validateCert()).
 *   2. In-App-Chat (/internal/run-tool): nginx prüft soul_cert bereits per
 *      access_by_lua_file soul_auth.lua, BEVOR die Anfrage überhaupt bis zu
 *      diesem internen Endpunkt durchgereicht wird (siehe Kommentar dort).
 * soul_draw ist bewusst NICHT in registerPaidTools()/registerPeerTools()
 * verdrahtet — zahlende externe Agenten und Peers kommen also gar nicht erst
 * an dieses Tool heran, unabhängig von jeder Domain-Frage.
 *
 * Fortschritt in der Soul verankern: jeder Aufruf schreibt einen Eintrag in
 * sys.md ("## Kunstwerke") inkl. SHA-256-Hash des aktuellen SVG-Inhalts —
 * soul_growth_chain hasht den GESAMTEN sys.md-Inhalt bei jedem Anker-Vorgang
 * (siehe useChainAnchor.js), eine Änderung an sys.md reicht also, damit der
 * nächste (vom Besitzer manuell ausgelöste, Wallet-signierte) Anker
 * automatisch belegt, dass zu diesem Zeitpunkt bereits an diesem Werk
 * gearbeitet wurde — UND welchen exakten Inhalt die SVG zu diesem Zeitpunkt
 * hatte (der SVG-Hash macht spätere, nachträgliche Änderungen an der Datei
 * selbst erkennbar: stimmt der aktuelle Hash nicht mehr mit einem verankerten
 * Eintrag überein, wurde die Datei nach der Verankerung verändert). soul_draw
 * selbst löst KEINE Blockchain-Transaktion aus — das bleibt eine bewusste,
 * kostenpflichtige Owner-Aktion.
 *
 * Nutzt @napi-rs/canvas — sowohl createCanvas (Raster) als auch SVGCanvas
 * (Vektor) teilen sich dieselbe Canvas-2D-API, drawStroke() unten läuft
 * unverändert gegen beide.
 *
 * Technik-Bandbreite pro Strich (style/mode/gradientTo/blend/edgeFade/reflect/
 * interpolation/colorVariation/brush/water/pigment/wetness/direction/falloff/
 * intensity, siehe strokeSchema
 * unten): reine Linien
 * (ink/solid) reichen für Gesten-Skizzen, aber weder für flächige moderne/
 * abstrakte Kompositionen noch für klassisch wirkende Schichtmalerei oder
 * lebendige, unregelmäßige Pinseltextur. Deshalb: mode "fill" füllt die
 * Punktkontur statt sie zu umranden (Farbblöcke, Hintergründe, ohne hunderte
 * Striche zu brauchen), style "dry"/"watercolor"/"spray"/"glow" simulieren
 * unterschiedliche Pinsel-/Licht-Charakteristik (siehe die einzelnen
 * draw*Stroke()-Funktionen unten), gradientTo/gradientShape blenden zwei
 * Farben über die Bounding Box (Himmel, Glanzlicht) — mit transparentem
 * gradientTo (oder der Kurzform edgeFade) löst sich eine Fläche stattdessen
 * nach außen ins Nichts auf (Nebel, weiche Silhouetten-Kanten, atmosphärische
 * Tiefe), blend (multiply/screen/overlay/soft-light) mischt mit bereits
 * Gezeichnetem statt es deckend zu ersetzen — Glasur-/Schatten-Aufbau in
 * mehreren Schichten, wie bei klassischer Ölmalerei. reflect spiegelt
 * denselben Strich an einer Wasserlinie (mit Stildurchgabe + optionaler
 * Wellenverzerrung) für Wasser-/Spiegel-Reflexionen. interpolation (0–1)
 * steuert stufenlos, wie stark die rohen Kontrollpunkte geglättet werden (1 =
 * volle Catmull-Rom-Glättung wie bisher, 0 = reine lineare/eckige Verbindung
 * der rohen Punkte) — Himmel weich, Wasser gebrochen, Masten präzise, Nebel
 * fast verschwunden. colorVariation lässt die Farbe pro gezeichnetem Segment
 * leicht um `color` schwanken (Pigmentvariation, damit wiederholte Striche
 * derselben Nennfarbe nicht identisch wirken). brush ist der parametrisierte
 * "Impressionisten-Pinsel" (length/bristleDensity/grain/jitter/
 * opacityVariation/pressureVariation/edgeBreak): zerlegt den Strich in kurze,
 * unabhängig gewürfelte Marken statt einer glatten Linie — Pinselstrich als
 * Ereignis, nicht als mathematisch glatte Kurve — und hat Vorrang vor style,
 * kombinierbar mit interpolation und colorVariation. Für style:"watercolor"
 * zusätzlich water/pigment/wetness (siehe drawWatercolorStroke() unten und
 * die Nässe-Zustand-Sektion davor) — KROs Befund war, dass eine Lasur bisher
 * stateless war, unabhängig davon was daneben/vorher gemalt wurde. water und
 * pigment trennen "wie nass" von "wie konzentriert" (statt nur opacity),
 * wetness ("wet_on_dry"/"wet_on_wet"/"re_wet") lässt Pigment tatsächlich in
 * eine noch feuchte Nachbarfläche laufen und sich dort mit deren Farbe
 * mischen — eine kleine, pro Canvas persistierte Liste von Nässe-Regionen
 * (Kreis + Farbe + Nässegrad) trocknet dabei pro soul_draw-AUFRUF ab (nicht
 * in Echtzeit — die Zeit zwischen zwei Aufrufen sagt nichts über die gemeinte
 * Maldauer), sodass mehrere Striche in derselben Sitzung ineinanderfließen
 * können, während ein späterer, neuer Aufruf bereits angetrocknetes Vorwerk
 * vorfindet.
 *
 * mode:"dissolve" ist eine KOMPOSITIONS-Entscheidung, keine Material-
 * Entscheidung wie water/pigment/wetness: löst eine bereits gemalte Fläche
 * gezielt zum Papier (oder einer anderen Zielfarbe) hin auf, statt Pigment
 * hinzuzufügen — die "verlorene Kante" der Malerei (siehe KROs Beispiel: eine
 * Gesichtshälfte bewusst weich verschwinden lassen, statt sie mit zehn
 * einzelnen Strichen nachzubilden). direction/falloff/intensity, siehe
 * drawDissolveStroke() unten. Bewusst additiv im append-only-Modell gelöst
 * (weicher, papierfarbener Überzug statt destination-out/echtem Löschen) —
 * eine echte Undo/Layer/Revision-Architektur für die andere Klasse von
 * Korrektur ("das war komplett falsch, ganz zurücknehmen") bleibt ein
 * separates, noch nicht begonnenes Vorhaben.
 *
 * signature (pro Strich)
 * + signaturePosition/signatureMargin (pro Aufruf, siehe runSoulDraw) sind
 * reine Positionierungs-Hilfe: Striche mit signature:true werden als starre
 * Gruppe automatisch an eine Ecke/Kante der tatsächlichen Leinwand
 * verschoben (Bounding Box aus den Strichen selbst berechnet). Die
 * Buchstabenformen selbst kann der Aufrufer entweder ganz normal als
 * Striche zeichnen (typischerweise mit brush, handschriftlich aber nicht
 * garantiert exakt lesbar), oder — für Inhalte, bei denen exakte Lesbarkeit
 * zählt (Datum, Name) — mode:"text" nutzen: echter Font-Text (fillText) mit
 * einem gebündelten Handschrift-Font (Google Fonts "Caveat"). mode:"text"
 * läuft bewusst NUR im Raster-Pass — live geprüft: der SVGCanvas-Text-Export
 * von @napi-rs/canvas verschluckt nachweislich zufällig Zeichen ("KRO" wird
 * zu "KO", das Alphabet zu "ABFJMOQTX", reproduzierbar auch in der jeweils
 * neuesten Bibliotheksversion) — ein aktuell ungefixter Upstream-Bug, kein
 * Font- oder Encoding-Problem. renderStrokesToSvgFragment() ruft für
 * mode:"text"-Striche deshalb gar nicht erst den SVG-Renderpfad auf, sondern
 * schreibt nur einen Klartext-Kommentar-Marker in die Fortsetzungshistorie.
 * Dritte Möglichkeit — echte, eigene Handschrift statt geliehener Typografie
 * ODER Freihand-Neuerfindung pro Werk: mode:"handwriting" setzt Text aus
 * einmal gespeicherten eigenen Buchstabenformen zusammen (siehe
 * soul_handwriting.mjs, soul_handwriting_save/_list) — mit leichter, pro
 * Aufruf gewürfelter Variation, damit zwei Signaturen ähnlich, aber nie
 * pixelgleich sind. Läuft komplett über echte Vektor-Striche (expandiert VOR
 * dem eigentlichen Render-Durchlauf in runSoulDraw, siehe dort), deshalb
 * ohne den mode:"text"-Bug identisch in Raster UND SVG einsetzbar.
 * Alle übrigen Achsen sind pro Strich unabhängig kombinierbar und laufen
 * identisch durch drawStroke()s Dispatcher in Raster- UND SVG-Context — live
 * geprüft: CanvasGradient exportiert korrekt als <linearGradient>/
 * <radialGradient> INKLUSIVE transparenter Stopps (stop-opacity),
 * globalCompositeOperation wird von SVGCanvas übernommen, gespiegelte Pfade
 * (reflect) exportieren korrekt als eigenständiger <path> mit literal
 * gespiegelten Koordinaten (kein transform="matrix(...)" — reflectPoints()
 * spiegelt die Punkte selbst, bevor sie in den normalen Pfad-Renderer
 * laufen). NICHT SVG-tauglich: destination-in-Masking wird von der SVG-
 * Export-Engine stillschweigend verworfen (deshalb kein maskenbasiertes
 * Kantenauflösen — edgeFade nutzt stattdessen transparente Gradient-Stopps,
 * die nachweislich funktionieren) — und wie oben beschrieben fillText().
 */

import { createCanvas, loadImage, SVGCanvas, SvgExportFlag, GlobalFonts } from '@napi-rs/canvas';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { SOULS_DIR, encryptBuf, decryptIfNeeded, loadVaultMeta } from '../lib/vault_fs.mjs';
import { sharedFileUrl } from '../lib/api.mjs';
import { recordArtworkProgress, artworkDir } from '../lib/artwork_log.mjs';
import { loadHandwritingProfile, expandHandwritingText } from './soul_handwriting.mjs';

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

const PAPER = '#EDE6D6';

// Handschrift-Font für mode:"text"-Striche (Signaturen/Daten) — Google Fonts
// "Caveat" (SIL Open Font License 1.1, siehe assets/fonts/OFL.txt), lokal
// gebündelt statt zur Laufzeit nachgeladen. Registrierung einmalig beim
// Modul-Import; schlägt sie fehl, fällt fillText() auf die System-Default-
// Schrift zurück statt den ganzen Prozess zu crashen — Text bleibt lesbar,
// nur nicht mehr handschriftlich.
const SIGNATURE_FONT_FAMILY = 'Caveat';
try {
  GlobalFonts.registerFromPath(
    fileURLToPath(new URL('../assets/fonts/Caveat.ttf', import.meta.url)),
    SIGNATURE_FONT_FAMILY,
  );
} catch (e) {
  console.warn('[soul_draw] Signatur-Font konnte nicht geladen werden, Fallback auf System-Font:', e.message);
}

// ── Kern-Renderer (reine Canvas-2D-Logik, läuft gegen Raster- UND SVG-Context) ─

function paintPaper(ctx, w, h) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Catmull-Rom Interpolation, damit wenige Kontrollpunkte (die ein LLM
// realistisch liefern kann) zu einer weichen Kurve werden. Reine
// Catmull-Rom-Berechnung, unverändert — der öffentliche Zugriffspunkt ist
// jetzt catmullRomPoints() weiter unten (mit interpolation-Parameter), diese
// Funktion ist deren "voll geglätteter" Baustein.
function catmullRomOnly(points, segmentsPerSpan) {
  if (points.length < 3) return points;
  const pts = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    for (let t = 0; t < segmentsPerSpan; t++) {
      const s = t / segmentsPerSpan;
      const s2 = s * s, s3 = s2 * s;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * s +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * s +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3);
      const pr0 = p1.pressure ?? 0.7, pr1 = p2.pressure ?? 0.7;
      out.push({ x, y, pressure: pr0 + (pr1 - pr0) * s });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// Dieselbe Span-/Sample-Struktur wie catmullRomOnly() (gleiche p1→p2-Spans,
// gleiche segmentsPerSpan-Aufteilung), aber reine lineare Interpolation
// zwischen den ROHEN Nachbarpunkten statt der kubischen Catmull-Rom-Formel
// (p0/p3 bleiben unbenutzt — kein Überschwingen). Absichtlich index-gleich
// lang zu catmullRomOnly()s Ausgabe, damit interpolation unten pro Sample
// zwischen beiden lerpen kann, ohne Punkte neu zuordnen zu müssen.
function linearPoints(points, segmentsPerSpan) {
  if (points.length < 3) return points;
  const pts = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    for (let t = 0; t < segmentsPerSpan; t++) {
      const s = t / segmentsPerSpan;
      const pr0 = p1.pressure ?? 0.7, pr1 = p2.pressure ?? 0.7;
      out.push({ x: p1.x + (p2.x - p1.x) * s, y: p1.y + (p2.y - p1.y) * s, pressure: pr0 + (pr1 - pr0) * s });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// interpolation (0–1, Standard 1): 0 folgt den rohen Kontrollpunkten (eckig/
// "gebrochen", kein Überschwingen), 1 ist die heutige volle Catmull-Rom-
// Glättung. Fast-Path bei >=1 (Standard-/Altverhalten) macht exakt dieselbe
// Arbeit wie vorher, keine Verhaltensänderung für Aufrufer ohne diesen
// Parameter. Dazwischen: Sample-für-Sample-Lerp zwischen linearPoints() und
// catmullRomOnly() — z.B. Himmel weich (nah 1), Wasser gebrochen (nah 0),
// Masten präzise (0), Nebel fast verschwunden (irgendwo dazwischen).
function catmullRomPoints(points, segmentsPerSpan = 12, interpolation = 1) {
  const smooth = catmullRomOnly(points, segmentsPerSpan);
  if (interpolation >= 1 || points.length < 3) return smooth;
  const linear = linearPoints(points, segmentsPerSpan);
  const n = Math.min(smooth.length, linear.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = linear[i], b = smooth[i];
    out[i] = { x: a.x + (b.x - a.x) * interpolation, y: a.y + (b.y - a.y) * interpolation, pressure: b.pressure };
  }
  return out;
}

// Natürliche Taper-Hüllkurve: Strich beginnt/endet dünn, ist in der Mitte am
// kräftigsten. Als viele kurze Segmente mit je eigener lineWidth gerendert —
// funktioniert im SVGCanvas identisch zum Raster-Canvas (jedes Segment wird
// zu einem eigenen <path> mit eigenem stroke-width, echte Vektor-Taper-Optik).
function taperEnvelope(t) {
  return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
}

// Bounding Box roher Kontrollpunkte — Basis für Gradient-Koordinaten. Auf den
// ROHEN Punkten statt den geglätteten, weil Catmull-Rom stellenweise leicht
// über die Kontrollpunkte hinausschwingen kann; die rohen Punkte sind die
// vom Aufrufer gemeinte Fläche.
function computeBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// Text-Bounding-Box relativ zum fillText()-Anker (baseline-Ursprung, siehe
// drawTextStroke) — für computeSignatureOffset, damit eine signaturePosition-
// Gruppe, die einen Text-Strich enthält, an der tatsächlich sichtbaren
// Text-Ausdehnung ausgerichtet wird statt am einzelnen Anker-Punkt (der ja
// nur die Baseline-Startposition ist, nicht die volle Textbox). Eigener
// Scratch-Canvas nur für measureText() — kein sichtbares Rendering.
let _measureCtx = null;
function measureTextBounds(anchor, text, font, fontSize) {
  if (!_measureCtx) _measureCtx = createCanvas(10, 10).getContext('2d');
  _measureCtx.font = `${fontSize}px "${font || SIGNATURE_FONT_FAMILY}"`;
  const m = _measureCtx.measureText(text || '');
  const ascent  = m.actualBoundingBoxAscent  || fontSize * 0.75;
  const descent = m.actualBoundingBoxDescent || fontSize * 0.2;
  return { minX: anchor.x, maxX: anchor.x + m.width, minY: anchor.y - ascent, maxY: anchor.y + descent };
}

// Parst #RGB/#RRGGBB zu rgba(r,g,b,alpha) — Basis für edgeFade und glow, die
// beide denselben Farbton mit variabler Transparenz als Gradient-Stopp
// brauchen. Kein Crash bei Nicht-Hex-Input (z.B. Aufrufer übergibt bereits
// rgba/eine benannte Farbe) — dann einfach die Original-Farbe unverändert
// zurückgeben; das Fade fällt in dem Fall aus, statt das Rendering zu brechen.
function colorWithAlpha(color, alpha) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || '');
  if (!m) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// colorVariation (0–1): verschiebt jeden RGB-Kanal von color um bis zu
// variation*255, geclamped auf 0-255 — Pigmentvariation statt digitalem
// Rauschen (zehn "gleichblaue" Wasserstriche sind dann nicht zehnmal exakt
// derselbe Hex-Wert). Nicht-Hex-Input: Farbe unverändert zurückgeben statt
// zu crashen (gleiche Fallback-Philosophie wie colorWithAlpha).
function varyColor(color, variation) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color || '');
  if (!m || !variation) return color;
  let hex = m[1];
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  const shift = () => (Math.random() - 0.5) * 2 * variation * 255;
  const r = clamp(parseInt(hex.slice(0, 2), 16) + shift());
  const g = clamp(parseInt(hex.slice(2, 4), 16) + shift());
  const b = clamp(parseInt(hex.slice(4, 6), 16) + shift());
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

// ── Nässe-Zustand für wet-on-wet/re_wet ───────────────────────────────────────
// Siehe KROs Befund: ein watercolor-Strich war bisher eine stateless weiche
// Lasur, unabhängig davon, was daneben oder vorher gemalt wurde — echtes
// Aquarell braucht aber, dass Pigment in noch feuchte Nachbarflächen laufen
// und sich dort mit deren Farbe mischen kann, UND dass eine Fläche über
// mehrere soul_draw-Aufrufe hinweg allmählich trocknet statt binär
// nass/trocken zu sein. Modelliert als kleine, persistierte Liste von
// Kreisregionen (Zentrum/Radius/Farbe/Nässe 0–1) neben dem PNG (interner
// Render-Zustand, keine Kunst — deshalb NICHT in vault_shared/ selbst,
// sondern im Canvas-Unterordner, wo listVaultSharedFs()/soul_draw_snapshot
// nur exakt benannte .png/.mp4 anfassen, keine generische Verzeichnis-
// Auflistung machen, siehe dortige Kommentare). Trocknen ist bewusst NICHT
// echtzeit-basiert (die Zeit zwischen zwei Aufrufen sagt nichts über die
// gemeinte Maldauer aus, siehe Datei-Kopfkommentar zum Mehrjahres-Werk-
// Modell) — stattdessen trocknet jede Region einmal PRO AUFRUF ab, bevor
// die neuen Striche dieses Aufrufs verarbeitet werden: mehrere Striche im
// selben Aufruf bleiben also untereinander "in derselben Sitzung" feucht,
// während ein späterer, neuer Aufruf bereits angetrocknetes Vorwerk vorfindet.
const WETNESS_DECAY_PER_CALL = 0.5;
const WETNESS_MIN            = 0.04; // darunter: Region wird beim Speichern verworfen
const WETNESS_MAX_REGIONS    = 60;   // Deckelung wie paintPaper()/spray — Dateigröße/Kosten

function decayWetRegions(regions) {
  return (regions || [])
    .map(r => ({ ...r, wetness: r.wetness * WETNESS_DECAY_PER_CALL }))
    .filter(r => r.wetness > WETNESS_MIN);
}

function pruneWetRegions(regions) {
  if (regions.length <= WETNESS_MAX_REGIONS) return regions;
  // Trockenste zuerst raus, nicht älteste zuerst — für wet_on_wet zählt nur,
  // was noch nennenswert feucht ist.
  return [...regions].sort((a, b) => b.wetness - a.wetness).slice(0, WETNESS_MAX_REGIONS);
}

async function loadWetRegions(path) {
  try {
    const raw = await readFile(path, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function saveWetRegions(path, regions) {
  await writeFile(path, JSON.stringify(pruneWetRegions(regions)), 'utf8');
}

// Mischt zwei Hex-Farben kanalweise (t=0 → colorA, t=1 → colorB) — Grundlage
// für "zwei Farben verschmelzen organisch in einer nassen Fläche". Gleiche
// Fallback-Philosophie wie varyColor()/colorWithAlpha(): Nicht-Hex-Input gibt
// unverändert colorA zurück statt zu crashen.
function mixHexColors(colorA, colorB, t) {
  const ma = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colorA || '');
  const mb = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colorB || '');
  if (!ma || !mb) return colorA;
  const expand = h => (h.length === 3 ? h.split('').map(c => c + c).join('') : h);
  const ha = expand(ma[1]), hb = expand(mb[1]);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  const chan = (h, i) => parseInt(h.slice(i, i + 2), 16);
  const r = lerp(chan(ha, 0), chan(hb, 0));
  const g = lerp(chan(ha, 2), chan(hb, 2));
  const b = lerp(chan(ha, 4), chan(hb, 4));
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

// Nächstgelegene, hinreichend nahe Nachbarregion für einen watercolor-Strich —
// bewusst grobe Kreis-Näherung (Zentrum/Radius aus der Bounding Box), keine
// pixelgenaue Überlappung nötig für eine künstlerische Simulation. reach
// wächst mit water (nasser Pinsel "spürt" weiter entfernte Feuchtigkeit).
function findWetNeighbor(regions, bounds, reach) {
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  let best = null, bestScore = -Infinity;
  for (const r of regions) {
    const d = Math.hypot(r.x - cx, r.y - cy);
    const edgeDist = d - r.r;
    if (edgeDist < reach) {
      const score = r.wetness - Math.max(0, edgeDist) / reach;
      if (score > bestScore) { bestScore = score; best = r; }
    }
  }
  return best;
}

// Liefert entweder die einfache Farbe oder — wenn gradientTo gesetzt ist —
// ein CanvasGradient, gebaut über die Bounding Box der Kontrollpunkte.
// "linear" läuft von oben nach unten (Standard, z.B. für Himmel), "radial"
// vom Zentrum nach außen (z.B. Glanzpunkte/Glow). Funktioniert unverändert
// als strokeStyle UND fillStyle, sowohl im Raster- als auch im SVG-Context
// (siehe canvas_test.mjs-Probe: SVGCanvas exportiert beide Gradient-Typen
// korrekt als <linearGradient>/<radialGradient> in <defs>).
function resolveFillStyle(ctx, color, gradientTo, gradientShape, points) {
  if (!gradientTo) return color;
  const { minX, minY, maxX, maxY } = computeBounds(points);
  if (gradientShape === 'radial') {
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const r = Math.max(maxX - minX, maxY - minY) / 2 || 1;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, gradientTo);
    return g;
  }
  const g = ctx.createLinearGradient(minX, minY, minX, maxY || minY + 1);
  g.addColorStop(0, color);
  g.addColorStop(1, gradientTo);
  return g;
}

// Gradient-Endpunkte für einen beliebigen Winkel über eine Bounding Box —
// resolveFillStyle() oben kann nur "oben nach unten" (linear) oder "Mitte
// nach außen" (radial), für eine gerichtete Auflösung (mode:"dissolve")
// braucht es aber einen frei wählbaren Winkel. direction (Grad, math.
// Konvention: 0=rechts, 90=unten, 180=links, 270=oben) zeigt dabei auf die
// Richtung ZUNEHMENDER Auflösung — direction:180 löst also nach links auf.
// Die halbe Bounding-Box-Diagonale als Länge reicht, um die Box unabhängig
// vom Winkel vollständig abzudecken.
function directionalGradientLine(bounds, direction) {
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY;
  const rad = (direction || 0) * Math.PI / 180;
  const dx = Math.cos(rad), dy = Math.sin(rad);
  const len = Math.hypot(w, h) / 2 || 1;
  return { x0: cx - dx * len, y0: cy - dy * len, x1: cx + dx * len, y1: cy + dy * len };
}

// mode "dissolve" — löst eine bereits gemalte Fläche gezielt zum Papier (oder
// einer anderen Zielfarbe) hin auf, statt neues Pigment hinzuzufügen: die
// klassische "verlorene Kante" (lost edge) der Malerei, mit der ein Gesicht
// z.B. auf einer Seite bewusst weich ins Nichts übergeht statt überall hart
// konturiert zu sein. Eine EIGENE Kompositions-Operation statt zehn einzelner
// Striche — points umreißt die betroffene Fläche (wie mode:"fill"), direction
// (optional) gibt eine Richtung zunehmender Auflösung vor (ohne direction:
// gleichmäßige, ungerichtete Auflösung der ganzen Fläche), falloff (0–1)
// steuert die Breite des Übergangs (0 = harte Kante genau in der Mitte, 1 =
// über die gesamte Fläche verteilt), intensity (0–1) wie weit die Auflösung
// am stärksten betroffenen Ende reicht (1 = dort vollständig zur Zielfarbe).
// Technisch: mehrere leicht versetzte, transparente Durchgänge (gleiche
// Organik wie drawWatercolorStroke/drawDryStroke) füllen die Fläche mit einem
// alpha-Gradienten der Zielfarbe — bewusst KEIN destination-out/echtes
// Löschen: das würde bis auf echte Transparenz durchlöchern (das Papier
// selbst ist schon der unterste Layer auf demselben Canvas), während ein
// weicher, papierfarbener Überzug optisch genau dem entspricht, wie
// Aquarellpigment beim Abtupfen/Aufhellen wirklich zum Papierton zurückkehrt.
function drawDissolveStroke(ctx, points, { color = PAPER, direction, falloff = 0.4, intensity = 0.85, interpolation }) {
  const bounds = computeBounds(points);
  const passes = 6;
  for (let p = 0; p < passes; p++) {
    const jittered = points.map(pt => ({
      ...pt,
      x: pt.x + (Math.random() - 0.5) * 10,
      y: pt.y + (Math.random() - 0.5) * 10,
    }));
    const smoothed = catmullRomPoints(jittered, 12, interpolation ?? 1);
    ctx.beginPath();
    ctx.moveTo(smoothed[0].x, smoothed[0].y);
    for (let i = 1; i < smoothed.length; i++) ctx.lineTo(smoothed[i].x, smoothed[i].y);
    ctx.closePath();

    if (direction != null) {
      const { x0, y0, x1, y1 } = directionalGradientLine(bounds, direction);
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      const lo = Math.max(0, 0.5 - falloff / 2), hi = Math.min(1, 0.5 + falloff / 2);
      g.addColorStop(0, colorWithAlpha(color, 0));
      g.addColorStop(lo, colorWithAlpha(color, 0));
      g.addColorStop(hi, colorWithAlpha(color, intensity));
      g.addColorStop(1, colorWithAlpha(color, intensity));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = colorWithAlpha(color, intensity);
    }
    ctx.globalAlpha = Math.min(1, (1 / passes) * 1.6);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// style "ink"/"solid" — unverändert das ursprüngliche Taper-Verhalten,
// jetzt nur um optionale Gradient-Strichfarbe erweitert.
function drawLineStroke(ctx, points, { color, width, opacity, style, gradientTo, gradientShape, interpolation, colorVariation }) {
  const smoothed = catmullRomPoints(points, 12, interpolation);
  const flatStyle = resolveFillStyle(ctx, color, gradientTo, gradientShape, points);
  ctx.globalAlpha = style === 'eraser' ? 1 : opacity;
  ctx.strokeStyle = flatStyle;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < smoothed.length - 1; i++) {
    const t = i / (smoothed.length - 1);
    const pressure = smoothed[i].pressure ?? (style === 'solid' ? 1 : taperEnvelope(t) * 0.7 + 0.3);
    ctx.lineWidth = Math.max(0.6, width * pressure);
    // colorVariation nur ohne gradientTo (Gradient hat Vorrang, keine Kombination)
    if (colorVariation && !gradientTo) ctx.strokeStyle = varyColor(color, colorVariation);
    ctx.beginPath();
    ctx.moveTo(smoothed[i].x, smoothed[i].y);
    ctx.lineTo(smoothed[i + 1].x, smoothed[i + 1].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// mode "fill" — die Punkte werden nicht als Linie gemalt, sondern als
// geschlossene Fläche gefüllt: flache Farbflächen für moderne/abstrakte
// Kompositionen oder große Hintergrund-Washes, ohne hunderte überlappende
// Striche zu brauchen. Die Schlusskante (letzter → erster Punkt) bleibt
// gerade statt Catmull-Rom-geglättet — für Farbflächen unerheblich, echte
// geglättete geschlossene Kurven wären ein eigenes (noch nicht gebrauchtes)
// Feature.
function drawFillShape(ctx, points, { color, opacity, gradientTo, gradientShape, interpolation }) {
  const smoothed = catmullRomPoints(points, 12, interpolation);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = resolveFillStyle(ctx, color, gradientTo, gradientShape, points);
  ctx.beginPath();
  ctx.moveTo(smoothed[0].x, smoothed[0].y);
  for (let i = 1; i < smoothed.length; i++) ctx.lineTo(smoothed[i].x, smoothed[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

// style "dry" — Trockenpinsel/Kreide: viele kurze Segmente, zufällige Lücken
// und schwankende Deckkraft/Breite brechen die Linie auf statt sie glatt
// durchzuziehen.
function drawDryStroke(ctx, points, { color, width, opacity, gradientTo, gradientShape, interpolation, colorVariation }) {
  const smoothed = catmullRomPoints(points, 12, interpolation);
  ctx.strokeStyle = resolveFillStyle(ctx, color, gradientTo, gradientShape, points);
  ctx.lineCap = 'round';
  for (let i = 0; i < smoothed.length - 1; i++) {
    if (Math.random() < 0.35) continue;
    const t = i / (smoothed.length - 1);
    const pressure = smoothed[i].pressure ?? (taperEnvelope(t) * 0.7 + 0.3);
    ctx.globalAlpha = opacity * (0.35 + Math.random() * 0.5);
    ctx.lineWidth = Math.max(0.5, width * pressure * (0.6 + Math.random() * 0.5));
    if (colorVariation && !gradientTo) ctx.strokeStyle = varyColor(color, colorVariation);
    ctx.beginPath();
    ctx.moveTo(smoothed[i].x, smoothed[i].y);
    ctx.lineTo(smoothed[i + 1].x, smoothed[i + 1].y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// style "watercolor" — mehrere leicht versetzte, transparente Durchgänge
// übereinander simulieren eine weiche Lasur; water/pigment ersetzen dabei
// NICHT opacity, sondern differenzieren sie in zwei unabhängige, physikalisch
// gemeinte Achsen (siehe KROs Befund): water steuert, wie weit/unvorhersehbar
// die Farbe verläuft (Jitter-Radius, Durchgangszahl, Reichweite zu
// Nachbarregionen), pigment die tatsächliche Farbkonzentration (Deckkraft-
// Anteil pro Durchgang) — derselbe width-Strich kann so als hauchdünner,
// sehr nasser Schleier beginnen und mit mehr pigment konzentriert werden.
// wetness+wetRegions tragen das eigentliche "in feuchte Nachbarflächen
// laufen"-Verhalten: wet_on_wet/re_wet suchen (siehe findWetNeighbor) eine
// nahegelegene, noch feuchte Region aus vorherigen Strichen/Aufrufen, mischen
// deren Farbe organisch ein (mixHexColors) und malen zusätzliche, transparente
// "Lauf"-Durchgänge, die zu deren Zentrum hin verzerrt sind — echtes
// Ineinanderfließen statt nur zweier unabhängiger Lasuren übereinander.
// Rückgabewert: die vom AUFRUFER (runSoulDraw) zu persistierende neue
// Nässe-Region dieses Strichs — jeder watercolor-Strich hinterlässt eine,
// unabhängig vom wetness-Modus (auch wet_on_dry-Striche sind unmittelbar nach
// dem Malen selbst feucht, nur ihre UMGEBUNG war es vorher nicht).
function drawWatercolorStroke(ctx, points, opts) {
  const {
    color, width, opacity = 0.9, gradientTo, gradientShape, interpolation, colorVariation,
    water = 0.5, pigment = 0.6, wetness = 'wet_on_dry', wetRegions = [],
  } = opts;

  const bounds = computeBounds(points);
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const strokeRadius = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + width;

  let neighbor = null;
  if (wetness !== 'wet_on_dry') {
    const reach = strokeRadius + width * (1 + water * 3);
    neighbor = findWetNeighbor(wetRegions, bounds, reach);
  }
  // re_wet erzwingt volle Nässe der gefundenen (oder gedachten) Nachbarstelle,
  // auch wenn sie längst angetrocknet ist — der eigentliche Unterschied zu
  // wet_on_wet, das nur mit der TATSÄCHLICH noch vorhandenen Nässe arbeitet.
  const neighborWetness = wetness === 're_wet' ? 1 : (neighbor?.wetness ?? 0);
  const blendColor = neighbor ? mixHexColors(color, neighbor.color, Math.min(0.6, neighborWetness * 0.7)) : color;
  const flatStyle = gradientTo ? resolveFillStyle(ctx, blendColor, gradientTo, gradientShape, points) : blendColor;

  const passes       = Math.max(2, Math.round(4 + water * 4));
  const baseAlpha    = opacity * (0.35 + pigment * 0.65);
  const jitterAmount = width * (0.35 + water * 0.9);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let p = 0; p < passes; p++) {
    ctx.strokeStyle = (colorVariation && !gradientTo) ? varyColor(blendColor, colorVariation) : flatStyle;
    const jittered = points.map(pt => ({
      ...pt,
      x: pt.x + (Math.random() - 0.5) * jitterAmount,
      y: pt.y + (Math.random() - 0.5) * jitterAmount,
    }));
    const smoothed = catmullRomPoints(jittered, 12, interpolation);
    ctx.globalAlpha = Math.min(1, (baseAlpha / passes) * 1.8);
    for (let i = 0; i < smoothed.length - 1; i++) {
      const t = i / (smoothed.length - 1);
      const pressure = smoothed[i].pressure ?? (taperEnvelope(t) * 0.7 + 0.4);
      ctx.lineWidth = Math.max(1, width * pressure * (1.1 + p * 0.15));
      ctx.beginPath();
      ctx.moveTo(smoothed[i].x, smoothed[i].y);
      ctx.lineTo(smoothed[i + 1].x, smoothed[i + 1].y);
      ctx.stroke();
    }
  }

  // Das eigentliche Verlaufen: zusätzliche, sehr transparente Durchgänge,
  // deren Punkte zufällig weit zum Zentrum der Nachbarregion hin verzogen
  // werden — Pigment "kriecht" dorthin, statt dass beide Flächen unabhängig
  // nebeneinander stehen bleiben.
  if (neighbor && water > 0 && neighborWetness > 0) {
    const bleedPasses = Math.max(1, Math.round(2 + water * 3));
    for (let p = 0; p < bleedPasses; p++) {
      const pull = (0.15 + Math.random() * 0.35) * water;
      const bled = points.map(pt => ({
        ...pt,
        x: pt.x + (neighbor.x - pt.x) * pull * Math.random(),
        y: pt.y + (neighbor.y - pt.y) * pull * Math.random(),
      }));
      const smoothed = catmullRomPoints(bled, 12, interpolation);
      ctx.strokeStyle = mixHexColors(blendColor, neighbor.color, 0.3 + Math.random() * 0.4);
      ctx.globalAlpha = Math.min(0.5, baseAlpha * 0.25 * neighborWetness);
      for (let i = 0; i < smoothed.length - 1; i++) {
        ctx.lineWidth = Math.max(1, width * (0.5 + Math.random() * 0.6));
        ctx.beginPath();
        ctx.moveTo(smoothed[i].x, smoothed[i].y);
        ctx.lineTo(smoothed[i + 1].x, smoothed[i + 1].y);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  return { x: cx, y: cy, r: strokeRadius, color: blendColor, wetness: 1 };
}

// style "spray" — Sprühdose/Stipple: viele kleine, zufällig um den Pfad
// gestreute Punkte statt einer durchgehenden Linie. Für Textur, Struktur,
// Laub, Körnung. Im Vektor-Export (vector: true) wird STATTDESSEN auf
// drawDryStroke() ausgewichen: jeder einzelne Stipple-Punkt würde als eigener
// <path> exportiert — live gemessen (siehe Datei-Kopfkommentar-Probe/
// paintPaper()) ~1.6 KB PRO Punkt, bei typischer density×smoothed-Punktzahl
// schnell im zweistelligen MB-Bereich für einen einzigen Strich. Für ein
// Dokument, das über Jahre wachsen soll, unpraktikabel — exakt das Problem,
// das paintPaper() oben für den Papier-Hintergrund schon einmal gelöst hat.
// Die echte Stipple-Textur bleibt dem PNG vorbehalten, das Vektor-Dokument
// bekommt eine günstige, aber stilistisch verwandte Näherung (aufgebrochene
// Linie statt Punktwolke).
function drawSprayStroke(ctx, points, { color, width, opacity, vector }) {
  if (vector) {
    drawDryStroke(ctx, points, { color, width, opacity, gradientTo: undefined, gradientShape: undefined });
    return;
  }
  const smoothed = catmullRomPoints(points, 20);
  ctx.fillStyle = color;
  const density = Math.max(3, Math.round(width * 1.5));
  for (const pt of smoothed) {
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * width;
      const x = pt.x + Math.cos(angle) * radius;
      const y = pt.y + Math.sin(angle) * radius;
      ctx.globalAlpha = opacity * (0.15 + Math.random() * 0.35);
      ctx.beginPath();
      ctx.arc(x, y, Math.random() * 1.4 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// brush — der parametrisierte "Impressionisten-Pinsel": Pinselstrich als
// Ereignis, nicht als mathematisch glatte Kurve. Der Pfad wird fein
// aufgelöst (hohe Sample-Dichte, respektiert interpolation), dann per
// Bogenlänge in length-px-"Marken" zerlegt — jede Marke ist eine
// UNABHÄNGIGE Mikroentscheidung mit eigenem gewürfeltem Pressure-/Opacity-/
// Farb-/Aussetzer-Wurf, bristleDensity-fach überlagert (mit jitter-Versatz
// pro Durchgang, wie mehrere Borsten eines echten Pinsels). Genau daraus
// entsteht eine Sequenz wie "kräftig → aufbrechen → fast verschwinden →
// wieder Pigment → abrupt enden", ganz ohne einen eigenen "kein Taper"-
// Schalter — unabhängige Zufallswürfe pro Marke reichen dafür aus.
// grain (feines Opacity-Rauschen innerhalb einer Marke) bleibt wie bei
// drawSprayStroke() auf den Raster-Pass beschränkt — im Vektor-Export würde
// jeder Grain-Punkt als eigener <path> exportiert, dieselbe Kostenabwägung
// wie dort dokumentiert.
function drawBrushStroke(ctx, points, { color, width, opacity, gradientTo, gradientShape, colorVariation, interpolation, brush, vector }) {
  const {
    length = 14,
    bristleDensity = 3,
    grain = 0.15,
    jitter = width * 0.12,
    opacityVariation = 0.35,
    pressureVariation = 0.3,
    edgeBreak = 0.12,
  } = brush || {};

  const fine = catmullRomPoints(points, 20, interpolation);
  const flatStyle = resolveFillStyle(ctx, color, gradientTo, gradientShape, points);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let pass = 0; pass < bristleDensity; pass++) {
    // Pro Durchgang EIN seitlicher Versatz der ganzen Bahn (nicht pro Marke)
    // — simuliert leicht unterschiedliche Borsten eines Pinsels statt eines
    // komplett neu gewürfelten Pfads pro Durchgang.
    const offX = (Math.random() - 0.5) * jitter;
    const offY = (Math.random() - 0.5) * jitter;

    // pressureLevel/opacityLevel treiben als gebundener Random Walk (statt
    // unabhängig gewürfelter Werte pro Marke) — sonst springt die Breite
    // zwischen zwei benachbarten, kurzen Marken hart, was bei runden
    // Linecaps wie eine Perlenkette statt eines Pinselstrichs aussieht.
    // Der Walk lässt trotzdem "kräftig → aufbrechen → fast verschwinden →
    // wieder Pigment" als LANGSAME Drift entlang des Strichs entstehen.
    let pressureLevel = 1;
    let opacityLevel = 1;

    let markStart = 0;
    let accLen = 0;
    for (let i = 0; i < fine.length - 1; i++) {
      accLen += Math.hypot(fine[i + 1].x - fine[i].x, fine[i + 1].y - fine[i].y);
      if (accLen < length && i !== fine.length - 2) continue;

      const t = i / (fine.length - 1);
      const basePressure = fine[i].pressure ?? (taperEnvelope(t) * 0.7 + 0.3);
      pressureLevel = Math.max(0.15, Math.min(1.8, pressureLevel + (Math.random() - 0.5) * pressureVariation * 0.6));
      opacityLevel = Math.max(0.15, Math.min(1.6, opacityLevel + (Math.random() - 0.5) * opacityVariation * 0.6));

      if (Math.random() >= edgeBreak) {
        ctx.strokeStyle = (colorVariation && !gradientTo) ? varyColor(color, colorVariation) : flatStyle;
        ctx.lineWidth = Math.max(0.4, width * basePressure * pressureLevel);
        ctx.globalAlpha = Math.max(0.05, Math.min(1, (opacity / bristleDensity) * 1.5 * opacityLevel));
        ctx.beginPath();
        ctx.moveTo(fine[markStart].x + offX, fine[markStart].y + offY);
        ctx.lineTo(fine[i + 1].x + offX, fine[i + 1].y + offY);
        ctx.stroke();

        if (grain > 0 && !vector) {
          const dots = Math.round(grain * 6);
          for (let g = 0; g < dots; g++) {
            const gt = Math.random();
            const gx = fine[markStart].x + (fine[i + 1].x - fine[markStart].x) * gt + offX + (Math.random() - 0.5) * width * 0.4;
            const gy = fine[markStart].y + (fine[i + 1].y - fine[markStart].y) * gt + offY + (Math.random() - 0.5) * width * 0.4;
            ctx.globalAlpha = opacity * grain * Math.random() * 0.5;
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath();
            ctx.arc(gx, gy, Math.random() * 1.2 + 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      markStart = i + 1;
      accLen = 0;
    }
  }
  ctx.globalAlpha = 1;
}

// style "glow" — weicher Lichtschein statt hartem 2-Stopp-Verlauf: mehrere
// konzentrische, nach außen transparent verlaufende Kreise übereinander
// (Zentrum = Bounding-Box-Mitte der Kontrollpunkte, absteigender Radius),
// für echte weiche Streuung (Bloom), die ihre Umgebung sichtbar durchdringt,
// statt als hart begrenztes Symbol draufzusitzen (Sonne, Glanzlicht,
// Laterne). Nutzt dieselbe colorWithAlpha()+radialGradient-Pipeline wie
// edgeFade — bereits geprüft SVG-tauglich (stop-opacity exportiert korrekt).
function drawGlowStroke(ctx, points, { color, width, opacity }) {
  const { minX, minY, maxX, maxY } = computeBounds(points);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const baseR = Math.max(width, ((maxX - minX) + (maxY - minY)) / 2 || width);
  const layers = 4;
  for (let i = layers; i >= 1; i--) {
    const r = baseR * (i / layers);
    const layerAlpha = Math.min(1, (opacity / layers) * 1.8);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, colorWithAlpha(color, layerAlpha));
    g.addColorStop(1, colorWithAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// mode "text" — echter Font-Text (fillText) statt Koordinaten-Pfad, für
// Signaturen/Daten, bei denen exakte Lesbarkeit zählt (siehe KROs Befund:
// freihändig gezeichnete Ziffern wirken als Datum nicht zuverlässig lesbar).
// NUR im Raster-Pass aufgerufen — siehe renderStrokesToSvgFragment(): der
// SVGCanvas-Text-Export von @napi-rs/canvas verschluckt live nachweislich
// zufällig Zeichen ("KRO" → "KO", das Alphabet → "ABFJMOQTX", auch in der
// jeweils neuesten Version geprüft), ein bekannter, aktuell ungefixter Bug.
// points[0] ist der Baseline-Anker (x,y bei fillText-Semantik); ein
// eventueller zweiter Punkt (vom Schema für mode:"stroke"/"fill" verlangt)
// wird ignoriert.
function drawTextStroke(ctx, points, { text, font, fontSize = 32, color = '#1c1b18', opacity = 0.9 }) {
  if (!text || !points?.length) return;
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.font = `${fontSize}px "${font || SIGNATURE_FONT_FAMILY}"`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, points[0].x, points[0].y);
  ctx.globalAlpha = 1;
}

// Spiegelt Kontrollpunkte an einer horizontalen Wasserlinie (2*waterline - y),
// mit optionaler sinusförmiger x-Verzerrung pro Punkt für Wasserkräuselung —
// Basis für reflect. Reine Koordinaten-Transformation, kein Rendering-Trick,
// deshalb identisch für Raster UND SVG (bereits geprüft: gespiegelte Pfade
// exportieren korrekt als <path transform="matrix(...)">).
function reflectPoints(points, waterline, waviness) {
  return points.map((p, i) => ({
    x: p.x + (waviness ? waviness * Math.sin(i * 0.9 + (waterline - p.y) * 0.05) : 0),
    y: 2 * waterline - p.y,
    pressure: p.pressure,
  }));
}

// signaturePosition — reine Positionierungs-Hilfe, KEIN Handschrift-/Font-
// Modell: der Aufrufer zeichnet die Signatur ganz normal als eigene(n)
// Strich(e) mit signature:true, in welchen Koordinaten auch immer bequem
// sind — die Bounding Box dieser Striche wird automatisch an die gewünschte
// Ecke/Kante der TATSÄCHLICHEN Leinwand verschoben (deren Größe erst bei
// Neuanlage feststeht und bei Fortsetzung variieren kann), statt dass der
// Aufrufer für jede Canvas-Größe von Hand die exakten Zielkoordinaten
// ausrechnen muss. Alle signature:true-Striche bekommen denselben
// Versatz (dx/dy) — sie bewegen sich als starre Gruppe, damit die relative
// Position der Buchstaben zueinander erhalten bleibt.
function computeSignatureOffset(strokes, canvasW, canvasH, position, margin) {
  const tagged = strokes.filter(s => s.signature && s.points?.length);
  if (!tagged.length) return { dx: 0, dy: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of tagged) {
    const b = s.mode === 'text'
      ? measureTextBounds(s.points[0], s.text, s.font, s.fontSize || 32)
      : computeBounds(s.points);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  const b = { minX, minY, maxX, maxY };
  const cx = (b.minX + b.maxX) / 2;
  let dx = 0, dy = 0;
  if (position.includes('right'))       dx = (canvasW - margin) - b.maxX;
  else if (position.includes('left'))   dx = margin - b.minX;
  else                                  dx = (canvasW / 2) - cx; // center
  if (position.startsWith('bottom'))    dy = (canvasH - margin) - b.maxY;
  else                                  dy = margin - b.minY;   // top
  return { dx, dy };
}

// mode:"handwriting" — ersetzt jeden solchen Strich VOR dem eigentlichen
// Render-Durchlauf durch die tatsächlichen, aus dem gespeicherten Profil
// zusammengesetzten Glyphen-Striche (siehe soul_handwriting.mjs). Profil wird
// nur bei Bedarf (mind. ein handwriting-Strich vorhanden) geladen. Fehlende
// Zeichen werden übersprungen (mit Standard-Vorschub) statt den Aufruf
// scheitern zu lassen — missing wird zurückgegeben, damit der Aufrufer
// erfährt, was im Profil noch fehlt (siehe formatSoulDrawSummary).
async function applyHandwritingExpansion(soulId, strokes) {
  if (!strokes.some(s => s.mode === 'handwriting')) return { strokes, missing: [] };
  const profile = await loadHandwritingProfile(soulId);
  const missing = new Set();
  const expanded = [];
  for (const s of strokes) {
    if (s.mode !== 'handwriting' || !s.points?.length) { expanded.push(s); continue; }
    const { strokes: sub, missing: m } = expandHandwritingText(profile, s.points[0], s.text || '', {
      fontSize: s.fontSize, color: s.color, opacity: s.opacity,
      jitter: s.handwritingJitter, colorVariation: s.colorVariation, signature: s.signature,
    });
    m.forEach(c => missing.add(c));
    expanded.push(...sub);
  }
  return { strokes: expanded, missing: [...missing] };
}

function applySignaturePositioning(strokes, canvasW, canvasH, position, margin = 24) {
  if (!position) return strokes;
  const { dx, dy } = computeSignatureOffset(strokes, canvasW, canvasH, position, margin);
  if (!dx && !dy) return strokes;
  return strokes.map(s => s.signature
    ? { ...s, points: s.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })) }
    : s);
}

// Kern-Dispatcher — wählt Fläche vs. Linien-"Pinsel" (inkl. glow), setzt
// Blend-Mode/Eraser einheitlich für alle Techniken. blend (multiply/screen/
// overlay/soft-light) ist reines ctx.globalCompositeOperation, unterstützt
// von Raster- UND SVG-Context gleichermaßen (siehe canvas_test.mjs-Probe).
// `vector` unterscheidet den teuren Raster-Pass (volle Textur) vom günstigen
// SVG-Export-Pass (siehe drawSprayStroke() oben) — vom Aufrufer gesetzt,
// nicht am ctx-Typ erraten. Aus drawStroke() herausgezogen, damit reflect
// (siehe dort) denselben Stil-Dispatch ein zweites Mal auf gespiegelte
// Punkte anwenden kann, ohne die Weiche zu duplizieren.
function dispatchStrokeStyle(ctx, stroke, { vector = false, wetRegions = [] } = {}) {
  const {
    points, color = '#1c1b18', width = 14, opacity = 0.9, style = 'ink', mode = 'stroke',
    gradientTo, gradientShape, blend, interpolation, colorVariation, brush, text, font, fontSize,
    water, pigment, wetness, direction, falloff, intensity,
  } = stroke;

  ctx.globalCompositeOperation = style === 'eraser' ? 'destination-out' : (blend || 'source-over');

  let newWetRegion = null;

  if (mode === 'text') {
    // Nie im SVG-Pass rendern — siehe drawTextStroke()s Kommentar zum
    // SVGCanvas-Text-Export-Bug. renderStrokesToSvgFragment() ruft für
    // mode:"text"-Striche gar nicht erst dispatchStrokeStyle() auf; dieser
    // vector-Check ist nur ein zusätzliches Sicherheitsnetz.
    if (!vector) drawTextStroke(ctx, points, { text, font, fontSize, color, opacity });
  } else if (brush) {
    drawBrushStroke(ctx, points, { color, width, opacity, gradientTo, gradientShape, colorVariation, interpolation, brush, vector });
  } else if (mode === 'fill') {
    drawFillShape(ctx, points, { color, opacity, gradientTo, gradientShape, interpolation });
  } else if (mode === 'dissolve') {
    // Bewusst stroke.color roh (nicht das oben mit '#1c1b18' vorbelegte
    // color), sonst würde eine Auflösung ohne explizite Zielfarbe fälschlich
    // zu dunklem Tintenschwarz statt zum Papierton auflösen (drawDissolve-
    // Stroke()s eigener PAPER-Default greift nur bei echtem undefined).
    drawDissolveStroke(ctx, points, { color: stroke.color, direction, falloff, intensity, interpolation });
  } else if (style === 'dry') {
    drawDryStroke(ctx, points, { color, width, opacity, gradientTo, gradientShape, interpolation, colorVariation });
  } else if (style === 'watercolor') {
    newWetRegion = drawWatercolorStroke(ctx, points, { color, width, opacity, gradientTo, gradientShape, interpolation, colorVariation, water, pigment, wetness, wetRegions });
  } else if (style === 'spray') {
    drawSprayStroke(ctx, points, { color, width, opacity, vector });
  } else if (style === 'glow') {
    drawGlowStroke(ctx, points, { color, width, opacity });
  } else {
    drawLineStroke(ctx, points, { color, width, opacity, style, gradientTo, gradientShape, interpolation, colorVariation });
  }

  ctx.globalCompositeOperation = 'source-over';
  return newWetRegion;
}

// Öffentliche Zeichenfunktion — ein normaler Durchgang, plus bei gesetztem
// reflect ein zweiter Durchgang mit gespiegelten/verzerrten Punkten und
// reduzierter Deckkraft. Dadurch erbt die Reflexion automatisch den Stil des
// Original-Strichs (ein gespiegelter watercolor-Strich sieht aus wie eine
// weiche Wasserspiegelung, ein gespiegelter ink-Strich wie eine klare
// Mastreflexion) — kein separater Reflexions-Renderer nötig. Läuft für
// reflect innerhalb derselben SVGCanvas-Instanz wie der Original-Strich
// (siehe renderStrokesToSvgFragment), landet also im selben
// <!-- stroke -->-Block; countStrokes() zählt Original+Reflexion weiterhin
// als EIN Strich.
// Rückgabewert: neue Nässe-Region (siehe drawWatercolorStroke), oder null bei
// jedem anderen style/mode — nur vom Original-Strich, eine gespiegelte
// reflect-Kopie hinterlässt bewusst keine eigene Region (sonst würde jede
// Wasserlinie unrealistischerweise selbst zur Feuchtfläche).
function drawStroke(ctx, stroke, { vector = false, wetRegions = [] } = {}) {
  if (!stroke.points || stroke.points.length < 2) return null;

  // edgeFade: Komfort-Kurzform, greift nur wenn gradientTo nicht schon
  // explizit gesetzt ist (ein Aufrufer, der bewusst eine zweite Farbe will,
  // hat Vorrang). Löst sich nach außen in Transparenz derselben Farbe auf —
  // für Nebel/weiche Silhouetten-Kanten, ohne dass der Aufrufer rgba(...)
  // von Hand berechnen muss.
  let resolved = stroke;
  if (stroke.edgeFade != null && !stroke.gradientTo) {
    resolved = {
      ...stroke,
      gradientTo: colorWithAlpha(stroke.color || '#1c1b18', 1 - stroke.edgeFade),
      gradientShape: stroke.gradientShape || 'radial',
    };
  }

  const newWetRegion = dispatchStrokeStyle(ctx, resolved, { vector, wetRegions });

  if (resolved.reflect) {
    const { waterline, opacity: reflectOpacity = 0.35, waviness = 0 } = resolved.reflect;
    const reflected = {
      ...resolved,
      points: reflectPoints(resolved.points, waterline, waviness),
      opacity: (resolved.opacity ?? 0.9) * reflectOpacity,
    };
    dispatchStrokeStyle(ctx, reflected, { vector, wetRegions });
  }

  return newWetRegion;
}

// ── SVG-Hilfsfunktionen ───────────────────────────────────────────────────────

// Rendert nur die übergebenen Striche (kein Hintergrund) und liefert das
// innere Markup (ohne äußeres <svg>-Tag) — das wird bei Fortsetzung vor
// </svg> in die bestehende Datei gespliced. Ein eigenes SVGCanvas PRO Strich,
// nicht eins für alle: getContent() ist destruktiv (flusht/resettet den
// internen Aufzeichnungs-State bei jedem Aufruf, live getestet — ein zweiter
// Strich auf demselben SVGCanvas nach bereits einmal aufgerufenem getContent()
// hätte den ersten Strich stillschweigend verworfen). Jeder Strich bekommt
// einen <!-- stroke --> Kommentar davor, rein zum verlässlichen Zählen (ein
// Strich kann durch den Taper-Loop in viele <path>-Segmente zerfallen — ohne
// Marker wäre "Anzahl Striche insgesamt" aus dem SVG nicht rekonstruierbar).
// wetRegionsPerStroke[i]: Nässe-Zustand GENAU zum Zeitpunkt, als Strich i im
// Raster-Pass gezeichnet wurde (siehe runSoulDraw) — sorgt dafür, dass der
// SVG-Export dieselbe fortschreitende Nässe-Historie sieht wie der Raster-
// Pass, statt versehentlich den fertigen Endzustand für jeden Strich zu
// verwenden. Fehlt der Eintrag (ältere Aufrufer/Tests ohne dieses Argument),
// fällt der jeweilige Strich auf "keine Nachbarn bekannt" zurück — harmlos,
// nur wet_on_wet/re_wet hätten dann nichts zum Verlaufen.
function renderStrokesToSvgFragment(strokes, width, height, wetRegionsPerStroke = []) {
  let fragment = '';
  for (let idx = 0; idx < strokes.length; idx++) {
    const stroke = strokes[idx];
    if (stroke.mode === 'text') {
      // Bewusst NICHT über drawStroke()/SVGCanvas gerendert — deren fillText-
      // Export verschluckt live nachweislich zufällig Zeichen (siehe
      // drawTextStroke()s Kommentar), ein aktuell ungefixter Bug in
      // @napi-rs/canvas. Der Text lebt bewusst nur im PNG; hier nur ein
      // durchsuchbarer, ehrlicher Marker, der weiterhin als <!-- stroke -->
      // zählt (es WAR ein echter Strich in diesem Aufruf, nur nicht als
      // Vektor persistiert).
      const escaped = (stroke.text || '').replace(/--/g, '––');
      fragment += `\t<!-- stroke --><!-- text (raster-only, siehe PNG — SVGCanvas-Text-Export-Bug): "${escaped}" -->\n`;
      continue;
    }
    const canvas = new SVGCanvas(width, height, SvgExportFlag.RelativePathEncoding);
    const ctx = canvas.getContext('2d');
    drawStroke(ctx, stroke, { vector: true, wetRegions: wetRegionsPerStroke[idx] || [] });
    const full = canvas.getContent().toString('utf8');
    const inner = (full.match(/<svg[^>]*>([\s\S]*)<\/svg>/) || [, ''])[1];
    fragment += `\t<!-- stroke -->\n${inner}`;
  }
  return fragment;
}

// Flache Hintergrundfarbe statt paintPaper()s gesprenkelter Papier-Textur:
// jeder der 1400 Speckle-Kreise wird von SVGCanvas als eigener, ziemlich
// verboser Bezier-Pfad exportiert — live gemessen: ~2.7 MB allein für den
// Hintergrund, noch bevor ein einziger Strich dazukommt. Für ein Dokument,
// das über Jahre wachsen soll, unpraktikabel. Die Textur bleibt im PNG
// (dort sind es einfach günstige Pixel), das SVG bekommt nur die Grundfarbe.
function buildNewSvgDocument(width, height, background, strokesFragment) {
  const canvas = new SVGCanvas(width, height, SvgExportFlag.RelativePathEncoding);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = (!background || background === 'paper') ? PAPER : background;
  ctx.fillRect(0, 0, width, height);
  const withBg = canvas.getContent().toString('utf8');
  return withBg.replace(/<\/svg>\s*$/, `${strokesFragment}</svg>\n`);
}

function spliceSvgFragment(existingSvgText, strokesFragment) {
  return existingSvgText.replace(/<\/svg>\s*$/, `${strokesFragment}</svg>\n`);
}

function countStrokes(svgText) {
  return (svgText.match(/<!--\s*stroke\s*-->/g) || []).length;
}

function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function fileExists(p) {
  try { await stat(p); return true; } catch { return false; }
}

// vault/context/-Dateien werden in api_context.json's synced_files.context
// registriert, damit sie über context_list auffindbar sind — gleiches Muster
// wie context_write.mjs's ensureContextRegistered().
async function ensureContextRegistered(soulId, filename) {
  const ctxPath = `${SOULS_DIR}${soulId}/api_context.json`;
  try {
    const raw = await readFile(ctxPath, 'utf8');
    const ctx = JSON.parse(raw);
    const sf  = ctx.synced_files = ctx.synced_files || {};
    const arr = Array.isArray(sf.context) ? sf.context : [];
    if (!arr.includes(filename)) {
      arr.push(filename);
      sf.context = arr;
      await writeFile(ctxPath, JSON.stringify(ctx), 'utf8');
    }
  } catch { /* nicht kritisch */ }
}

// ── MCP-Tool-Registrierung ────────────────────────────────────────────────────
// Owner-only, gleiche Kategorie wie context_write/vault_shared_upload — nur
// dort registriert wo soulId bekannt ist (siehe tools/index.mjs registerTools()).
// PNG bleibt unverschlüsselt in vault_shared (wie vault_shared_upload.mjs) —
// das ist bewusst ein Peer-Freigabe-Staging-Bereich, keine Vault-Verschlüsselung.

const strokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  pressure: z.number().min(0).max(1).optional()
    .describe('0–1, optional. Ohne Angabe: automatischer Taper (dünn–dick–dünn).'),
});

const strokeSchema = z.object({
  points: z.array(strokePointSchema).min(2).max(200)
    .describe('Wenige Kontrollpunkte reichen (3–6 pro Strich) — werden automatisch zu einer weichen Kurve interpoliert.'),
  color: z.string().max(20).optional().describe('Hex-Farbe, z.B. "#A8402F"'),
  width: z.number().min(0.5).max(200).optional().describe('Grundstärke des Strichs in px'),
  opacity: z.number().min(0).max(1).optional(),
  style: z.enum(['ink', 'solid', 'eraser', 'dry', 'watercolor', 'spray', 'glow']).optional()
    .describe('"ink"/"solid": glatte, tapernde/gleichmäßige Linie (Standard: ink). "eraser" löscht nur im PNG (destination-out) — im append-only SVG wird stattdessen mit der Papierfarbe übermalt, echtes Löschen alter SVG-Striche ist nicht möglich. "dry": aufgebrochener Trockenpinsel/Kreide-Strich. "watercolor": weiche, transparente, ineinander verlaufende Lasur (mehrere Durchgänge, siehe water/pigment/wetness für die volle Aquarell-Physik). "spray": gestreute Stipple-Punkte statt einer Linie — Textur/Körnung/Laub. "glow": weicher Lichtschein (mehrere gestapelte, nach außen verblassende Kreise) statt hartem Verlaufsrand — für Sonne/Glanzlicht/Laterne, die ihre Umgebung sichtbar durchdringen soll, nicht nur als Symbol draufsitzt.'),
  water: z.number().min(0).max(1).optional()
    .describe('Nur bei style:"watercolor", Standard 0.5. Wie nass der Pinsel ist — unabhängig von pigment. Steuert Streuradius/Durchgangszahl der Lasur UND (zusammen mit wetness) wie weit/stark Farbe in eine feuchte Nachbarfläche läuft. Wenig Wasser: knapper, vorhersehbarer Schleier. Viel Wasser: weiträumiges, unkontrollierteres Verlaufen.'),
  pigment: z.number().min(0).max(1).optional()
    .describe('Nur bei style:"watercolor", Standard 0.6. Farbkonzentration, unabhängig von water — wie viel Pigment auf dem nassen Pinsel ist. Für den Effekt "eine Bewegung, unterschiedliche Farbdichte" mehrere kurze, aufeinanderfolgende Striche entlang derselben Bewegung mit unterschiedlichem pigment kombinieren (z.B. sehr wässriger Anfang, konzentriertes Ende).'),
  wetness: z.enum(['wet_on_dry', 'wet_on_wet', 're_wet']).optional()
    .describe('Nur bei style:"watercolor", Standard "wet_on_dry". "wet_on_dry": malt klar, ohne mit Nachbarstrichen zu verschmelzen. "wet_on_wet": sucht eine nahegelegene, noch feuchte Fläche (auch aus früheren Aufrufen — jeder watercolor-Strich bleibt danach kurz "feucht" und trocknet mit jedem weiteren soul_draw-Aufruf etwas mehr an, kein Echtzeit-Timer) und lässt die Farbe organisch hineinlaufen/sich mit ihr mischen — für Himmel, Nebel, ineinanderfließende Flächen. Am stärksten kurz nach dem Nachbarstrich (auch noch im selben Aufruf), schwächer über mehrere spätere Aufrufe hinweg. "re_wet": aktiviert eine Fläche zwangsweise als frisch feucht, auch wenn sie längst angetrocknet ist — um bewusst an einer alten Stelle weiterzuarbeiten.'),
  mode: z.enum(['stroke', 'fill', 'text', 'handwriting', 'dissolve']).optional()
    .describe('"stroke" (Standard): malt den Pfad als Pinsellinie. "fill": behandelt die Punkte als geschlossene Form und füllt sie mit `color` — flache Farbflächen für Hintergründe oder moderne/abstrakte Kompositionen, ohne viele überlappende Striche zu brauchen. "text": rendert `text` mit einem echten Handschrift-Font an points[0] (Baseline-Anker) — für Signaturen/Daten, bei denen exakte Lesbarkeit zählt (siehe `text`-Feld). Nur im PNG sichtbar, nicht im SVG (siehe dort). "handwriting": setzt `text` aus der EIGENEN, einmal per soul_handwriting_save gespeicherten Handschrift zusammen — echte Vektor-Striche, funktioniert identisch in PNG und SVG, mit leichter Variation pro Aufruf (siehe `handwritingJitter`). Noch nicht definierte Zeichen werden übersprungen (siehe Rückmeldung). "dissolve": löst eine bereits gemalte Fläche gezielt zum Papier (oder `color`) hin auf statt neues Pigment hinzuzufügen — die "verlorene Kante" der Malerei (z.B. eine Gesichtshälfte bewusst weich verschwinden lassen), siehe direction/falloff/intensity. Eine Kompositions-Entscheidung über eine Fläche, kein Pinselstrich.'),
  direction: z.number().min(0).max(360).optional()
    .describe('Nur bei mode:"dissolve". Winkel in Grad (0=rechts, 90=unten, 180=links, 270=oben), in dessen Richtung die Auflösung zunimmt — direction:180 löst z.B. nach links auf (linke Bildhälfte verschwindet, rechte bleibt). Ohne Angabe: gleichmäßige, ungerichtete Auflösung der ganzen Fläche.'),
  falloff: z.number().min(0).max(1).optional()
    .describe('Nur bei mode:"dissolve", Standard 0.4. Breite des Übergangs: 0 = harte Kante genau in der Mitte der Fläche, 1 = Übergang über die gesamte Fläche verteilt (sehr allmählich).'),
  intensity: z.number().min(0).max(1).optional()
    .describe('Nur bei mode:"dissolve", Standard 0.85. Wie vollständig die Auflösung am stärksten betroffenen Ende ist — 1 = dort vollständig zur Zielfarbe (meist Papier), niedrigere Werte lassen noch etwas vom ursprünglichen Gemalten durchscheinen.'),
  text: z.string().max(120).optional()
    .describe('Bei mode:"text" oder mode:"handwriting": der zu rendernde Text, z.B. "KRO · 17.08.2026". Bei "text": echter Font (Google Fonts "Caveat"), garantiert exakt lesbar, aber geliehene Typografie, NUR im PNG (bekannter Bug im SVG-Text-Export von @napi-rs/canvas — verschluckt dort zufällig Zeichen; die SVG-Fortsetzungshistorie bekommt stattdessen einen Klartext-Kommentar-Marker). Bei "handwriting": echte eigene Buchstabenformen aus dem Handschriftprofil, funktioniert identisch in PNG und SVG.'),
  font: z.string().max(60).optional().describe('Nur bei mode:"text". Font-Familie, falls bereits im Prozess registriert. Standard: "Caveat" (handschriftlich).'),
  fontSize: z.number().min(6).max(300).optional().describe('Bei mode:"text" oder mode:"handwriting": Schrift-/Zeichengröße in px. Standard 32.'),
  handwritingJitter: z.number().min(0).max(1).optional()
    .describe('Nur bei mode:"handwriting", Standard 0.15. Wie stark Rotation/Skalierung/Position/Zeichenabstand pro Vorkommen jeder Glyphe zufällig variieren — 0 = jede Signatur pixelgleich, höhere Werte = natürlichere, weniger identische Wiederholung.'),
  gradientTo: z.string().max(32).optional()
    .describe('Zweite Farbe — verläuft von `color` zu dieser Farbe über die Bounding Box des Strichs/der Fläche (z.B. Himmel, Glanzlicht, weiche Schattierung). Kann auch "rgba(r,g,b,0)" sein (transparent) — löst den Strich/die Fläche nach außen ins Nichts auf statt zu einer zweiten harten Farbe. Siehe auch edgeFade für dieselbe Wirkung ohne rgba() von Hand auszurechnen.'),
  gradientShape: z.enum(['linear', 'radial']).optional()
    .describe('Form des Verlaufs, wenn gradientTo gesetzt ist. Standard "linear" (oben nach unten der Bounding Box), "radial" für Glanzpunkte/Glow vom Zentrum nach außen.'),
  blend: z.enum(['multiply', 'screen', 'overlay', 'soft-light']).optional()
    .describe('Farbmischung mit dem bereits Gezeichneten darunter — "multiply" für Schatten/Lasur, "screen" für Licht/Glanzlicht-Aufbau, "overlay"/"soft-light" für dezente Farbverschiebungen. Standard: deckend (normal).'),
  edgeFade: z.number().min(0).max(1).optional()
    .describe('0–1: löst den Strich/die Fläche nach außen in Transparenz derselben Farbe auf (Kurzform für gradientTo="rgba(...)" mit gradientShape "radial" — wird ignoriert, wenn gradientTo bereits explizit gesetzt ist). Für Nebel, weich auslaufende Silhouetten, atmosphärische Tiefe statt harter Kanten. 1 = komplett transparenter Rand.'),
  reflect: z.object({
    waterline: z.number().describe('y-Koordinate der Spiegellinie (z.B. Horizont/Wasserlinie).'),
    opacity: z.number().min(0).max(1).optional().describe('Deckkraft der Spiegelung relativ zum Original. Standard 0.35.'),
    waviness: z.number().min(0).max(50).optional().describe('Amplitude einer sinusförmigen horizontalen Verzerrung in px, für Wasserkräuselung. Standard 0 (glatte Spiegelung).'),
  }).optional()
    .describe('Spiegelt denselben Strich unterhalb von waterline — mit reduzierter Deckkraft und optionaler Wellenverzerrung. Die Spiegelung übernimmt automatisch style/mode/Farbe des Original-Strichs (ein gespiegelter watercolor-Strich wirkt wie eine weiche Wasserspiegelung, ein gespiegelter ink-Strich wie eine klare Mastreflexion). Für Wasser-/Spiegel-Reflexionen.'),
  interpolation: z.number().min(0).max(1).optional()
    .describe('0–1, Standard 1. Steuert, wie stark die rohen Kontrollpunkte geglättet werden. 1 (Standard): volle Catmull-Rom-Glättung wie bisher — weiche, runde Kurve. 0: reine lineare Verbindung der rohen Punkte — eckig, gebrochen, den Kontrollpunkten wörtlich folgend. Dazwischen: stufenloser Übergang. Himmel/Wasser eher weich (nah 1), Wellen/Nebel eher gebrochen (nah 0), Masten/Architektur eher präzise-eckig (nah 0).'),
  colorVariation: z.number().min(0).max(1).optional()
    .describe('0–1, Standard 0. Lässt die Farbe pro gezeichnetem Segment leicht um `color` schwanken (jeder RGB-Kanal um bis zu ±(colorVariation×255)), statt den ganzen Strich in exakt einer Farbe zu malen — für Pigment-/Farbvariation, damit z.B. mehrere Wasserstriche derselben Nennfarbe nicht identisch wirken. Wird ignoriert, wenn gradientTo gesetzt ist (Gradient hat Vorrang).'),
  brush: z.object({
    length: z.number().min(1).max(200).optional().describe('px-Länge einer einzelnen "Borsten-Marke" — Basis-Granularität jeder Mikroentscheidung entlang des Strichs. Standard 14.'),
    bristleDensity: z.number().min(1).max(12).optional().describe('Anzahl überlagerter Durchgänge (wie mehrere Borsten eines echten Pinsels). Standard 3.'),
    grain: z.number().min(0).max(1).optional().describe('Feines Opacity-Rauschen (Körnung) innerhalb jeder Marke — nur im PNG sichtbar, nicht im SVG-Export. Standard 0.15.'),
    jitter: z.number().min(0).max(50).optional().describe('Seitliche Versatz-Abweichung in px pro Durchgang. Standard ≈ width×0.12.'),
    opacityVariation: z.number().min(0).max(1).optional().describe('Wie stark die Deckkraft von Marke zu Marke zufällig schwankt. Standard 0.35.'),
    pressureVariation: z.number().min(0).max(1).optional().describe('Wie stark die Strichbreite von Marke zu Marke zufällig schwankt. Standard 0.3.'),
    edgeBreak: z.number().min(0).max(1).optional().describe('Wahrscheinlichkeit, dass eine einzelne Marke ganz ausfällt (trockener Aussetzer/Lücke). Standard 0.12.'),
  }).optional()
    .describe('Der parametrisierte "Impressionisten-Pinsel": zerlegt den Strich in kurze, unabhängig gewürfelte Marken statt einer glatten, gleichmäßigen Linie — Pinselstrich als Ereignis, nicht als mathematisch glatte Kurve (kräftig → aufbrechen → fast verschwinden → wieder Pigment → abrupt enden). Hat Vorrang vor `style`, wenn gesetzt — kombinierbar mit `interpolation` und `colorVariation`. Für lebendige, unregelmäßige Pinseltextur (Laub, bewegtes Wasser, lockere Studien) statt der glatten ink/dry/watercolor-Striche.'),
  signature: z.boolean().optional()
    .describe('Markiert diesen Strich als Teil der Signatur. Zusammen mit dem Aufruf-Parameter signaturePosition werden alle so markierten Striche automatisch als starre Gruppe an die gewünschte Ecke/Kante der tatsächlichen Leinwand verschoben — die Buchstabenformen selbst werden ganz normal als Striche gezeichnet (z.B. mit brush für einen handschriftlichen Charakter), in beliebigen, bequemen Koordinaten. Kein Font-/Handschrift-Modell, nur Positionierung.'),
});

// Geteilter Kern — genutzt sowohl vom MCP-Tool unten (register(), für Claude.ai/
// Claude Desktop) als auch von server.mjs's /internal/run-tool (für den In-App-
// Chat, siehe dortiger 'soul_draw'-Case). Zwei unabhängige, von Hand gepflegte
// Tool-Registries in diesem Projekt (useClaude.js/server.mjs für den In-App-Chat,
// tools/index.mjs für MCP) — ohne diese Trennung von Rendering/Persistenz und
// MCP-Response-Formatierung hätte server.mjs die komplette Canvas-/SVG-Logik
// ein zweites Mal reimplementieren müssen, mit allen bereits hier gefixten
// Bugs (destruktives SVGCanvas.getContent(), Papier-Textur-Dateigröße) erneut
// zum Risiko.
export async function runSoulDraw(soulId, token, { canvas_id, width, height, background, strokes, description, signaturePosition, signatureMargin }) {
  const pngDir      = artworkDir(soulId, canvas_id);
  const ctxDir      = `${SOULS_DIR}${soulId}/vault/context`;
  const pngPath     = `${pngDir}/${canvas_id}.png`;
  const svgPath     = `${ctxDir}/${canvas_id}.svg`;
  const wetnessPath = `${pngDir}/${canvas_id}.wetness.json`;
  await mkdir(pngDir, { recursive: true });
  await mkdir(ctxDir, { recursive: true });

  const { vaultKeyHex, cipherMode } = await loadVaultMeta(soulId);
  const isNew = !(await fileExists(svgPath));

  let canvas, ctx, w, h, existingSvgText = null;

  if (isNew) {
    w = width || 1600;
    h = height || 1200;
    canvas = createCanvas(w, h);
    ctx = canvas.getContext('2d');
    if (!background || background === 'paper') paintPaper(ctx, w, h);
    else { ctx.fillStyle = background; ctx.fillRect(0, 0, w, h); }
  } else {
    const existingPng = await readFile(pngPath);
    const img = await loadImage(existingPng);
    w = img.width;
    h = img.height;
    canvas = createCanvas(w, h);
    ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const rawSvg = await readFile(svgPath).catch(() => null);
    existingSvgText = rawSvg ? decryptIfNeeded(rawSvg, vaultKeyHex).toString('utf8') : null;
  }

  const { strokes: withHandwriting, missing: missingHandwritingChars } = await applyHandwritingExpansion(soulId, strokes);
  strokes = applySignaturePositioning(withHandwriting, w, h, signaturePosition, signatureMargin);

  // Nässe-Zustand: einmal pro AUFRUF abtrocknen (nicht pro Strich — mehrere
  // Striche in diesem Aufruf gelten als "in derselben Sitzung"), dann
  // progressiv fortschreiben, während die Striche gezeichnet werden, damit
  // ein späterer Strich im selben Aufruf bereits frühere als Nachbarn sehen
  // kann. wetRegionsPerStroke[i] hält den Snapshot GENAU vor Strich i fest,
  // für den identischen SVG-Durchlauf weiter unten (siehe dortiger Kommentar).
  let wetRegions = decayWetRegions(await loadWetRegions(wetnessPath));
  const wetRegionsPerStroke = [];
  for (const stroke of strokes) {
    wetRegionsPerStroke.push(wetRegions);
    const newRegion = drawStroke(ctx, stroke, { wetRegions });
    if (newRegion) wetRegions = [...wetRegions, newRegion];
  }
  await saveWetRegions(wetnessPath, wetRegions);

  const pngBuf = canvas.toBuffer('image/png');
  await writeFile(pngPath, pngBuf);

  const svgFragment = renderStrokesToSvgFragment(strokes, w, h, wetRegionsPerStroke);
  const svgText = isNew || !existingSvgText
    ? buildNewSvgDocument(w, h, background, svgFragment)
    : spliceSvgFragment(existingSvgText, svgFragment);

  let svgOutBuf = Buffer.from(svgText, 'utf8');
  if (cipherMode === 'ciphered' && vaultKeyHex) svgOutBuf = encryptBuf(svgOutBuf, vaultKeyHex);
  await writeFile(svgPath, svgOutBuf);
  await ensureContextRegistered(soulId, `${canvas_id}.svg`);

  const totalStrokes = countStrokes(svgText);
  const svgHash = sha256Hex(svgText);

  const stageLabel = `${isNew ? 'begonnen' : 'fortgesetzt'} (+${strokes.length} Striche, insgesamt ${totalStrokes})`;
  await recordArtworkProgress(soulId, canvas_id, { stageLabel, contentHash: svgHash });

  const vaultUrlPng = `vault-shared://${soulId}/${canvas_id}/${canvas_id}.png`;
  const viewUrlPng  = token ? sharedFileUrl(soulId, `${canvas_id}/${canvas_id}.png`, token) : null;
  const sizeKb      = Math.ceil(pngBuf.length / 1024);

  return { isNew, w, h, pngBuf, sizeKb, totalStrokes, vaultUrlPng, viewUrlPng, svgHash, description, missingHandwritingChars };
}

export function formatSoulDrawSummary(canvasId, strokeCount, result) {
  const { isNew, w, h, sizeKb, totalStrokes, vaultUrlPng, viewUrlPng, svgHash, description, missingHandwritingChars } = result;
  const descPart = description ? ` — ${description}` : '';
  return [
    isNew
      ? `Neues Werk "${canvasId}" angelegt (${w}×${h}px, ${strokeCount} Striche).`
      : `"${canvasId}" fortgesetzt — ${strokeCount} neue Striche hinzugefügt (insgesamt ${totalStrokes}).`,
    `PNG: ${sizeKb} KB${viewUrlPng ? ` — ${viewUrlPng}` : ''}`,
    `SVG (Vektor-Quelle, geschützt in vault/context) — über context_get "${canvasId}.svg" lesbar.`,
    `Fortschritt in sys.md ("## Kunstwerke") vermerkt (sha256 ${svgHash.slice(0, 12)}…) — fließt in den nächsten Blockchain-Anker ein.`,
    missingHandwritingChars?.length
      ? `Hinweis: mode:"handwriting" — folgende Zeichen sind noch nicht im Handschriftprofil definiert und wurden übersprungen: ${missingHandwritingChars.map(c => `"${c}"`).join(', ')} (siehe soul_handwriting_save).`
      : null,
    '',
    `Mit peer_send teilen (PNG):`,
    `  to: "Till" (oder "alle")`,
    `  message: "[${canvasId}.png](${vaultUrlPng})${descPart}"`,
  ].filter(Boolean).join('\n');
}

export function register(server, soulId, token) {
  server.tool(
    'soul_draw',
    [
      'Zeichnet oder erweitert ein Bild headless (ohne Maus/Mensch) aus einer Liste von',
      'Pinselstrichen. Für langfristige Werke gedacht — mit derselben canvas_id über Tage,',
      'Wochen, Monate oder Jahre hinweg weiterzeichnen, jeder Aufruf fügt neue Striche hinzu.',
      '',
      'Speichert {canvas_id}.png (Raster-Vorschau, unverschlüsselt) in vault_shared —',
      'zum Teilen/Betrachten, z.B. per peer_send. Die eigentliche Werk-Quelle ist',
      '{canvas_id}.svg (echtes Vektor-Dokument, offener Standard), geschützt und',
      'verschlüsselt in vault/context — dort über context_get lesbar, aber nicht über',
      'die Peer-Sharing-Infrastruktur erreichbar, damit nur der Besitzer daran',
      'weiterzeichnen kann. Jeder Aufruf trägt außerdem einen Fortschritts-Eintrag in',
      'sys.md ("## Kunstwerke") ein — fließt automatisch in den nächsten (vom Besitzer',
      'ausgelösten) Blockchain-Anker als Beleg ein, dass zu diesem Zeitpunkt bereits',
      'am Werk gearbeitet wurde.',
      '',
      'Wenige grobe Kontrollpunkte pro Strich reichen (3–6) — Catmull-Rom-Interpolation',
      'macht daraus eine weiche Kurve, eine Taper-Hüllkurve simuliert Pinselgefühl.',
      'Kein Bedarf, hunderte Pixel-Koordinaten einzeln zu generieren.',
      '',
      'Technik-Bandbreite pro Strich (style): "ink"/"solid" für klare Linien, "dry" für',
      'aufgebrochenen Trockenpinsel/Kreide, "watercolor" für weiche, ineinander verlaufende',
      'Lasuren, "spray" für gestreute Textur/Körnung, "glow" für weichen Lichtschein (mehrere',
      'gestapelte, nach außen verblassende Kreise statt hartem Verlaufsrand — Licht, das seine',
      'Umgebung durchdringt, statt als Symbol draufzusitzen).',
      '',
      'Echte Aquarell-Physik für style:"watercolor" (drei zusätzliche Achsen): water (0-1,',
      'Standard 0.5) und pigment (0-1, Standard 0.6) trennen "wie nass der Pinsel ist" von',
      '"wie konzentriert die Farbe ist" — derselbe Strich kann so von hauchdünnem, nassem',
      'Schleier bis konzentriert-dunkel reichen (dafür mehrere kurze Striche entlang derselben',
      'Bewegung mit unterschiedlichem pigment kombinieren). wetness ("wet_on_dry" Standard,',
      '"wet_on_wet", "re_wet") lässt Farbe tatsächlich in benachbarte, noch feuchte Flächen',
      'laufen und sich dort organisch mit deren Farbe mischen — jeder watercolor-Strich bleibt',
      'danach kurz feucht und trocknet mit jedem weiteren soul_draw-Aufruf etwas mehr an (kein',
      'Echtzeit-Timer, sondern pro Aufruf/Sitzung), "wet_on_wet" wirkt also am stärksten kurz',
      'nach dem Nachbarstrich (auch noch im selben Aufruf) und schwächer über mehrere spätere',
      'Aufrufe hinweg. "re_wet" aktiviert eine längst angetrocknete Fläche zwangsweise neu, um',
      'bewusst dort weiterzumalen.',
      '',
      'Eine Kompositions-Entscheidung statt eines Material-Strichs: mode:"dissolve" löst eine',
      'bereits gemalte Fläche gezielt zum Papier (oder `color`) hin auf, statt neues Pigment',
      'hinzuzufügen — die "verlorene Kante" der klassischen Malerei, z.B. eine Gesichtshälfte',
      'bewusst weich verschwinden lassen, statt sie mit vielen einzelnen Strichen nachzubilden.',
      'points umreißt die betroffene Fläche (wie mode:"fill"). direction (0-360°, math. Konvention',
      '— 0=rechts, 90=unten, 180=links, 270=oben) zeigt in die Richtung zunehmender Auflösung',
      '(direction:180 löst nach links auf); ohne direction löst sich die ganze Fläche gleichmäßig',
      'auf. falloff (0-1, Standard 0.4) steuert die Übergangsbreite (0 = harte Kante genau in der',
      'Mitte, 1 = über die ganze Fläche verteilt). intensity (0-1, Standard 0.85) wie vollständig',
      'die Auflösung am stärksten betroffenen Ende ist.',
      '',
      'mode: "fill" behandelt die Punkte',
      'statt als Linie als geschlossene Fläche und füllt sie — flache Farbblöcke für',
      'Hintergründe oder moderne/abstrakte Kompositionen, ohne viele Striche zu brauchen.',
      'gradientTo/gradientShape blenden zwei Farben über die Fläche/den Strich (Himmel,',
      'Glanzlicht, weiche Schattierung) — mit transparentem gradientTo ("rgba(r,g,b,0)")',
      'löst sich die Fläche stattdessen nach außen ins Nichts auf (Nebel, weiche Silhouetten-',
      'Kanten); edgeFade (0-1) ist dieselbe Wirkung als Kurzform ohne rgba() von Hand',
      'auszurechnen. blend mischt mit dem bereits Gezeichneten (multiply für Schatten/Lasur,',
      'screen für Licht, overlay/soft-light für dezente Verschiebungen) — z.B. für klassisch',
      'wirkende Schichtmalerei statt flacher Deckfarbe. reflect: { waterline, opacity?,',
      'waviness? } spiegelt denselben Strich an einer Wasserlinie, mit reduzierter Deckkraft',
      'und optionaler Wellenverzerrung — übernimmt automatisch Stil/Farbe des Original-',
      'Strichs (z.B. ein gespiegelter ink-Strich für eine klare Mastreflexion im Wasser).',
      '',
      'Ein Pinselstrich ist ein Ereignis, keine mathematisch glatte Kurve — drei Achsen',
      'dafür: interpolation (0-1, Standard 1) steuert stufenlos, wie stark die rohen',
      'Kontrollpunkte geglättet werden — 1 = volle weiche Kurve wie bisher, 0 = eckig/',
      'gebrochen, den Punkten wörtlich folgend (Himmel weich, Wasser gebrochen, Masten',
      'präzise, Nebel fast verschwunden). colorVariation (0-1, Standard 0) lässt die Farbe',
      'pro gezeichnetem Segment leicht um `color` schwanken (Pigmentvariation, damit',
      'wiederholte Striche derselben Nennfarbe nicht identisch wirken). brush: { length?,',
      'bristleDensity?, grain?, jitter?, opacityVariation?, pressureVariation?, edgeBreak? }',
      'ist der parametrisierte Impressionisten-Pinsel — zerlegt den Strich in kurze,',
      'unabhängig gewürfelte Marken statt einer glatten Linie, jede mit eigenem Zufallswurf',
      'für Druck/Deckkraft/Aussetzer, mehrfach überlagert wie Borsten eines echten Pinsels',
      '(kräftig → aufbrechen → fast verschwinden → wieder Pigment → abrupt enden, ganz ohne',
      'eigenen Taper-Schalter). Hat Vorrang vor style, kombinierbar mit interpolation und',
      'colorVariation — für lebendige, unregelmäßige Textur (Laub, bewegtes Wasser, lockere',
      'Studien) statt der glatten ink/dry/watercolor-Striche.',
      '',
      'Für eine Signatur/Monogramm: signature:true auf den betreffenden Strichen markiert sie',
      'als eine Gruppe, signaturePosition ("bottom-right" etc.) verschiebt genau diese Gruppe',
      'automatisch an den Leinwandrand — die Bounding Box wird aus den Strichen selbst',
      'berechnet (auch bei mode:"text"/"handwriting"-Strichen), keine Koordinaten von Hand',
      'ausrechnen nötig, funktioniert unabhängig von der tatsächlichen Leinwandgröße.',
      'signatureMargin steuert den Randabstand (Standard 24px). Für die Buchstabenformen',
      'selbst drei Möglichkeiten: (1) ganz normal als Striche zeichnen (typischerweise mit',
      'brush) — handschriftlich, aber jedes Mal neu erfunden, nicht garantiert exakt lesbar',
      'und nicht wiedererkennbar dieselbe Hand. (2) mode:"text" für Inhalte, bei denen exakte',
      'Lesbarkeit zählt: rendert `text` mit einem echten Handschrift-Font, garantiert exakt',
      'korrekte Zeichen, aber geliehene Typografie, NUR im PNG (bekannter Bug im SVG-Text-',
      'Export der Canvas-Bibliothek verschluckt dort zufällig Zeichen — die SVG-',
      'Fortsetzungshistorie bekommt stattdessen einen Klartext-Kommentar-Marker). (3) mode:',
      '"handwriting" für eine echte, wiedererkennbare EIGENE Handschrift: setzt `text` aus',
      'einmal per soul_handwriting_save gespeicherten eigenen Buchstabenformen zusammen —',
      'echte Vektor-Striche, funktioniert identisch in PNG und SVG (kein Font-Bug), mit',
      'leichter, bei jedem Aufruf neu gewürfelter Variation (handwritingJitter), damit zwei',
      'Signaturen ähnlich, aber nie pixelgleich sind. Noch nicht definierte Zeichen werden',
      'übersprungen, nicht als Fehler — die Rückmeldung nennt sie (dann ggf. per',
      'soul_handwriting_save nachtragen; soul_handwriting_list zeigt den aktuellen Stand).',
      'Kombinierbar: z.B. der Name als brush-Strich, das Datum daneben als mode:"handwriting"',
      'oder "text" — alle mit signature:true in derselben signaturePosition-Gruppe.',
      '',
      'Beim allerersten Aufruf mit einer neuen canvas_id: width/height/background legen',
      'die Leinwand an. Bei jedem weiteren Aufruf mit derselben canvas_id werden diese',
      'Parameter ignoriert (Leinwandgröße bleibt fix), nur strokes werden hinzugefügt.',
    ].join('\n'),
    {
      canvas_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_\-]+$/, 'Nur alphanumerisch + - _')
        .describe('Eindeutiger Name des Werks — dieselbe canvas_id in künftigen Aufrufen setzt genau dieses Werk fort.'),
      width: z.number().int().min(64).max(4096).optional().describe('Breite in px (nur bei Neuanlage, Standard 1600)'),
      height: z.number().int().min(64).max(4096).optional().describe('Höhe in px (nur bei Neuanlage, Standard 1200)'),
      background: z.string().max(20).optional()
        .describe('"paper" für strukturiertes Papier (Standard), oder Hex-Farbe wie "#1c1b18" — nur bei Neuanlage'),
      strokes: z.array(strokeSchema).min(1).max(500)
        .describe('Neue Pinselstriche, die zum Werk hinzugefügt werden'),
      description: z.string().max(200).optional().describe('Optionale Beschreibung für peer_send'),
      signaturePosition: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom-center', 'top-center']).optional()
        .describe('Verschiebt alle Striche mit signature:true als starre Gruppe an diese Ecke/Kante der tatsächlichen Leinwand (Bounding Box der markierten Striche wird automatisch berechnet). Ohne signature:true-Striche im selben Aufruf wirkungslos.'),
      signatureMargin: z.number().min(0).max(200).optional().describe('Abstand der Signatur vom Leinwandrand in px. Standard 24.'),
    },
    async ({ canvas_id, width, height, background, strokes, description, signaturePosition, signatureMargin }) => {
      try {
        const result = await runSoulDraw(soulId, token, { canvas_id, width, height, background, strokes, description, signaturePosition, signatureMargin });
        return {
          content: [
            { type: 'image', data: result.pngBuf.toString('base64'), mimeType: 'image/png' },
            { type: 'text', text: formatSoulDrawSummary(canvas_id, strokes.length, result) },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
