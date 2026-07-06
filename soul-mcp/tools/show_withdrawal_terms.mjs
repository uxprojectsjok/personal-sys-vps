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

import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { SOULS_DIR, loadCtx } from '../lib/vault_fs.mjs';
import { legalTextForChat, buildTermsPreviewPdf } from '../lib/eu_withdrawal_terms.mjs';

const BASE_URL = process.env.BASE_URL || '';

export function register(server, soulId) {
  server.tool(
    'show_withdrawal_terms',
    [
      'PFLICHT-ERSTAUFRUF vor jedem Nicht-Krypto-Kauf (PayPal etc.) bei dieser Soul.',
      'Muss aufgerufen werden BEVOR accept_digital_content_terms aufgerufen wird —',
      'ohne den hier erzeugten terms_token schlägt accept_digital_content_terms fehl.',
      '',
      'Gibt eine gesetzlich vorgeschriebene EU-Widerrufsbelehrung zurück (Link zu',
      'einem PDF + Volltext). Das ist eine rechtliche Informationspflicht, keine',
      'Formatierungsfrage: der Link MUSS unverändert an den Nutzer weitergegeben',
      'werden, damit dieser die Belehrung selbst lesen kann, bevor er zustimmt.',
      'Eine eigene Zusammenfassung des Inhalts reicht rechtlich nicht aus und',
      'ersetzt nicht die Weitergabe des Links.',
      '',
      'Diese Soul akzeptiert PayPal als Nicht-Krypto-Zahlungsweg — ein Kauf',
      'berührt daher das gesetzliche 14-tägige Widerrufsrecht des Käufers.',
      'Zeige dem Nutzer den zurückgegebenen Link, bevor du fortfährst.',
    ].join('\n'),
    {},
    async () => {
      const ctx   = await loadCtx(soulId);
      const amort = ctx.amortization || {};
      if (!amort.paypal_enabled) {
        return {
          content: [{ type: 'text', text: 'Diese Soul akzeptiert aktuell keinen Nicht-Krypto-Zahlungsweg.' }],
          isError: true,
        };
      }

      try {
        const termsToken  = randomUUID();
        const previewPdf  = await buildTermsPreviewPdf({
          termsToken,
          soulName: ctx.name || soulId.slice(0, 8),
          soulId,
          priceEur: amort.price_eur || '?',
          target:   amort.paypal_link || amort.paypal_email || '(nicht konfiguriert)',
          traderName:      amort.trader_name || '',
          traderAddress:   amort.trader_address || '',
          traderEmail:     amort.trader_email || '',
          traderLegalForm: amort.trader_legal_form || '',
          traderVatNote:   amort.trader_vat_note || '',
          tokenDurationDays: amort.token_duration_days || 1,
        });
        const consentDir  = `${SOULS_DIR}${soulId}/consent_docs`;
        await mkdir(consentDir, { recursive: true });
        await writeFile(`${consentDir}/${termsToken}.pdf`, previewPdf);
        const previewUrl  = `${BASE_URL}/api/vault/consent/${soulId}/${termsToken}.pdf`;

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
