/**
 * show_withdrawal_terms — Pflicht-Erstaufruf im EU-Widerrufsrecht-Flow.
 *
 * Muss VOR accept_digital_content_terms aufgerufen werden — der dort
 * zwingende Parameter terms_token kommt ausschließlich aus der Antwort
 * dieses Tools. accept_digital_content_terms verifiziert serverseitig,
 * dass ein hier erzeugtes Dokument tatsächlich existiert; ein erfundener
 * oder ausgedachter terms_token wird abgelehnt.
 *
 * Warum ein eigenes Tool statt nur "im Tool-Ergebnis" darauf hinzuweisen:
 * Anweisungen in Tool-RESULTATEN (Daten) behandeln Modelle aus gutem Grund
 * skeptisch — das ist dasselbe Muster wie Prompt-Injection über fremde
 * Inhalte. Die Tool-BESCHREIBUNG (Metadaten, vom Betreiber registriert)
 * genießt dagegen mehr Vertrauen. Ob das reicht, ist ein Versuch, keine
 * Garantie — aber ein anderer Hebel als die bisherigen.
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { SOULS_DIR, loadCtx } from '../lib/vault_fs.mjs';
import { legalTextForChat, buildTermsPreviewPdf, buildTermsPreviewTxt, sweepExpiredConsentTxt } from '../lib/eu_withdrawal_terms.mjs';

const BASE_URL = process.env.BASE_URL || '';

export function register(server, soulId) {
  server.tool(
    'show_withdrawal_terms',
    [
      'PFLICHT-ERSTAUFRUF vor jedem Kauf bei dieser Soul — sowohl PayPal als auch',
      'POL/Polygon. Muss aufgerufen werden BEVOR accept_digital_content_terms',
      'aufgerufen wird — ohne den hier erzeugten terms_token schlägt',
      'accept_digital_content_terms fehl.',
      '',
      'WICHTIG: Die Wallet-Adresse bzw. das PayPal-Ziel werden NICHT vorab genannt',
      '(auch nicht von soul_preview/soul_discover) — sie erscheinen erst in der',
      'PDF-Antwort von accept_digital_content_terms, nach erteilter Zustimmung.',
      'Das gilt für BEIDE Zahlungswege gleichermaßen (Vorsichtsprinzip beim',
      'ungeklärten Anwendungsbereich des Widerrufsrechts bei Krypto-Zahlungen).',
      '',
      'Gibt eine gesetzlich vorgeschriebene EU-Widerrufsbelehrung zurück (Link zu',
      'einem PDF + Volltext). Das ist eine rechtliche Informationspflicht, keine',
      'Formatierungsfrage: der Link MUSS unverändert an den Nutzer weitergegeben',
      'werden, damit dieser die Belehrung selbst lesen kann, bevor er zustimmt.',
      'Eine eigene Zusammenfassung des Inhalts reicht rechtlich nicht aus und',
      'ersetzt nicht die Weitergabe des Links.',
      '',
      'Zeige dem Nutzer den zurückgegebenen Link, bevor du fortfährst.',
    ].join('\n'),
    {
      payment_method: z.enum(['paypal', 'pol']).describe('Gewählter Zahlungsweg — bestimmt, welches Zahlungsziel später in accept_digital_content_terms genannt wird.'),
    },
    async ({ payment_method }) => {
      const ctx   = await loadCtx(soulId);
      const amort = ctx.amortization || {};
      const polAvailable    = amort.enabled === true && typeof amort.wallet === 'string' && amort.wallet.startsWith('0x');
      const paypalAvailable = amort.paypal_enabled === true;

      if (payment_method === 'paypal' && !paypalAvailable) {
        return { content: [{ type: 'text', text: 'Diese Soul akzeptiert aktuell keinen PayPal-Zahlungsweg.' }], isError: true };
      }
      if (payment_method === 'pol' && !polAvailable) {
        return { content: [{ type: 'text', text: 'Diese Soul akzeptiert aktuell keinen POL-Zahlungsweg.' }], isError: true };
      }
      if (!paypalAvailable && !polAvailable) {
        return { content: [{ type: 'text', text: 'Diese Soul akzeptiert aktuell keinen Zahlungsweg.' }], isError: true };
      }

      try {
        const termsToken  = randomUUID();
        const tokenDurationDays = amort.token_duration_days || 1;
        const previewFields = {
          termsToken,
          soulName: ctx.name || soulId.slice(0, 8),
          soulId,
          priceEur: amort.price_eur || '?',
          target:   amort.paypal_link || amort.paypal_email || '(nicht konfiguriert)',
          wallet:   amort.wallet || '',
          paymentMethod: payment_method,
          traderName:      amort.trader_name || '',
          traderAddress:   amort.trader_address || '',
          traderEmail:     amort.trader_email || '',
          traderLegalForm: amort.trader_legal_form || '',
          traderVatNote:   amort.trader_vat_note || '',
          tokenDurationDays,
        };
        const previewPdf  = await buildTermsPreviewPdf(previewFields);
        const previewTxt  = buildTermsPreviewTxt(previewFields);
        const consentDir  = `${SOULS_DIR}${soulId}/consent_docs`;
        await mkdir(consentDir, { recursive: true });
        await writeFile(`${consentDir}/${termsToken}.pdf`, previewPdf);
        await writeFile(`${consentDir}/${termsToken}.txt`, previewTxt, 'utf8');
        const previewUrl    = `${BASE_URL}/api/vault/consent/${soulId}/${termsToken}.pdf`;
        const previewUrlTxt = `${BASE_URL}/api/vault/consent/${soulId}/${termsToken}.txt`;

        // Best-effort, nicht blockierend: abgelaufene .txt-Begleitdateien aus früheren
        // Käufen dieser Soul mit aufräumen (löscht nie .pdf, siehe eu_withdrawal_terms.mjs).
        sweepExpiredConsentTxt(soulId, tokenDurationDays).catch(() => {});

        return {
          content: [
            {
              type: 'text',
              text: [
                '=== AB HIER WÖRTLICH AN DEN NUTZER SENDEN ===',
                '',
                'Bevor du fortfahren kannst, lies bitte die gesetzliche Widerrufsbelehrung:',
                '',
                `📄 [Widerrufsbelehrung öffnen](${previewUrl})`,
                previewUrl,
                '',
                `Weitere Kaufbedingungen (Zahlungsweg, Leistungsbeginn, Mängelhaftung): ${BASE_URL}/agb`,
                `Maschinenlesbare Fassung der AGB (für Agenten, kein HTML-Rendering nötig): ${BASE_URL}/agb.txt`,
                `Maschinenlesbare Fassung dieser Widerrufsbelehrung: ${previewUrlTxt}`,
                '',
                'Antworte danach mit "Ja, ich stimme zu und schließe kostenpflichtig ab",',
                'wenn du beidem zustimmst UND den kostenpflichtigen Kauf abschließen willst:',
                '1. Die digitale Leistung beginnt sofort nach Zahlung.',
                '2. Du verzichtest damit auf dein 14-tägiges Widerrufsrecht.',
                '',
                'Ohne diese Zustimmung ist die Bereitstellung der digitalen Leistung über',
                'diesen Weg leider technisch nicht möglich.',
                '',
                '=== ENDE DER NACHRICHT AN DEN NUTZER ===',
                '',
                'Erst NACH expliziter Zustimmung des Nutzers accept_digital_content_terms',
                `aufrufen mit consent_immediate_performance=true, consent_withdrawal_waiver=true`,
                `und terms_token="${termsToken}".`,
                'Falls der Nutzer nach dem Inhalt der Belehrung fragt: den Volltext unten',
                'verwenden, aber nur auf Nachfrage — nicht von dir aus zusammenfassen.',
                '',
                '--- Volltext (nur bei Nachfrage des Nutzers verwenden) ---',
                legalTextForChat(),
              ].join('\n'),
            },
            { type: 'resource', resource: { uri: previewUrl, mimeType: 'application/pdf', blob: previewPdf.toString('base64') } },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `show_withdrawal_terms fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
