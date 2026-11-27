// Schedule score from the user's preferences. Ported from index.html v7 (evaluateScheduleRules),
// generalised: free days (any), time window, soft busy blocks, fewer gaps and a lunch hour.
// v7's own rules map onto these exactly:
//   "Lunes libre"            → freeDays: ['Lunes']                      (−3)
//   "Martes después de 9:30" → soft busy block Martes 00:00–09:30        (−1)
import { timeToMinutes, fmtHourFull, fmtTime, daysUsed, gapMinutes, DAYS, termsOverlap } from './time.js';

export const DEFAULT_RULES = {
  freeDays: [], busy: [],
  noEarly: false, earlyHour: 7,
  noLate: false, lateHour: 18,
  fewerGaps: false, lunch: false,
  creditTarget: 18, strictPairing: true, genOnlySeats: false,
  // v7 keys, still read (see normalizeRules)
  mondayFree: false, tuesdayLate: false,
};

/** Rules with v7's mondayFree / tuesdayLate expressed as free days and a soft busy block. */
export function normalizeRules(rules = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  const freeDays = new Set(r.freeDays || []);
  if (r.mondayFree) freeDays.add('Lunes');
  const busy = [...(r.busy || [])];
  if (r.tuesdayLate && !busy.some(b => b.id === 'v7-tuesday')) busy.push({ id: 'v7-tuesday', day: 'Martes', start: '00:00', end: '09:30', soft: true, label: 'Martes antes de 9:30' });
  return { ...r, freeDays: [...freeDays], busy, mondayFree: false, tuesdayLate: false };
}

/** Whether a section meets during a busy block. */
export function overlapsBusy(sec, block) {
  return (sec.schedules || []).some(sch => sch.days.includes(block.day) &&
    Math.max(timeToMinutes(sch.start_time), timeToMinutes(block.start)) < Math.min(timeToMinutes(sch.end_time), timeToMinutes(block.end)));
}
export const hardBusy = rules => normalizeRules(rules).busy.filter(b => !b.soft);

export function totalCredits(sections, creditsOf) {
  let total = 0, hasUnknown = false; const seen = new Set();
  sections.forEach(s => {
    if (seen.has(s.code)) return; seen.add(s.code);
    const c = creditsOf(s.code);
    if (c === null || c === undefined) hasUnknown = true; else total += c;
  });
  return { total, hasUnknown };
}

/** Days with classes that have no free hour between 11:30 and 14:00. */
function daysWithoutLunch(sections) {
  let n = 0;
  for (const day of DAYS) {
    const slots = [];
    sections.forEach(s => (s.schedules || []).forEach(sch => { if (sch.days.includes(day)) slots.push([timeToMinutes(sch.start_time), timeToMinutes(sch.end_time)]); }));
    if (!slots.length) continue;
    const lo = 11.5 * 60, hi = 14 * 60;
    let free = 0, cursor = lo;
    slots.filter(([s, e]) => e > lo && s < hi).sort((a, b) => a[0] - b[0]).forEach(([s, e]) => { free = Math.max(free, Math.min(s, hi) - cursor); cursor = Math.max(cursor, e); });
    free = Math.max(free, hi - cursor);
    if (free < 60) n++;
  }
  return n;
}

/** Returns { score (1–10), flags: [{type:'ok'|'warn'|'info', text}], totalCredits, hasUnknown, lastEnd, days, gaps }. */
export function evaluateSchedule(sections, rules = DEFAULT_RULES, creditsOf = () => null) {
  const r = normalizeRules(rules);
  let score = 10; const flags = [];
  let hasEarly = false, hasLate = false, lastEnd = 0;
  const used = daysUsed(sections);
  sections.forEach(sec => (sec.schedules || []).forEach(sch => {
    const s = timeToMinutes(sch.start_time), e = timeToMinutes(sch.end_time);
    if (s < r.earlyHour * 60) hasEarly = true;
    if (e > r.lateHour * 60) hasLate = true;
    lastEnd = Math.max(lastEnd, e);
  }));
  const busyDays = r.freeDays.filter(d => used.has(d));
  if (busyDays.length) { score -= 3 * busyDays.length; flags.push({ type: 'warn', text: busyDays.length === 1 ? `Tiene clase el ${busyDays[0].toLowerCase()}` : `Tiene clase: ${busyDays.join(', ').toLowerCase()}` }); }
  else if (r.freeDays.length && sections.length) flags.push({ type: 'ok', text: r.freeDays.length === 1 ? `${r.freeDays[0]} libre` : `Días libres: ${r.freeDays.join(', ').toLowerCase()}` });
  if (r.noEarly && hasEarly) { score -= 2; flags.push({ type: 'warn', text: `Clase antes de las ${fmtHourFull(r.earlyHour)}` }); }
  if (r.noLate && hasLate) { score -= 2; flags.push({ type: 'warn', text: `Clase después de las ${fmtHourFull(r.lateHour)}` }); }
  for (const b of r.busy) if (b.soft && sections.some(s => overlapsBusy(s, b))) { score -= 1; flags.push({ type: 'warn', text: b.label || `Ocupa ${b.day.toLowerCase()} ${fmtTime(b.start)}–${fmtTime(b.end)}` }); }
  const gaps = gapMinutes(sections);
  if (r.fewerGaps && gaps >= 120) { score -= Math.min(3, Math.floor(gaps / 120)); flags.push({ type: 'warn', text: `${Math.round(gaps / 60)} h de huecos entre clases` }); }
  if (r.lunch) { const n = daysWithoutLunch(sections); if (n) { score -= Math.min(2, n); flags.push({ type: 'warn', text: `${n} día${n > 1 ? 's' : ''} sin hora de almuerzo` }); } }
  const { total, hasUnknown } = totalCredits(sections, creditsOf);
  if (sections.length) {
    if (total > r.creditTarget) flags.push({ type: 'warn', text: `Excede la meta de créditos (${total}/${r.creditTarget})` });
    else if (total > 0) flags.push({ type: 'ok', text: `${total}/${r.creditTarget} créditos` });
  }
  if (hasUnknown) flags.push({ type: 'info', text: 'Algunas materias no reportan créditos' });
  return { score: Math.max(1, score), flags, totalCredits: total, hasUnknown, lastEnd, days: used.size, gaps };
}

export { termsOverlap };
