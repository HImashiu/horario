import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, colombianHolidays, easterSunday, partOfTerm, termHalves, fold, isIsoDate } from '../../src/core/ics.js';

test('Easter and the Colombian holidays (Ley Emiliani moves some to Monday)', () => {
  assert.equal(easterSunday(2024), '2024-03-31');
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  assert.deepEqual(colombianHolidays(2026), [
    '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03', '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-15',
    '2026-06-29', '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02', '2026-11-16', '2026-12-08', '2026-12-25',
  ]);
  assert.deepEqual(colombianHolidays(2027), [
    '2027-01-01', '2027-01-11', '2027-03-22', '2027-03-25', '2027-03-26', '2027-05-01', '2027-05-10', '2027-05-31', '2027-06-07',
    '2027-07-05', '2027-07-20', '2027-08-07', '2027-08-16', '2027-10-18', '2027-11-01', '2027-11-15', '2027-12-08', '2027-12-25',
  ]);
});

const sec = (over = {}) => ({
  id: 'uniandes-12345', nrc: '12345', code: 'MATE1203', title: 'Cálculo Diferencial', section: '4', schedule_type: 'Magistral',
  instructors: ['Ana Pérez'], schedules: [{ days: ['Lunes', 'Miércoles'], start_time: '07:00', end_time: '08:20', location: 'ML_510' }], ...over,
});
const OPTS = { start: '2027-01-25', end: '2027-05-22', recess: '2027-03-24', holidays: true, name: 'Plan A', now: new Date('2026-11-27T12:00:00Z') };
const unfold = t => t.replace(/\r\n /g, '');
const prop = (t, name) => unfold(t).split('\r\n').filter(l => l.startsWith(name));

test('a weekly event per meeting, in Bogotá time, until the last day of classes', () => {
  const r = buildIcs([sec()], OPTS);
  assert.equal(r.events, 1);
  assert.ok(r.text.startsWith('BEGIN:VCALENDAR\r\n') && r.text.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(r.text), 'every line ends in CRLF');
  assert.ok(r.text.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), 'lines folded at 75 octets');
  assert.deepEqual(prop(r.text, 'DTSTART;'), ['DTSTART;TZID=America/Bogota:20270125T070000']);
  assert.deepEqual(prop(r.text, 'DTEND;'), ['DTEND;TZID=America/Bogota:20270125T082000']);
  assert.deepEqual(prop(r.text, 'RRULE'), ['RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO,WE;UNTIL=20270523T045959Z']);
  assert.deepEqual(prop(r.text, 'SUMMARY'), ['SUMMARY:MATE 1203 Cálculo Diferencial']);
  assert.deepEqual(prop(r.text, 'LOCATION'), ['LOCATION:ML_510']);
  assert.match(prop(r.text, 'DESCRIPTION')[0], /Magistral · Sección 4 · NRC 12345\\nProfesor: Ana Pérez/);
  assert.equal(prop(r.text, 'BEGIN:VTIMEZONE').length, 1);
});

test('holidays and the recess week are left out', () => {
  const ex = prop(buildIcs([sec()], OPTS).text, 'EXDATE')[0].split(':')[1].split(',');
  // San José (Monday 22 March) and the rest of the recess week; Ascensión (Monday 10 May).
  assert.deepEqual(ex, ['20270322T070000', '20270324T070000', '20270510T070000']);
  // Corpus Christi (31 May) is after the last day of classes: nothing to remove.
  const noHolidays = buildIcs([sec()], { ...OPTS, holidays: false, recess: null });
  assert.deepEqual(prop(noHolidays.text, 'EXDATE'), []);
});

test('the first event is the first class day on or after the start, skipping a holiday', () => {
  const wed = buildIcs([sec({ schedules: [{ days: ['Miércoles'], start_time: '14:00', end_time: '15:20', location: 'TBA' }] })], OPTS);
  assert.deepEqual(prop(wed.text, 'DTSTART;'), ['DTSTART;TZID=America/Bogota:20270127T140000']);
  assert.deepEqual(prop(wed.text, 'LOCATION'), [], 'no "TBA" location');
  // Starting on Monday 11 January 2027 (Reyes Magos): the first event is the next class.
  const mon = buildIcs([sec()], { ...OPTS, start: '2027-01-11' });
  assert.deepEqual(prop(mon.text, 'DTSTART;'), ['DTSTART;TZID=America/Bogota:20270113T070000']);
});

test('8-week courses go in the first or second half of the class weeks', () => {
  assert.equal(partOfTerm({ ptrm: '8A' }), 'first');
  assert.equal(partOfTerm({ ptrm: '8B' }), 'second');
  assert.equal(partOfTerm({ ptrm: '1' }), 'full');
  assert.equal(partOfTerm({}), 'full');
  // 17 weeks from 25 January, minus the recess week: 16 class weeks, 8 and 8.
  assert.deepEqual(termHalves(OPTS.start, OPTS.end, OPTS.recess), { first: { start: '2027-01-25', end: '2027-03-21' }, second: { start: '2027-03-29', end: '2027-05-22' } });
  const a = buildIcs([sec({ ptrm: '8A' })], OPTS), b = buildIcs([sec({ ptrm: '8B' })], OPTS);
  assert.deepEqual(prop(a.text, 'RRULE'), ['RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO,WE;UNTIL=20270322T045959Z']);
  assert.deepEqual(prop(b.text, 'DTSTART;'), ['DTSTART;TZID=America/Bogota:20270329T070000']);
  assert.match(prop(a.text, 'DESCRIPTION')[0], /8 semanas \(primera mitad\)/);
});

test('text is escaped, long lines folded, bad dates refused, sections without times skipped', () => {
  const r = buildIcs([sec({ title: 'Ondas, Fluidos; y más' }), sec({ nrc: '2', schedules: [] })], OPTS);
  assert.deepEqual(prop(r.text, 'SUMMARY'), ['SUMMARY:MATE 1203 Ondas\\, Fluidos\\; y más']);
  assert.equal(r.events, 1);
  assert.equal(r.skipped.length, 1);
  const long = fold('DESCRIPTION:' + 'á'.repeat(60));
  assert.ok(long.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
  assert.equal(long.replace(/\r\n /g, ''), 'DESCRIPTION:' + 'á'.repeat(60));
  assert.throws(() => buildIcs([sec()], { ...OPTS, start: '2027-05-30' }), /fechas/);
  assert.throws(() => buildIcs([sec()], { ...OPTS, end: '2027-02-30' }), /fechas/);
  assert.ok(isIsoDate('2027-02-28') && !isIsoDate('2027-02-30') && !isIsoDate('28/02/2027'));
});

test('dates sent by the API for a meeting win over the semester dates', () => {
  const r = buildIcs([sec({ schedules: [{ days: ['Lunes'], start_time: '07:00', end_time: '08:20', location: 'ML_510', date_start: '2027-02-01', date_end: '2027-03-19' }] })], OPTS);
  assert.deepEqual(prop(r.text, 'DTSTART;'), ['DTSTART;TZID=America/Bogota:20270201T070000']);
  assert.deepEqual(prop(r.text, 'RRULE'), ['RRULE:FREQ=WEEKLY;WKST=MO;BYDAY=MO;UNTIL=20270320T045959Z']);
});
