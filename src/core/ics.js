// Calendar file (.ics, RFC 5545) for Google Calendar, Outlook and phones: one weekly event per
// class meeting, from the first to the last day of classes, without Colombian holidays and an
// optional recess week. Uniandes times are Bogotá time (UTC−5, no daylight saving).
import { fmtCode } from './requirements.js';
import { kindOf } from './sections.js';

const TZ = 'America/Bogota';
const DAY_INDEX = { Domingo: 0, Lunes: 1, Martes: 2, 'Miércoles': 3, Jueves: 4, Viernes: 5, 'Sábado': 6 };
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ─── Dates as 'YYYY-MM-DD' (computed in UTC, so the device's time zone never shifts them) ──
const parse = d => { const [y, m, day] = String(d).split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)); };
const toIso = dt => dt.toISOString().slice(0, 10);
export const isIsoDate = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && toIso(parse(d)) === d;
export const addDays = (d, n) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return toIso(x); };
export const weekday = d => parse(d).getUTCDay();
const mondayOf = d => addDays(d, -((weekday(d) + 6) % 7));
const compact = d => d.replace(/-/g, '');

/** Easter Sunday (Gregorian calendar, anonymous algorithm). */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Colombian public holidays of a year. Some stay on their date; others move to the following
 * Monday (Ley 51 de 1983); the rest follow Easter.
 */
export function colombianHolidays(year) {
  const d = (m, day) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const nextMonday = date => addDays(date, (8 - weekday(date)) % 7);
  const easter = easterSunday(year);
  return [...new Set([
    d(1, 1), d(5, 1), d(7, 20), d(8, 7), d(12, 8), d(12, 25),
    ...[[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].map(([m, day]) => nextMonday(d(m, day))),
    addDays(easter, -3), addDays(easter, -2), // Jueves y Viernes Santo
    addDays(easter, 43), addDays(easter, 64), addDays(easter, 71), // Ascensión, Corpus Christi, Sagrado Corazón (lunes)
  ])].sort();
}

/** 'full', or 'first' / 'second' for 8-week cycles (ptrm 8A / 8B). */
export function partOfTerm(s) {
  const code = String(s?.ptrm || '').toUpperCase(), desc = String(s?.ptrmdesc || '').toUpperCase();
  if (code === '8A' || (/PRIMER/.test(desc) && /CICLO|8 SEM/.test(desc))) return 'first';
  if (code === '8B' || (/SEGUND/.test(desc) && /CICLO|8 SEM/.test(desc))) return 'second';
  return 'full';
}

/** The class weeks (without the recess week) split in two halves, for 8-week courses. */
export function termHalves(start, end, recess = null) {
  const skip = recess && isIsoDate(recess) ? mondayOf(recess) : null;
  const weeks = [];
  for (let w = mondayOf(start); w <= end; w = addDays(w, 7)) if (w !== skip) weeks.push(w);
  const half = Math.ceil(weeks.length / 2);
  const firstEnd = addDays(weeks[half - 1] || start, 6);
  const secondStart = weeks[half] || addDays(firstEnd, 1);
  return {
    first: { start, end: firstEnd < end ? firstEnd : end },
    second: { start: secondStart > start ? secondStart : start, end },
  };
}

// ─── Text ────────────────────────────────────────────────────
const text = v => String(v ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const enc = new TextEncoder();
/** Lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1). */
export function fold(line) {
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > (parts.length ? 74 : 75)) { parts.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}
const hhmmss = t => { const [h, m] = String(t).split(':'); return `${h.padStart(2, '0')}${(m || '00').padStart(2, '0')}00`; };
const utcStamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * @param sections  the sections of a schedule (as stored by the app)
 * @param options   start, end: first and last day of classes ('YYYY-MM-DD'); recess: any day of
 *                  the recess week; holidays: skip Colombian holidays; name: calendar name.
 * @returns {{ text: string, events: number, skipped: object[] }}
 */
export function buildIcs(sections, { start, end, recess = null, holidays = true, name = 'Horario', now = new Date() } = {}) {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) throw new Error('Revisa las fechas: el primer día debe ser antes del último.');
  const off = new Set();
  if (holidays) for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) colombianHolidays(y).forEach(d => off.add(d));
  if (recess && isIsoDate(recess)) { const m = mondayOf(recess); for (let i = 0; i < 7; i++) off.add(addDays(m, i)); }
  const halves = termHalves(start, end, recess);
  const stamp = utcStamp(now);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Armador de Horarios//Uniandes v8//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${text(name)}`, `X-WR-TIMEZONE:${TZ}`,
    'BEGIN:VTIMEZONE', `TZID:${TZ}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0500', 'TZNAME:-05', 'END:STANDARD', 'END:VTIMEZONE',
  ];
  let events = 0;
  const skipped = [];
  for (const s of sections) {
    const part = partOfTerm(s);
    const range = part === 'first' ? halves.first : part === 'second' ? halves.second : { start, end };
    let wrote = false;
    (s.schedules || []).forEach((sch, i) => {
      const days = (sch.days || []).map(d => DAY_INDEX[d]).filter(d => d !== undefined).sort((a, b) => a - b);
      if (!days.length || !sch.start_time || !sch.end_time) return;
      // Dates the API gives for a meeting, when it does, win over the semester's.
      const from = isIsoDate(sch.date_start) ? sch.date_start : range.start;
      const to = isIsoDate(sch.date_end) ? sch.date_end : range.end;
      const dates = [];
      for (let d = from; d <= to; d = addDays(d, 1)) if (days.includes(weekday(d))) dates.push(d);
      const first = dates.find(d => !off.has(d));
      if (!first) return;
      const excluded = dates.filter(d => d > first && off.has(d));
      const kind = kindOf(s) === 'mag' ? 'Magistral' : 'Complementaria';
      const where = sch.location && !/^(TBA|N\/A|-)$/i.test(sch.location) ? sch.location : '';
      lines.push(
        'BEGIN:VEVENT',
        `UID:${text(`${s.nrc || s.id}-${i}-${compact(from)}@armador-de-horarios`)}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TZ}:${compact(first)}T${hhmmss(sch.start_time)}`,
        `DTEND;TZID=${TZ}:${compact(first)}T${hhmmss(sch.end_time)}`,
        `RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=${days.map(d => BYDAY[d]).join(',')};UNTIL=${compact(addDays(to, 1))}T045959Z`,
        ...(excluded.length ? [`EXDATE;TZID=${TZ}:${excluded.map(d => `${compact(d)}T${hhmmss(sch.start_time)}`).join(',')}`] : []),
        `SUMMARY:${text(`${fmtCode(s.code)} ${s.title}${kind === 'Complementaria' ? ' (complementaria)' : ''}`)}`,
        ...(where ? [`LOCATION:${text(where)}`] : []),
        `DESCRIPTION:${text(`${kind} · Sección ${s.section} · NRC ${s.nrc}${(s.instructors || []).length ? `\nProfesor: ${s.instructors.join(', ')}` : ''}${part !== 'full' ? `\nCurso de 8 semanas (${part === 'first' ? 'primera' : 'segunda'} mitad): confirma sus fechas.` : ''}`)}`,
        'END:VEVENT',
      );
      events++; wrote = true;
    });
    if (!wrote) skipped.push(s);
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(fold).join('\r\n') + '\r\n', events, skipped };
}
