/**
 * health_check — reads health.md from vault/context, parses metrics,
 * applies evidence-based reference ranges and returns a structured analysis
 * the SoulKI can use to have an informed, personalised health conversation.
 *
 * Reference sources: WHO physical activity guidelines, ESC resting HR norms,
 * National Sleep Foundation recommendations.
 */

import { getText } from '../lib/api.mjs';

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
  { max: 300, status: 'critical',   label: 'Kritisch',      tip: 'Unter 5h — schweres Schlafdefizit. Kognition, Immunsystem und Herzgesundheit sind messbar beeinträchtigt. Dringend priorisieren.' },
  { max: 360, status: 'too_low',    label: 'Zu wenig',      tip: 'Unter 6h — unter der Mindestempfehlung für Erwachsene. Konsistente Schlafzeiten und ein bildschirmfreies Abendritual helfen.' },
  { max: 420, status: 'borderline', label: 'Knapp',         tip: '6–7h — leicht unter der Empfehlung. Ziel: 7h+ durch frühere Schlafenszeit oder reduzierte Abendroutine.' },
  { max: 540, status: 'optimal',    label: 'Optimal',       tip: '7–9h — idealer Bereich. Kognition, Erholung und Stimmung profitieren. Beibehalten.' },
  { max: 999, status: 'long',       label: 'Viel',          tip: 'Über 9h — kann auf erhöhten Erholungsbedarf, Schlafschulden-Abbau oder andere Faktoren hinweisen.' },
];

const STEPS_RANGES = [
  { max: 3000,  status: 'sedentary',   label: 'Sitzend',      tip: 'Unter 3.000 — sehr geringes Aktivitätsniveau. Selbst kurze Gehpausen von 5 Min/Stunde machen einen messbaren Unterschied.' },
  { max: 5000,  status: 'low',         label: 'Wenig aktiv',  tip: '3.000–5.000 Schritte. Kleine Änderungen helfen: Treppe statt Aufzug, 10-Min-Spaziergang nach dem Mittagessen.' },
  { max: 7500,  status: 'moderate',    label: 'Mäßig aktiv',  tip: '5.000–7.500 Schritte. WHO-Ziel: 7.500+. Ein zusätzlicher 15-Min-Spaziergang täglich reicht oft.' },
  { max: 10000, status: 'active',      label: 'Aktiv',        tip: '7.500–10.000 Schritte — im empfohlenen Bereich. Signifikant reduziertes Risiko für Herz-Kreislauf-Erkrankungen.' },
  { max: 99999, status: 'very_active', label: 'Sehr aktiv',   tip: 'Über 10.000 Schritte — ausgezeichnete Alltagsaktivität.' },
];

const ACTIVE_DAYS_RATINGS = [
  { min: 0, max: 1, status: 'low',      label: 'Kaum aktiv'  },
  { min: 2, max: 3, status: 'moderate', label: 'Mäßig'       },
  { min: 4, max: 5, status: 'good',     label: 'Gut'         },
  { min: 6, max: 7, status: 'great',    label: 'Ausgezeichnet'},
];

// ── Parsers ───────────────────────────────────────────────────────────────────

function classifyRange(value, ranges) {
  if (value == null) return null;
  for (const r of ranges) {
    if (value <= r.max) return { status: r.status, label: r.label, tip: r.tip };
  }
  return null;
}

function classifyActiveDays(value) {
  if (value == null) return null;
  for (const r of ACTIVE_DAYS_RATINGS) {
    if (value >= r.min && value <= r.max) return { status: r.status, label: r.label };
  }
  return null;
}

function parseSleepLine(line) {
  // "7h 12min (avg)" or "6h 58min (avg)" or just "7h (avg)"
  const hMatch = line.match(/(\d+)h/);
  const mMatch = line.match(/(\d+)min/);
  if (!hMatch && !mMatch) return null;
  return (hMatch ? parseInt(hMatch[1], 10) * 60 : 0) + (mMatch ? parseInt(mMatch[1], 10) : 0);
}

function parseStepsLine(line) {
  // "8.432 (avg)" — German thousands separator (dot), strip it
  const m = line.match(/([\d.]+)\s*\(avg\)/);
  if (!m) return null;
  return parseInt(m[1].replace(/\./g, ''), 10);
}

