/**
 * Gemeinsamer Rechtstext + PDF-Bausteine für den EU-Widerrufsrecht-Flow.
 * Geteilt zwischen show_withdrawal_terms.mjs (Vorschau, Pflicht-Erstaufruf)
 * und accept_digital_content_terms.mjs (Einwilligung + Kaufbeleg), damit
 * beide nie unterschiedlichen Text zeigen können.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { SOULS_DIR } from './vault_fs.mjs';

const BRAND_TEAL = '#4a8f74';   // gedeckter als das helle Website-Teal (#6db89a) — besser lesbar auf Papier/Druck
const BRAND_DARK = '#1a1a1a';
const BRAND_DIM  = '#666666';

// Initialen aus dem Anbieternamen — Firmen-Präfix vor " – "/" - " wird ignoriert,
// falls vorhanden (z.B. "UX-Projects – Jan-Oliver Karo" → nur "Jan-Oliver Karo"
// initialisieren). Space UND Bindestrich trennen einzelne Namensteile.
function initialsFromTraderName(traderName) {
  if (!traderName) return 'XX';
  const parts = traderName.split(/\s[–-]\s/);
  const personName = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const initials = personName
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .join('');
  return initials || 'XX';
}

// Jährlich rollierende, fortlaufende Rechnungsnummer (§ 14 Abs. 4 Nr. 4 UStG:
// eindeutig, lückenlos fortlaufend — Jahres-Reset ist gängige, GoBD-konforme
// Praxis). Zähler liegt pro Soul in einer eigenen Datei, nicht in api_context.json,
// damit ein kaputter Kaufvorgang nie versehentlich die Amortisierungs-Config
// anfasst. Bewusst ohne Datei-Lock — Rechnungserstellung ist ein seltener,
// von einem Menschen ausgelöster Vorgang, kein Hochfrequenz-Pfad (gleiches
// Muster wie chain.json/pending_anchor.json in chain_lib.lua).
async function nextInvoiceNumber(soulId, traderName, date = new Date()) {
  const dir  = `${SOULS_DIR}${soulId}`;
  const path = `${dir}/invoice_counter.json`;
  const year = date.getUTCFullYear();

  let counter = { year, next: 1 };
  try {
    const raw = await readFile(path, 'utf8');
    const saved = JSON.parse(raw);
    counter = (saved.year === year) ? saved : { year, next: 1 };
  } catch { /* noch kein Zähler — Jahr beginnt bei 1 */ }

  const seq = counter.next;
  await mkdir(dir, { recursive: true }).catch(() => {});
  await writeFile(path, JSON.stringify({ year, next: seq + 1 }));

  const yyyy = year;
  const mm   = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(date.getUTCDate()).padStart(2, '0');
  const initials = initialsFromTraderName(traderName);
  const seqStr   = String(seq).padStart(3, '0');
  return `${yyyy}-${mm}-${dd}-${initials}-${seqStr}`;
}

export { nextInvoiceNumber };

// Zahlungsmethoden-spezifische Texte — PayPal hat ein Notizfeld, in das der
// Käufer selbst die Referenz-ID einträgt; POL/Polygon-Transaktionen haben
// keins, dort läuft die Zuordnung über reference_id im POST /api/soul/pay-
// Aufruf (server-seitig gegen consent_docs/ geprüft, siehe soul_pay.lua).
function paymentMethodTexts(paymentMethod, { target, wallet }) {
  if (paymentMethod === 'pol') {
    return {
      targetLabel: 'Wallet-Adresse (Polygon)',
      targetValue: wallet || '(nicht konfiguriert)',
      referenceNote: 'Diese Referenz-ID muss beim Einlösen der Zahlung als reference_id an ' +
        'POST /api/soul/pay mitgeschickt werden — nur so kann der Anbieter die Zahlung dieser ' +
        'Einwilligung zuordnen. Sie steht NICHT in der Blockchain-Transaktion selbst.',
      provisionNote: 'Zugang erfolgt über ein Zugriffs-Token, automatisch ausgestellt direkt nach ' +
        'Bestätigung der Zahlung auf der Polygon-Blockchain (kein manuelles Prüfen nötig).',
    };
  }
  return {
    targetLabel: 'PayPal-Zahlungsziel',
    targetValue: target || '(nicht konfiguriert)',
    referenceNote: 'Diese Referenz-ID muss bei der PayPal-Zahlung in der Notiz angegeben werden — ' +
      'nur so kann der Anbieter die Zahlung dieser Einwilligung zuordnen.',
    provisionNote: 'Zugang erfolgt über ein Zugriffs-Token, gültig ab Ausstellung. Das Token wird ' +
      'nach manueller Prüfung des Zahlungseingangs per E-Mail oder direkt im Chat übermittelt.',
  };
}

