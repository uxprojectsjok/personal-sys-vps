/**
 * accept_digital_content_terms — EU-Widerrufsrecht-Einwilligung + drei
 * getrennte PDF-Belege (Rechnung, Widerrufsbelehrung, Verzichtserklärung).
 *
 * Setzt einen vorherigen Aufruf von show_withdrawal_terms voraus: terms_token
 * MUSS aus dessen Antwort stammen. Ein erfundener/ausgedachter terms_token wird
 * serverseitig abgelehnt (es muss ein zuvor tatsächlich erzeugtes Dokument unter
 * consent_docs/{terms_token}.pdf existieren) — das erzwingt den Erstaufruf
 * technisch, statt sich auf die Kooperation der aufrufenden KI zu verlassen.
 *
 * Die Vorabinformation aus show_withdrawal_terms bleibt unter terms_token.pdf
 * unverändert bestehen (wird NICHT mehr überschrieben) — sie ist ein eigenes
 * Dokument mit eigenem rechtlichen Zweck (Art. 246a EGBGB, VOR Vertragsschluss),
 * getrennt von den drei hier neu erzeugten Dokumenten (jeweils eigene UUID,
 * eigener Link): Rechnung (§ 14 UStG), Widerrufsbelehrung inkl.
 * Muster-Widerrufsformular (Art. 246a EGBGB, als eigenständiges Nachschlage-
 * dokument) und Verzichtserklärung (§ 356 Abs. 5 BGB, der Einwilligungsnachweis).
 *
 * Die PDFs landen NICHT in vault_shared (dort für alle zahlenden/Peer-
 * Verbindungen lesbar — ungeeignet für personenbezogene Rechtsdokumente),
 * sondern in einem eigenen consent_docs/-Ordner, der von keinem
 * vault_shared_list/-get erreicht wird. Die Download-Links brauchen deshalb
 * keinen Zahlungs-Token (existiert an dieser Stelle im Flow noch nicht) — sie
 * sind stattdessen durch die Unratbarkeit der jeweiligen UUID gesichert (wie
 * ein Freigabe-Link bei Dropbox/Google Docs).
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { writeFile, stat } from 'fs/promises';
import { SOULS_DIR, loadCtx } from '../lib/vault_fs.mjs';
import {
  buildInvoicePdf, buildInvoiceTxt,
  buildWithdrawalNoticePdf, buildWithdrawalNoticeTxt,
  buildWaiverPdf, buildWaiverTxt,
  nextInvoiceNumber,
} from '../lib/eu_withdrawal_terms.mjs';

const BASE_URL = process.env.BASE_URL || '';

export function register(server, soulId) {
  server.tool(
    'accept_digital_content_terms',
    [
      'EU-Pflichtschritt vor jedem Kauf (PayPal, x402): Der Käufer',
      'muss ausdrücklich zustimmen, dass die digitale Leistung sofort beginnt',
      'UND dass er dadurch sein gesetzliches 14-tägiges Widerrufsrecht verliert.',
      '',
      'VORAUSSETZUNG: show_withdrawal_terms muss VORHER aufgerufen und sein Link',
      'dem Nutzer gezeigt worden sein — terms_token kommt aus dessen Antwort.',
      'Ein erfundener oder geratener terms_token wird abgelehnt (es muss ein',
      'tatsächlich existierendes Dokument dazu geben).',
      '',
      'GEBUNDEN AN DIESE SESSION, kein soul_id-Parameter: exakt wie show_withdrawal_terms',
      'wirkt dieses Tool ausschließlich auf die Soul der aktuellen MCP-Verbindung. Für',
      'eine ANDERE soul_id (die dir bekannt ist, aber zu der du keine Session hast) den',
      'HTTP-Weg nutzen: POST {node_url}/api/soul/terms/accept mit soul_id, terms_token',
      '(aus POST {node_url}/api/soul/terms/show), payment_method und beiden Consent-',
      'Feldern im Body — keine MCP-Session nötig, gleiche Felder/Regeln wie hier.',
      '',
      'Nur mit beiden Einwilligungen (=true) UND gültigem terms_token wird der',
      'Bezahlweg genannt. Niemals consent=true raten oder ohne echte, vom Nutzer',
      'im Chat ausdrücklich erklärte Zustimmung aufrufen.',
      '',
      'Bei Erfolg: drei getrennte PDFs werden neu erzeugt — Rechnung,',
      'Widerrufsbelehrung (inkl. Muster-Widerrufsformular) und Verzichtserklärung.',
      'Der Link aus show_withdrawal_terms bleibt unverändert bestehen (eigenes',
      'Dokument, wird NICHT überschrieben). PFLICHT: Alle drei neuen Links IMMER',
      'wörtlich an den Nutzer weitergeben — als klickbare Markdown-Links, nicht nur',
      'in eigenen Worten zusammenfassen und dabei weglassen. Zusätzlich ausdrücklich',
      'darauf hinweisen: die Referenz-ID (= terms_token) MUSS bei der Zahlung angegeben',
      'werden (PayPal: in der Notiz; x402: als reference_id beim Aufruf von',
      'POST /api/soul/pay/x402), sonst kann der Betreiber/das System die Zahlung',
      'nicht zuordnen.',
      '',
      'payment_method MUSS identisch zu dem in show_withdrawal_terms gewählten',
      'Zahlungsweg sein — das Zahlungsziel (Wallet-Adresse für x402 oder',
      'PayPal-Ziel) wird erst HIER, nach erteilter Zustimmung, zum ersten Mal genannt.',
    ].join('\n'),
    {
      terms_token: z.string().uuid()
        .describe('Referenz-ID aus der Antwort von show_withdrawal_terms — dieses Tool muss vorher aufgerufen worden sein.'),
      payment_method: z.enum(['paypal', 'x402']).describe('Gewählter Zahlungsweg — muss zu dem in show_withdrawal_terms gewählten passen.'),
      consent_immediate_performance: z.boolean()
        .describe('Zustimmung: die digitale Leistung soll sofort beginnen, vor Ablauf der 14-tägigen Widerrufsfrist. Nur auf true setzen nach echter, im Chat erklärter Zustimmung des Nutzers.'),
      consent_withdrawal_waiver: z.boolean()
        .describe('Bestätigung: dem Käufer ist bewusst, dass er durch die Zustimmung zum sofortigen Beginn sein Widerrufsrecht verliert. Nur auf true setzen nach echter, im Chat erklärter Zustimmung des Nutzers.'),
      contact_note: z.string().max(200).optional()
        .describe('Optionale Notiz/Kontakt (z.B. E-Mail), für den späteren manuellen Abgleich durch den Soul-Inhaber'),
    },
    async ({ terms_token, payment_method, consent_immediate_performance, consent_withdrawal_waiver, contact_note }) => {
      const ctx   = await loadCtx(soulId);
      const amort = ctx.amortization || {};
      const walletAvailable = amort.enabled === true && typeof amort.wallet === 'string' && amort.wallet.startsWith('0x');
      const paypalAvailable = amort.paypal_enabled === true;
      const x402Available   = walletAvailable && typeof amort.price_usdc === 'string' && Number(amort.price_usdc) > 0;

      // Siehe show_withdrawal_terms.mjs für die Begründung: "diese Soul" ohne Name/
      // soul_id/HTTP-Fallback liest sich wie eine generische Ablehnung, obwohl es
      // fast immer heißt "du bist als die FALSCHE Soul verbunden".
      const selfLabel = `${ctx.name || soulId.slice(0, 8)} (${soulId}, deine aktuelle MCP-Session)`;
      const httpHint  = `Für eine ANDERE soul_id (nicht ${soulId}): POST ${BASE_URL}/api/soul/terms/accept mit soul_id + terms_token (aus POST ${BASE_URL}/api/soul/terms/show) im Body -- keine MCP-Session dafür nötig.`;
      if (payment_method === 'paypal' && !paypalAvailable) {
        return { content: [{ type: 'text', text: `${selfLabel} akzeptiert aktuell keinen PayPal-Zahlungsweg.\n\n${httpHint}` }], isError: true };
      }
      if (payment_method === 'x402' && !x402Available) {
        return { content: [{ type: 'text', text: `${selfLabel} akzeptiert aktuell keinen x402-Zahlungsweg (kein USDC-Preis hinterlegt).\n\n${httpHint}` }], isError: true };
      }

      const consentDir = `${SOULS_DIR}${soulId}/consent_docs`;
      const docPath     = `${consentDir}/${terms_token}.pdf`;
      const txtPath     = `${consentDir}/${terms_token}.txt`;
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
        const wallet       = amort.wallet || '';
        const price        = payment_method === 'x402' ? (amort.price_usdc || '?') : (amort.price_eur || '?');
        const currency     = payment_method === 'x402' ? 'USDC' : 'EUR';
        const now          = new Date();
        // Lokale Zeit statt UTC — für ein an Verbraucher gerichtetes Rechtsdokument
        // ist "Z" (UTC) irreführend, Käufer erwarten ihre eigene (Europe/Berlin) Uhrzeit.
        const timestampDisplay = now.toLocaleString('de-DE', {
          timeZone: 'Europe/Berlin',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          timeZoneName: 'short',
        });

        // Einmal ziehen, an PDF UND TXT weiterreichen — sonst würde die TXT-Erzeugung
        // eine zweite, ungenutzte Rechnungsnummer verbrauchen (Zähler muss lückenlos
        // fortlaufend bleiben, § 14 Abs. 4 Nr. 4 UStG).
        const invoiceNumber = await nextInvoiceNumber(soulId, amort.trader_name || '');
        const invoiceDate   = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });

        const sharedFields = {
          soulName: ctx.name || soulId.slice(0, 8),
          soulId,
          price,
          currency,
          target,
          wallet,
          paymentMethod: payment_method,
          contactNote: contact_note || '',
          timestamp: timestampDisplay,
          referenceId: terms_token,
          traderName:     amort.trader_name || '',
          traderAddress:  amort.trader_address || '',
          traderEmail:    amort.trader_email || '',
          traderLegalForm: amort.trader_legal_form || '',
          traderVatNote:  amort.trader_vat_note || '',
          invoiceNumber,
          invoiceDate,
        };

        // Drei eigene UUIDs statt terms_token als Dateiname — die Vorschau unter
        // terms_token.pdf/.txt (aus show_withdrawal_terms) bleibt dadurch unangetastet
        // als eigenständiges Vorab-Dokument bestehen, statt überschrieben zu werden.
        // vault_consent_serve.lua verlangt einen reinen UUID-Dateinamen (kein Suffix),
        // daher keine sprechenden Namen wie "{token}-rechnung.pdf" — jedes Dokument
        // nennt seine Art stattdessen im eigenen Titel/Text.
        const invoiceToken    = randomUUID();
        const withdrawalToken = randomUUID();
        const waiverToken     = randomUUID();

        const [invoicePdf, withdrawalPdf, waiverPdf] = await Promise.all([
          buildInvoicePdf(sharedFields),
          buildWithdrawalNoticePdf(sharedFields),
          buildWaiverPdf(sharedFields),
        ]);
        const invoiceTxtContent    = buildInvoiceTxt(sharedFields);
        const withdrawalTxtContent = buildWithdrawalNoticeTxt(sharedFields);
        const waiverTxtContent     = buildWaiverTxt(sharedFields);

        await Promise.all([
          writeFile(`${consentDir}/${invoiceToken}.pdf`, invoicePdf),
          writeFile(`${consentDir}/${invoiceToken}.txt`, invoiceTxtContent, 'utf8'),
          writeFile(`${consentDir}/${withdrawalToken}.pdf`, withdrawalPdf),
          writeFile(`${consentDir}/${withdrawalToken}.txt`, withdrawalTxtContent, 'utf8'),
          writeFile(`${consentDir}/${waiverToken}.pdf`, waiverPdf),
          writeFile(`${consentDir}/${waiverToken}.txt`, waiverTxtContent, 'utf8'),
        ]);

        const invoiceUrl        = `${BASE_URL}/api/vault/consent/${soulId}/${invoiceToken}.pdf`;
        const invoiceUrlTxt     = `${BASE_URL}/api/vault/consent/${soulId}/${invoiceToken}.txt`;
        const withdrawalUrl     = `${BASE_URL}/api/vault/consent/${soulId}/${withdrawalToken}.pdf`;
        const withdrawalUrlTxt  = `${BASE_URL}/api/vault/consent/${soulId}/${withdrawalToken}.txt`;
        const waiverUrl         = `${BASE_URL}/api/vault/consent/${soulId}/${waiverToken}.pdf`;
        const waiverUrlTxt      = `${BASE_URL}/api/vault/consent/${soulId}/${waiverToken}.txt`;

        const paymentLines = payment_method === 'x402'
          ? [
              `x402/Polygon: ${price} ${currency} an ${wallet}`,
              `WICHTIG: Diese Referenz-ID MUSS als reference_id im x402_payment_header-Aufruf`,
              `von POST /api/soul/pay/x402 mitgeschickt werden — sonst kann das System die`,
              `Zahlung nicht zuordnen und lehnt sie ab.`,
              'Der Zugang wird nach Bestätigung der Zahlung durch den x402-Facilitator',
              'automatisch freigeschaltet (kein manuelles Prüfen nötig).',
            ]
          : [
              `PayPal: ${price} ${currency} an ${target}`,
              `WICHTIG: Diese Referenz-ID MUSS in der PayPal-Zahlungsnotiz angegeben`,
              `werden — sonst kann der Betreiber die Zahlung nicht zuordnen.`,
              'Nach der Zahlung den Soul-Inhaber direkt kontaktieren — Zugang wird',
              'manuell geprüft und freigeschaltet, in der Regel innerhalb von 48 Stunden.',
            ];

        return {
          content: [
            {
              type: 'text',
              text: [
                'Einwilligung erfasst. Drei getrennte Dokumente erzeugt: Rechnung,',
                'Widerrufsbelehrung (inkl. Muster-Widerrufsformular) und Verzichtserklärung.',
                '',
                `📄 [Rechnung herunterladen](${invoiceUrl})`,
                `${invoiceUrl}`,
                '',
                `📄 [Widerrufsbelehrung herunterladen](${withdrawalUrl})`,
                `${withdrawalUrl}`,
                '',
                `📄 [Verzichtserklärung herunterladen](${waiverUrl})`,
                `${waiverUrl}`,
                '',
                'PFLICHT: Gib dem Nutzer IMMER alle drei Links oben — jeweils als klickbaren',
                'Link UND als reine URL zum Kopieren. Nicht in einer eigenen Zusammenfassung weglassen.',
                '',
                `Maschinenlesbare Fassungen (für den zahlenden Agenten, kein PDF-Parsing nötig):`,
                `Rechnung: ${invoiceUrlTxt}`,
                `Widerrufsbelehrung: ${withdrawalUrlTxt}`,
                `Verzichtserklärung: ${waiverUrlTxt}`,
                `Die maschinenlesbaren .txt-Fassungen werden nach Token-Gültigkeit + ${14} Tage Puffer`,
                'automatisch entfernt — die PDFs bleiben unbefristet erhalten (steuerliche Aufbewahrungspflicht).',
                '',
                `Referenz-ID: ${terms_token}`,
                ...paymentLines,
              ].join('\n'),
            },
            { type: 'resource', resource: { uri: invoiceUrl, mimeType: 'application/pdf', blob: invoicePdf.toString('base64') } },
            { type: 'resource', resource: { uri: withdrawalUrl, mimeType: 'application/pdf', blob: withdrawalPdf.toString('base64') } },
            { type: 'resource', resource: { uri: waiverUrl, mimeType: 'application/pdf', blob: waiverPdf.toString('base64') } },
          ],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: `accept_digital_content_terms fehlgeschlagen: ${err.message}` }], isError: true };
      }
    }
  );
}
