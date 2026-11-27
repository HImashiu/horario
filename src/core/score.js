// Schedule score from the user's restrictions. Ported from index.html v7 (evaluateScheduleRules)
// with the rules passed in instead of read from the DOM.
import { timeToMinutes, fmtHourFull, daysUsed, gapMinutes } from './time.js';

// v7 shipped "Lunes libre" and "Martes después de 9:30" switched on for everyone.
// New users start neutral; saved rules are kept as they were.
export const DEFAULT_RULES = {
  mondayFree: false, tuesdayLate: false,
  noEarly: false, earlyHour: 7,
  noLate: false, lateHour: 18,
  creditTarget: 18, strictPairing: true, genOnlySeats: false,
};

export function totalCredits(sections, creditsOf) {
  let total = 0, hasUnknown = false; const seen = new Set();
  sections.forEach(s => {
    if (seen.has(s.code)) return; seen.add(s.code);
    const c = creditsOf(s.code);
    if (c === null || c === undefined) hasUnknown = true; else total += c;
  });
  return { total, hasUnknown };
}

/** Returns { score (1–10), flags: [{type:'ok'|'warn'|'info', text}], totalCredits, hasUnknown, lastEnd, days, gaps }. */
export function evaluateSchedule(sections, rules = DEFAULT_RULES, creditsOf = () => null) {
  const r = { ...DEFAULT_RULES, ...rules };
  let score = 10; const flags = [];
  let hasMonday = false, hasEarly = false, hasLate = false, tuesdayEarly = false, lastEnd = 0;
  sections.forEach(sec => (sec.schedules || []).forEach(sch => {
    const s = timeToMinutes(sch.start_time), e = timeToMinutes(sch.end_time);
    if (sch.days.includes('Lunes')) hasMonday = true;
    if (s < r.earlyHour * 60) hasEarly = true;
    if (e > r.lateHour * 60) hasLate = true;
    if (sch.days.includes('Martes') && s < 9.5 * 60) tuesdayEarly = true;
    lastEnd = Math.max(lastEnd, e);
  }));
  if (r.mondayFree && hasMonday) { score -= 3; flags.push({ type: 'warn', text: 'Tiene clase los lunes' }); }
  else if (r.mondayFree && sections.length && !hasMonday) flags.push({ type: 'ok', text: 'Lunes libre' });
  if (r.noEarly && hasEarly) { score -= 2; flags.push({ type: 'warn', text: `Clase antes de las ${fmtHourFull(r.earlyHour)}` }); }
  if (r.noLate && hasLate) { score -= 2; flags.push({ type: 'warn', text: `Clase después de las ${fmtHourFull(r.lateHour)}` }); }
  if (r.tuesdayLate && tuesdayEarly) { score -= 1; flags.push({ type: 'warn', text: 'Martes inicia antes de 9:30 AM' }); }
  const { total, hasUnknown } = totalCredits(sections, creditsOf);
  if (sections.length) {
    if (total > r.creditTarget) flags.push({ type: 'warn', text: `Excede la meta de créditos (${total}/${r.creditTarget})` });
    else if (total > 0) flags.push({ type: 'ok', text: `${total}/${r.creditTarget} créditos` });
  }
  if (hasUnknown) flags.push({ type: 'info', text: 'Algunas materias no reportan créditos' });
  return { score: Math.max(1, score), flags, totalCredits: total, hasUnknown, lastEnd, days: daysUsed(sections).size, gaps: gapMinutes(sections) };
}