export const LEGAL_SECTIONS = [
  {
    title: 'Widerrufsrecht',
    text: 'Verbraucher haben beim Kauf digitaler Inhalte und Dienstleistungen im ' +
      'Fernabsatz ein gesetzliches Widerrufsrecht von 14 Tagen ab Vertragsschluss. ' +
      'Der Widerruf ist kostenfrei und ohne Angabe von Gründen möglich.',
  },
  {
    title: 'Folgen des Widerrufs',
    text: 'Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir ' +
      'von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der ' +
      'zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der ' +
      'Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt ' +
      'haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag ' +
      'zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei ' +
      'uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe ' +
      'Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, ' +
      'es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem ' +
      'Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.',
  },
  {
    title: 'Vorzeitiges Erlöschen des Widerrufsrechts',
    text: 'Das Widerrufsrecht erlischt vorzeitig bei einem Vertrag über die Lieferung ' +
      'von nicht auf einem körperlichen Datenträger befindlichen digitalen ' +
      'Inhalten, wenn wir mit der Ausführung des Vertrags begonnen haben, nachdem ' +
      'Sie ausdrücklich zugestimmt haben, dass wir mit der Ausführung des Vertrags ' +
      'vor Ablauf der Widerrufsfrist beginnen, und Sie Ihre Kenntnis davon ' +
      'bestätigt haben, dass Sie durch Ihre Zustimmung mit Beginn der Ausführung ' +
      'des Vertrags Ihr Widerrufsrecht verlieren.\n\n' +
      'Nach einem wirksamen Widerruf wird der Vertrag rückabgewickelt: der Käufer ' +
      'darf die erhaltenen digitalen Inhalte nicht weiter nutzen und muss sie im ' +
      'Rahmen der technischen Möglichkeiten löschen bzw. den Zugriff darauf beenden.',
  },
];

export function legalTextForChat() {
  return LEGAL_SECTIONS.map(s => `**${s.title}**\n${s.text}`).join('\n\n');
}

export function writeLegalSections(doc) {
  for (const section of LEGAL_SECTIONS) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND_DARK).text(section.title);
    doc.font('Helvetica').fontSize(9.5).fillColor(BRAND_DARK).text(section.text);
    doc.moveDown();
  }
}

