// ── Owner-Tools (service_token / OAuth) ──────────────────────────────────────
import { register as soulRead }              from './soul_read.mjs';
import { register as soulWrite }             from './soul_write.mjs';
import { register as soulDelete }            from './soul_delete.mjs';
import { register as bemeChat }              from './beme_chat.mjs';
import { register as vaultManifest }         from './vault_manifest.mjs';
import { register as audioList }             from './audio_list.mjs';
import { register as audioGet }              from './audio_get.mjs';
import { register as imageList }             from './image_list.mjs';
import { register as imageGet }              from './image_get.mjs';
import { register as videoList }             from './video_list.mjs';
import { register as videoGet }              from './video_get.mjs';
import { register as contextList }           from './context_list.mjs';
import { register as contextGet }            from './context_get.mjs';
import { register as calendarRead }          from './calendar_read.mjs';
import { register as verifyHuman }           from './verify_human.mjs';
import { register as soulEarnings }          from './soul_earnings.mjs';
import { register as soulDiscover }          from './soul_discover.mjs';
import { register as soulMaturity }          from './soul_maturity.mjs';
import { register as soulSkills }            from './soul_skills.mjs';
import { register as profileGet }            from './profile_get.mjs';
import { register as profileSave }           from './profile_save.mjs';
import { register as soulCloudPush }         from './soul_cloud_push.mjs';
import { register as elevenLabsAgentUpdate } from './elevenlabs_agent_update.mjs';
import { register as soulPayRead }           from './soul_pay_read.mjs';
import { register as soulReadByToken }       from './soul_read_by_token.mjs';
import { register as soulPaidComment }       from './soul_paid_comment.mjs';
import { register as mindRead }              from './mind_read.mjs';
import { register as mindWrite }             from './mind_write.mjs';
import { register as healthCheck }           from './health_check.mjs';
import { register as foodLog }               from './food_log.mjs';
import { register as healthSync }            from './health_sync.mjs';

// ── Owner Filesystem-Tools ────────────────────────────────────────────────────
import { register as shopWriteRead }         from './shop_write_read.mjs';
import { register as shopLog }               from './shop_log.mjs';
import { register as contextWrite }          from './context_write.mjs';
import { register as twilioCallConfig }      from './twilio_call_config.mjs';

// ── Owner API-Tools (neu) ─────────────────────────────────────────────────────
import { register as webSearch }             from './web_search.mjs';

// ── Peer Messaging (MCP-WhatsApp) ─────────────────────────────────────────────
import { register as peerInbox }             from './peer_inbox.mjs';
import { register as peerSend }              from './peer_send.mjs';

// ── Paid-only Filesystem-Tools ────────────────────────────────────────────────
import { register as healthCheckPayed }      from './health_check_payed.mjs';

// ── Paid-Agent / Peer – Filesystem-basierte Varianten ────────────────────────
import { register as soulReadPaid }          from './soul_read_paid.mjs';
import { register as soulReadPeer }          from './soul_read_peer.mjs';
import { register as verifyHumanPeer }       from './verify_human_peer.mjs';
import { register as soulMaturityPeer }      from './soul_maturity_peer.mjs';
import { register as soulSkillsPeer }        from './soul_skills_peer.mjs';
import { register as soulWritePeer }         from './soul_write_peer.mjs';
import { register as calendarReadPeer }      from './calendar_read_peer.mjs';
import { register as profileGetPeer }        from './profile_get_peer.mjs';
import { registerList as vaultListPeer }     from './vault_list_peer.mjs';
import { registerGet as vaultGetPeer }       from './vault_get_peer.mjs';
import { register as videoGetPeer }          from './video_get_peer.mjs';
import { register as contextGetPeer }        from './context_get_peer.mjs';
import { register as soulCommentPeer }       from './soul_comment_peer.mjs';

/**
 * Registriert alle MCP-Tools für den Soul-Inhaber (service_token / OAuth).
 * @param {string} soulId  — owner soul_id (für Filesystem-basierte Tools); optional
 */
export function registerTools(server, token, soulId = null) {
  soulRead(server, token);
  soulWrite(server, token);
  soulDelete(server, token);
  bemeChat(server, token);
  soulMaturity(server, token);
  verifyHuman(server, token);
  soulEarnings(server, token);
  soulDiscover(server, token);
  vaultManifest(server, token);
  audioList(server, token);
  audioGet(server, token);
  imageList(server, token);
  imageGet(server, token);
  videoList(server, token);
  videoGet(server, token);
  contextList(server, token);
  contextGet(server, token);
  calendarRead(server, token);
  profileGet(server, token);
  profileSave(server, token);
  soulSkills(server, token);
  soulCloudPush(server, token);
  elevenLabsAgentUpdate(server, token);
  soulPayRead(server, token);
  soulReadByToken(server, token);
  soulPaidComment(server, token);
  mindRead(server, token);
  mindWrite(server, token);
  healthCheck(server, token);
  foodLog(server, token);
  healthSync(server, token);
  webSearch(server, token);
  twilioCallConfig(server, token);
  peerInbox(server, token);
  peerSend(server, token);
  if (soulId) shopWriteRead(server, soulId);
  if (soulId) shopLog(server, soulId);
  if (soulId) contextWrite(server, soulId);
}

