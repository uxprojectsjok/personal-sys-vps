/**
 * soul_transfer.mjs — Soul-Eigentumsübertragung (kostenlos oder Verkauf), off-chain
 * koordiniert, on-chain per bestehendem SoulRegistry.transferSoul() ausgeführt.
 *
 * Bewusst KEIN neuer Smart Contract, keine Änderung an SoulRegistry (Entscheidung
 * 2026-08-09): das Eskrow/NFT-Marktplatz-Feature ist für ein künftiges Redeploy
 * vorgesehen — heute nur die Workflow-Logik drumherum, damit der bestehende
 * transferSoul(soulId, newOwner) sicher (Empfänger bestätigt Wallet-Kontrolle
 * per Signatur, bei Verkauf zusätzlich Zahlungsnachweis) statt blind aufgerufen
 * wird. Der eigentliche transferSoul()-Call bleibt Sache des aktuellen
 * Eigentümers (eigene Wallet, kein Server-Custody eines Spend-Keys) — dieses
 * Modul bereitet nur vor, wann/mit wem das sicher passieren kann.
 *
 * Ablauf:
 *   1. Eigentümer legt ein Listing an (setListing) — kostenlos oder mit Preis +
 *      Gültigkeitsdauer (die Dauer fixiert den Preis für die Zeit der Challenge,
 *      unabhängig von evtl. künftiger dynamischer Bepreisung anderswo im System).
 *   2. Käufer (über eigene KI/MCP oder direkt) startet eine Challenge
 *      (createChallenge) — genau eine aktive Challenge pro Soul zur Zeit
 *      (first-come, kein Ticket-System für konkurrierende Käufer heute).
 *   3. Käufer signiert eine Bestätigungsnachricht mit der eigenen Wallet
 *      (submitSignature) — beweist Kontrolle über die Zieladresse, verhindert
 *      Tippfehler/Clipboard-Hijacking (siehe [[send_soul_ui_feature]]-Diskussion).
 *   4. Bei Verkauf: Käufer sendet USDC direkt an die aktuelle On-Chain-Eigentümer-
 *      Adresse (normale Wallet-zu-Wallet-Überweisung, nicht x402 — kein API-
 *      Zugriffskauf, sondern eine Vermögensübertragung) und reicht den tx_hash
 *      ein (submitPayment) — wird gegen die Chain verifiziert (from/to/amount).
 *   5. Eigentümer sieht die abgeschlossene Challenge im UI und führt selbst
 *      transferSoul(soulId, buyerWallet) aus — eigene Wallet-Signatur, wie
 *      jede andere on-chain Aktion in diesem Projekt.
 */

import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { ethers } from 'ethers';
import { SOULS_DIR } from './vault_fs.mjs';

const CONTRACT_ADDRESS = '0xE80B92edFE2286a5a941D10123AbF5E11F76342B';
const USDC_ADDRESS     = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const POLYGON_RPC       = 'https://polygon-bor-rpc.publicnode.com';
const TRANSFER_TOPIC    = ethers.id('Transfer(address,address,uint256)');
const OWNER_ABI = ['function soulOwner(bytes32 soulId) view returns (address)'];

let _provider = null;
function getProvider() {
  if (!_provider) _provider = new ethers.JsonRpcProvider(POLYGON_RPC);
  return _provider;
}

function soulIdToBytes32(soulId) {
  return ethers.keccak256(ethers.toUtf8Bytes(soulId));
}

function transferDir(soulId) {
  return `${SOULS_DIR}${soulId}/soul_transfer`;
}

function listingPath(soulId) {
  return `${transferDir(soulId)}/listing.json`;
}

