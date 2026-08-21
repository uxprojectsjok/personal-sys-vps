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
import { loadCtx } from '../lib/vault_fs.mjs';
import { legalTextForChat, buildTermsPreviewPdf, buildTermsPreviewTxt, sweepExpiredConsentTxt, consentPurchaseDir } from '../lib/eu_withdrawal_terms.mjs';
import { computeDynamicUsdcPrice } from '../lib/dynamic_pricing.mjs';

const BASE_URL = process.env.BASE_URL || '';

export function register(server, soulId) {
  server.tool(
    'show_withdrawal_terms',
    [
      'PFLICHT-ERSTAUFRUF vor jedem x402/USDC-Kauf bei dieser Soul. Muss aufgerufen',
      'werden BEVOR accept_digital_content_terms aufgerufen wird — ohne den hier',
      'erzeugten terms_token schlägt accept_digital_content_terms fehl.',
      '',
      'GEBUNDEN AN DIESE SESSION, kein soul_id-Parameter: dieses Tool prüft/verkauft',
      'ausschließlich die Soul, mit der die aktuelle MCP-Verbindung besteht — NIE eine',
      'andere, beliebige Soul. Soll eine ANDERE, dir bekannte soul_id gekauft werden',
      '(z.B. weil ein Nutzer explizit nach dieser Soul fragt), funktioniert das über',
      'dieses Tool NICHT — auch dann nicht, wenn diese Soul denselben Zahlungsweg',
      'anbietet. Stattdessen den rohen HTTP-Weg nutzen, ganz ohne MCP-Session:',
      'POST {node_url}/api/soul/terms/show mit {"soul_id": "<ziel-soul-id>"} im Body',
      '(node_url aus llms.txt/wire_search/wire_status). Liefert dieselben Felder wie',
      'hier. Zweiter Schritt dann POST {node_url}/api/soul/terms/accept, Gegenstück',
      'zu accept_digital_content_terms.',
      '',
      'WICHTIG: Die Wallet-Adresse wird NICHT vorab genannt (auch nicht von',
      'soul_preview/soul_discover) — sie erscheint erst in der PDF-Antwort von',
      'accept_digital_content_terms, nach erteilter Zustimmung (Vorsichtsprinzip',
      'beim ungeklärten Anwendungsbereich des Widerrufsrechts bei Krypto-Zahlungen).',
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
    {},
    async () => {
      const ctx   = await loadCtx(soulId);
      const amort = ctx.amortization || {};
      const walletAvailable = amort.enabled === true && typeof amort.wallet === 'string' && amort.wallet.startsWith('0x');
      const x402Available   = walletAvailable && typeof amort.price_usdc === 'string' && Number(amort.price_usdc) > 0;

      // Nennt die betroffene Soul explizit (Name + soul_id) und den HTTP-Fallback --
      // sonst liest sich "diese Soul" wie eine generische Ablehnung, obwohl es fast
      // immer bedeutet "du bist als die FALSCHE Soul verbunden, um DIESE zu kaufen"
      // (live beobachtet: ein Agent, der eigentlich soul_id X kaufen wollte, aber
      // über seine EIGENE Session getestet hat -- die Meldung gab keinen Hinweis,
      // dass ein anderer Weg für eine andere soul_id existiert).
      const selfLabel = `${ctx.name || soulId.slice(0, 8)} (${soulId}, deine aktuelle MCP-Session)`;
      const httpHint  = `Für eine ANDERE soul_id (nicht ${soulId}): POST ${BASE_URL}/api/soul/terms/show mit {"soul_id": "<ziel-soul-id>"} im Body -- keine MCP-Session dafür nötig.`;
      if (!x402Available) {
        return { content: [{ type: 'text', text: `${selfLabel} akzeptiert aktuell keinen x402-Zahlungsweg (kein USDC-Preis hinterlegt).\n\n${httpHint}` }], isError: true };
      }

      try {
        const termsToken  = randomUUID();
        const tokenDurationDays = amort.token_duration_days || 1;
        // Den TATSÄCHLICH aktuellen dynamischen Preis zeigen (dieselbe Formel wie
        // soul_pay_x402.lua beim Settlement) — siehe accept_digital_content_terms.mjs
        // für die ausführliche Begründung. Sonst zeigt die Vorabinformation einen
        // anderen Betrag als tatsächlich abgebucht wird (live gefunden, 2026-08-08:
        // Vorabinformation zeigte 0.50 statt dynamisch).
        const previewBasePrice = Number(amort.price_usdc) || 0;
        const previewDynamicPricing = amort.dynamic_pricing === true;
        const previewPrice = previewDynamicPricing
          ? (await computeDynamicUsdcPrice(soulId, previewBasePrice)).toFixed(6)
          : (amort.price_usdc || '?');
        const previewFields = {
          termsToken,
          soulName: ctx.name || soulId.slice(0, 8),
          soulId,
          price:    previewPrice,
          basePrice: previewBasePrice,
          dynamicPricing: previewDynamicPricing,
          currency: 'USDC',
          wallet:   amort.wallet || '',
          traderName:      amort.trader_name || '',
          traderAddress:   amort.trader_address || '',
          traderEmail:     amort.trader_email || '',
          traderLegalForm: amort.trader_legal_form || '',
          traderVatNote:   amort.trader_vat_note || '',
          traderLegalFooter: amort.trader_legal_footer || '',
          tokenDurationDays,
        };
        const previewPdf  = await buildTermsPreviewPdf(previewFields);
        const previewTxt  = buildTermsPreviewTxt(previewFields);
        // Ein Ordner pro Kauf/Referenz-ID (statt einer Datei pro zufälliger UUID) —
        // accept_digital_content_terms legt die drei weiteren Dokumente (Rechnung,
        // Widerrufsbelehrung, Verzichtserklärung) später in denselben Ordner.
        const purchaseDir = consentPurchaseDir(soulId, termsToken);
        await mkdir(purchaseDir, { recursive: true });
        await writeFile(`${purchaseDir}/vorabinformation.pdf`, previewPdf);
        await writeFile(`${purchaseDir}/vorabinformation.txt`, previewTxt, 'utf8');
        // meta.json fürs Vault-Explorer-Frontend (vault_consent_list.lua liest das) —
        // wird von accept_digital_content_terms um invoice_number/accepted_at ergänzt.
        await writeFile(`${purchaseDir}/meta.json`, JSON.stringify({
          created_at: new Date().toISOString(),
          payment_method: 'x402',
        }), 'utf8');
        const previewUrl    = `${BASE_URL}/api/vault/consent/${soulId}/${termsToken}/vorabinformation.pdf`;
        const previewUrlTxt = `${BASE_URL}/api/vault/consent/${soulId}/${termsToken}/vorabinformation.txt`;

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
