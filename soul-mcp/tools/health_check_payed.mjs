/**
 * health_check_payed — Paid-Agent-Variante.
 * Liest health.md direkt vom Dateisystem (kein API-Zugriff nötig).
 * Gleiche Analyse-Logik wie health_check, aber für externe bezahlte Agenten.
 */

import { readFile } from 'fs/promises';
import { decryptIfNeeded, loadVaultMeta, SOULS_DIR } from '../lib/vault_fs.mjs';

// ── Reference ranges ──────────────────────────────────────────────────────────

const HR_RANGES = [
  { max: 40,  status: 'very_low',  label: 'Sehr niedrig', tip: 'Unter 40 bpm. Bei Schwindel oder Erschöpfung ärztlich abklären. Kann bei sehr gut trainierten Sportlern normal sein.' },
  { max: 60,  status: 'athletic',  label: 'Athletisch',   tip: 'Unter 60 bpm — Zeichen guter kardiovaskulärer Fitness. Halten.' },
  { max: 70,  status: 'good',      label: 'Gut',          tip: 'Guter Ruhepuls. Mit regelmäßigem Ausdauertraining weiter optimierbar.' },
  { max: 80,  status: 'normal',    label: 'Normal',       tip: 'Normaler Bereich. 2–3× wöchentliches Ausdauertraining kann den Puls langfristig senken.' },
  { max: 100, status: 'elevated',  label: 'Erhöht',       tip: 'Leicht erhöht. Häufige Ursachen: Stress, Schlafmangel, zu wenig Bewegung, Koffein. Aerobic-Training und Schlafhygiene helfen.' },
  { max: 999, status: 'high',      label: 'Hoch',         tip: 'Über 100 bpm im Ruhezustand. Tachykardie-Bereich — ärztliche Abklärung empfehlenswert.' },
];

const SLEEP_RANGES = [
  { max: 300, status: 'critical',   label: 'Kritisch',  tip: 'Unter 5h — schweres Schlafdefizit.' },
  { max: 360, status: 'too_low',    label: 'Zu wenig',  tip: 'Unter 6h — unter der Mindestempfehlung für Erwachsene.' },
  { max: 420, status: 'borderline', label: 'Knapp',     tip: '6–7h — leicht unter der Empfehlung.' },
  { max: 540, status: 'optimal',    label: 'Optimal',   tip: '7–9h — idealer Bereich.' },
  { max: 999, status: 'long',       label: 'Viel',      tip: 'Über 9h — erhöhter Erholungsbedarf.' },
];

const STEPS_RANGES = [
  { max: 3000,  status: 'sedentary',   label: 'Sitzend',     tip: 'Unter 3.000 — sehr geringes Aktivitätsniveau.' },
  { max: 5000,  status: 'low',         label: 'Wenig aktiv', tip: '3.000–5.000 Schritte.' },
  { max: 7500,  status: 'moderate',    label: 'Mäßig aktiv', tip: '5.000–7.500 Schritte.' },
  { max: 10000, status: 'active',      label: 'Aktiv',       tip: '7.500–10.000 Schritte — empfohlener Bereich.' },
  { max: 99999, status: 'very_active', label: 'Sehr aktiv',  tip: 'Über 10.000 Schritte.' },
];

const ACTIVE_DAYS_RATINGS = [
  { min: 0, max: 1, status: 'low',      label: 'Kaum aktiv'   },
  { min: 2, max: 3, status: 'moderate', label: 'Mäßig'        },
  { min: 4, max: 5, status: 'good',     label: 'Gut'          },
  { min: 6, max: 7, status: 'great',    label: 'Ausgezeichnet' },
];

const STATUS_SCORE = {
  athletic: 5, optimal: 5, very_active: 5, great: 5,
  good: 4,
  normal: 3, active: 3, moderate: 3,
  borderline: 2, low: 2,
  elevated: 1, too_low: 1, sedentary: 1,
  critical: 0, high: 0, very_low: 0,
};

function classifyRange(value, ranges) {
  if (value == null) return null;
  for (const r of ranges) { if (value <= r.max) return { status: r.status, label: r.label, tip: r.tip }; }
  return null;
}
function classifyActiveDays(value) {
  if (value == null) return null;
  for (const r of ACTIVE_DAYS_RATINGS) { if (value >= r.min && value <= r.max) return { status: r.status, label: r.label }; }
  return null;
}
function parseSleepLine(line) {
  const hM = line.match(/(\d+)h/), mM = line.match(/(\d+)min/);
  if (!hM && !mM) return null;
  return (hM ? parseInt(hM[1], 10) * 60 : 0) + (mM ? parseInt(mM[1], 10) : 0);
}
function parseStepsLine(line) {
  const m = line.match(/([\d.]+)\s*\(avg\)/);
  return m ? parseInt(m[1].replace(/\./g, ''), 10) : null;
}
function parseHrLine(line)  { const m = line.match(/(\d+)\s*bpm/); return m ? parseInt(m[1], 10) : null; }
function parseIntLine(line) { const m = line.match(/(\d+)/);       return m ? parseInt(m[1], 10) : null; }
function fmtSleep(min)      { return min == null ? null : `${Math.floor(min / 60)}h ${min % 60}min`; }

