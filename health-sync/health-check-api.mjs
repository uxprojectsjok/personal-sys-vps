#!/usr/bin/env node
// Standalone health check — called by health_check_api.lua
// Usage: node health-check-api.mjs /path/to/health.md
// Output: { tips: string[], summary: [...], overall: {...} }

import { readFileSync } from 'fs'

const healthMdPath = process.argv[2]
if (!healthMdPath) {
  process.stdout.write(JSON.stringify({ tips: [] }))
  process.exit(0)
}

let text = ''
try {
  text = readFileSync(healthMdPath, 'utf8')
} catch {
  process.stdout.write(JSON.stringify({ tips: [] }))
  process.exit(0)
}

// ── Reference ranges ──────────────────────────────────────────────────────────

const HR_RANGES = [
  { max: 40,  status: 'very_low',  label: 'Sehr niedrig', tip: 'Unter 40 bpm. Bei Schwindel oder Erschöpfung ärztlich abklären. Kann bei sehr gut trainierten Sportlern normal sein.' },
  { max: 60,  status: 'athletic',  label: 'Athletisch',   tip: 'Unter 60 bpm — Zeichen guter kardiovaskulärer Fitness. Halten.' },
  { max: 70,  status: 'good',      label: 'Gut',          tip: 'Guter Ruhepuls. Mit regelmäßigem Ausdauertraining weiter optimierbar.' },
  { max: 80,  status: 'normal',    label: 'Normal',       tip: 'Normaler Bereich. 2–3× wöchentliches Ausdauertraining kann den Puls langfristig senken.' },
  { max: 100, status: 'elevated',  label: 'Erhöht',       tip: 'Leicht erhöht. Häufige Ursachen: Stress, Schlafmangel, zu wenig Bewegung, Koffein. Aerobic-Training und Schlafhygiene helfen.' },
  { max: 999, status: 'high',      label: 'Hoch',         tip: 'Über 100 bpm im Ruhezustand. Tachykardie-Bereich — ärztliche Abklärung empfehlenswert.' },
]

const SLEEP_RANGES = [
  { max: 300, status: 'critical',   label: 'Kritisch',  tip: 'Unter 5h — schweres Schlafdefizit. Kognition, Immunsystem und Herzgesundheit sind messbar beeinträchtigt. Dringend priorisieren.' },
  { max: 360, status: 'too_low',    label: 'Zu wenig',  tip: 'Unter 6h — unter der Mindestempfehlung für Erwachsene. Konsistente Schlafzeiten und ein bildschirmfreies Abendritual helfen.' },
  { max: 420, status: 'borderline', label: 'Knapp',     tip: '6–7h — leicht unter der Empfehlung. Ziel: 7h+ durch frühere Schlafenszeit oder reduzierte Abendroutine.' },
  { max: 540, status: 'optimal',    label: 'Optimal',   tip: '7–9h — idealer Bereich. Kognition, Erholung und Stimmung profitieren. Beibehalten.' },
  { max: 999, status: 'long',       label: 'Viel',      tip: 'Über 9h — kann auf erhöhten Erholungsbedarf, Schlafschulden-Abbau oder andere Faktoren hinweisen.' },
]

const STEPS_RANGES = [
  { max: 3000,  status: 'sedentary',   label: 'Sitzend',     tip: 'Unter 3.000 — sehr geringes Aktivitätsniveau. Selbst kurze Gehpausen von 5 Min/Stunde machen einen messbaren Unterschied.' },
  { max: 5000,  status: 'low',         label: 'Wenig aktiv', tip: '3.000–5.000 Schritte. Kleine Änderungen helfen: Treppe statt Aufzug, 10-Min-Spaziergang nach dem Mittagessen.' },
  { max: 7500,  status: 'moderate',    label: 'Mäßig aktiv', tip: '5.000–7.500 Schritte. WHO-Ziel: 7.500+. Ein zusätzlicher 15-Min-Spaziergang täglich reicht oft.' },
  { max: 10000, status: 'active',      label: 'Aktiv',       tip: '7.500–10.000 Schritte — im empfohlenen Bereich. Signifikant reduziertes Risiko für Herz-Kreislauf-Erkrankungen.' },
  { max: 99999, status: 'very_active', label: 'Sehr aktiv',  tip: 'Über 10.000 Schritte — ausgezeichnete Alltagsaktivität.' },
]

const ACTIVE_DAYS_RATINGS = [
  { min: 0, max: 1, status: 'low',      label: 'Kaum aktiv',    tip: 'Kaum Aktivität diese Woche. Selbst ein 20-minütiger Spaziergang täglich verbessert kardiovaskuläre Kennzahlen messbar.' },
  { min: 2, max: 3, status: 'moderate', label: 'Mäßig',         tip: '2–3 aktive Tage — ein guter Anfang. Ziel: 4–5 Tage mit moderater Intensität laut WHO-Empfehlung.' },
  { min: 4, max: 5, status: 'good',     label: 'Gut',           tip: '4–5 aktive Tage — im guten Bereich. WHO empfiehlt 150 Min moderate Ausdauerbelastung/Woche.' },
  { min: 6, max: 7, status: 'great',    label: 'Ausgezeichnet', tip: null },
]

