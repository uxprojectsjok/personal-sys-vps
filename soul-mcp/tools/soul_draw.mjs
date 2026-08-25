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

// Gesäter PRNG (mulberry32) statt Math.random() für alles, was in BEIDEN
// Durchläufen (Raster-Canvas in runSoulDraw + separater SVGCanvas-Durchlauf
// in renderStrokesToSvgFragment) läuft — Jitter/Passes/Bleed in
// drawWatercolorStroke/drawDryStroke/drawBrushStroke/drawDissolveStroke/
// varyColor nutzen alle Math.random(), aber die beiden Durchläufe sind zwei
// KOMPLETT UNABHÄNGIGE Funktionsaufrufe ohne gemeinsamen Zufallszustand —
// bei genug überlappenden halbtransparenten Strichen driftet die
// Komposition sichtbar auseinander (live gefunden: ein Werk mit
// zusätzlichen "Ringen" im PNG, die im SVG fehlten, obwohl beide dieselben
// 14 Striche zeichnen sollten). seedStrokeRng() wird PRO STRICH (nicht
// einmal fürs ganze Werk) sowohl im Raster- als auch im Vektor-Durchlauf
// mit demselben Wert aufgerufen (siehe runSoulDraw/renderStrokesToSvgFragment)
// — Divergenz durch raster-only Extra-Zufallszüge (z.B. drawBrushStroke()s
// grain-Punkte, nur bei !vector) bleibt dadurch auf den EINEN betroffenen
// Strich begrenzt, statt sich auf alle folgenden Striche fortzupflanzen.
let _rngState = 1;
function seedStrokeRng(seed) { _rngState = (seed >>> 0) || 1; }
function rng() {
  _rngState |= 0; _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

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
  const shift = () => (rng() - 0.5) * 2 * variation * 255;
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

// "broken color" / palette-lokale Variation (KROs Befund zum Monet-Vergleich):
// statt EINER Nennfarbe (ggf. + zufälliger colorVariation-Abweichung derselben
// Farbe) bekommt der Strich eine kleine Palette VERWANDTER Töne und wandert
// entlang seines Verlaufs (t: 0=Anfang, 1=Ende) selbst hindurch — mit
// zufälligem Wobble pro Segment, damit es kein sauberer linearer Verlauf
// wird, sondern wie nebeneinanderliegende, vom Auge gemischte Pinselflecken
// wirkt (Monets Wasser: nicht "orange Fläche", sondern orange/rosa/gelb/blau
// nebeneinander). t kommt vom Aufrufer (Position im Strich), nicht von hier.
function pickPaletteColor(palette, t) {
  if (!palette || palette.length < 2) return null;
  const wobble = (rng() - 0.5) * 0.5;
  const pos = Math.max(0, Math.min(0.999, t + wobble)) * (palette.length - 1);
  const i0 = Math.floor(pos), i1 = Math.min(palette.length - 1, i0 + 1);
  return mixHexColors(palette[i0], palette[i1], pos - i0);
}

// Gewichtete diskrete Palettenwahl — anderer Anwendungsfall als
// pickPaletteColor() oben (die entlang eines EINZELNEN Strichs kontinuierlich
// wandert): hier bekommt JEDE Marke unabhängig EINE feste Farbe aus der
// Palette zugelost, mit expliziten Anteilen statt Gleichverteilung. KROs
// eigenes Beispiel: "überwiegend blau-grau, aber 15% warme, 10% violette,
// 5% grüne Marken dazwischen" — genau dieser Anteils-Gedanke, nicht ein
// weicher Verlauf. Fehlen/unpassende Länge von weights: fällt auf
// Gleichverteilung zurück statt einen Fehler zu werfen (harmlos, planvolle
// Toleranz statt harter Validierung für einen rein künstlerischen Parameter).
function pickWeightedPaletteColor(palette, weights) {
  if (!palette || palette.length < 2) return null;
  const w = (Array.isArray(weights) && weights.length === palette.length && weights.some((x) => x > 0))
    ? weights
    : palette.map(() => 1);
  const total = w.reduce((sum, x) => sum + Math.max(0, x), 0);
  let r = rng() * total;
  for (let i = 0; i < palette.length; i++) {
    r -= Math.max(0, w[i]);
    if (r <= 0) return palette[i];
  }
  return palette[palette.length - 1];
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
      x: pt.x + (rng() - 0.5) * 10,
      y: pt.y + (rng() - 0.5) * 10,
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
    if (rng() < 0.35) continue;
    const t = i / (smoothed.length - 1);
    const pressure = smoothed[i].pressure ?? (taperEnvelope(t) * 0.7 + 0.3);
    ctx.globalAlpha = opacity * (0.35 + rng() * 0.5);
    ctx.lineWidth = Math.max(0.5, width * pressure * (0.6 + rng() * 0.5));
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
    color, width, opacity = 0.9, gradientTo, gradientShape, interpolation, colorVariation, palette,
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
    // palette hat Vorrang vor colorVariation/gradientTo — die Farbe wird PRO
    // SEGMENT über pickPaletteColor() bestimmt (siehe dort), nicht einmal
    // pro Durchgang. Ohne palette: unverändertes Verhalten.
    if (!palette) ctx.strokeStyle = (colorVariation && !gradientTo) ? varyColor(blendColor, colorVariation) : flatStyle;
    const jittered = points.map(pt => ({
      ...pt,
      x: pt.x + (rng() - 0.5) * jitterAmount,
      y: pt.y + (rng() - 0.5) * jitterAmount,
    }));
    const smoothed = catmullRomPoints(jittered, 12, interpolation);
    ctx.globalAlpha = Math.min(1, (baseAlpha / passes) * 1.8);
    for (let i = 0; i < smoothed.length - 1; i++) {
      const t = i / (smoothed.length - 1);
      if (palette) ctx.strokeStyle = pickPaletteColor(palette, t);
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
      const pull = (0.15 + rng() * 0.35) * water;
      const bled = points.map(pt => ({
        ...pt,
        x: pt.x + (neighbor.x - pt.x) * pull * rng(),
        y: pt.y + (neighbor.y - pt.y) * pull * rng(),
      }));
      const smoothed = catmullRomPoints(bled, 12, interpolation);
      ctx.strokeStyle = mixHexColors(blendColor, neighbor.color, 0.3 + rng() * 0.4);
      ctx.globalAlpha = Math.min(0.5, baseAlpha * 0.25 * neighborWetness);
      for (let i = 0; i < smoothed.length - 1; i++) {
        ctx.lineWidth = Math.max(1, width * (0.5 + rng() * 0.6));
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

// style "oil" — deckende Ölfarbe statt lasierender Wasserfarbe (KROs größte
// gefundene Lücke im Monet-Vergleich): hoher, überwiegend deckender
// Pigmentauftrag statt Transparenz, sichtbare Borstenstruktur (mehrere leicht
// versetzte Durchgänge, wie drawBrushStroke), und "wet-in-wet"-Verschieben
// bereits gemalter Nachbarfarbe in den neuen Strich — nutzt DIESELBE
// wetRegions-Infrastruktur wie watercolor (findWetNeighbor/mixHexColors),
// aber bewusst OHNE eigenen wetness-Parameter: echte Ölfarbe bleibt lange
// genug offen, dass "wet-in-wet" für sie eher der Normalfall als eine
// bewusste Ausnahme ist (anders als Aquarell, das schnell anzieht). Die
// Verschiebung ist dafür lokaler/stärker als watercolors diffuses Verlaufen
// — kein separater "Bleed-Durchgang" danach, sondern direkt in den
// Haupt-Durchgängen gemischt (Öl "schiebt" Farbe, statt sie zu verdünnen).
// oilLoad (0-1, wie viel Farbe auf dem Pinsel ist) steuert, wie deckend jeder
// Durchgang ist — bei niedrigem Wert schimmert die Unterfarbe stellenweise
// durch (drybrush-artig), bei hohem Wert praktisch vollständig deckend.
// palette: siehe pickPaletteColor() — dieselbe "broken color"-Palette-
// Wanderung wie bei watercolor, hier oft der wichtigere Fall (Monets
// nebeneinanderliegende, vom Auge gemischte Pinselflecken sind primär ein
// Öl-Phänomen, nicht Aquarell). Rückgabewert wie drawWatercolorStroke: die
// neue Nässe-Region für nachfolgende Striche (eigene UND watercolor können
// sie als Nachbarn finden — dasselbe wetRegions-Array).
function drawOilStroke(ctx, points, opts) {
  const {
    color, width, opacity = 0.95, interpolation, palette,
    oilLoad = 0.7, wetRegions = [],
  } = opts;

  const bounds = computeBounds(points);
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const strokeRadius = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + width;
  const reach = width * 1.4;

  const passes = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Für die zurückgegebene wetRegion (Zentrum des GANZEN Strichs) reicht der
  // einmalige, grobe Nachbar-Fund — die eigentliche Verschiebung beim Malen
  // selbst (unten) sucht dagegen PRO SEGMENT lokal, s. dortiger Kommentar.
  const overallNeighbor = findWetNeighbor(wetRegions, bounds, strokeRadius + width * 1.2);

  for (let p = 0; p < passes; p++) {
    // Pro Durchgang EIN seitlicher Borsten-Versatz (wie drawBrushStroke),
    // nicht pro Segment — sonst wirkt es wie Wasserfarben-Jitter statt
    // parallel geführter Borsten eines Pinsels.
    const offX = (rng() - 0.5) * width * 0.14;
    const offY = (rng() - 0.5) * width * 0.14;
    const jittered = points.map(pt => ({ ...pt, x: pt.x + offX, y: pt.y + offY }));
    const smoothed = catmullRomPoints(jittered, 12, interpolation);
    for (let i = 0; i < smoothed.length - 1; i++) {
      const t = i / (smoothed.length - 1);
      let segColor = palette ? pickPaletteColor(palette, t) : color;
      // Lokale Nachbarsuche PRO SEGMENT statt einmal für den ganzen Strich —
      // ein langer Strich kann so an verschiedenen Stellen unterschiedliche
      // Unterfarbe aufnehmen (KROs Befund: "ein neuer Strich müsste
      // teilweise die Farbe des darunterliegenden Strichs aufnehmen", nicht
      // nur EINE Nachbarfarbe pauschal für den ganzen Strich).
      const localBounds = { minX: smoothed[i].x - reach, maxX: smoothed[i].x + reach, minY: smoothed[i].y - reach, maxY: smoothed[i].y + reach };
      const localNeighbor = findWetNeighbor(wetRegions, localBounds, reach);
      if (localNeighbor) {
        const dragAmount = Math.min(0.65, (localNeighbor.wetness ?? 0) * 0.75) * (0.6 + rng() * 0.4);
        segColor = mixHexColors(segColor, localNeighbor.color, dragAmount);
      }
      ctx.strokeStyle = segColor;
      const pressure = smoothed[i].pressure ?? (taperEnvelope(t) * 0.6 + 0.5);
      ctx.lineWidth = Math.max(1, width * pressure * (1 + p * 0.08));
      // Deckend, aber nicht IMMER voll — vereinzelte dünnere Stellen lassen
      // die Unterfarbe "stellenweise sichtbar" bleiben (KROs Befund), statt
      // dass jeder Strich die Fläche komplett verschluckt.
      ctx.globalAlpha = Math.min(1, opacity * (0.55 + oilLoad * 0.45) * (rng() > 0.12 ? 1 : 0.4));
      ctx.beginPath();
      ctx.moveTo(smoothed[i].x, smoothed[i].y);
      ctx.lineTo(smoothed[i + 1].x, smoothed[i + 1].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  return { x: cx, y: cy, r: strokeRadius, color: palette ? pickPaletteColor(palette, 0.5) : (overallNeighbor ? mixHexColors(color, overallNeighbor.color, 0.3) : color), wetness: 1 };
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
    const offX = (rng() - 0.5) * jitter;
    const offY = (rng() - 0.5) * jitter;

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
      pressureLevel = Math.max(0.15, Math.min(1.8, pressureLevel + (rng() - 0.5) * pressureVariation * 0.6));
      opacityLevel = Math.max(0.15, Math.min(1.6, opacityLevel + (rng() - 0.5) * opacityVariation * 0.6));

      if (rng() >= edgeBreak) {
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
            const gt = rng();
            const gx = fine[markStart].x + (fine[i + 1].x - fine[markStart].x) * gt + offX + (rng() - 0.5) * width * 0.4;
            const gy = fine[markStart].y + (fine[i + 1].y - fine[markStart].y) * gt + offY + (rng() - 0.5) * width * 0.4;
            ctx.globalAlpha = opacity * grain * rng() * 0.5;
            ctx.fillStyle = ctx.strokeStyle;
            ctx.beginPath();
            ctx.arc(gx, gy, rng() * 1.2 + 0.3, 0, Math.PI * 2);
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

// Ray-Casting-Punkt-in-Polygon-Test — Standardalgorithmus, keine
// Bibliothek nötig für die grobe künstlerische Verwendung hier
// (Feld-Region ist ein einfaches, nicht notwendig konvexes Polygon).
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Für role:"tree"s Krone — einfacher als Polygon-Test, keine Punktliste
// nötig, nur Zentrum + zwei Radien (elliptische Streuzone).
function pointInEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px - cx) / rx, dy = (py - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

// mode:"field" — KROs eigener Befund zum Monet-Vergleich: das Werk hatte
// viele technische, aber voneinander UNABHÄNGIGE Einzelstriche statt eines
// zusammenhängenden optischen Felds. Ein field-Strich beschreibt keinen
// einzelnen Pinselzug mehr, sondern eine ganze Region: "hier eine kleine
// Gruppe verwandter Farben, eine Richtung, eine Dichte, eine lokale
// Bewegung" — und wird VOR dem eigentlichen Render-Durchlauf (wie
// mode:"handwriting" oben) zu vielen einzelnen kurzen Dabs expandiert, die
// danach ganz normal durch dispatchStrokeStyle laufen (jeder Dab kann also
// oil/watercolor/... sein, inkl. wet-in-wet-Verschiebung UNTEREINANDER, da
// sie nacheinander ins selbe wetRegions-Array eingehen).
//
// Bewusst DICHTE-GEDECKELT (targetCount max. 220 pro field-Strich): das
// bestehende Werk (kro_monet_harbor_01) hat inzwischen 17.774 SVG-Pfade,
// genau das von KRO benannte Problem ("mehr Pinselereignisse bringen uns
// nicht automatisch näher an die Referenz") — ein Werkzeug, das genau diese
// Sorge worst-case vervielfachen könnte, wäre kontraproduktiv. Ein einzelner
// field-Aufruf ersetzt viele einzeln zu formulierende Striche EFFIZIENTER
// (ein Tool-Call statt hundert), aber erzeugt am Ende real trotzdem einen
// Pfad pro Dab im SVG — Dichte bewusst moderat, nicht "so viele wie möglich".
function expandFieldStroke(stroke) {
  const {
    region, fieldDirection = 0, fieldDirectionJitter = 20, fieldLength = 24,
    fieldWidth, fieldDensity = 0.5, fieldStyle,
    width, style, color, palette, paletteWeights, opacity, colorVariation, interpolation,
    water, pigment, wetness, oilLoad, gradientTo, gradientShape, brush,
  } = stroke;
  if (!region || region.length < 3) return [];

  const bounds = computeBounds(region);
  const areaW = Math.max(1, bounds.maxX - bounds.minX);
  const areaH = Math.max(1, bounds.maxY - bounds.minY);
  const dabW = fieldWidth || width || 14;
  const dabLen = fieldLength;
  const cellArea = Math.max(40, dabW * dabLen * 0.6);
  const targetCount = Math.min(220, Math.max(4, Math.round(((areaW * areaH) / cellArea) * fieldDensity)));
  // paletteWeights gesetzt: JEDE Marke bekommt unabhängig eine feste,
  // gewürfelte Farbe aus der Palette (siehe pickWeightedPaletteColor) — sonst
  // unverändertes Verhalten (Marke behält die palette, pickPaletteColor()
  // wandert wie gehabt kontinuierlich innerhalb ihres eigenen kurzen Pfads).
  const useWeighted = Array.isArray(palette) && Array.isArray(paletteWeights);

  const dabs = [];
  let attempts = 0;
  while (dabs.length < targetCount && attempts < targetCount * 8) {
    attempts++;
    const px = bounds.minX + rng() * areaW;
    const py = bounds.minY + rng() * areaH;
    if (!pointInPolygon(px, py, region)) continue;
    const angleDeg = fieldDirection + (rng() - 0.5) * 2 * fieldDirectionJitter;
    const angle = (angleDeg * Math.PI) / 180;
    const half = (dabLen / 2) * (0.6 + rng() * 0.8);
    const dx = Math.cos(angle) * half, dy = Math.sin(angle) * half;
    dabs.push({
      points: [{ x: px - dx, y: py - dy }, { x: px + dx, y: py + dy }],
      color: useWeighted ? pickWeightedPaletteColor(palette, paletteWeights) : color,
      palette: useWeighted ? undefined : palette,
      width: dabW * (0.7 + rng() * 0.6), opacity, style: fieldStyle || style,
      colorVariation, interpolation: interpolation ?? 0.6, water, pigment, wetness, oilLoad,
      gradientTo, gradientShape, brush,
    });
  }
  return dabs;
}

// Läuft VOR dem seedStrokeRng()-Durchlauf in runSoulDraw, deshalb bewusst
// mit dem NOCH UNGESÄTEN rng() (Modul-Startzustand bzw. was auch immer
// vorher lief) — harmlos, da das Ergebnis (die konkreten Dab-Koordinaten)
// hier EINMAL bestimmt und danach als ganz normale, feste Striche in BEIDE
// Durchläufe (Raster + SVG) eingehen. Keine eigene Determinismus-Sorge wie
// bei den style-Funktionen — die expandierten Dabs selbst sind bereits
// fixe Daten, sobald diese Funktion einmal gelaufen ist.
function expandFieldStrokes(strokes) {
  const expanded = [];
  for (const s of strokes) {
    if (s.mode === 'field') expanded.push(...expandFieldStroke(s));
    else expanded.push(s);
  }
  return expanded;
}

// mode:"object" — eine Stufe ÜBER mode:"field": nicht viele ÄHNLICHE Dabs in
// einer Region, sondern eine kleine, ROLLEN-basierte Gruppe UNTERSCHIEDLICHER
// Striche, die zusammen ein erkennbares Ding ergeben statt einer bloßen
// Textur. KROs eigener Befund im Monet-Vergleich: "Strich → Strichgruppe →
// Volumen → Objekt", nicht umgekehrt "Objekt → Striche" (ein Symbol, das wie
// ein Boot AUSSEHEN soll, statt mehrerer Striche, aus deren Beziehung
// zueinander die Wahrnehmung eines Boots entsteht). role wählt eine feste,
// handgebaute Rezeptur aus mehreren Teil-Strichen mit unterschiedlicher
// Funktion (bei "ship" z.B. Rumpf/Bug-Heck/Mast/Takelage/Spiegelung/
// verlorene Kante — exakt KROs eigene Aufschlüsselung), nicht zufällig
// gestreute, gleichartige Marken wie bei "field".
//
// Bewusst nur ZWEI Rollen zum Start (ship, mast) statt KROs gesamtem
// Vokabular (crane/pier/reflection/mist/building_mass) auf einmal — erst
// bewähren, dann erweitern, gleiche Vorsicht wie beim ersten field-Schritt.
//
// depth (foreground/midground/background) ist eine einfache, in diese
// Funktion eingebaute Kurzform atmosphärischer Perspektive (weiter hinten:
// weniger Masse/Kontrast) — kein eigenständiges value_map-Werkzeug, das
// bleibt weiterhin offen, aber deckt genau den Tiefen-Bedarf ab, den ein
// einzelnes Objekt in einer Szene hat.
// Presets für role:"quadruped" — bewusst nur STARTPUNKTE (Parameter-Bündel),
// kein separater Code-Pfad pro Tierart. "Hund und Katze sind sich ähnlich":
// hier heißt das konkret "ähnliche Zahlenwerte auf demselben Bauplan", nicht
// zwei verschiedene Funktionen. KRO kann jeden dieser Werte einzeln
// überschreiben oder eine komplett neue Tierart nur aus eigenen
// Proportions-Schätzungen beschreiben (preset weglassen, alle Werte direkt
// angeben) — das ist der eigentliche Verallgemeinerungs-Mechanismus, die
// Presets hier sind nur bequeme, kalibrierte Beispiele, keine Obergrenze.
const QUADRUPED_PRESETS = {
  cat:   { legLength: 0.22, bodyLength: 0.9,  bodyHeight: 0.4,  neckLength: 0.1,  headSize: 0.32, earStyle: 'pointed', tailLength: 0.75, tailStyle: 'curled' },
  dog:   { legLength: 0.27, bodyLength: 1,    bodyHeight: 0.44, neckLength: 0.16, headSize: 0.3,  earStyle: 'floppy',  tailLength: 0.5,  tailStyle: 'straight' },
  fox:   { legLength: 0.24, bodyLength: 0.95, bodyHeight: 0.36, neckLength: 0.12, headSize: 0.26, earStyle: 'pointed', tailLength: 0.85, tailStyle: 'bushy' },
  horse: { legLength: 0.46, bodyLength: 1.3,  bodyHeight: 0.5,  neckLength: 0.45, headSize: 0.24, earStyle: 'pointed', tailLength: 0.7,  tailStyle: 'bushy' },
  cow:   { legLength: 0.28, bodyLength: 1.3,  bodyHeight: 0.6,  neckLength: 0.2,  headSize: 0.28, earStyle: 'round',   tailLength: 0.6,  tailStyle: 'straight' },
};

// Presets für role:"biped" — gleiches Prinzip wie QUADRUPED_PRESETS: EIN
// Bauplan (Rumpf senkrecht statt waagerecht, zwei Beine statt vier, Kopf,
// optional Arme/Flügel), Mensch und stehender Vogel sind nur unterschiedliche
// Zahlenwerte darauf, keine getrennten Rollen.
const BIPED_PRESETS = {
  human: { legLength: 0.5,  torsoLength: 0.45, torsoWidth: 0.16, neckLength: 0.06, headSize: 0.14, limbStyle: 'arms',  legSpread: 0.12 },
  bird:  { legLength: 0.18, torsoLength: 0.32, torsoWidth: 0.22, neckLength: 0.22, headSize: 0.16, limbStyle: 'wings', legSpread: 0.04 },
};

// Presets für role:"tree" — Baumkrone ist kein Einzelstrich, sondern eine
// kleine Dab-Streuung (gleiche Idee wie expandFieldStroke, hier lokal für
// eine Ellipse statt eines beliebigen Polygons — Kronen sind praktisch immer
// rundlich/oval, ein Polygon wäre unnötiger Aufwand für den Aufrufer).
const TREE_PRESETS = {
  deciduous: { trunkHeight: 0.5, trunkWidth: 0.06, canopyRadius: 0.55, canopyAspect: 1,    canopyDensity: 0.55 },
  conifer:   { trunkHeight: 0.35, trunkWidth: 0.05, canopyRadius: 0.35, canopyAspect: 1.8,  canopyDensity: 0.65 },
};

function expandObjectStroke(stroke) {
  const {
    role, anchor, scale = 200, direction = 0, mass = 0.6, edge = 'soft',
    contrast = 0.7, depth = 'midground', palette, color, style = 'oil', preset, hasMast = true,
  } = stroke;
  if (!anchor || typeof anchor.x !== 'number' || typeof anchor.y !== 'number') return [];

  const depthFactor = depth === 'background' ? 0.55 : depth === 'foreground' ? 1.15 : 1;
  const effMass = Math.max(0.15, Math.min(1.2, mass * depthFactor));
  const effContrast = Math.max(0.1, Math.min(1, contrast * depthFactor));
  const effOpacity = 0.5 + effContrast * 0.45;

  const rad = (direction * Math.PI) / 180;
  const dirX = Math.cos(rad), dirY = Math.sin(rad);
  const perpX = -dirY, perpY = dirX;

  const baseColor = (palette && palette.length) ? palette[0] : (color || '#2a2a28');
  const midColor = (palette && palette.length > 1) ? palette[Math.floor(palette.length / 2)] : baseColor;

  if (role === 'quadruped') {
    // Preset liefert Startwerte, explizite Parameter im Aufruf gewinnen —
    // KRO kann so "cat" nehmen UND z.B. nur tailStyle abweichend angeben.
    const p = { ...(QUADRUPED_PRESETS[preset] || QUADRUPED_PRESETS.dog), ...stroke };
    const {
      legLength, bodyLength, bodyHeight, neckLength, headSize, earStyle, tailLength, tailStyle,
    } = p;

    const bodyLen = scale * bodyLength;
    const bodyH = scale * bodyHeight * effMass;
    const legLen = scale * legLength;

    // "unten" ist hier IMMER Bildschirm-unten (Schwerkraft) statt aus
    // direction abgeleitet — anders als bei "ship" (das auf Wasser in
    // beliebiger Ausrichtung stehen kann) steht ein Landtier immer mit den
    // Beinen nach unten, unabhängig davon, wohin es blickt (direction).
    const bx0 = anchor.x - dirX * bodyLen / 2, by0 = anchor.y - dirY * bodyLen / 2; // hinten
    const bx1 = anchor.x + dirX * bodyLen / 2, by1 = anchor.y + dirY * bodyLen / 2; // vorne (Kopf-Ende)

    const strokes = [];

    // 1) Rumpf — ein Zug von hinten nach vorne.
    strokes.push({
      points: [{ x: bx0, y: by0 }, { x: anchor.x, y: anchor.y }, { x: bx1, y: by1 }],
      color: baseColor, width: bodyH, opacity: effOpacity, style, interpolation: 0.6,
    });

    // 2) Beine — zwei Beinpaare (nahe hinten/vorne), je zwei leicht versetzt
    // (Tiefenandeutung: das "hintere" Bein eines Paars beginnt an derselben
    // Rumpfstelle, steht aber seitlich versetzt).
    [0.2, 0.8].forEach((t) => {
      const px = bx0 + (bx1 - bx0) * t, py = by0 + (by1 - by0) * t;
      [-0.13, 0.13].forEach((offset) => {
        strokes.push({
          points: [
            { x: px + dirX * scale * offset, y: py + bodyH * 0.3 },
            { x: px + dirX * scale * offset, y: py + bodyH * 0.3 + legLen },
          ],
          color: baseColor, width: Math.max(1, bodyH * 0.16), opacity: effOpacity * 0.95, style, interpolation: 0.2,
        });
      });
    });

    // 3) Hals + Kopf am vorderen Ende, leicht angehoben (Kopf wird meist
    // über Rückenhöhe getragen, nicht in einer Linie mit dem Rumpf).
    const neckLen = scale * neckLength;
    const headCx = bx1 + dirX * neckLen, headCy = by1 + dirY * neckLen - bodyH * 0.35;
    strokes.push({
      points: [{ x: bx1, y: by1 }, { x: headCx, y: headCy }],
      color: baseColor, width: bodyH * 0.65, opacity: effOpacity, style, interpolation: 0.3,
    });
    const headSz = scale * headSize;
    strokes.push({
      points: [
        { x: headCx - dirX * headSz * 0.3, y: headCy },
        { x: headCx + dirX * headSz * 0.5, y: headCy - headSz * 0.15 },
      ],
      color: baseColor, width: Math.max(2, headSz * 0.8), opacity: effOpacity, style,
    });

    // 4) Ohren — Form hängt von earStyle ab.
    if (earStyle !== 'none') {
      const earLen = headSz * 0.4;
      const earBaseX = headCx, earBaseY = headCy - headSz * 0.25;
      if (earStyle === 'pointed') {
        strokes.push({
          points: [{ x: earBaseX, y: earBaseY }, { x: earBaseX - dirX * earLen * 0.3, y: earBaseY - earLen }],
          color: baseColor, width: Math.max(1, headSz * 0.12), opacity: effOpacity, style: 'ink',
        });
      } else if (earStyle === 'floppy') {
        strokes.push({
          points: [
            { x: earBaseX, y: earBaseY },
            { x: earBaseX, y: earBaseY + earLen * 0.7 },
            { x: earBaseX - dirX * earLen * 0.3, y: earBaseY + earLen },
          ],
          color: baseColor, width: Math.max(1, headSz * 0.16), opacity: effOpacity * 0.9, style: 'ink', interpolation: 0.7,
        });
      } else if (earStyle === 'round') {
        strokes.push({
          points: [{ x: earBaseX, y: earBaseY }, { x: earBaseX, y: earBaseY - earLen * 0.4 }],
          color: baseColor, width: Math.max(2, headSz * 0.22), opacity: effOpacity, style: 'ink',
        });
      }
    }

    // 5) Schwanz am hinteren Ende — Form hängt von tailStyle ab.
    if (tailStyle !== 'none') {
      const tailLen = scale * tailLength;
      let tailEnd;
      if (tailStyle === 'curled') tailEnd = { x: bx0 - dirX * tailLen * 0.55, y: by0 - tailLen * 0.35 };
      else if (tailStyle === 'bushy') tailEnd = { x: bx0 - dirX * tailLen, y: by0 - tailLen * 0.15 };
      else tailEnd = { x: bx0 - dirX * tailLen * 0.8, y: by0 + tailLen * 0.25 };
      strokes.push({
        points: [{ x: bx0, y: by0 }, { x: bx0 - dirX * tailLen * 0.4, y: by0 - tailLen * 0.1 }, tailEnd],
        color: baseColor, width: Math.max(1, bodyH * (tailStyle === 'bushy' ? 0.3 : 0.12)), opacity: effOpacity * 0.9, style, interpolation: 0.6,
      });
    }

    // 6) Verlorene Kante — Beine/Boden ins Gras/den Untergrund auflösen.
    if (edge !== 'hard') {
      const dissolveColor = (palette && palette.length > 2) ? palette[palette.length - 1] : '#EDE6D6';
      strokes.push({
        mode: 'dissolve',
        points: [
          { x: bx0 - bodyLen * 0.1, y: by0 + bodyH * 0.3 },
          { x: bx1 + bodyLen * 0.1, y: by1 + bodyH * 0.3 },
          { x: bx1 + bodyLen * 0.1, y: by1 + bodyH * 0.3 + legLen + bodyH },
          { x: bx0 - bodyLen * 0.1, y: by0 + bodyH * 0.3 + legLen + bodyH },
        ],
        color: dissolveColor, direction: 90, falloff: 0.6, intensity: edge === 'lost' ? 0.7 : 0.35,
      });
    }

    return strokes;
  }

  if (role === 'mast') {
    const len = scale;
    const w = Math.max(1, len * 0.02 * effMass);
    return [{
      points: [
        { x: anchor.x, y: anchor.y },
        { x: anchor.x + dirX * len, y: anchor.y + dirY * len },
      ],
      color: baseColor, width: w, opacity: effOpacity, style, interpolation: 0.3,
    }];
  }

  if (role === 'ship') {
    const hullLen = scale;
    const hullW = Math.max(3, hullLen * 0.14 * effMass);
    const hx0 = anchor.x - dirX * hullLen / 2, hy0 = anchor.y - dirY * hullLen / 2;
    const hx1 = anchor.x + dirX * hullLen / 2, hy1 = anchor.y + dirY * hullLen / 2;
    // "leicht gebrochen": Mittelpunkt seitlich versetzt statt exakt gerade.
    const midX = anchor.x + perpX * hullW * 0.15, midY = anchor.y + perpY * hullW * 0.15;

    const strokes = [];

    // 1) Rumpf — breiter, dunkler, leicht gebrochener Zug entlang direction.
    // reflect (sofern edge nicht "hard"): Spiegelung direkt über den
    // bestehenden reflect-Mechanismus statt eines eigenen Spiegel-Strichs.
    strokes.push({
      points: [{ x: hx0, y: hy0 }, { x: midX, y: midY }, { x: hx1, y: hy1 }],
      color: baseColor, width: hullW, opacity: effOpacity, style, interpolation: 0.5,
      reflect: edge !== 'hard'
        ? { waterline: anchor.y + Math.abs(perpY) * hullW * 0.5, opacity: 0.28 * effContrast, waviness: hullW * 0.4 }
        : undefined,
    });

    // 2) Bug/Heck — zwei kurze Richtungswechsel an den Rumpf-Enden, leicht
    // nach außen UND quer zur Fahrtrichtung (Silhouette, die über die
    // Rumpflinie hinausragt).
    const kinkLen = hullLen * 0.13;
    [[hx0, hy0, -1], [hx1, hy1, 1]].forEach(([hx, hy, sign]) => {
      strokes.push({
        points: [
          { x: hx, y: hy },
          { x: hx + dirX * kinkLen * sign * 0.3 - perpX * kinkLen * 0.9, y: hy + dirY * kinkLen * sign * 0.3 - perpY * kinkLen * 0.9 },
        ],
        color: baseColor, width: hullW * 0.7, opacity: effOpacity * 0.9, style,
      });
    });

    // 3) Mast + 4) Takelage — nur wenn hasMast (Standard true). Das ist die
    // Verallgemeinerung "ship" → beliebiges Wasserfahrzeug: hasMast:false
    // macht aus derselben Rezeptur ein Ruderboot statt eines Segelschiffs,
    // ohne eine eigene role dafür zu brauchen — dieselbe Lektion wie bei
    // quadruped (ein Bauplan mit Parametern statt Rezept pro Objekt).
    if (hasMast) {
      const mastLen = hullLen * 0.8;
      const mastTopX = anchor.x - perpX * mastLen, mastTopY = anchor.y - perpY * mastLen;
      strokes.push({
        points: [{ x: anchor.x, y: anchor.y }, { x: mastTopX, y: mastTopY }],
        color: baseColor, width: Math.max(1, hullLen * 0.012 * effMass), opacity: effOpacity * 0.95, style: 'ink',
      });

      // Takelage — 1-3 sehr schwache diagonale Verbindungen Mastspitze zu
      // Rumpfenden (hier: beide Enden, also 2 — "1-3" je nach Schiffsgröße
      // wäre eine spätere Erweiterung, kein Grund das jetzt zu verkomplizieren).
      [[hx0, hy0], [hx1, hy1]].forEach(([hx, hy]) => {
        strokes.push({
          points: [{ x: mastTopX, y: mastTopY }, { x: hx, y: hy }],
          color: midColor, width: 1, opacity: effOpacity * 0.25, style: 'ink',
        });
      });
    }

    // 6) Verlorene Kante — ein Rumpfende weich zum Wasser/Nebel hin auflösen
    // (bei edge:"hard" ausgelassen — dann bleibt das Schiff klar umrissen).
    if (edge !== 'hard') {
      const dissolveColor = (palette && palette.length > 2) ? palette[palette.length - 1] : '#EDE6D6';
      strokes.push({
        mode: 'dissolve',
        points: [
          { x: hx1 - dirX * hullLen * 0.35 - perpX * hullW, y: hy1 - dirY * hullLen * 0.35 - perpY * hullW },
          { x: hx1 + dirX * hullLen * 0.15 - perpX * hullW, y: hy1 + dirY * hullLen * 0.15 - perpY * hullW },
          { x: hx1 + dirX * hullLen * 0.15 + perpX * hullW, y: hy1 + dirY * hullLen * 0.15 + perpY * hullW },
          { x: hx1 - dirX * hullLen * 0.35 + perpX * hullW, y: hy1 - dirY * hullLen * 0.35 + perpY * hullW },
        ],
        color: dissolveColor,
        direction,
        falloff: 0.5,
        intensity: edge === 'lost' ? 0.9 : 0.55,
      });
    }

    return strokes;
  }

  if (role === 'biped') {
    const p = { ...(BIPED_PRESETS[preset] || BIPED_PRESETS.human), ...stroke };
    const { legLength, torsoLength, torsoWidth, neckLength, headSize, limbStyle, legSpread } = p;

    const torsoLen = scale * torsoLength;
    const torsoW = scale * torsoWidth * effMass;
    const legLen = scale * legLength;
    const spread = scale * legSpread;

    // "oben"/"unten" sind hier IMMER Bildschirm-oben/unten (Schwerkraft),
    // unabhängig von direction — wie bei quadruped, aus demselben Grund
    // (ein stehendes Wesen hat Beine immer nach unten, direction bestimmt
    // nur, wohin Kopf/Vorderseite blicken).
    const topX = anchor.x, topY = anchor.y - torsoLen;

    const strokes = [];

    // 1) Rumpf — senkrechter Zug von der Hüfte (anchor) nach oben.
    strokes.push({
      points: [{ x: anchor.x, y: anchor.y }, { x: topX, y: topY }],
      color: baseColor, width: torsoW, opacity: effOpacity, style, interpolation: 0.4,
    });

    // 2) Beine — zwei Züge von der Hüfte nach unten, seitlich versetzt
    // (legSpread = Standbreite, unabhängig von direction).
    [-1, 1].forEach((side) => {
      strokes.push({
        points: [
          { x: anchor.x + side * spread, y: anchor.y },
          { x: anchor.x + side * spread, y: anchor.y + legLen },
        ],
        color: baseColor, width: Math.max(1, torsoW * 0.35), opacity: effOpacity * 0.95, style, interpolation: 0.2,
      });
    });

    // 3) Hals + Kopf — leichter Vorwärts-Versatz Richtung direction.
    const neckLen = scale * neckLength;
    const headCx = topX + dirX * scale * 0.05, headCy = topY - neckLen;
    strokes.push({
      points: [{ x: topX, y: topY }, { x: headCx, y: headCy }],
      color: baseColor, width: torsoW * 0.6, opacity: effOpacity, style, interpolation: 0.3,
    });
    const headSz = scale * headSize;
    strokes.push({
      points: [
        { x: headCx - headSz * 0.3, y: headCy },
        { x: headCx + headSz * 0.3, y: headCy - headSz * 0.1 },
      ],
      color: baseColor, width: Math.max(2, headSz * 0.9), opacity: effOpacity, style,
    });

    // 4) Arme (herabhängend) oder Flügel (angelegt, diagonal nach hinten/
    // unten) — je nach limbStyle. "none" lässt beides weg (z.B. für sehr
    // entfernte/kleine Figuren, wo Arme/Flügel ohnehin nicht lesbar wären).
    if (limbStyle === 'arms') {
      [-1, 1].forEach((side) => {
        strokes.push({
          points: [
            { x: topX + side * torsoW * 0.4, y: topY + torsoLen * 0.1 },
            { x: topX + side * torsoW * 0.7, y: topY + torsoLen * 0.75 },
          ],
          color: baseColor, width: Math.max(1, torsoW * 0.22), opacity: effOpacity * 0.9, style, interpolation: 0.3,
        });
      });
    } else if (limbStyle === 'wings') {
      [-1, 1].forEach((side) => {
        strokes.push({
          points: [
            { x: topX + side * torsoW * 0.3, y: topY + torsoLen * 0.15 },
            { x: topX + side * torsoW * 1.4, y: topY + torsoLen * 0.5 },
            { x: topX + side * torsoW * 0.9, y: topY + torsoLen * 0.85 },
          ],
          color: baseColor, width: Math.max(1, torsoW * 0.3), opacity: effOpacity * 0.85, style, interpolation: 0.6,
        });
      });
    }

    // 5) Verlorene Kante am Boden.
    if (edge !== 'hard') {
      const dissolveColor = (palette && palette.length > 2) ? palette[palette.length - 1] : '#EDE6D6';
      strokes.push({
        mode: 'dissolve',
        points: [
          { x: anchor.x - spread - torsoW, y: anchor.y + legLen * 0.6 },
          { x: anchor.x + spread + torsoW, y: anchor.y + legLen * 0.6 },
          { x: anchor.x + spread + torsoW, y: anchor.y + legLen + torsoW },
          { x: anchor.x - spread - torsoW, y: anchor.y + legLen + torsoW },
        ],
        color: dissolveColor, direction: 90, falloff: 0.6, intensity: edge === 'lost' ? 0.7 : 0.35,
      });
    }

    return strokes;
  }

  if (role === 'tree') {
    const p = { ...(TREE_PRESETS[preset] || TREE_PRESETS.deciduous), ...stroke };
    const { trunkHeight, trunkWidth, canopyRadius, canopyAspect, canopyDensity } = p;

    const trunkLen = scale * trunkHeight;
    const trunkW = Math.max(2, scale * trunkWidth * effMass);
    const trunkTopX = anchor.x, trunkTopY = anchor.y - trunkLen;

    const strokes = [];

    // 1) Stamm — senkrechter Zug vom Boden (anchor) nach oben. `palette` gilt
    // NUR für die Krone (Laub-Farbvarianz) — der Stamm braucht seine eigene
    // Holzfarbe, sonst verschwindet er farblich in der Krone darüber (Bug:
    // palette[0] hier war eine Laubfarbe, kein Holzton).
    strokes.push({
      points: [{ x: anchor.x, y: anchor.y }, { x: trunkTopX, y: trunkTopY }],
      color: color || '#5a4632',
      width: trunkW, opacity: effOpacity, style: 'dry', interpolation: 0.3,
    });

    // 2) Krone — KEIN Einzelstrich, sondern eine Dab-Streuung in einer
    // Ellipse über dem Stamm (gleiche Streu-Idee wie expandFieldStroke,
    // hier lokal für eine Ellipse statt eines Polygons — Baumkronen sind
    // praktisch immer rundlich/oval). canopyAspect > 1 macht die Krone
    // schlanker/höher (Nadelbaum-artig) statt rund (Laubbaum-artig).
    const canopyR = scale * canopyRadius;
    const canopyRy = canopyR * canopyAspect;
    const canopyCx = trunkTopX, canopyCy = trunkTopY - canopyRy * 0.5;
    const canopyPalette = (palette && palette.length) ? palette : [color || '#4a6b3a'];
    const dabW = Math.max(4, canopyR * 0.18);
    const dabLen = dabW * 1.3;
    const cellArea = Math.max(20, dabW * dabLen * 0.6);
    const approxArea = Math.PI * canopyR * canopyRy;
    const targetCount = Math.min(180, Math.max(6, Math.round((approxArea / cellArea) * canopyDensity)));

    let attempts = 0, placed = 0;
    while (placed < targetCount && attempts < targetCount * 8) {
      attempts++;
      const px = canopyCx + (rng() - 0.5) * 2 * canopyR;
      const py = canopyCy + (rng() - 0.5) * 2 * canopyRy;
      if (!pointInEllipse(px, py, canopyCx, canopyCy, canopyR, canopyRy)) continue;
      placed++;
      const angle = rng() * Math.PI * 2;
      const half = (dabLen / 2) * (0.6 + rng() * 0.8);
      const ddx = Math.cos(angle) * half, ddy = Math.sin(angle) * half;
      const dabColor = canopyPalette.length >= 2
        ? pickWeightedPaletteColor(canopyPalette, canopyPalette.map(() => 1))
        : canopyPalette[0];
      strokes.push({
        points: [{ x: px - ddx, y: py - ddy }, { x: px + ddx, y: py + ddy }],
        color: dabColor, width: dabW * (0.7 + rng() * 0.6), opacity: effOpacity * (0.7 + rng() * 0.3), style: 'oil',
      });
    }

    // 3) Weiche Kante über die ganze Krone verteilt statt harter Silhouette
    // (dissolve ohne direction: gleichmäßige, ungerichtete Auflösung).
    if (edge !== 'hard') {
      strokes.push({
        mode: 'dissolve',
        points: [
          { x: canopyCx - canopyR, y: canopyCy - canopyRy },
          { x: canopyCx + canopyR, y: canopyCy - canopyRy },
          { x: canopyCx + canopyR, y: canopyCy + canopyRy },
          { x: canopyCx - canopyR, y: canopyCy + canopyRy },
        ],
        color: '#EDE6D6', falloff: 0.85, intensity: edge === 'lost' ? 0.5 : 0.25,
      });
    }

    return strokes;
  }

  return [];
}

function expandObjectStrokes(strokes) {
  const expanded = [];
  for (const s of strokes) {
    if (s.mode === 'object') expanded.push(...expandObjectStroke(s));
    else expanded.push(s);
  }
  return expanded;
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
    water, pigment, wetness, direction, falloff, intensity, palette, oilLoad,
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
    newWetRegion = drawWatercolorStroke(ctx, points, { color, width, opacity, gradientTo, gradientShape, interpolation, colorVariation, palette, water, pigment, wetness, wetRegions });
  } else if (style === 'oil') {
    newWetRegion = drawOilStroke(ctx, points, { color, width, opacity, interpolation, palette, oilLoad, wetRegions });
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
function renderStrokesToSvgFragment(strokes, width, height, wetRegionsPerStroke = [], strokeSeedBase = 0) {
  let fragment = '';
  for (let idx = 0; idx < strokes.length; idx++) {
    const stroke = strokes[idx];
    // Gleiche Formel wie im Raster-Durchlauf (runSoulDraw) — siehe rng()-
    // Kommentar oben. Muss VOR dem text-Sonderfall stehen (der ruft
    // drawStroke() gar nicht auf), damit Strich-Index und Seed trotzdem im
    // Gleichschritt mit dem Raster-Durchlauf bleiben.
    seedStrokeRng(strokeSeedBase + idx * 104729);
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
  points: z.array(strokePointSchema).min(2).max(200).optional()
    .describe('Wenige Kontrollpunkte reichen (3–6 pro Strich) — werden automatisch zu einer weichen Kurve interpoliert. Bei mode:"field" stattdessen `region` verwenden (siehe dort).'),
  color: z.string().max(20).optional().describe('Hex-Farbe, z.B. "#A8402F"'),
  width: z.number().min(0.5).max(200).optional().describe('Grundstärke des Strichs in px'),
  opacity: z.number().min(0).max(1).optional(),
  style: z.enum(['ink', 'solid', 'eraser', 'dry', 'watercolor', 'oil', 'spray', 'glow']).optional()
    .describe('"ink"/"solid": glatte, tapernde/gleichmäßige Linie (Standard: ink). "eraser" löscht nur im PNG (destination-out) — im append-only SVG wird stattdessen mit der Papierfarbe übermalt, echtes Löschen alter SVG-Striche ist nicht möglich. "dry": aufgebrochener Trockenpinsel/Kreide-Strich. "watercolor": weiche, transparente, ineinander verlaufende Lasur (mehrere Durchgänge, siehe water/pigment/wetness für die volle Aquarell-Physik). "oil": deckende Ölfarbe statt Lasur — hoher Pigmentauftrag, Borstenstruktur, verschiebt automatisch etwas Nachbarfarbe hinein ("wet-in-wet", siehe oilLoad) statt sie zu verdünnen. Für Motive, die eher wie Monet/Impressionismus als wie Aquarell wirken sollen. "spray": gestreute Stipple-Punkte statt einer Linie — Textur/Körnung/Laub. "glow": weicher Lichtschein (mehrere gestapelte, nach außen verblassende Kreise) statt hartem Verlaufsrand — für Sonne/Glanzlicht/Laterne, die ihre Umgebung sichtbar durchdringen soll, nicht nur als Symbol draufsitzt.'),
  oilLoad: z.number().min(0).max(1).optional()
    .describe('Nur bei style:"oil", Standard 0.7. Wie viel Farbe auf dem Pinsel ist — hoch: praktisch vollständig deckend. Niedrig: vereinzelte dünnere Stellen, Unterfarbe schimmert stellenweise durch (drybrush-artig).'),
  palette: z.array(z.string().max(20)).min(2).max(6).optional()
    .describe('"Broken color" statt einer einzelnen Farbe (nur bei style:"watercolor"/"oil") — eine kleine Palette verwandter Hex-Töne (z.B. ["#6E8790","#78939A","#657B88","#8A9692"]), durch die der Strich entlang seines eigenen Verlaufs mit leichtem Zufalls-Wobble selbst wandert, statt `color` konstant zu verwenden. Für Monet-artige Flächen, wo mehrere verwandte, aber nicht identische Töne nebeneinanderliegen und sich erst im Auge mischen, statt eine Fläche in einer Farbe zu füllen. Überschreibt `color`/`colorVariation` für diesen Strich, wenn gesetzt.'),
  water: z.number().min(0).max(1).optional()
    .describe('Nur bei style:"watercolor", Standard 0.5. Wie nass der Pinsel ist — unabhängig von pigment. Steuert Streuradius/Durchgangszahl der Lasur UND (zusammen mit wetness) wie weit/stark Farbe in eine feuchte Nachbarfläche läuft. Wenig Wasser: knapper, vorhersehbarer Schleier. Viel Wasser: weiträumiges, unkontrollierteres Verlaufen.'),
  pigment: z.number().min(0).max(1).optional()
    .describe('Nur bei style:"watercolor", Standard 0.6. Farbkonzentration, unabhängig von water — wie viel Pigment auf dem nassen Pinsel ist. Für den Effekt "eine Bewegung, unterschiedliche Farbdichte" mehrere kurze, aufeinanderfolgende Striche entlang derselben Bewegung mit unterschiedlichem pigment kombinieren (z.B. sehr wässriger Anfang, konzentriertes Ende).'),
  wetness: z.enum(['wet_on_dry', 'wet_on_wet', 're_wet']).optional()
    .describe('Nur bei style:"watercolor", Standard "wet_on_dry". "wet_on_dry": malt klar, ohne mit Nachbarstrichen zu verschmelzen. "wet_on_wet": sucht eine nahegelegene, noch feuchte Fläche (auch aus früheren Aufrufen — jeder watercolor-Strich bleibt danach kurz "feucht" und trocknet mit jedem weiteren soul_draw-Aufruf etwas mehr an, kein Echtzeit-Timer) und lässt die Farbe organisch hineinlaufen/sich mit ihr mischen — für Himmel, Nebel, ineinanderfließende Flächen. Am stärksten kurz nach dem Nachbarstrich (auch noch im selben Aufruf), schwächer über mehrere spätere Aufrufe hinweg. "re_wet": aktiviert eine Fläche zwangsweise als frisch feucht, auch wenn sie längst angetrocknet ist — um bewusst an einer alten Stelle weiterzuarbeiten.'),
  mode: z.enum(['stroke', 'fill', 'text', 'handwriting', 'dissolve', 'field', 'object']).optional()
    .describe('"stroke" (Standard): malt den Pfad als Pinsellinie. "fill": behandelt die Punkte als geschlossene Form und füllt sie mit `color` — flache Farbflächen für Hintergründe oder moderne/abstrakte Kompositionen, ohne viele überlappende Striche zu brauchen. "text": rendert `text` mit einem echten Handschrift-Font an points[0] (Baseline-Anker) — für Signaturen/Daten, bei denen exakte Lesbarkeit zählt (siehe `text`-Feld). Nur im PNG sichtbar, nicht im SVG (siehe dort). "handwriting": setzt `text` aus der EIGENEN, einmal per soul_handwriting_save gespeicherten Handschrift zusammen — echte Vektor-Striche, funktioniert identisch in PNG und SVG, mit leichter Variation pro Aufruf (siehe `handwritingJitter`). Noch nicht definierte Zeichen werden übersprungen (siehe Rückmeldung). "dissolve": löst eine bereits gemalte Fläche gezielt zum Papier (oder `color`) hin auf statt neues Pigment hinzuzufügen — die "verlorene Kante" der Malerei (z.B. eine Gesichtshälfte bewusst weich verschwinden lassen), siehe direction/falloff/intensity. Eine Kompositions-Entscheidung über eine Fläche, kein Pinselstrich. "field": erzeugt viele kurze, zusammenhängende Dabs innerhalb einer Region statt eines einzelnen Strichs — siehe region/fieldDirection/fieldLength/fieldWidth/fieldDensity/fieldStyle. Für "ein zusammenhängendes optisches Feld" statt vieler unabhängiger Einzelstriche (KROs Befund zum Monet-Vergleich) — EIN Aufruf statt hundert einzeln formulierter Striche. "object": eine Stufe über "field" — erzeugt eine kleine, ROLLEN-basierte Gruppe unterschiedlicher Teilstriche, die gemeinsam ein erkennbares Ding ergeben (siehe role/anchor/scale/direction/mass/edge/contrast/depth), statt vieler gleichartiger Marken. "Strich → Strichgruppe → Objekt" statt "Objekt → Striche" (KROs eigener Befund).'),
  role: z.enum(['ship', 'mast', 'quadruped', 'biped', 'tree']).optional()
    .describe('Nur bei mode:"object". Welcher Bauplan verwendet wird. "ship": Rumpf (breit, dunkel, leicht gebrochen) + Bug/Heck (zwei kurze Richtungswechsel) + optional Mast+Takelage (siehe hasMast — false macht daraus z.B. ein Ruderboot, ohne eine eigene Rolle zu brauchen) + Spiegelung (über reflect) + optional eine verlorene Kante an einem Rumpfende (siehe edge) — exakt KROs eigene Aufschlüsselung "diese Striche erzeugen gemeinsam die Wahrnehmung eines Bootes", nicht ein einzelner Boots-Strich. "mast": ein einzelner dünner Zug entlang direction — der einfachste Baustein, für wiederholte Masten/Kräne in einer Szene. "quadruped": ein generischer Vierbeiner-Bauplan (Rumpf + 2 Beinpaare + Hals/Kopf + Ohren + Schwanz + optional verlorene Kante am Boden) — KEIN Rezept pro Tierart, sondern EIN Bauplan, den beliebige Tiere über legLength/bodyLength/bodyHeight/neckLength/headSize/earStyle/tailLength/tailStyle/preset werden (siehe dort). "biped": generischer Zweibeiner-Bauplan (Rumpf senkrecht + 2 Beine über legSpread + Hals/Kopf + Arme ODER angelegte Flügel über limbStyle) — für Menschen, Vögel (stehend/watend), alles Aufrechte; Beine zeigen wie bei quadruped immer bildschirm-abwärts, unabhängig von direction. "tree": Stamm (senkrecht, "dry"-Textur) + Krone als Dab-Streuung in einer Ellipse (canopyRadius/canopyAspect/canopyDensity, optional palette für Laub-Farbvarianz) statt eines Umriss-Strichs — für Bäume/Büsche/belaubte Massen. "Hund und Katze sind sich ähnlich" gilt hier für alle fünf Rollen gleichermaßen: ähnliche Parameterwerte auf demselben Bauplan, nicht eine neue Rolle pro Art — für eine neue, nicht gelistete Art/Sorte einfach alle Werte aus eigenem Wissen über deren Proportionen schätzen, kein preset nötig. Weitere Baupläne (crane/pier/building_mass als reine Objekte, nicht Lebewesen) folgen, sobald sich ein konkreter Bedarf zeigt.'),
  anchor: strokePointSchema.optional()
    .describe('Nur bei mode:"object" (ersetzt `points`, wie `region` bei mode:"field"). Bezugspunkt der Strichgruppe — bei "ship" die Rumpfmitte etwa auf Höhe der Wasserlinie, bei "mast" der Fußpunkt, bei "quadruped" die Rumpfmitte auf Rückenhöhe (Beine hängen von dort nach unten), bei "biped" die Hüfte (Rumpf geht von dort nach oben, Beine nach unten), bei "tree" der Stammfuß (Boden, Stamm geht von dort nach oben).'),
  hasMast: z.boolean().optional()
    .describe('Nur bei role:"ship", Standard true. false lässt Mast+Takelage weg — macht aus demselben Rumpf-Bauplan z.B. ein Ruderboot oder einen Kahn, ohne eine eigene Rolle zu brauchen (ein Bauplan, ein Spektrum von Wasserfahrzeugen statt "vessel" als neue Rolle).'),
  limbStyle: z.enum(['arms', 'wings', 'none']).optional()
    .describe('Nur bei role:"biped", Standard aus preset (human: "arms", bird: "wings"). "arms": zwei herabhängende dünne Züge seitlich am Rumpf. "wings": zwei angelegte, diagonal nach hinten/unten geknickte Formen (Ruhestellung, keine ausgebreiteten Flügel). "none" lässt beides weg, z.B. für sehr kleine/entfernte Figuren.'),
  legSpread: z.number().min(0).max(1).optional()
    .describe('Nur bei role:"biped", relativ zu `scale`. Standbreite — wie weit die beiden Beine seitlich vom Rumpf-Mittelpunkt (anchor) auseinander stehen.'),
  torsoLength: z.number().min(0.05).max(2).optional()
    .describe('Nur bei role:"biped", relativ zu `scale`. Rumpflänge von der Hüfte (anchor) bis zu den Schultern.'),
  torsoWidth: z.number().min(0.02).max(1).optional()
    .describe('Nur bei role:"biped", relativ zu `scale`. Rumpfbreite/-dicke.'),
  trunkHeight: z.number().min(0.05).max(3).optional()
    .describe('Nur bei role:"tree", relativ zu `scale`. Stammhöhe vom Boden (anchor) bis zum Kronenansatz.'),
  trunkWidth: z.number().min(0.005).max(0.5).optional()
    .describe('Nur bei role:"tree", relativ zu `scale`. Stammdicke.'),
  canopyRadius: z.number().min(0.05).max(3).optional()
    .describe('Nur bei role:"tree", relativ zu `scale`. Kronenradius (horizontal) — canopyAspect skaliert davon den vertikalen Radius.'),
  canopyAspect: z.number().min(0.2).max(4).optional()
    .describe('Nur bei role:"tree", Standard 1. Verhältnis vertikaler/horizontaler Kronenradius — 1 rund (Laubbaum-artig), deutlich >1 schlank/hoch (Nadelbaum-artig).'),
  canopyDensity: z.number().min(0.05).max(1).optional()
    .describe('Nur bei role:"tree". Wie dicht die Krone mit Dabs gefüllt wird — niedrig für lichtes/lückiges Laub, hoch für dichtes Blattwerk.'),
  preset: z.enum(['cat', 'dog', 'fox', 'horse', 'cow', 'human', 'bird', 'deciduous', 'conifer']).optional()
    .describe('Kalibrierte Startwerte für den jeweiligen Bauplan: bei role:"quadruped" cat/dog/fox/horse/cow, bei role:"biped" human/bird, bei role:"tree" deciduous/conifer. Einzelne Werte können trotzdem überschrieben werden (preset + z.B. abweichendes tailStyle kombinierbar). Nur eine bequeme Abkürzung, keine Voraussetzung: für jede andere Art/Sorte einfach alle Werte direkt angeben.'),
  legLength: z.number().min(0).max(2).optional()
    .describe('Nur bei role:"quadruped", relativ zu `scale`. Beinlänge — kurz (Katze, ~0.4) bis lang (Pferd, ~0.85).'),
  bodyLength: z.number().min(0.1).max(3).optional()
    .describe('Nur bei role:"quadruped", relativ zu `scale`. Rumpflänge.'),
  bodyHeight: z.number().min(0.05).max(1.5).optional()
    .describe('Nur bei role:"quadruped", relativ zu `scale`. Rumpfhöhe/-dicke.'),
  neckLength: z.number().min(0).max(2).optional()
    .describe('Nur bei role:"quadruped", relativ zu `scale`. Halslänge zwischen Rumpf und Kopf — 0 für kaum sichtbaren Hals (Katze/Hund), deutlich höher für langhalsige Tiere.'),
  headSize: z.number().min(0.05).max(1).optional()
    .describe('Nur bei role:"quadruped", relativ zu `scale`. Kopfgröße relativ zum Rumpf.'),
  earStyle: z.enum(['pointed', 'floppy', 'round', 'none']).optional()
    .describe('Nur bei role:"quadruped". Ohrform — "pointed" (Katze/Fuchs), "floppy" (viele Hunderassen), "round" (Kuh/Bär-artig), "none" ohne sichtbare Ohren.'),
  tailLength: z.number().min(0).max(2).optional()
    .describe('Nur bei role:"quadruped", relativ zu `scale`. Schwanzlänge.'),
  tailStyle: z.enum(['straight', 'curled', 'bushy', 'none']).optional()
    .describe('Nur bei role:"quadruped". Schwanzform — "straight", "curled" (eingerollt, katzenartig), "bushy" (buschig, fuchs-/pferdeschweifartig), "none" ohne Schwanz.'),
  scale: z.number().min(4).max(2000).optional()
    .describe('Nur bei mode:"object", Standard 200. Größenreferenz der ganzen Strichgruppe in px — bei "ship" die Rumpflänge, bei "mast" die Länge.'),
  mass: z.number().min(0).max(1.5).optional()
    .describe('Nur bei mode:"object", Standard 0.6. Wie kräftig/breit die Teilstriche relativ zu `scale` sind.'),
  edge: z.enum(['hard', 'soft', 'lost']).optional()
    .describe('Nur bei mode:"object", Standard "soft". "hard": klar umrissen, keine Spiegelung, keine verlorene Kante. "soft": Spiegelung + eine dezent aufgelöste Kante an einem Ende. "lost": wie "soft", aber die Auflösung ist deutlich stärker — größere Teile verschwinden sichtbar ins Wasser/den Nebel.'),
  contrast: z.number().min(0).max(1).optional()
    .describe('Nur bei mode:"object", Standard 0.7. Wie dunkel/deutlich die Strichgruppe gegen ihre Umgebung steht, unabhängig von `mass` (Größe) — niedrig für fast verschwindende, weit entfernte Objekte.'),
  depth: z.enum(['foreground', 'midground', 'background']).optional()
    .describe('Nur bei mode:"object", Standard "midground". Einfache eingebaute atmosphärische Perspektive: "background" dämpft mass/contrast automatisch, "foreground" verstärkt sie leicht — kein eigenes value_map-Werkzeug, aber deckt den Tiefen-Bedarf für ein einzelnes Objekt in der Szene ab.'),
  region: z.array(strokePointSchema).min(3).max(60).optional()
    .describe('Nur bei mode:"field". Umriss der Region, die mit Dabs gefüllt wird (wie `points` bei mode:"fill", geschlossenes Polygon, muss nicht konvex sein).'),
  fieldDirection: z.number().min(0).max(360).optional()
    .describe('Nur bei mode:"field", Standard 0. Bevorzugte Ausrichtung der Dabs in Grad (0=rechts, 90=unten, 180=links, 270=oben) — z.B. Wasser eher horizontal (0/180), Reflexionen/Masten eher vertikal (90/270).'),
  fieldDirectionJitter: z.number().min(0).max(90).optional()
    .describe('Nur bei mode:"field", Standard 20. Wie stark die Ausrichtung einzelner Dabs zufällig von fieldDirection abweicht (in Grad) — 0 = alle exakt parallel (unnatürlich gleichförmig), höher = organischer.'),
  fieldLength: z.number().min(2).max(300).optional()
    .describe('Nur bei mode:"field", Standard 24. Länge eines einzelnen Dabs in px.'),
  fieldWidth: z.number().min(0.5).max(200).optional()
    .describe('Nur bei mode:"field". Breite eines einzelnen Dabs — Standard: `width`, falls gesetzt, sonst 14.'),
  fieldDensity: z.number().min(0.05).max(1).optional()
    .describe('Nur bei mode:"field", Standard 0.5. Wie dicht die Region mit Dabs gefüllt wird, relativ zu Region-Fläche und Dab-Größe — bewusst gedeckelt (max. 220 Dabs pro field-Strich), um das SVG nicht unnötig aufzublähen. Höher = dichter/deckender, niedriger = luftiger/skizzenhafter.'),
  fieldStyle: z.enum(['ink', 'solid', 'dry', 'watercolor', 'oil', 'spray', 'glow']).optional()
    .describe('Nur bei mode:"field". Welchen Stil jeder einzelne Dab nutzt (siehe `style`) — Standard: `style`, falls gesetzt, sonst "ink". "oil" oder "watercolor" meist am sinnvollsten für ein zusammenhängendes Feld.'),
  paletteWeights: z.array(z.number().min(0).max(1)).min(2).max(6).optional()
    .describe('Nur bei mode:"field", zusammen mit `palette` (gleiche Länge, gleiche Reihenfolge). Statt palette\'s normalem kontinuierlichen Wandern entlang eines Strichs bekommt hier JEDE einzelne Marke unabhängig eine feste Farbe aus der Palette zugelost, mit diesen Anteilen (relativ, müssen sich nicht zu 1 summieren) — z.B. palette:["#6E8790","#D4A95A","#8A6E9A","#7AA07A"], paletteWeights:[0.7,0.15,0.1,0.05] für "überwiegend blaugrau, aber 15% warme, 10% violette, 5% grüne Marken dazwischen". Für echtes broken color: das Auge mischt die nebeneinanderliegenden Marken, nicht ein einzelner Mischwert.'),
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
}).superRefine((data, ctx) => {
  // points ist optional geworden, damit mode:"field" (nutzt region) und
  // mode:"object" (nutzt anchor) valide sind — hier stattdessen
  // laufzeitgeprüft: GENAU das passende Feld muss zum jeweiligen mode
  // vorhanden sein, sonst bekäme ein Strich ohne sein Pflichtfeld erst tief
  // in dispatchStrokeStyle/expandFieldStroke/expandObjectStroke einen
  // kryptischen Fehler.
  if (data.mode === 'field') {
    if (!data.region || data.region.length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['region'], message: 'mode:"field" braucht region (mind. 3 Punkte).' });
    }
  } else if (data.mode === 'object') {
    if (!data.anchor) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['anchor'], message: 'mode:"object" braucht anchor.' });
    }
    if (!data.role) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['role'], message: 'mode:"object" braucht role (z.B. "ship" oder "mast").' });
    }
  } else if (!data.points || data.points.length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['points'], message: 'points (mind. 2 Punkte) ist außer bei mode:"field"/"object" erforderlich.' });
  }
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
  const withFields = expandFieldStrokes(withHandwriting);
  const withObjects = expandObjectStrokes(withFields);
  strokes = applySignaturePositioning(withObjects, w, h, signaturePosition, signatureMargin);

  // Nässe-Zustand: einmal pro AUFRUF abtrocknen (nicht pro Strich — mehrere
  // Striche in diesem Aufruf gelten als "in derselben Sitzung"), dann
  // progressiv fortschreiben, während die Striche gezeichnet werden, damit
  // ein späterer Strich im selben Aufruf bereits frühere als Nachbarn sehen
  // kann. wetRegionsPerStroke[i] hält den Snapshot GENAU vor Strich i fest,
  // für den identischen SVG-Durchlauf weiter unten (siehe dortiger Kommentar).
  // strokeSeedBase: EIN Zufallswert für diesen ganzen Aufruf, aber pro Strich
  // (seedStrokeRng(strokeSeedBase + idx * 104729)) neu gesät — identisch im
  // Raster- (hier) und im Vektor-Durchlauf (renderStrokesToSvgFragment)
  // unten, damit beide Male exakt dieselben "Zufalls"-Jitter/Passes/Bleed-
  // Werte würfeln. Siehe rng()-Kommentar oben für den gefundenen Bug, den
  // das behebt.
  const strokeSeedBase = Math.floor(Math.random() * 0x7fffffff);
  let wetRegions = decayWetRegions(await loadWetRegions(wetnessPath));
  const wetRegionsPerStroke = [];
  strokes.forEach((stroke, idx) => {
    wetRegionsPerStroke.push(wetRegions);
    seedStrokeRng(strokeSeedBase + idx * 104729);
    const newRegion = drawStroke(ctx, stroke, { wetRegions });
    if (newRegion) wetRegions = [...wetRegions, newRegion];
  });
  await saveWetRegions(wetnessPath, wetRegions);

  const pngBuf = canvas.toBuffer('image/png');
  await writeFile(pngPath, pngBuf);

  const svgFragment = renderStrokesToSvgFragment(strokes, w, h, wetRegionsPerStroke, strokeSeedBase);
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

// ── Checkpoint/Flatten ────────────────────────────────────────────────────────
// KROs eigener Befund im Monet-Vergleich: "malen → betrachten →
// entfernen/vereinfachen → übermalen" braucht einen besseren Korrekturzyklus,
// nicht nur einen besseren Pinsel. Das SVG ist aber bewusst APPEND-ONLY —
// jeder soul_draw-Aufruf trägt seinen contentHash in sys.md ("## Kunstwerke")
// ein, der in den nächsten Blockchain-Anker einfließt. Echtes Löschen
// einzelner Striche aus einem bestehenden SVG würde einen bereits
// verankerten Hash im Nachhinein ungültig/nicht mehr nachvollziehbar machen
// — das widerspricht dem ganzen Sinn der Provenienz-Kette. Deshalb hier KEIN
// Löschen, sondern ein neuer, eigenständiger canvas_id: sein SVG startet mit
// null Strichen, bekommt aber das aktuelle, geflachte PNG der Quelle als
// EIN eingebettetes Hintergrundbild (<image>, base64) statt tausender
// einzelner Pfade. source_canvas_id bleibt dabei komplett unverändert —
// eigene Datei, eigene bereits verankerte Historie, nichts wird überschrieben
// oder gelöscht. Lineage wird ehrlich im sys.md-Eintrag vermerkt statt so zu
// tun, als hätte die Arbeit bei null begonnen.
export async function runSoulDrawCheckpoint(soulId, token, { source_canvas_id, new_canvas_id, note }) {
  const sourcePngPath = `${artworkDir(soulId, source_canvas_id)}/${source_canvas_id}.png`;
  const sourceSvgPath = `${SOULS_DIR}${soulId}/vault/context/${source_canvas_id}.svg`;
  if (!(await fileExists(sourcePngPath))) {
    throw new Error(`Quellwerk "${source_canvas_id}" existiert nicht (kein PNG gefunden).`);
  }

  const newPngDir = artworkDir(soulId, new_canvas_id);
  const newPngPath = `${newPngDir}/${new_canvas_id}.png`;
  const newSvgPath = `${SOULS_DIR}${soulId}/vault/context/${new_canvas_id}.svg`;
  if (await fileExists(newSvgPath)) {
    throw new Error(`"${new_canvas_id}" existiert bereits — anderen Namen wählen.`);
  }

  const { vaultKeyHex, cipherMode } = await loadVaultMeta(soulId);

  // Nur für die Log-Nachricht (wie groß die Vereinfachung tatsächlich war),
  // keine funktionale Rolle — Quelle könnte z.B. auch ein reines
  // soul_generate-Werk ohne eigenes soul_draw-SVG sein.
  let sourcePathCount = null;
  try {
    const rawSourceSvg = await readFile(sourceSvgPath);
    const sourceSvgText = decryptIfNeeded(rawSourceSvg, vaultKeyHex).toString('utf8');
    sourcePathCount = countStrokes(sourceSvgText);
  } catch { /* kein SVG bei der Quelle — kein Problem, einfach kein Zähler */ }

  const pngBuf = await readFile(sourcePngPath);
  const img = await loadImage(pngBuf);
  const w = img.width, h = img.height;

  await mkdir(newPngDir, { recursive: true });
  await writeFile(newPngPath, pngBuf);

  const b64 = pngBuf.toString('base64');
  const lineageNote = sourcePathCount !== null
    ? ` (${sourcePathCount} Striche zu diesem einen Hintergrundbild vereinfacht)`
    : '';
  const svgText = [
    '<?xml version="1.0" encoding="utf-8" ?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}">`,
    `\t<!-- checkpoint: gestartet als geflachtetes Abbild von "${source_canvas_id}"${lineageNote} — dessen eigene Historie/Anker bleiben unverändert erhalten, dies hier ist ein bewusster neuer Anfang, kein Ersatz. -->`,
    `\t<image href="data:image/png;base64,${b64}" x="0" y="0" width="${w}" height="${h}" />`,
    '</svg>',
    '',
  ].join('\n');

  let svgOutBuf = Buffer.from(svgText, 'utf8');
  if (cipherMode === 'ciphered' && vaultKeyHex) svgOutBuf = encryptBuf(svgOutBuf, vaultKeyHex);
  await mkdir(`${SOULS_DIR}${soulId}/vault/context`, { recursive: true });
  await writeFile(newSvgPath, svgOutBuf);
  await ensureContextRegistered(soulId, `${new_canvas_id}.svg`);

  const svgHash = sha256Hex(svgText);
  const noteText = note ? ` — ${note}` : '';
  const stageLabel = `Checkpoint: kuratiert aus "${source_canvas_id}"${lineageNote}, neuer eigener Verlauf ab hier${noteText}`;
  await recordArtworkProgress(soulId, new_canvas_id, { stageLabel, contentHash: svgHash });

  const vaultUrlPng = `vault-shared://${soulId}/${new_canvas_id}/${new_canvas_id}.png`;
  const viewUrlPng  = token ? sharedFileUrl(soulId, `${new_canvas_id}/${new_canvas_id}.png`, token) : null;

  return { source_canvas_id, new_canvas_id, w, h, sourcePathCount, svgHash, vaultUrlPng, viewUrlPng };
}

export function formatSoulDrawCheckpointSummary(result) {
  const { source_canvas_id, new_canvas_id, w, h, sourcePathCount, svgHash, vaultUrlPng, viewUrlPng } = result;
  const sourceInfo = sourcePathCount !== null ? ` (dessen ${sourcePathCount} Striche zu diesem einen Hintergrundbild vereinfacht)` : '';
  return [
    `Checkpoint erstellt: "${new_canvas_id}" (${w}×${h}px), gestartet als geflachtetes Abbild von "${source_canvas_id}"${sourceInfo}.`,
    `"${source_canvas_id}" bleibt vollständig unverändert — eigene Historie, eigene Anker, nichts gelöscht oder überschrieben.`,
    `Ab jetzt mit soul_draw und canvas_id:"${new_canvas_id}" weiterarbeiten — startet mit 0 Strichen im neuen SVG-Verlauf.`,
    `PNG: ${viewUrlPng || vaultUrlPng}`,
    `Fortschritt in sys.md ("## Kunstwerke") vermerkt (sha256 ${svgHash.slice(0, 12)}…) — fließt in den nächsten Blockchain-Anker ein.`,
  ].join('\n');
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
      'Lasuren, "oil" für deckende Ölfarbe mit Borstenstruktur und automatischem "wet-in-wet"-',
      'Verschieben von Nachbarfarbe (siehe oilLoad) — für impressionistisch/Monet-artige Wirkung',
      'statt Aquarell-Transparenz, "spray" für gestreute Textur/Körnung, "glow" für weichen',
      'Lichtschein (mehrere gestapelte, nach außen verblassende Kreise statt hartem Verlaufsrand',
      '— Licht, das seine Umgebung durchdringt, statt als Symbol draufzusitzen).',
      '',
      'palette (nur watercolor/oil): statt einer festen `color` eine kleine Palette verwandter',
      'Töne, durch die der Strich entlang seines eigenen Verlaufs selbst wandert ("broken color"',
      '— mehrere ähnliche, aber nicht identische Farben nebeneinander statt einer Fläche in',
      'einer Farbe, mischt sich erst im Auge des Betrachters).',
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
      'Für ein zusammenhängendes optisches Feld statt vieler unabhängiger Einzelstriche',
      '(KROs eigener Befund im Monet-Vergleich): mode:"field" erzeugt viele kurze Dabs',
      'innerhalb einer Region (region statt points, wie mode:"fill") in einem Aufruf statt',
      'hundert einzeln formulierter Striche — fieldDirection/fieldDirectionJitter (Ausrichtung',
      'der Dabs, z.B. Wasser eher horizontal, Reflexionen/Masten eher vertikal),',
      'fieldLength/fieldWidth (Dab-Größe), fieldDensity (0-1, wie dicht — bewusst auf max. 220',
      'Dabs pro field-Strich gedeckelt, um das SVG nicht unnötig aufzublähen), fieldStyle',
      '(welcher style pro Dab, meist "oil" oder "watercolor" sinnvoll). palette funktioniert',
      'hier genau wie bei einzelnen watercolor/oil-Strichen, wirkt aber über die ganze Region',
      'verteilt statt entlang eines einzelnen Pfads — echtes "broken color": mehrere verwandte',
      'Töne liegen nebeneinander, das Auge mischt sie, statt dass eine Fläche in einer Farbe',
      'gefüllt wird. paletteWeights (nur zusammen mit palette): statt kontinuierlich zu wandern',
      'bekommt JEDE Marke unabhängig eine feste, gewürfelte Farbe mit expliziten Anteilen —',
      '"überwiegend blaugrau, aber 15% warme, 10% violette, 5% grüne Marken dazwischen" statt',
      'eines weichen Verlaufs.',
      '',
      'Eine Stufe über "field": mode:"object" erzeugt keine gleichartigen Marken, sondern eine',
      'kleine, ROLLEN-basierte Gruppe UNTERSCHIEDLICHER Teilstriche, die gemeinsam ein',
      'erkennbares Ding ergeben — "Strich → Strichgruppe → Objekt" statt "Objekt → Striche"',
      '(KROs eigener Befund: ein Boot entsteht aus der Beziehung mehrerer Striche zueinander,',
      'nicht aus einem einzelnen Boots-Symbol). anchor (statt points) ist der Bezugspunkt, role',
      'wählt die Rezeptur — fünf Baupläne bisher: "ship" — Rumpf (breit, dunkel, leicht',
      'gebrochen) + Bug/Heck (zwei kurze Richtungswechsel an den Enden) + optional Mast+Takelage',
      '(siehe hasMast, Standard true — false macht z.B. ein Ruderboot aus demselben Rumpf, ein',
      'Spektrum von Wasserfahrzeugen statt einer eigenen "vessel"-Rolle) + Spiegelung (über den',
      'bestehenden reflect-Mechanismus) + optional eine verlorene Kante an einem Rumpfende',
      '(siehe edge) — exakt KROs eigene sechsteilige Aufschlüsselung. "mast" — ein einzelner',
      'dünner Zug, der einfachste Baustein für wiederholte Masten/Kräne. "quadruped" — EIN',
      'generischer Vierbeiner-BAUPLAN (Rumpf + 2 Beinpaare + Hals/Kopf + Ohren + Schwanz +',
      'optional verlorene Kante am Boden), kein Rezept pro Tierart: legLength/bodyLength/',
      'bodyHeight/neckLength/headSize/earStyle/tailLength/tailStyle beschreiben JEDE beliebige',
      'Tierart auf demselben Bauplan. "biped" — generischer Zweibeiner-BAUPLAN (Rumpf senkrecht',
      '+ 2 Beine über legSpread + Hals/Kopf + Arme ODER angelegte Flügel über limbStyle) — für',
      'Menschen, Vögel (stehend/watend), alles Aufrechte; Beine zeigen wie bei quadruped immer',
      'bildschirm-abwärts, unabhängig von direction. "tree" — Stamm (senkrecht) + Krone als',
      'Dab-Streuung in einer Ellipse (canopyRadius/canopyAspect/canopyDensity, optional palette',
      'für Laub-Farbvarianz) statt eines Umriss-Strichs — für Bäume/Büsche/belaubte Massen;',
      'canopyAspect > 1 macht die Krone schlank/hoch (Nadelbaum) statt rund (Laubbaum). Über',
      'alle fünf Baupläne gilt derselbe Verallgemeinerungs-Mechanismus: "Hund und Katze sind',
      'sich ähnlich" heißt konkret ähnliche Zahlenwerte auf demselben Bauplan, nicht zwei',
      'verschiedene Rollen. preset (quadruped: cat/dog/fox/horse/cow, biped: human/bird, tree:',
      'deciduous/conifer) liefert kalibrierte Startwerte, ist aber nur eine Abkürzung — für jede',
      'andere Art/Sorte (Löwe, Papagei, Palme, ...) einfach alle Werte direkt aus eigenem Wissen',
      'über deren Proportionen schätzen, kein Bildmodell und keine feste Liste nötig, das ist',
      'der eigentliche Verallgemeinerungs-Mechanismus. scale (Größenreferenz), mass (wie',
      'kräftig), contrast (wie deutlich gegen die Umgebung), edge ("hard"/"soft"/"lost" — klar',
      'umrissen bis stark aufgelöst) und depth ("foreground"/"midground"/"background" — dämpft',
      'mass/contrast automatisch für entfernte Objekte, einfache eingebaute atmosphärische',
      'Perspektive) formen jeden Bauplan unterschiedlich. Weitere Baupläne (crane/pier/',
      'building_mass als reine Objekte statt Lebewesen) folgen, sobald sich ein konkreter Bedarf',
      'zeigt.',
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

export function registerCheckpoint(server, soulId, token) {
  server.tool(
    'soul_draw_checkpoint',
    [
      'Startet einen neuen, LEEREN Vektor-Verlauf für ein Werk, das visuell dort weitermacht, wo',
      'ein bestehendes aufgehört hat — ohne dessen angesammelte Striche mitzuschleppen. Für Werke,',
      'deren SVG (echter Vektor-Verlauf) inzwischen sehr groß geworden ist (viele tausend Striche)',
      'und bei denen weiteres Anhängen unpraktikabel wird: das aktuelle PNG von source_canvas_id',
      'wird als EIN Hintergrundbild in den neuen canvas_id übernommen (sichtbar identisch, aber',
      'technisch ein einziges Bild statt tausender einzelner Pfade), danach wächst new_canvas_id',
      'wieder ganz normal strichweise mit soul_draw weiter.',
      '',
      'source_canvas_id bleibt dabei VOLLSTÄNDIG unverändert — eigene Datei, eigene bereits',
      'verankerte Provenienz-Historie, nichts wird gelöscht oder überschrieben. Das ist bewusst',
      'kein "Aufräumen" der alten Historie (echtes Löschen einzelner Striche gibt es nicht — würde',
      'bereits verankerte Hashes im Nachhinein ungültig machen), sondern ein neuer, eigenständiger',
      'Anfang, der ehrlich auf seine Herkunft verweist (siehe sys.md-Eintrag). Für gezieltes',
      'Vereinfachen einer Komposition ("betrachten → vereinfachen → weitermalen") ohne die',
      'Provenienz-Kette des Originals zu gefährden.',
    ].join('\n'),
    {
      source_canvas_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_\-]+$/, 'Nur alphanumerisch + - _')
        .describe('Das bestehende, zu groß gewordene Werk, dessen aktueller Stand als Startpunkt übernommen wird.'),
      new_canvas_id: z.string().min(1).max(80).regex(/^[A-Za-z0-9_\-]+$/, 'Nur alphanumerisch + - _')
        .describe('Name des neuen Werks — muss noch nicht existieren. Ab jetzt mit soul_draw weiterbearbeiten.'),
      note: z.string().max(200).optional()
        .describe('Optionale kurze Notiz, warum dieser Checkpoint gesetzt wurde (z.B. "Komposition vereinfachen, weniger Einzelstriche") — landet im sys.md-Eintrag.'),
    },
    async ({ source_canvas_id, new_canvas_id, note }) => {
      try {
        const result = await runSoulDrawCheckpoint(soulId, token, { source_canvas_id, new_canvas_id, note });
        return { content: [{ type: 'text', text: formatSoulDrawCheckpointSummary(result) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Fehler: ${err.message}` }], isError: true };
      }
    }
  );
}
