// Time helpers and clash detection. Ported from index.html v7 (timeToMinutes … hasTimeConflict).

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DAY_HEAD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const DAY_SHORT = { Lunes: 'Lu', Martes: 'Ma', 'Miércoles': 'Mi', Jueves: 'Ju', Viernes: 'Vi', 'Sábado': 'Sá', Domingo: 'Do' };

export function timeToMinutes(t) {
  if (t === null || t === undefined || t === '') return 0;
  if (typeof t === 'number') return t;
  const [h, m] = String(t).split(':');
  return parseInt(h, 10) * 60 + parseInt(m || '0', 10);
}
export function fmtTime(t) {
  const v = timeToMinutes(t);
  const h = Math.floor(v / 60), m = v % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}`;
}
export const fmtTimeAP = t => { const v = timeToMinutes(t); return `${fmtTime(v)} ${Math.floor(v / 60) < 12 ? 'AM' : 'PM'}`; };
export const fmtHour = h => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
export const fmtHourFull = h => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;

export const schedText = s =>
  (s.schedules || []).map(sch => `${sch.days.map(d => DAY_SHORT[d] || d).join(' ')} ${fmtTime(sch.start_time)}–${fmtTime(sch.end_time)}`).join(' · ') || 'Sin horario';

/**
 * Whether two sections run in overlapping parts of the term.
 * Uniandes marks part-of-term with `ptrm` ("1" = 16 semanas; other values are
 * shorter cycles). Two different short cycles never overlap; anything unknown
 * is assumed to overlap, as before.
 */
export function termsOverlap(a, b) {
  const pa = a?.ptrm ? String(a.ptrm) : '', pb = b?.ptrm ? String(b.ptrm) : '';
  if (!pa || !pb || pa === pb) return true;
  if (pa === '1' || pb === '1') return true;
  return false;
}

export function hasTimeConflict(a, b) {
  if (!termsOverlap(a, b)) return false;
  for (const x of a.schedules || []) for (const y of b.schedules || []) {
    if (x.days.some(d => y.days.includes(d))) {
      if (Math.max(timeToMinutes(x.start_time), timeToMinutes(y.start_time)) < Math.min(timeToMinutes(x.end_time), timeToMinutes(y.end_time))) return true;
    }
  }
  return false;
}

export function weeklyHours(sections) {
  let min = 0;
  sections.forEach(s => (s.schedules || []).forEach(sch => { min += (timeToMinutes(sch.end_time) - timeToMinutes(sch.start_time)) * Math.max(1, sch.days.length); }));
  return min / 60;
}
export const fmtHours = h => h.toFixed(1).replace('.', ',');

export function daysUsed(sections) {
  const set = new Set();
  sections.forEach(s => (s.schedules || []).forEach(sch => sch.days.forEach(d => set.add(d))));
  return set;
}

/** Idle minutes between classes, summed over the week. */
export function gapMinutes(sections) {
  let total = 0;
  for (const day of DAYS) {
    const slots = [];
    sections.forEach(s => (s.schedules || []).forEach(sch => { if (sch.days.includes(day)) slots.push([timeToMinutes(sch.start_time), timeToMinutes(sch.end_time)]); }));
    slots.sort((a, b) => a[0] - b[0]);
    let end = null;
    for (const [s, e] of slots) { if (end !== null && s > end) total += s - end; end = end === null ? e : Math.max(end, e); }
  }
  return total;
}