// Vorschau-PDF — VOR der Zustimmung, von show_withdrawal_terms erzeugt.
// Zeigt bereits Preis, Zahlungsziel und Anbieter — informierte Zustimmung setzt
// voraus, dass der Käufer das VOR dem "Ja, ich stimme zu" kennt, nicht erst danach.
export async function buildTermsPreviewPdf({ termsToken, soulName, soulId, priceEur, target, wallet, paymentMethod = 'paypal', traderName, traderAddress, traderEmail, traderLegalForm, traderVatNote, tokenDurationDays }) {
  const { default: PDFDocument } = await import('pdfkit');
  const pm = paymentMethodTexts(paymentMethod, { target, wallet });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(20).fillColor(BRAND_DARK).text('SYS', { continued: true });
    doc.fillColor(BRAND_TEAL).text('.');
    doc.fillColor(BRAND_DIM).font('Helvetica').fontSize(9).text(traderName || 'SaveYourSoul');
    doc.moveDown(0.3);
    doc.save().strokeColor(BRAND_TEAL).lineWidth(2)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke().restore();
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND_DARK).text('Widerrufsbelehrung');
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#8a5a1c').text(`Referenz-ID: ${termsToken}`);
    doc.font('Helvetica').fontSize(9).fillColor(BRAND_DARK).text(pm.referenceNote);
    doc.fontSize(9).fillColor(BRAND_DIM).text(
      'Vorschau — noch keine Zustimmung erteilt. Dieses Dokument beschreibt dein ' +
      'gesetzliches Widerrufsrecht beim Kauf digitaler Inhalte, bevor du zustimmst.'
    );
    doc.fillColor(BRAND_DARK).moveDown();
    doc.font('Helvetica').fontSize(10).text(`Soul: ${soulName} (${soulId})`);
    doc.text(`Preis: ${priceEur} EUR`);
    doc.text(`${pm.targetLabel}: ${pm.targetValue}`);
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND_DARK).text('Anbieter');
    doc.font('Helvetica').fontSize(10);
    if (traderName) {
      doc.text(traderName);
      if (traderAddress)   doc.text(traderAddress);
      if (traderEmail)     doc.text(`E-Mail: ${traderEmail}`);
      if (traderLegalForm) doc.text(traderLegalForm);
      if (traderVatNote)   doc.text(traderVatNote);
    } else {
      doc.fontSize(9).fillColor('#b00020').text(
        'Keine Anbieterkennzeichnung hinterlegt — bitte in den Marketplace-Einstellungen ' +
        'Name, Anschrift und Kontakt-E-Mail des Anbieters eintragen.'
      );
      doc.fillColor(BRAND_DARK);
    }
    doc.moveDown();

    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND_DARK).text('Funktionsweise & Bereitstellung');
    doc.font('Helvetica').fontSize(10).text(
      `Zugang erfolgt über ein Zugriffs-Token, gültig für ${tokenDurationDays || 1} Tag(e) ab ` +
      `Ausstellung. ${pm.provisionNote} Die digitale Leistung beginnt mit Erhalt und Einsatz des ` +
      `Tokens. Es gilt das gesetzliche Mängelhaftungsrecht; bei technischen Problemen wende dich ` +
      `an die oben genannte Kontakt-E-Mail des Anbieters.`
    );
    doc.moveDown();

    writeLegalSections(doc);

    doc.end();
  });
}