function parseRecentActivities(text) {
  const block = text.match(/## Recent Activities\n([\s\S]*?)(?=\n##|$)/);
  if (!block) return [];
  const activities = [];
  for (const line of block[1].split('\n')) {
    const m = line.match(/^- (\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\d+)\s*min(?:\s+([\d.]+)\s*km)?(?:\s+♥\s*([\d.]+)\s*bpm)?/);
    if (m) activities.push({ date: m[1], type: m[2], duration_min: parseInt(m[3], 10), distance_km: m[4] ? parseFloat(m[4]) : null, avg_hr: m[5] ? parseFloat(m[5]) : null });
  }
  return activities;
}

function parseHealthMd(text) {
  const result = { source: null, last_sync: null, weekly: {}, monthly: {}, recent_activities: [] };
  const sourceM = text.match(/^source:\s*(.+)$/m);
  const syncM   = text.match(/^last_sync:\s*(.+)$/m);
  if (sourceM) result.source    = sourceM[1].trim();
  if (syncM)   result.last_sync = syncM[1].trim();

  const weeklyBlock  = text.match(/## This Week[^\n]*\n([\s\S]*?)(?=\n##|$)/);
  const monthlyBlock = text.match(/## Monthly Summary[^\n]*\n([\s\S]*?)(?=\n##|$)/);

  function parseBlock(block, target) {
    if (!block) return;
    for (const line of block[1].split('\n')) {
      if (/Resting HR/i.test(line))   target.resting_hr    = parseHrLine(line);
      if (/Sleep/i.test(line))        target.sleep_minutes  = parseSleepLine(line);
      if (/Steps/i.test(line))        target.steps          = parseStepsLine(line);
      if (/Active days/i.test(line))  target.active_days    = parseIntLine(line);
    }
  }
  parseBlock(weeklyBlock,  result.weekly);
  parseBlock(monthlyBlock, result.monthly);
  result.recent_activities = parseRecentActivities(text);
  return result;
}

function overallStatus(items) {
  const scores = items.filter(Boolean).map(i => STATUS_SCORE[i.status] ?? 2);
  if (!scores.length) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 4.2) return { status: 'excellent', label: 'Sehr gut' };
  if (avg >= 3.2) return { status: 'good',      label: 'Gut' };
  if (avg >= 2.0) return { status: 'fair',      label: 'Verbesserungspotenzial' };
  return          { status: 'poor',             label: 'Aufmerksamkeit empfohlen' };
}

export function register(server, soulId) {
  server.tool(
    'health_check_payed',
    'Liest health.md und gibt eine vollständige Gesundheitsübersicht zurück: Körpermetriken (Ruhepuls, Schlaf, Schritte, aktive Tage) mit evidenzbasierten Bewertungen sowie Recent Activities. Für bezahlte externe Agenten.',
    {},
    async () => {
      try {
        const { vaultKeyHex } = await loadVaultMeta(soulId);
        const buf = await readFile(`${SOULS_DIR}${soulId}/vault/context/health.md`);
        const text = decryptIfNeeded(buf, vaultKeyHex).toString('utf8');

        const parsed = parseHealthMd(text);
        const w = parsed.weekly;
        const m = parsed.monthly;
        const hrClass      = classifyRange(w.resting_hr,    HR_RANGES);
        const sleepClass   = classifyRange(w.sleep_minutes, SLEEP_RANGES);
        const stepsClass   = classifyRange(w.steps,         STEPS_RANGES);
        const activeDaysCl = classifyActiveDays(w.active_days);
        const overall      = overallStatus([hrClass, sleepClass, stepsClass, activeDaysCl]);
        const tips         = [hrClass, sleepClass, stepsClass]
          .filter(c => c && !['athletic', 'optimal', 'very_active', 'good', 'active'].includes(c.status))
          .map(c => c.tip);

        let hrTrend = null;
        if (w.resting_hr != null && m.resting_hr != null) {
          const diff = w.resting_hr - m.resting_hr;
          hrTrend = diff <= -3 ? 'improving' : diff >= 3 ? 'worsening' : 'stable';
        }

        const ageDays = parsed.last_sync ? Math.floor((Date.now() - new Date(parsed.last_sync).getTime()) / 86_400_000) : null;

        return { content: [{ type: 'text', text: JSON.stringify({
          available: true,
          source:    parsed.source,
          last_sync: parsed.last_sync,
          data_age_days: ageDays,
          data_stale:    ageDays != null && ageDays > 9,
          weekly: {
            resting_hr:  { value: w.resting_hr,    unit: 'bpm',       formatted: w.resting_hr ? `${w.resting_hr} bpm` : null, ...hrClass },
            sleep:       { value: w.sleep_minutes,  unit: 'min',       formatted: fmtSleep(w.sleep_minutes), ...sleepClass },
            steps:       { value: w.steps,          unit: 'steps/day', ...stepsClass },
            active_days: { value: w.active_days,    of: 7,             ...activeDaysCl },
          },
          monthly: {
            resting_hr:  { value: m.resting_hr },
            sleep:       { value: m.sleep_minutes, formatted: fmtSleep(m.sleep_minutes) },
            active_days: { value: m.active_days },
          },
          hr_trend:          hrTrend,
          overall,
          tips,
          recent_activities: parsed.recent_activities,
        }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ available: false, message: `health.md nicht verfügbar: ${err.message}` }, null, 2) }] };
      }
    }
  );
}