// ── Parsers ───────────────────────────────────────────────────────────────────

function classifyRange(value, ranges) {
  if (value == null) return null
  for (const r of ranges) {
    if (value <= r.max) return { status: r.status, label: r.label, tip: r.tip }
  }
  return null
}

function classifyActiveDays(value) {
  if (value == null) return null
  for (const r of ACTIVE_DAYS_RATINGS) {
    if (value >= r.min && value <= r.max) return { status: r.status, label: r.label, tip: r.tip }
  }
  return null
}

function parseSleepLine(line) {
  const hMatch = line.match(/(\d+)h/)
  const mMatch = line.match(/(\d+)min/)
  if (!hMatch && !mMatch) return null
  return (hMatch ? parseInt(hMatch[1], 10) * 60 : 0) + (mMatch ? parseInt(mMatch[1], 10) : 0)
}

function parseStepsLine(line) {
  const m = line.match(/([\d.]+)\s*(?:\(avg\))?/)
  if (!m) return null
  const n = parseInt(m[1].replace(/\./g, ''), 10)
  return isNaN(n) ? null : n
}

function parseHrLine(line) {
  const m = line.match(/(\d+)\s*bpm/)
  return m ? parseInt(m[1], 10) : null
}

function parseIntLine(line) {
  const m = line.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function parseHealthMd(text) {
  const result = {
    weekly:  { resting_hr: null, sleep_minutes: null, steps: null, active_days: null },
    monthly: { resting_hr: null, sleep_minutes: null, active_days: null },
    last_sync: null,
  }

  const syncM = text.match(/^last_sync:\s*(.+)$/m)
  if (syncM) result.last_sync = syncM[1].trim()

  const weeklyBlock  = text.match(/## This Week[^\n]*\n([\s\S]*?)(?=\n##|$)/)
  const monthlyBlock = text.match(/## Monthly Summary[^\n]*\n([\s\S]*?)(?=\n##|$)/)

  function parseBlock(block, target) {
    if (!block) return
    for (const line of block[1].split('\n')) {
      if (/Resting HR/i.test(line))  target.resting_hr    = parseHrLine(line)
      if (/Sleep/i.test(line))       target.sleep_minutes  = parseSleepLine(line)
      if (/Steps/i.test(line))       target.steps          = parseStepsLine(line)
      if (/Active days/i.test(line)) target.active_days    = parseIntLine(line)
    }
  }

  parseBlock(weeklyBlock, result.weekly)
  parseBlock(monthlyBlock, result.monthly)
  return result
}

// ── Overall score ─────────────────────────────────────────────────────────────

const STATUS_SCORE = {
  athletic: 5, optimal: 5, very_active: 5, great: 5,
  good: 4,
  normal: 3, active: 3, moderate: 3,
  borderline: 2, low: 2,
  elevated: 1, too_low: 1, sedentary: 1,
  critical: 0, high: 0, very_low: 0,
}

function overallStatus(items) {
  const scores = items.filter(Boolean).map(i => STATUS_SCORE[i.status] ?? 2)
  if (!scores.length) return null
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  if (avg >= 4.2) return { status: 'excellent', label: 'Sehr gut' }
  if (avg >= 3.2) return { status: 'good',      label: 'Gut' }
  if (avg >= 2.0) return { status: 'fair',      label: 'Verbesserungspotenzial' }
  return           { status: 'poor',      label: 'Aufmerksamkeit empfohlen' }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const parsed = parseHealthMd(text)
const w = parsed.weekly

const hrClass      = classifyRange(w.resting_hr,    HR_RANGES)
const sleepClass   = classifyRange(w.sleep_minutes, SLEEP_RANGES)
const stepsClass   = classifyRange(w.steps,         STEPS_RANGES)
const activeDaysCl = classifyActiveDays(w.active_days)

const overall = overallStatus([hrClass, sleepClass, stepsClass, activeDaysCl])

const GOOD_STATUSES = new Set(['athletic', 'optimal', 'very_active', 'good', 'active', 'great'])

const tips = [hrClass, sleepClass, stepsClass, activeDaysCl]
  .filter(c => c && c.tip && !GOOD_STATUSES.has(c.status))
  .map(c => c.tip)

const summary = [
  hrClass      && { metric: 'Ruhepuls',    value: w.resting_hr    != null ? `${w.resting_hr} bpm` : null, ...hrClass },
  sleepClass   && { metric: 'Schlaf',      value: w.sleep_minutes != null ? `${Math.floor(w.sleep_minutes/60)}h ${w.sleep_minutes%60}min` : null, ...sleepClass },
  stepsClass   && { metric: 'Schritte',    value: w.steps         != null ? w.steps.toLocaleString('de-DE') : null, ...stepsClass },
  activeDaysCl && { metric: 'Aktive Tage', value: w.active_days   != null ? `${w.active_days}/7` : null, ...activeDaysCl },
].filter(Boolean)

process.stdout.write(JSON.stringify({ tips, summary, overall }))