// Bestätigter Kaufbeleg — von accept_digital_content_terms erzeugt, überschreibt
// dieselbe Datei/denselben Link, den show_withdrawal_terms bereits ausgegeben hat.
// Kombiniert Rechnung (§ 14 UStG) + Widerrufsbelehrung in einem Dokument —
// rechtlich unproblematisch (übliche Praxis), vermeidet eine zweite, separate
// Rechnungserzeugung (z.B. über PayPals eigenes Invoice-Feature, das dafür die
// Leistungsbeschreibung an PayPal übermitteln müsste — bewusst vermieden, siehe
// verify-identity-hq-plan.md, Abschnitt Datensparsamkeit/Rechnungsstellung).
export async function buildConsentPdf({ soulName, soulId, priceEur, target, wallet, paymentMethod = 'paypal', contactNote, timestamp, referenceId, traderName, traderAddress, traderEmail, traderLegalForm, traderVatNote }) {
  const { default: PDFDocument } = await import('pdfkit');
  const invoiceNumber = await nextInvoiceNumber(soulId, traderName);
  const invoiceDate   = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
  const pm = paymentMethodTexts(paymentMethod, { target, wallet });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth  = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left        = doc.page.margins.left;

    // ── Briefkopf ──────────────────────────────────────────────────────────
    doc.fontSize(20).fillColor(BRAND_DARK).font('Helvetica-Bold').text('SYS', left, doc.y, { continued: true });
    doc.fillColor(BRAND_TEAL).text('.');
    doc.fillColor(BRAND_DIM).font('Helvetica').fontSize(9)
      .text(traderName || 'SaveYourSoul', { align: 'left' });
    doc.moveDown(0.3);
    doc.save().strokeColor(BRAND_TEAL).lineWidth(2)
      .moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).stroke().restore();
    doc.moveDown(0.8);

    // ── Titel + Rechnungs-Meta (zweispaltig) ─────────────────────────────────
    const metaTop = doc.y;
    doc.fontSize(18).fillColor(BRAND_DARK).font('Helvetica-Bold')
      .text('Rechnung & Widerrufsbelehrung', left, metaTop, { width: pageWidth * 0.6 });

    const metaX = left + pageWidth * 0.62;
    const metaW = pageWidth * 0.38;
    doc.fontSize(9).font('Helvetica').fillColor(BRAND_DIM)
      .text('Rechnungsnummer', metaX, metaTop, { width: metaW, align: 'right' });
    doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_DARK)
      .text(invoiceNumber, metaX, doc.y, { width: metaW, align: 'right' });
    doc.fontSize(9).font('Helvetica').fillColor(BRAND_DIM)
      .text(`Rechnungsdatum: ${invoiceDate}`, metaX, doc.y + 2, { width: metaW, align: 'right' });
    doc.text(`Leistungsdatum: ${invoiceDate}`, metaX, doc.y, { width: metaW, align: 'right' });

    doc.y = Math.max(doc.y, metaTop + 70);
    doc.x = left;
    doc.moveDown(1);

    // ── Referenz-ID (Zahlungszuordnung) — bewusst hervorgehoben ─────────────
    // Box-Höhe aus der tatsächlichen Textbreite messen statt eines festen Werts
    // zu raten — die Notiz kann je nach Referenz-ID-Länge auf 1 oder 2 Zeilen
    // umbrechen, ein fixer Wert hätte sonst zu Überlappung geführt.
    const refBoxTop   = doc.y;
    const refBoxPad   = 10;
    const refTitleH   = doc.fontSize(10).heightOfString(`Referenz-ID: ${referenceId}`, { width: pageWidth - refBoxPad * 2 });
    const refNoteText = pm.referenceNote;
    const refNoteH    = doc.fontSize(8.5).heightOfString(refNoteText, { width: pageWidth - refBoxPad * 2 });
    const refBoxH     = refBoxPad * 2 + refTitleH + 3 + refNoteH;

    doc.rect(left, refBoxTop, pageWidth, refBoxH).fill('#fdf3e8');
    doc.fillColor('#8a5a1c').font('Helvetica-Bold').fontSize(10)
      .text(`Referenz-ID: ${referenceId}`, left + refBoxPad, refBoxTop + refBoxPad, { width: pageWidth - refBoxPad * 2 });
    doc.font('Helvetica').fontSize(8.5)
      .text(refNoteText, left + refBoxPad, doc.y + 3, { width: pageWidth - refBoxPad * 2 });
    doc.fillColor(BRAND_DARK);
    doc.y = refBoxTop + refBoxH;
    doc.x = left;
    doc.moveDown(1.2);

    // ── Anbieter / Leistungsempfänger (zweispaltig) ──────────────────────────
    // Beide Spalten können unterschiedlich viele Zeilen haben (Anbieter hat bis
    // zu 4, Empfänger nur 2) — daher beide Endpositionen tracken und danach das
    // Maximum nehmen, statt mit einem festen moveDown() zu raten (führte sonst
    // zur Überlappung mit der folgenden Tabelle, wenn die linke Spalte länger war).
    const partiesTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND_DIM).text('ANBIETER', left, partiesTop, { characterSpacing: 0.5 });
    doc.font('Helvetica').fontSize(10).fillColor(BRAND_DARK);
    if (traderName) {
      doc.text(traderName, left, doc.y + 2, { width: pageWidth * 0.45 });
      if (traderAddress)   doc.text(traderAddress, { width: pageWidth * 0.45 });
      if (traderEmail)     doc.text(`E-Mail: ${traderEmail}`, { width: pageWidth * 0.45 });
      if (traderLegalForm) doc.text(traderLegalForm, { width: pageWidth * 0.45 });
    } else {
      doc.fillColor('#b00020').fontSize(9)
        .text('Keine Anbieterkennzeichnung hinterlegt — bitte in den Marketplace-Einstellungen Name, Anschrift und Kontakt-E-Mail eintragen.', left, doc.y + 2, { width: pageWidth * 0.45 });
      doc.fillColor(BRAND_DARK);
    }
    const traderColBottom = doc.y;

    const buyerX = left + pageWidth * 0.55;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND_DIM).text('LEISTUNGSEMPFÄNGER', buyerX, partiesTop, { width: pageWidth * 0.45, characterSpacing: 0.5 });
    doc.font('Helvetica').fontSize(10).fillColor(BRAND_DARK)
      .text(contactNote || '—', buyerX, doc.y + 2, { width: pageWidth * 0.45 });
    doc.text(`Erstellt: ${timestamp}`, buyerX, doc.y, { width: pageWidth * 0.45 });
    const buyerColBottom = doc.y;

    doc.y = Math.max(traderColBottom, buyerColBottom);
    doc.x = left;
    doc.moveDown(1.5);

    // ── Rechnungstabelle ──────────────────────────────────────────────────
    const tableTop = doc.y;
    const col1 = left, col2 = left + pageWidth * 0.72, colW2 = pageWidth * 0.28;
    doc.rect(left, tableTop, pageWidth, 22).fill(BRAND_TEAL);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
      .text('BESCHREIBUNG', col1 + 8, tableTop + 6)
      .text('BETRAG', col2, tableTop + 6, { width: colW2 - 8, align: 'right' });

    const rowTop = tableTop + 22;
    doc.fillColor(BRAND_DARK).font('Helvetica').fontSize(10)
      .text(`Digitaler Zugang — Soul „${soulName}“ (${soulId.slice(0, 8)})`, col1 + 8, rowTop + 8, { width: pageWidth * 0.68 })
      .text(`${priceEur} EUR`, col2, rowTop + 8, { width: colW2 - 8, align: 'right' });
    doc.strokeColor('#dddddd').lineWidth(1).moveTo(left, rowTop + 32).lineTo(left + pageWidth, rowTop + 32).stroke();

    const totalTop = rowTop + 40;
    doc.font('Helvetica-Bold').fontSize(11)
      .text('Gesamtbetrag', col1 + 8, totalTop, { width: pageWidth * 0.68 })
      .text(`${priceEur} EUR`, col2, totalTop, { width: colW2 - 8, align: 'right' });
    if (traderVatNote) {
      doc.font('Helvetica').fontSize(8).fillColor(BRAND_DIM)
        .text(traderVatNote, col1 + 8, totalTop + 16, { width: pageWidth - 16 });
    }
    doc.fillColor(BRAND_DARK);
    doc.moveDown(2.5);

    // ── Zahlungsziel ──────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND_DIM).text(pm.targetLabel.toUpperCase(), left, doc.y, { characterSpacing: 0.5 });
    doc.font('Helvetica').fontSize(10).fillColor(BRAND_DARK).text(pm.targetValue, left, doc.y + 2);
    doc.moveDown();

    doc.font('Helvetica').fontSize(9).text(pm.provisionNote, left, doc.y, { width: pageWidth });
    doc.moveDown();

    // ── Widerrufsbelehrung ────────────────────────────────────────────────
    doc.save().strokeColor('#dddddd').lineWidth(1)
      .moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).stroke().restore();
    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND_DARK).text('Widerrufsbelehrung');
    doc.moveDown(0.3);
    writeLegalSections(doc);

    // ── Erteilte Einwilligungen ───────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND_DARK).text('Erteilte Einwilligungen');
    doc.font('Helvetica').fontSize(10);
    doc.text(`[${timestamp}] Zustimmung zum sofortigen Beginn der Leistung: JA`);
    doc.text(`[${timestamp}] Kenntnisnahme des dadurch erlöschenden Widerrufsrechts: JA`);

    // ── Fußzeile ──────────────────────────────────────────────────────────
    doc.fontSize(8).fillColor(BRAND_DIM)
      .text(`${invoiceNumber} · Automatisch erzeugt vom SYS-Protokoll`, left, doc.page.height - doc.page.margins.bottom - 12, { width: pageWidth, align: 'center' });

    doc.end();
  });
}
