/**
 * accept_digital_content_terms — EU-Widerrufsrecht-Einwilligung + PDF-Beleg.
 *
 * Vor jedem Nicht-Krypto-Kauf (PayPal etc.) muss der Käufer ausdrücklich
 * zustimmen, dass die digitale Leistung sofort beginnt UND dass er dadurch
 * sein 14-tägiges Widerrufsrecht verliert. Erst nach beiden Einwilligungen
 * wird ein PDF (dauerhafter Datenträger) erzeugt und der Bezahlweg genannt.
 *
 * Das PDF landet in vault_shared/ (sichtbar im Datei-Explorer des Betreibers)
 * UND wird direkt als Base64 zurückgegeben — kein Zahlungs-Token nötig, das
 * existiert an dieser Stelle im Flow noch gar nicht.
 */

import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { SOULS_DIR, loadCtx } from '../lib/vault_fs.mjs';

export function register(server, soulId) {
  server.tool(
    'accept_digital_content_terms',
    [
      'EU-Pflichtschritt vor jedem Nicht-Krypto-Kauf (PayPal etc.): Der Käufer',
      'muss ausdrücklich zustimmen, dass die digitale Leistung sofort beginnt',
      'UND dass er dadurch sein gesetzliches 14-tägiges Widerrufsrecht verliert.',
      '',
      'Ohne beide Einwilligungen (=true) gibt es KEINEN Hinweis auf den',
      'Bezahlweg — dieses Tool muss also VOR der Zahlung aufgerufen werden.',
      '',
      'Bei Erfolg: PDF-Beleg (Base64) + PayPal-Kontaktdaten in der Antwort.',
      'Der Käufer zahlt danach außerhalb des Systems und kontaktiert den',
      'Soul-Inhaber direkt — Zugang wird manuell freigeschaltet, i.d.R. binnen 48h.',
    ].join('\n'),
    {
      consent_immediate_performance: z.boolean()
        .describe('Zustimmung: die digitale Leistung soll sofort beginnen, vor Ablauf der 14-tägigen Widerrufsfrist'),
      consent_withdrawal_waiver: z.boolean()
        .describe('Bestätigung: dem Käufer ist bewusst, dass er durch die Zustimmung zum sofortigen Beginn sein Widerrufsrecht verliert'),
      contact_note: z.string().max(200).optional()
        .describe('Optionale Notiz/Kontakt (z.B. E-Mail), für den späteren manuellen Abgleich durch den Soul-Inhaber'),
    },
    async ({ consent_immediate_performance, consent_withdrawal_waiver, contact_note }) => {
      if (!consent_immediate_performance || !consent_withdrawal_waiver) {
        return {
          content: [{
            type: 'text',
            text: 'Kauf erst nach beiden ausdrücklichen Einwilligungen möglich: ' +
              'consent_immediate_performance UND consent_withdrawal_waiver müssen true sein.',
          }],
          isError: true,
        };
      }

      try {
        const ctx   = await loadCtx(soulId);
        const amort = ctx.amortization || {};
        if (!amort.paypal_enabled) {
          return {
            content: [{ type: 'text', text: 'Diese Soul akzeptiert aktuell keinen Nicht-Krypto-Zahlungsweg.' }],
            isError: true,
          };
        }
        const target   = amort.paypal_link || amort.paypal_email || '(nicht konfiguriert)';
        const priceEur = amort.price_eur || '?';
        const now      = new Date();
        const nowIso   = now.toISOString();

        const pdfBuffer = await buildConsentPdf({
          soulName: ctx.name || soulId.slice(0, 8),
          soulId,
          priceEur,
          target,
          contactNote: contact_note || '',
          timestamp: nowIso,
        });

        const ts        = Date.now();
        const filename   = `${ts}_widerruf_${Math.random().toString(16).slice(2, 8)}.pdf`;
        const sharedDir  = `${SOULS_DIR}${soulId}/vault_shared`;
        await mkdir(sharedDir, { recursive: true });
        await writeFile(`${sharedDir}/${filename}`, pdfBuffer);

        const b64 = pdfBuffer.toString('base64');

        return {
          content: [{
            type: 'text',
            text: [
              'Einwilligung erfasst. Widerrufsbelehrung + Kaufbeleg als PDF erzeugt',
              `(auch im Datei-Explorer des Soul-Inhabers unter vault_shared/${filename} abgelegt).`,
              '',
              `PayPal: ${priceEur} EUR an ${target}`,
              'Nach der Zahlung den Soul-Inhaber direkt kontaktieren — Zugang wird',
              'manuell geprüft und freigeschaltet, in der Regel innerhalb von 48 Stunden.',
              '',
              'PDF (Base64, application/pdf):',
              b64,
            ].join('\n'),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `accept_digital_content_terms fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}

async function buildConsentPdf({ soulName, soulId, priceEur, target, contactNote, timestamp }) {
  const { default: PDFDocument } = await import('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Widerrufsbelehrung & Kaufbestätigung', { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(`Erstellt: ${timestamp}`);
    doc.text(`Soul: ${soulName} (${soulId})`);
    doc.text(`Preis: ${priceEur} EUR`);
    doc.text(`Zahlungsziel: ${target}`);
    if (contactNote) doc.text(`Kontakt/Notiz des Käufers: ${contactNote}`);
    doc.moveDown();

    doc.fontSize(12).text('Widerrufsrecht', { underline: true });
    doc.fontSize(10).text(
      'Verbraucher haben beim Kauf digitaler Inhalte und Dienstleistungen im ' +
      'Fernabsatz ein gesetzliches Widerrufsrecht von 14 Tagen ab Vertragsschluss. ' +
      'Der Widerruf ist kostenfrei und ohne Angabe von Gründen möglich.'
    );
    doc.moveDown(0.5);
    doc.text(
      'Das Widerrufsrecht erlischt vorzeitig, wenn der Anbieter mit der Ausführung ' +
      'der Leistung erst nach ausdrücklicher Zustimmung des Verbrauchers zum ' +
      'sofortigen Beginn beginnt, der Verbraucher dabei bestätigt hat, dass er ' +
      'dadurch sein Widerrufsrecht verliert, und die Ausführung tatsächlich begonnen hat.'
    );
    doc.moveDown(0.5);
    doc.text(
      'Nach einem wirksamen Widerruf wird der Vertrag rückabgewickelt: der Anbieter ' +
      'erstattet den Kaufpreis, der Käufer darf die erhaltenen digitalen Inhalte ' +
      'nicht weiter nutzen und muss sie im Rahmen der technischen Möglichkeiten ' +
      'löschen bzw. den Zugriff darauf beenden.'
    );
    doc.moveDown();

    doc.fontSize(12).text('Erteilte Einwilligungen', { underline: true });
    doc.fontSize(10).text(`[${timestamp}] Zustimmung zum sofortigen Beginn der Leistung: JA`);
    doc.text(`[${timestamp}] Kenntnisnahme des dadurch erlöschenden Widerrufsrechts: JA`);

    doc.end();
  });
}
