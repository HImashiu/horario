import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasTimeConflict, termsOverlap, gapMinutes } from '../../src/core/time.js';
import { mapUniandesSection, titleCase, normalizeQuery } from '../../src/data/uniandes-api.js';
import { seatTone, hasSeats, seatText } from '../../src/core/sections.js';
import { isTermMet, unmetTerms, formatTerm, listCodes } from '../../src/core/requirements.js';

// Synthetic item shaped like the Uniandes API response (numbers arrive as strings).
const apiItem = (over = {}) => ({
  nrc: '99901', class: 'MATE', course: '1203', section: '1', credits: '3', title: 'CÁLCULO DIFERENCIAL',
  maxenrol: '50', enrolled: '41', seatsavail: '9', term: '202620', ptrm: '1', ptrmdesc: '16 SEMANAS', campus: 'CAMPUS PRINCIPAL',
  instructors: [{ name: 'Profesor de prueba' }],
  schedules: [{ l: 'L', i: 'I', time_ini: '0930', time_fin: '1050', classroom: 'ML_101' }],
  ...over,
});

test('API numbers given as strings become real seats and credits', () => {
  const s = mapUniandesSection(apiItem());
  assert.equal(s.seats_available, 9);
  assert.equal(s.capacity, 50);
  assert.equal(s.credits, 3);
  assert.equal(seatText(s), '9/50');
  assert.equal(seatTone(s.seats_available, s.capacity), 'low', '9 of 50 is under 20%');
  assert.ok(hasSeats(s));
});

test('seats fall back to capacity minus enrolled, and a full section has no seats', () => {
  const s = mapUniandesSection(apiItem({ seatsavail: undefined, enrolled: '50' }));
  assert.equal(s.seats_available, 0);
  assert.equal(seatTone(s.seats_available, s.capacity), 'full');
  assert.ok(!hasSeats(s));
});

test('API mapping keeps part-of-term and splits complementarias', () => {
  const comp = mapUniandesSection(apiItem({ course: '1203C', section: '11', nrc: '99902' }));
  assert.equal(comp.code, 'MATE1203');
  assert.equal(comp.schedule_type, 'Complementaria');
  assert.equal(comp.ptrm, '1');
  assert.equal(comp.title, 'Cálculo Diferencial');
  assert.deepEqual(comp.schedules[0].days, ['Lunes', 'Miércoles']);
});

test('titles in capitals are shown in title case; Roman numerals stay upper case', () => {
  assert.equal(titleCase('FÍSICA II'), 'Física II');
  assert.equal(titleCase('INTRODUCCIÓN A LA PROGRAMACIÓN'), 'Introducción a la Programación');
  assert.equal(titleCase('Ya Bien Escrito'), 'Ya Bien Escrito');
});

test('course codes are normalised from several spellings', () => {
  assert.equal(normalizeQuery('mate 1203'), 'MATE1203');
  assert.equal(normalizeQuery('FISI-1518'), 'FISI1518');
  assert.equal(normalizeQuery('cálculo'), 'cálculo');
});

const sec = (id, ptrm, days, start, end) => ({ id, code: id, ptrm, schedules: [{ days, start_time: start, end_time: end }] });

test('same time slot clashes within the same part of term', () => {
  assert.ok(hasTimeConflict(sec('a', '1', ['Lunes'], '09:30', '10:50'), sec('b', '1', ['Lunes'], '10:00', '11:20')));
  assert.ok(!hasTimeConflict(sec('a', '1', ['Lunes'], '09:30', '10:50'), sec('b', '1', ['Lunes'], '10:50', '12:00')));
});

test('two different 8-week cycles never clash, but a 16-week course clashes with both', () => {
  const first = sec('a', '8A', ['Martes'], '14:00', '15:20'), second = sec('b', '8B', ['Martes'], '14:00', '15:20');
  const full = sec('c', '1', ['Martes'], '14:00', '15:20');
  assert.ok(!termsOverlap(first, second));
  assert.ok(!hasTimeConflict(first, second));
  assert.ok(hasTimeConflict(first, full));
  assert.ok(hasTimeConflict(sec('d', undefined, ['Martes'], '14:00', '15:20'), first), 'unknown part of term is assumed to overlap');
});

test('gaps add idle time between classes on the same day', () => {
  const secs = [sec('a', '1', ['Lunes'], '07:00', '08:20'), sec('b', '1', ['Lunes'], '10:00', '11:20'), sec('c', '1', ['Martes'], '09:00', '10:00')];
  assert.equal(gapMinutes(secs), 100);
});

test('requirement terms: single, any-of, and count-from-groups', () => {
  const groups = { CPO1: { options: ['A1', 'A2'] }, CPO2: { options: ['B1', 'B2'] } };
  const passed = new Set(['MATE1203', 'IMEC2522', 'A2']);
  const met = c => passed.has(c);
  assert.ok(isTermMet('MATE1203', met, groups));
  assert.ok(isTermMet(['IMEC2540', 'IMEC2522'], met, groups));
  assert.ok(isTermMet({ count: 1, from: ['CPO1', 'CPO2'] }, met, groups));
  assert.ok(!isTermMet({ count: 2, from: ['CPO1', 'CPO2'] }, met, groups));
  assert.deepEqual(unmetTerms(['MATE1203', 'FISI1518'], met, groups), ['FISI1518']);
  assert.equal(formatTerm(['IMEC2540', 'IMEC2522'], groups), '(IMEC 2540 o IMEC 2522)');
  assert.equal(formatTerm({ count: 2, from: ['CPO1', 'CPO2'] }, { CPO1: { short: 'CPO1', options: [] }, CPO2: { short: 'CPO2', options: [] } }), '2 cursos de CPO1 o CPO2');
  assert.deepEqual(listCodes(['X', ['Y', 'Z'], { count: 1, from: ['CPO1'] }], groups), ['X', 'Y', 'Z', 'A1', 'A2']);
});
