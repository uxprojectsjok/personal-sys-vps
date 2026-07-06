/**
 * accept_digital_content_terms — EU-Widerrufsrecht-Einwilligung + PDF-Beleg.
 *
 * Vor jedem Nicht-Krypto-Kauf (PayPal etc.) muss der Käufer ausdrücklich
 * zustimmen, dass die digitale Leistung sofort beginnt UND dass er dadurch
 * sein 14-tägiges Widerrufsrecht verliert. Erst nach beiden Einwilligungen
 * wird ein PDF (dauerhafter Datenträger) erzeugt und der Bezahlweg genannt.
 *
 * Jede Einwilligung bekommt eine eigene UUID (Referenz-ID), die (a) im PDF
 * selbst steht, (b) der Käufer in seiner PayPal-Zahlungsnotiz angeben soll
 * (Zuordnung Zahlung ↔ Einwilligung), und (c) Teil des Download-Links ist.
 *
 * Das PDF landet NICHT in vault_shared (dort für alle zahlenden/Peer-Verbindungen
 * lesbar — ungeeignet für ein personenbezogenes Rechtsdokument), sondern in einem
 * eigenen consent_docs/-Ordner, der von keinem vault_shared_list/-get erreicht
 * wird. Der Download-Link braucht deshalb keinen Zahlungs-Token (existiert an
 * dieser Stelle im Flow noch nicht) — er ist stattdessen durch die Unratbarkeit
 * der UUID gesichert (wie ein Freigabe-Link bei Dropbox/Google Docs).
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { SOULS_DIR, loadCtx } from '../lib/vault_fs.mjs';

const BASE_URL = process.env.BASE_URL || '';

// Gemeinsamer Rechtstext — identisch in der Chat-Vorschau (vor der Zustimmung)
// und im PDF (nach der Zustimmung), damit beide nie auseinanderlaufen.
const LEGAL_SECTIONS = [
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

function legalTextForChat() {
  return LEGAL_SECTIONS.map(s => `**${s.title}**\n${s.text}`).join('\n\n');
}

export function register(server, soulId) {
  server.tool(
    'accept_digital_content_terms',
    [
      'EU-Pflichtschritt vor jedem Nicht-Krypto-Kauf (PayPal etc.): Der Käufer',
      'muss ausdrücklich zustimmen, dass die digitale Leistung sofort beginnt',
      'UND dass er dadurch sein gesetzliches 14-tägiges Widerrufsrecht verliert.',
      '',
      'ABLAUF (zwei Schritte, nicht überspringen):',
      '1. Dieses Tool OHNE beide consent-Flags (oder mit false) aufrufen →',
      '   gibt den vollständigen Belehrungstext zurück. Diesen Text dem Nutzer',
      '   VOLLSTÄNDIG und wörtlich zeigen (nicht zusammenfassen), dann ausdrücklich',
      '   fragen, ob er beiden Punkten zustimmt.',
      '2. Erst nach expliziter Zustimmung des Nutzers dieses Tool ERNEUT aufrufen,',
      '   diesmal mit consent_immediate_performance=true UND',
      '   consent_withdrawal_waiver=true → erzeugt PDF-Beleg + Download-Link +',
      '   Zahlungsanweisung.',
      '',
      'Ohne beide Einwilligungen gibt es KEINEN Hinweis auf den Bezahlweg —',
      'niemals direkt mit consent=true raten oder ohne echte Nutzer-Zustimmung aufrufen.',
      '',
      'PFLICHT bei Schritt 2: Den Download-Link IMMER wörtlich an den Nutzer',
      'weitergeben — als klickbaren Markdown-Link, nicht nur in eigenen Worten',
      'zusammenfassen und dabei weglassen. Zusätzlich ausdrücklich darauf hinweisen:',
      'die Referenz-ID MUSS in der PayPal-Zahlungsnotiz angegeben werden, sonst kann',
      'der Betreiber die Zahlung nicht dem Vorgang zuordnen. Der Käufer zahlt danach',
      'außerhalb des Systems und kontaktiert den Soul-Inhaber direkt — Zugang wird',
      'manuell freigeschaltet, i.d.R. binnen 48h.',
    ].join('\n'),
    {
      consent_immediate_performance: z.boolean().optional().default(false)
        .describe('Zustimmung: die digitale Leistung soll sofort beginnen, vor Ablauf der 14-tägigen Widerrufsfrist. Erst auf true setzen, NACHDEM der Belehrungstext (Schritt 1) dem Nutzer gezeigt und seine Zustimmung eingeholt wurde.'),
      consent_withdrawal_waiver: z.boolean().optional().default(false)
        .describe('Bestätigung: dem Käufer ist bewusst, dass er durch die Zustimmung zum sofortigen Beginn sein Widerrufsrecht verliert. Erst auf true setzen, NACHDEM der Belehrungstext (Schritt 1) dem Nutzer gezeigt und seine Zustimmung eingeholt wurde.'),
      contact_note: z.string().max(200).optional()
        .describe('Optionale Notiz/Kontakt (z.B. E-Mail), für den späteren manuellen Abgleich durch den Soul-Inhaber'),
    },
    async ({ consent_immediate_performance, consent_withdrawal_waiver, contact_note }) => {
      const ctx   = await loadCtx(soulId);
      const amort = ctx.amortization || {};
      if (!amort.paypal_enabled) {
        return {
          content: [{ type: 'text', text: 'Diese Soul akzeptiert aktuell keinen Nicht-Krypto-Zahlungsweg.' }],
          isError: true,
        };
      }

      if (!consent_immediate_performance || !consent_withdrawal_waiver) {
        const previewPdf = await buildTermsPreviewPdf();
        return {
          content: [
            {
              type: 'text',
              text: [
                '📋 Widerrufsbelehrung — im PDF unten UND im Text darunter. Beides dem',
                'Nutzer zeigen, den Text NICHT in eigenen Worten zusammenfassen.',
                '',
                '---',
                '',
                legalTextForChat(),
                '',
                '---',
                '',
                'Frage den Nutzer jetzt ausdrücklich, ob er BEIDEN Punkten zustimmt:',
                '1. Die digitale Leistung beginnt sofort nach Zahlung (vor Ablauf der 14-Tage-Frist).',
                '2. Er verzichtet damit auf sein 14-tägiges Widerrufsrecht.',
                '',
                'Erst NACH expliziter Zustimmung dieses Tool erneut aufrufen mit',
                'consent_immediate_performance=true und consent_withdrawal_waiver=true.',
              ].join('\n'),
            },
            { type: 'resource', resource: { uri: 'sys://widerrufsbelehrung-vorschau.pdf', mimeType: 'application/pdf', blob: previewPdf.toString('base64') } },
          ],
        };
      }

      try {
        const target      = amort.paypal_link || amort.paypal_email || '(nicht konfiguriert)';
        const priceEur     = amort.price_eur || '?';
        const now          = new Date();
        // Lokale Zeit statt UTC — für ein an Verbraucher gerichtetes Rechtsdokument
        // ist "Z" (UTC) irreführend, Käufer erwarten ihre eigene (Europe/Berlin) Uhrzeit.
        const timestampDisplay = now.toLocaleString('de-DE', {
          timeZone: 'Europe/Berlin',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZoneName: 'short',
        });
        const referenceId  = randomUUID();

        const pdfBuffer = await buildConsentPdf({
          soulName: ctx.name || soulId.slice(0, 8),
          soulId,
          priceEur,
          target,
          contactNote: contact_note || '',
          timestamp: timestampDisplay,
          referenceId,
          traderName:     amort.trader_name || '',
          traderAddress:  amort.trader_address || '',
          traderEmail:    amort.trader_email || '',
          traderLegalForm: amort.trader_legal_form || '',
          traderVatNote:  amort.trader_vat_note || '',
        });

        const consentDir = `${SOULS_DIR}${soulId}/consent_docs`;
        await mkdir(consentDir, { recursive: true });
        await writeFile(`${consentDir}/${referenceId}.pdf`, pdfBuffer);

        const downloadUrl = `${BASE_URL}/api/vault/consent/${soulId}/${referenceId}.pdf`;

        return {
          content: [
            {
              type: 'text',
              text: [
                'Einwilligung erfasst. Widerrufsbelehrung + Kaufbeleg als PDF erzeugt.',
                '',
                `📄 [Widerrufsdokument herunterladen](${downloadUrl})`,
                `${downloadUrl}`,
                '',
                'PFLICHT: Gib dem Nutzer IMMER den Link oben — als klickbaren Link UND',
                'als reine URL zum Kopieren. Nicht in einer eigenen Zusammenfassung weglassen.',
                '',
                `Referenz-ID: ${referenceId}`,
                `WICHTIG: Diese Referenz-ID MUSS in der PayPal-Zahlungsnotiz angegeben`,
                `werden — sonst kann der Betreiber die Zahlung nicht zuordnen.`,
                '',
                `PayPal: ${priceEur} EUR an ${target}`,
                'Nach der Zahlung den Soul-Inhaber direkt kontaktieren — Zugang wird',
                'manuell geprüft und freigeschaltet, in der Regel innerhalb von 48 Stunden.',
              ].join('\n'),
            },
            { type: 'resource', resource: { uri: downloadUrl, mimeType: 'application/pdf', blob: pdfBuffer.toString('base64') } },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `accept_digital_content_terms fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}

async function buildConsentPdf({ soulName, soulId, priceEur, target, contactNote, timestamp, referenceId, traderName, traderAddress, traderEmail, traderLegalForm, traderVatNote }) {
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

function writeLegalSections(doc) {
  for (const section of LEGAL_SECTIONS) {
    doc.fontSize(12).text(section.title, { underline: true });
    doc.fontSize(10).text(section.text);
    doc.moveDown();
  }
}

// Vorschau-PDF VOR der Zustimmung — noch kein Kauf, keine Referenz-ID, wird
// nicht gespeichert. Existiert nur, damit der Client (der PDF-Resource-Blöcke
// offenbar direkt rendert statt sie vom Modell umschreiben zu lassen) die
// Belehrung vollständig zeigt, statt dass sie in der Chat-Zusammenfassung
// verkürzt wird.
async function buildTermsPreviewPdf() {
  const { default: PDFDocument } = await import('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Widerrufsbelehrung', { underline: true });
    doc.moveDown();
    doc.fontSize(9).fillColor('#666').text(
      'Vorschau — noch keine Zustimmung erteilt. Dieses Dokument beschreibt dein ' +
      'gesetzliches Widerrufsrecht beim Kauf digitaler Inhalte, bevor du zustimmst.'
    );
    doc.fillColor('black').moveDown();

    writeLegalSections(doc);

    doc.end();
  });
}
