/**
 * accept_digital_content_terms — EU-Widerrufsrecht-Einwilligung + PDF-Beleg.
 *
 * Setzt einen vorherigen Aufruf von show_withdrawal_terms voraus: terms_token
 * MUSS aus dessen Antwort stammen. Ein erfundener/ausgedachter terms_token wird
 * serverseitig abgelehnt (es muss ein zuvor tatsächlich erzeugtes Dokument unter
 * consent_docs/{terms_token}.pdf existieren) — das erzwingt den Erstaufruf
 * technisch, statt sich auf die Kooperation der aufrufenden KI zu verlassen.
 *
 * Nach Zustimmung wird dieselbe Datei/derselbe Link (aus show_withdrawal_terms)
 * zum bestätigten Kaufbeleg aktualisiert — kein neuer, zweiter Link.
 *
 * Das PDF landet NICHT in vault_shared (dort für alle zahlenden/Peer-Verbindungen
 * lesbar — ungeeignet für ein personenbezogenes Rechtsdokument), sondern in einem
 * eigenen consent_docs/-Ordner, der von keinem vault_shared_list/-get erreicht
 * wird. Der Download-Link braucht deshalb keinen Zahlungs-Token (existiert an
 * dieser Stelle im Flow noch nicht) — er ist stattdessen durch die Unratbarkeit
 * der UUID gesichert (wie ein Freigabe-Link bei Dropbox/Google Docs).
 */

import { z } from 'zod';
import { writeFile, stat } from 'fs/promises';
import { SOULS_DIR, loadCtx } from '../lib/vault_fs.mjs';
import { buildConsentPdf } from '../lib/eu_withdrawal_terms.mjs';

const BASE_URL = process.env.BASE_URL || '';

export function register(server, soulId) {
  server.tool(
    'accept_digital_content_terms',
    [
      'EU-Pflichtschritt vor jedem Nicht-Krypto-Kauf (PayPal etc.): Der Käufer',
      'muss ausdrücklich zustimmen, dass die digitale Leistung sofort beginnt',
      'UND dass er dadurch sein gesetzliches 14-tägiges Widerrufsrecht verliert.',
      '',
      'VORAUSSETZUNG: show_withdrawal_terms muss VORHER aufgerufen und sein Link',
      'dem Nutzer gezeigt worden sein — terms_token kommt aus dessen Antwort.',
      'Ein erfundener oder geratener terms_token wird abgelehnt (es muss ein',
      'tatsächlich existierendes Dokument dazu geben).',
      '',
      'Nur mit beiden Einwilligungen (=true) UND gültigem terms_token wird der',
      'Bezahlweg genannt. Niemals consent=true raten oder ohne echte, vom Nutzer',
      'im Chat ausdrücklich erklärte Zustimmung aufrufen.',
      '',
      'Bei Erfolg: derselbe Link aus show_withdrawal_terms wird zum bestätigten',
      'Kaufbeleg (PDF) aktualisiert. PFLICHT: Diesen Link IMMER wörtlich an den',
      'Nutzer weitergeben — als klickbaren Markdown-Link, nicht nur in eigenen',
      'Worten zusammenfassen und dabei weglassen. Zusätzlich ausdrücklich darauf',
      'hinweisen: die Referenz-ID (= terms_token) MUSS in der PayPal-Zahlungsnotiz',
      'angegeben werden, sonst kann der Betreiber die Zahlung nicht dem Vorgang',
      'zuordnen. Der Käufer zahlt danach außerhalb des Systems und kontaktiert den',
      'Soul-Inhaber direkt — Zugang wird manuell freigeschaltet, i.d.R. binnen 48h.',
    ].join('\n'),
    {
      terms_token: z.string().uuid()
        .describe('Referenz-ID aus der Antwort von show_withdrawal_terms — dieses Tool muss vorher aufgerufen worden sein.'),
      consent_immediate_performance: z.boolean()
        .describe('Zustimmung: die digitale Leistung soll sofort beginnen, vor Ablauf der 14-tägigen Widerrufsfrist. Nur auf true setzen nach echter, im Chat erklärter Zustimmung des Nutzers.'),
      consent_withdrawal_waiver: z.boolean()
        .describe('Bestätigung: dem Käufer ist bewusst, dass er durch die Zustimmung zum sofortigen Beginn sein Widerrufsrecht verliert. Nur auf true setzen nach echter, im Chat erklärter Zustimmung des Nutzers.'),
      contact_note: z.string().max(200).optional()
        .describe('Optionale Notiz/Kontakt (z.B. E-Mail), für den späteren manuellen Abgleich durch den Soul-Inhaber'),
    },
    async ({ terms_token, consent_immediate_performance, consent_withdrawal_waiver, contact_note }) => {
      const ctx   = await loadCtx(soulId);
      const amort = ctx.amortization || {};
      if (!amort.paypal_enabled) {
        return {
          content: [{ type: 'text', text: 'Diese Soul akzeptiert aktuell keinen Nicht-Krypto-Zahlungsweg.' }],
          isError: true,
        };
      }

      const consentDir = `${SOULS_DIR}${soulId}/consent_docs`;
      const docPath     = `${consentDir}/${terms_token}.pdf`;
      try {
        await stat(docPath);
      } catch {
        return {
          content: [{
            type: 'text',
            text: 'Ungültiger oder unbekannter terms_token. Zuerst show_withdrawal_terms ' +
              'aufrufen und dessen terms_token unverändert hier einsetzen — nicht selbst erfinden.',
          }],
          isError: true,
        };
      }

      if (!consent_immediate_performance || !consent_withdrawal_waiver) {
        return {
          content: [{
            type: 'text',
            text: 'Kauf erst nach beiden ausdrücklichen Einwilligungen möglich: ' +
              'consent_immediate_performance UND consent_withdrawal_waiver müssen true sein. ' +
              'Stimmt der Nutzer nicht zu, ist die Bereitstellung der digitalen Leistung über ' +
              'diesen Weg leider technisch nicht möglich — kein weiterer Versuch mit erfundenen ' +
              'true-Werten ohne echte Zustimmung.',
          }],
          isError: true,
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

        const pdfBuffer = await buildConsentPdf({
          soulName: ctx.name || soulId.slice(0, 8),
          soulId,
          priceEur,
          target,
          contactNote: contact_note || '',
          timestamp: timestampDisplay,
          referenceId: terms_token,
          traderName:     amort.trader_name || '',
          traderAddress:  amort.trader_address || '',
          traderEmail:    amort.trader_email || '',
          traderLegalForm: amort.trader_legal_form || '',
          traderVatNote:  amort.trader_vat_note || '',
        });

        await writeFile(docPath, pdfBuffer);

        const downloadUrl = `${BASE_URL}/api/vault/consent/${soulId}/${terms_token}.pdf`;

        return {
          content: [
            {
              type: 'text',
              text: [
                'Einwilligung erfasst. Rechnung + Widerrufsbelehrung als PDF erzeugt.',
                '',
                `📄 [Rechnung & Widerrufsbelehrung herunterladen](${downloadUrl})`,
                `${downloadUrl}`,
                '',
                'PFLICHT: Gib dem Nutzer IMMER den Link oben — als klickbaren Link UND',
                'als reine URL zum Kopieren. Nicht in einer eigenen Zusammenfassung weglassen.',
                '',
                `Referenz-ID: ${terms_token}`,
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
