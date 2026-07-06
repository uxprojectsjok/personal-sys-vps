/**
 * Gemeinsamer Rechtstext + PDF-Bausteine für den EU-Widerrufsrecht-Flow.
 * Geteilt zwischen show_withdrawal_terms.mjs (Vorschau, Pflicht-Erstaufruf)
 * und accept_digital_content_terms.mjs (Einwilligung + Kaufbeleg), damit
 * beide nie unterschiedlichen Text zeigen können.
 */

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
    doc.fontSize(12).text(section.title, { underline: true });
    doc.fontSize(10).text(section.text);
    doc.moveDown();
  }
}

// Vorschau-PDF — VOR der Zustimmung, von show_withdrawal_terms erzeugt.
export async function buildTermsPreviewPdf(termsToken) {
  const { default: PDFDocument } = await import('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Widerrufsbelehrung', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666').text(`Referenz-ID: ${termsToken}`);
    doc.fontSize(9).text(
      'Vorschau — noch keine Zustimmung erteilt. Dieses Dokument beschreibt dein ' +
      'gesetzliches Widerrufsrecht beim Kauf digitaler Inhalte, bevor du zustimmst.'
    );
    doc.fillColor('black').moveDown();

    writeLegalSections(doc);

    doc.end();
  });
}

// Bestätigter Kaufbeleg — von accept_digital_content_terms erzeugt, überschreibt
// dieselbe Datei/denselben Link, den show_withdrawal_terms bereits ausgegeben hat.
export async function buildConsentPdf({ soulName, soulId, priceEur, target, contactNote, timestamp, referenceId, traderName, traderAddress, traderEmail, traderLegalForm, traderVatNote }) {
  const { default: PDFDocument } = await import('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Widerrufsbelehrung & Kaufbestätigung', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#b00020').text(`Referenz-ID: ${referenceId}`);
    doc.fillColor('black').fontSize(9).text(
      'Diese Referenz-ID muss bei der PayPal-Zahlung in der Notiz angegeben werden — ' +
      'nur so kann der Anbieter die Zahlung dieser Einwilligung zuordnen.'
    );
    doc.moveDown();
    doc.fontSize(10).text(`Erstellt: ${timestamp}`);
    doc.text(`Soul: ${soulName} (${soulId})`);
    doc.text(`Preis: ${priceEur} EUR`);
    doc.text(`Zahlungsziel: ${target}`);
    if (contactNote) doc.text(`Kontakt/Notiz des Käufers: ${contactNote}`);
    doc.moveDown();

    doc.fontSize(12).text('Anbieter', { underline: true });
    if (traderName) {
      doc.fontSize(10).text(traderName);
      if (traderAddress)   doc.text(traderAddress);
      if (traderEmail)     doc.text(`E-Mail: ${traderEmail}`);
      if (traderLegalForm) doc.text(traderLegalForm);
      if (traderVatNote)   doc.text(traderVatNote);
    } else {
      doc.fontSize(9).fillColor('#b00020').text(
        'Keine Anbieterkennzeichnung hinterlegt — bitte in den Marketplace-Einstellungen ' +
        'Name, Anschrift und Kontakt-E-Mail des Anbieters eintragen.'
      );
      doc.fillColor('black');
    }
    doc.moveDown();

    writeLegalSections(doc);

    doc.fontSize(12).text('Erteilte Einwilligungen', { underline: true });
    doc.fontSize(10).text(`[${timestamp}] Zustimmung zum sofortigen Beginn der Leistung: JA`);
    doc.text(`[${timestamp}] Kenntnisnahme des dadurch erlöschenden Widerrufsrechts: JA`);

    doc.end();
  });
}