/**
 * Registriert Free-Tools für bezahlte externe Agenten (pol_access_token).
 *
 * Vault-Media-Endpunkte (audio/images/video/context/profile) akzeptiert
 * vault_auth.lua bereits für pol_access_token → bestehende Tool-Implementierungen
 * funktionieren direkt.
 * Alle anderen Tools (soul_read, verify_human, soul_maturity, calendar_read,
 * soul_skills) benötigen Filesystem-Varianten da /api/soul für pol_access_token
 * gesperrt ist.
 *
 * @param {object} server  — McpServer
 * @param {string} polToken — pol_access_token (48 Hex-Zeichen)
 * @param {string[]} agentTools — Array erlaubter Tool-Namen
 * @param {string} soulId — soul_id des Ziel-Souls (für Filesystem-basierte Tools)
 */
export function registerPaidTools(server, polToken, agentTools = [], soulId) {
  const allowed = new Set(agentTools.length ? agentTools : ['soul_read', 'verify_human', 'soul_maturity']);

  // soul_read: spezieller paid-read Endpoint (liefert nur AGENT-Block)
  if (allowed.has('soul_read'))     soulReadPaid(server, polToken);

  // verify_human: /api/vault/manifest ist für pol_access_token gesperrt →
  // blockchain direkt mit bekannter soul_id aufrufen
  if (allowed.has('verify_human') && soulId) verifyHumanPeer(server, soulId);

  // soul_maturity: /api/soul gesperrt für pol → Filesystem
  if (allowed.has('soul_maturity') && soulId) soulMaturityPeer(server, soulId);

  // soul_skills: /api/soul gesperrt → Filesystem
  if (allowed.has('soul_skills') && soulId) soulSkillsPeer(server, soulId);

  // calendar_read: /api/soul gesperrt → Filesystem
  if (allowed.has('calendar_read') && soulId) calendarReadPeer(server, soulId);

  // soul_discover: interner Endpoint, kein Auth nötig — immer verfügbar
  soulDiscover(server, polToken);

  // Vault-Media: vault_auth.lua akzeptiert pol_access_token für diese Pfade
  if (allowed.has('audio_list'))    audioList(server, polToken);
  if (allowed.has('audio_get'))     audioGet(server, polToken);
  if (allowed.has('image_list'))    imageList(server, polToken);
  if (allowed.has('image_get'))     imageGet(server, polToken);
  if (allowed.has('video_list'))    videoList(server, polToken);
  if (allowed.has('video_get'))     videoGet(server, polToken);
  if (allowed.has('context_list'))  contextList(server, polToken);
  if (allowed.has('context_get'))   contextGet(server, polToken);
  if (allowed.has('profile_get'))   profileGet(server, polToken);

  // soul_paid_comment: Immer verfügbar für zahlende Agenten (Token bereits vorhanden)
  soulPaidComment(server, polToken);

  // health_check_payed: Gesundheitsdaten für bezahlte externe Agenten
  if (allowed.has('health_check_payed') && soulId) healthCheckPayed(server, soulId);

  // shop_write_read: Shopping-Daten für bezahlte externe Agenten
  if (allowed.has('shop_write_read') && soulId) shopWriteRead(server, soulId);

  // soul_write: Zahlende externe Agenten dürfen nicht schreiben (Sicherheit)
  // soul_earnings: Private Einnahmen-Daten, nicht für externe Agenten
}

/**
 * Registriert alle MCP-Tools für vertrauenswürdige Peer-Souls (soul_cert-Auth).
 * Peers erhalten uneingeschränkten Zugriff auf alle Tools — kein freeTools-Filter.
 * Alle Tools lesen direkt vom Dateisystem — OpenResty-Auth wird umgangen
 * (Peer-Cert ist auf dem Ziel-Server nicht gültig).
 *
 * @param {object} server       — McpServer
 * @param {string} peerToken    — Peer-Soul-Cert (für soul_discover)
 * @param {string[]} _freeTools — ignoriert (Peers erhalten immer alle Tools)
 * @param {string} targetSoulId — soul_id des Ziel-Souls auf diesem Server
 */
export function registerPeerTools(server, peerToken, _freeTools = [], targetSoulId) {
  soulReadPeer(server, targetSoulId);
  verifyHumanPeer(server, targetSoulId);
  soulMaturityPeer(server, targetSoulId);
  soulSkillsPeer(server, targetSoulId);
  calendarReadPeer(server, targetSoulId);
  profileGetPeer(server, targetSoulId);
  soulWritePeer(server, targetSoulId);

  // Vault-Media (Filesystem-basierte Varianten)
  vaultListPeer(server, targetSoulId, 'audio');
  vaultGetPeer(server, targetSoulId, 'audio');
  vaultListPeer(server, targetSoulId, 'images');
  vaultGetPeer(server, targetSoulId, 'images');
  vaultListPeer(server, targetSoulId, 'video');
  videoGetPeer(server, targetSoulId);
  vaultListPeer(server, targetSoulId, 'context');
  contextGetPeer(server, targetSoulId);

  // soul_discover: interner Endpoint, kein Auth nötig — immer verfügbar
  soulDiscover(server, peerToken);

  // soul_comment: immer verfügbar für vertrauenswürdige Peers
  soulCommentPeer(server, peerToken, targetSoulId);

  // soul_earnings: Private Finanz-Daten — nicht für Peers freigegeben
}