function challengePath(soulId, challengeId) {
  return `${transferDir(soulId)}/challenge_${challengeId}.json`;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJson(path, data) {
  await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

// ── Listing (Eigentümer-Seite) ──────────────────────────────────────────────

export async function getListing(soulId) {
  return await readJson(listingPath(soulId));
}

export async function setListing(soulId, { mode, priceUsdc, durationHours }) {
  if (mode !== 'free' && mode !== 'sale') throw new Error('invalid_mode');
  const duration = Math.min(720, Math.max(1, Math.floor(Number(durationHours) || 24)));
  let price = null;
  if (mode === 'sale') {
    price = Number(priceUsdc);
    if (!(price > 0)) throw new Error('invalid_price');
    price = price.toFixed(6);
  }
  const listing = {
    mode,
    price_usdc: price,
    duration_hours: duration,
    created_at: new Date().toISOString(),
    active: true,
  };
  await writeJson(listingPath(soulId), listing);
  return listing;
}

export async function deactivateListing(soulId) {
  const listing = await getListing(soulId);
  if (!listing) return null;
  listing.active = false;
  await writeJson(listingPath(soulId), listing);
  return listing;
}

// ── Challenge (Käufer-Seite) ─────────────────────────────────────────────────

async function listChallengeFiles(soulId) {
  try {
    const entries = await readdir(transferDir(soulId));
    return entries.filter(e => e.startsWith('challenge_') && e.endsWith('.json'));
  } catch {
    return [];
  }
}

function isTerminal(status) {
  return status === 'completed' || status === 'cancelled' || status === 'expired';
}

// Findet die aktuell aktive (nicht abgelaufene, nicht terminale) Challenge
// dieser Soul, falls vorhanden — es ist bewusst immer nur eine gleichzeitig
// aktiv (kein Konkurrenz-/Ticket-System für mehrere Käufer heute).
export async function getActiveChallenge(soulId) {
  const files = await listChallengeFiles(soulId);
  const now = Date.now();
  for (const f of files) {
    const c = await readJson(`${transferDir(soulId)}/${f}`);
    if (!c) continue;
    if (isTerminal(c.status)) continue;
    if (new Date(c.expires_at).getTime() < now) {
      c.status = 'expired';
      await writeJson(`${transferDir(soulId)}/${f}`, c);
      continue;
    }
    return c;
  }
  return null;
}

export async function getChallenge(soulId, challengeId) {
  const c = await readJson(challengePath(soulId, challengeId));
  if (!c) return null;
  if (!isTerminal(c.status) && new Date(c.expires_at).getTime() < Date.now()) {
    c.status = 'expired';
    await writeJson(challengePath(soulId, challengeId), c);
  }
  return c;
}

export async function createChallenge(soulId) {
  const listing = await getListing(soulId);
  if (!listing || !listing.active) {
    const err = new Error('no_active_listing');
    err.code = 'no_active_listing';
    throw err;
  }
  const existing = await getActiveChallenge(soulId);
  if (existing) return existing;

  const challengeId = randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + listing.duration_hours * 3600_000);
  const challenge = {
    challenge_id: challengeId,
    soul_id: soulId,
    mode: listing.mode,
    price_usdc: listing.price_usdc,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    status: 'pending',
    buyer_wallet: null,
    buyer_signature: null,
    signed_at: null,
    payment_tx_hash: null,
    paid_at: null,
    completed_at: null,
    transfer_tx_hash: null,
  };
  await writeJson(challengePath(soulId, challengeId), challenge);
  return challenge;
}

export function confirmationMessage(soulId, challengeId) {
  return [
    'SYS Soul Transfer Confirmation',
    `soul_id: ${soulId}`,
    `challenge_id: ${challengeId}`,
    'I confirm I control this wallet and wish to receive this Soul.',
  ].join('\n');
}

export async function submitSignature(soulId, challengeId, wallet, signature) {
  const challenge = await getChallenge(soulId, challengeId);
  if (!challenge) throw Object.assign(new Error('challenge_not_found'), { code: 'challenge_not_found' });
  if (challenge.status !== 'pending') throw Object.assign(new Error('wrong_status'), { code: 'wrong_status', status: challenge.status });

  let recovered;
  try {
    recovered = ethers.verifyMessage(confirmationMessage(soulId, challengeId), signature);
  } catch {
    throw Object.assign(new Error('invalid_signature'), { code: 'invalid_signature' });
  }
  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    throw Object.assign(new Error('signature_mismatch'), { code: 'signature_mismatch' });
  }

  challenge.buyer_wallet = wallet;
  challenge.buyer_signature = signature;
  challenge.signed_at = new Date().toISOString();
  challenge.status = challenge.mode === 'free' ? 'ready' : 'signed';
  await writeJson(challengePath(soulId, challengeId), challenge);
  return challenge;
}

// Aktuellen On-Chain-Eigentümer lesen — Zahlungsziel UND spätere transferSoul()-
// Berechtigung hängen an dieser Adresse, nicht an der lokalen amort.wallet-
// Konfiguration (können auseinanderlaufen, on-chain ist hier maßgeblich).
export async function getOnChainOwner(soulId) {
  const contract = new ethers.Contract(CONTRACT_ADDRESS, OWNER_ABI, getProvider());
  const owner = await contract.soulOwner(soulIdToBytes32(soulId));
  const ZERO = '0x0000000000000000000000000000000000000000';
  return owner === ZERO ? null : owner;
}