function parseHrLine(line) {
  const m = line.match(/(\d+)\s*bpm/);
  return m ? parseInt(m[1], 10) : null;
}

function parseIntLine(line) {
  const m = line.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseFoodLog(text) {
  const foodBlock   = text.match(/## Food Log\n([\s\S]*?)(?=\n##|$)/);
  const annualBlock = text.match(/## Annual Journal\n([\s\S]*?)(?=\n##|$)/);

  const entries = [];
  if (foodBlock) {
    for (const line of foodBlock[1].split('\n')) {
      const m = line.match(/^- (\d{4}-\d{2}-\d{2}) \| ([ABCDE]) \| (.+)$/);
      if (m) entries.push({ date: m[1], rating: m[2], label: m[3] });
    }
  }

  function isoWeek(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const year = d.getUTCFullYear();
    const startOfYear = new Date(Date.UTC(year, 0, 1));
    const week = Math.ceil(((d - startOfYear) / 86400000 + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  function gradeFromScore(sc) {
    return sc >= 4.5 ? 'A' : sc >= 3.5 ? 'B' : sc >= 2.5 ? 'C' : sc >= 1.5 ? 'D' : 'E';
  }

  function computeStats(subset) {
    const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const e of subset) counts[e.rating]++;
    const total = subset.length;
    let avg_grade = null;
    if (total > 0) {
      const sc = (counts.A * 5 + counts.B * 4 + counts.C * 3 + counts.D * 2 + counts.E) / total;
      avg_grade = gradeFromScore(sc);
    }
    return { total, counts, avg_grade };
  }

  const today        = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const currentWeek  = isoWeek(today);

  const thisMonth      = entries.filter(e => e.date.startsWith(currentMonth));
  const thisWeekEntries = entries.filter(e => isoWeek(e.date) === currentWeek);

  const monthStats = computeStats(thisMonth);
  const topMeals   = [];
  for (const e of thisMonth) {
    if ('AB'.includes(e.rating)) topMeals.push(e.label.split(' — ')[0].trim());
  }

  // Weekly averages from raw entries (current month + any recent entries in Food Log)
  const weekMap = {};
  for (const e of entries) {
    const w = isoWeek(e.date);
    if (!weekMap[w]) weekMap[w] = [];
    weekMap[w].push(e);
  }
  const weekly_averages = Object.keys(weekMap)
    .sort((a, b) => b.localeCompare(a))
    .map(week => {
      const stats = computeStats(weekMap[week]);
      return { week, ...stats };
    });

  // Annual journal — last 12 monthly summaries (include Weeks line)
  const annualEntries = [];
  if (annualBlock) {
    const monthBlocks = annualBlock[1].split(/(?=### \d{4}-\d{2})/);
    for (const block of monthBlocks.slice(0, 12)) {
      const head = block.match(/### (\d{4}-\d{2})/);
      if (!head) continue;
      annualEntries.push({ month: head[1], summary: block.trim() });
    }
  }

  return {
    recent_entries: entries.slice(0, 10),
    this_week: {
      week: currentWeek,
      meals: thisWeekEntries.map(e => `${e.date} ${e.rating} ${e.label}`),
      ...computeStats(thisWeekEntries),
    },
    this_month: {
      month: currentMonth,
      ...monthStats,
      top_meals: [...new Set(topMeals)].slice(0, 3),
    },
    weekly_averages,
    annual: annualEntries,
  };
}

function parseHealthMd(text) {
  const result = {
    source: null, last_sync: null,
    weekly: { resting_hr: null, sleep_minutes: null, steps: null, active_days: null },
    monthly: { resting_hr: null, sleep_minutes: null, active_days: null },
    food: null,
  };

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
  result.food = parseFoodLog(text);
  return result;
}

// ── Overall score ─────────────────────────────────────────────────────────────

const STATUS_SCORE = {
  athletic: 5, optimal: 5, very_active: 5, great: 5,
  good: 4,
  normal: 3, active: 3, moderate: 3,
  borderline: 2, low: 2,
  elevated: 1, too_low: 1, sedentary: 1,
  critical: 0, high: 0, very_low: 0,
};

function overallStatus(items) {
  const scores = items.filter(Boolean).map(i => STATUS_SCORE[i.status] ?? 2);
  if (!scores.length) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 4.2) return { status: 'excellent', label: 'Sehr gut' };
  if (avg >= 3.2) return { status: 'good',      label: 'Gut' };
  if (avg >= 2.0) return { status: 'fair',      label: 'Verbesserungspotenzial' };
  return          { status: 'poor',      label: 'Aufmerksamkeit empfohlen' };
}

// ── Data age ──────────────────────────────────────────────────────────────────

function dataDays(lastSync) {
  if (!lastSync) return null;
  const ms = Date.now() - new Date(lastSync).getTime();
  return Math.floor(ms / 86_400_000);
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtSleep(minutes) {
  if (minutes == null) return null;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function fmtSteps(v) {
  if (v == null) return null;
  return v.toLocaleString('de-DE');
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function register(server, token) {
  server.tool(
    'health_check',
    'Liest health.md und gibt eine vollständige Gesundheitsübersicht zurück: Körpermetriken (Ruhepuls, Schlaf, Schritte, aktive Tage) mit evidenzbasierten Bewertungen (WHO/ESC/NSF) sowie Food-Log-Auswertung (aktuelle Mahlzeiten, Monatsstatistik, Annual Journal). Einziges Tool für alle Gesundheitsdaten. Setzt Health-Sync voraus (bash /opt/sys/health-sync/install.sh).',
    {},
    async () => {
      let rawText;
      try {
        rawText = await getText('/api/vault/context/health.md', token);
      } catch {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            available: false,
            message: 'health.md nicht gefunden. Das Health-Sync-Experiment ist noch nicht aktiviert. Aktivierung: bash /opt/sys/health-sync/install.sh',
          }, null, 2) }],
        };
      }

      const parsed  = parseHealthMd(rawText);
      const ageDays = dataDays(parsed.last_sync);
      const w = parsed.weekly;
      const m = parsed.monthly;

      const hrClass      = classifyRange(w.resting_hr,    HR_RANGES);
      const sleepClass   = classifyRange(w.sleep_minutes, SLEEP_RANGES);
      const stepsClass   = classifyRange(w.steps,         STEPS_RANGES);
      const activeDaysCl = classifyActiveDays(w.active_days);

      const overall = overallStatus([hrClass, sleepClass, stepsClass, activeDaysCl]);

      // Collect actionable tips
      const tips = [hrClass, sleepClass, stepsClass]
        .filter(c => c && !['athletic', 'optimal', 'very_active', 'good', 'active'].includes(c.status))
        .map(c => c.tip);

      // Trend: compare weekly vs monthly resting HR
      let hrTrend = null;
      if (w.resting_hr != null && m.resting_hr != null) {
        const diff = w.resting_hr - m.resting_hr;
        if (diff <= -3)      hrTrend = 'improving';
        else if (diff >= 3)  hrTrend = 'worsening';
        else                 hrTrend = 'stable';
      }

      const result = {
        available:  true,
        source:     parsed.source,
        last_sync:  parsed.last_sync,
        data_age_days: ageDays,
        data_stale: ageDays != null && ageDays > 9,

        weekly: {
          resting_hr:  { value: w.resting_hr,    unit: 'bpm',       formatted: w.resting_hr ? `${w.resting_hr} bpm` : null, ...hrClass },
          sleep:       { value: w.sleep_minutes,  unit: 'min',       formatted: fmtSleep(w.sleep_minutes), ...sleepClass },
          steps:       { value: w.steps,          unit: 'steps/day', formatted: fmtSteps(w.steps), ...stepsClass },
          active_days: { value: w.active_days,    of: 7,             ...activeDaysCl },
        },

        monthly: {
          resting_hr:  { value: m.resting_hr,    formatted: m.resting_hr ? `${m.resting_hr} bpm` : null },
          sleep:       { value: m.sleep_minutes,  formatted: fmtSleep(m.sleep_minutes) },
          active_days: { value: m.active_days },
        },

        hr_trend: hrTrend,
        overall,
        tips,
        food: parsed.food,
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