// Verifiziert einen eingereichten USDC-Transfer (Polygon) gegen die Chain:
// echter, bestätigter Transfer vom Käufer-Wallet an den aktuellen Soul-
// Eigentümer, Betrag >= Angebotspreis. Normale Wallet-zu-Wallet-Überweisung
// (kein x402/EIP-3009) — der Käufer zahlt eigenes Gas, keine Facilitator-Rolle
// nötig, deutlich einfacher als das x402-Protokoll für diesen Anwendungsfall.
export async function submitPayment(soulId, challengeId, txHash) {
  const challenge = await getChallenge(soulId, challengeId);
  if (!challenge) throw Object.assign(new Error('challenge_not_found'), { code: 'challenge_not_found' });
  if (challenge.mode !== 'sale') throw Object.assign(new Error('not_a_sale'), { code: 'not_a_sale' });
  if (challenge.status !== 'signed') throw Object.assign(new Error('wrong_status'), { code: 'wrong_status', status: challenge.status });
  if (!challenge.buyer_wallet) throw Object.assign(new Error('not_signed_yet'), { code: 'not_signed_yet' });

  const provider = getProvider();
  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    throw Object.assign(new Error('tx_not_confirmed'), { code: 'tx_not_confirmed' });
  }

  const sellerAddr = await getOnChainOwner(soulId);
  if (!sellerAddr) throw Object.assign(new Error('seller_not_registered'), { code: 'seller_not_registered' });

  const requiredWei = ethers.parseUnits(challenge.price_usdc, 6);
  const padTopic = (addr) => ethers.zeroPadValue(addr.toLowerCase(), 32);
  const fromTopic = padTopic(challenge.buyer_wallet);
  const toTopic   = padTopic(sellerAddr);

  const match = receipt.logs.find(log =>
    log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
    log.topics[0] === TRANSFER_TOPIC &&
    log.topics[1]?.toLowerCase() === fromTopic &&
    log.topics[2]?.toLowerCase() === toTopic &&
    BigInt(log.data) >= requiredWei
  );
  if (!match) {
    throw Object.assign(new Error('payment_not_found'), { code: 'payment_not_found' });
  }

  challenge.payment_tx_hash = txHash;
  challenge.paid_at = new Date().toISOString();
  challenge.status = 'ready';
  await writeJson(challengePath(soulId, challengeId), challenge);
  return challenge;
}

// Vom Eigentümer aufgerufen, NACHDEM er selbst transferSoul() erfolgreich
// on-chain ausgeführt hat (eigene Wallet, siehe Frontend) — schließt die
// Challenge ab und deaktiviert das Listing (Soul hat jetzt einen neuen
// Eigentümer, ein altes Listing wäre irreführend).
export async function markCompleted(soulId, challengeId, transferTxHash) {
  const challenge = await getChallenge(soulId, challengeId);
  if (!challenge) throw Object.assign(new Error('challenge_not_found'), { code: 'challenge_not_found' });
  if (challenge.status !== 'ready') throw Object.assign(new Error('wrong_status'), { code: 'wrong_status', status: challenge.status });

  challenge.status = 'completed';
  challenge.completed_at = new Date().toISOString();
  challenge.transfer_tx_hash = transferTxHash || null;
  await writeJson(challengePath(soulId, challengeId), challenge);
  await deactivateListing(soulId);
  return challenge;
}

export async function cancelChallenge(soulId, challengeId) {
  const challenge = await getChallenge(soulId, challengeId);
  if (!challenge) return null;
  if (isTerminal(challenge.status)) return challenge;
  challenge.status = 'cancelled';
  await writeJson(challengePath(soulId, challengeId), challenge);
  return challenge;
}

// Best-effort Aufräumen alter, terminaler Challenge-Dateien — analog
// sweepExpiredConsentTxt in eu_withdrawal_terms.mjs, opportunistisch getriggert,
// kein eigener Timer.
export async function sweepOldChallenges(soulId, maxAgeDays = 30) {
  const files = await listChallengeFiles(soulId);
  const maxAgeMs = maxAgeDays * 86400_000;
  const now = Date.now();
  for (const f of files) {
    const path = `${transferDir(soulId)}/${f}`;
    const c = await readJson(path);
    if (!c || !isTerminal(c.status)) continue;
    const ts = new Date(c.completed_at || c.created_at).getTime();
    if (now - ts > maxAgeMs) await unlink(path).catch(() => {});
  }
}
