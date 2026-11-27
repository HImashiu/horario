// Preferences (free days, busy blocks, gaps, lunch) and the generator features built on them.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../src/state/store.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { parseItems } from '../../src/data/banner-import.js';
import { demoBannerItems } from '../../src/data/demo.js';
import { evaluateSchedule, normalizeRules, overlapsBusy } from '../../src/core/score.js';

const { S } = store;
const sec = (id, day, start, end, code = id) => ({ id, code, schedules: [{ days: [day], start_time: start, end_time: end }] });

beforeEach(() => {
  const map = new Map();
  store.setStorage(createLocalStore({ getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }));
  store.load(); store.resetHistory();
  const { codes } = store.ingestSections(parseItems(demoBannerItems()));
  codes.forEach(code => store.addToBasket({ code }));
});

test('v7 rules and their new form score the same', () => {
  const secs = [sec('a', 'Lunes', '07:00', '08:20'), sec('b', 'Martes', '09:00', '10:20')];
  const v7 = evaluateSchedule(secs, { mondayFree: true, tuesdayLate: true });
  const v8 = evaluateSchedule(secs, normalizeRules({ mondayFree: true, tuesdayLate: true }));
  assert.equal(v7.score, 6, '−3 Monday, −1 Tuesday before 9:30');
  assert.equal(v8.score, v7.score);
});

test('any day can be a free day, each one costs 3 points when used', () => {
  const secs = [sec('a', 'Miércoles', '10:00', '11:20'), sec('b', 'Viernes', '10:00', '11:20')];
  assert.equal(evaluateSchedule(secs, { freeDays: ['Viernes'] }).score, 7);
  assert.equal(evaluateSchedule(secs, { freeDays: ['Miércoles', 'Viernes'] }).score, 4);
  assert.equal(evaluateSchedule(secs, { freeDays: ['Lunes'] }).score, 10);
});

test('fewer gaps and lunch hour lower the score only when asked', () => {
  const secs = [sec('a', 'Lunes', '07:00', '08:20'), sec('b', 'Lunes', '11:00', '12:20'), sec('c', 'Lunes', '12:30', '14:00')];
  assert.equal(evaluateSchedule(secs, {}).score, 10);
  const r = evaluateSchedule(secs, { fewerGaps: true, lunch: true });
  assert.equal(r.score, 10 - 1 - 1, '2 h 40 min of gaps (−1) and no free hour for lunch (−1)');
});

test('busy blocks: a section overlaps only when it meets inside the block', () => {
  const blk = { day: 'Martes', start: '07:00', end: '09:00' };
  assert.ok(overlapsBusy(sec('a', 'Martes', '08:30', '09:50'), blk));
  assert.ok(!overlapsBusy(sec('b', 'Martes', '09:00', '10:20'), blk));
  assert.ok(!overlapsBusy(sec('c', 'Lunes', '08:00', '09:00'), blk));
});

test('a hard busy block keeps the generator away from those hours', () => {
  const all = store.runGenerator();
  assert.equal(all.count, 215);
  store.cancelGen();
  store.setRule('busy', [{ id: 'x', day: 'Viernes', start: '07:00', end: '10:00', soft: false }]);
  const r = store.runGenerator();
  assert.ok(r.ok && r.count < 215);
  for (const o of S.gen.results) {
    const secs = o.ids.map(store.findSec);
    assert.ok(!secs.some(s => overlapsBusy(s, S.rules.busy[0])), 'no option meets on Friday morning');
  }
});

test('when nothing fits, optional courses are left out (as few as possible)', () => {
  // Block every Física 1 section → no full schedule exists.
  store.setRule('busy', [
    { id: 'a', day: 'Lunes', start: '12:00', end: '14:00', soft: false },
    { id: 'b', day: 'Miércoles', start: '12:00', end: '14:00', soft: false },
  ]);
  const strict = store.runGenerator();
  assert.equal(strict.ok, false, 'Física 1 has no section outside the busy hours');
  store.toggleOptional('FISI1518');
  const r = store.runGenerator();
  assert.ok(r.ok);
  assert.deepEqual(r.dropped.length, 1);
  assert.ok(!S.gen.results[0].ids.some(id => store.findSec(id).code === 'FISI1518'));
});

test('re-sorting generator results shows the first option of the new order', () => {
  store.runGenerator();
  store.applyGen(5);
  store.sortGen('gaps');
  assert.equal(S.gen.index, 0);
  const gaps = S.gen.results.map(o => o.gaps);
  assert.deepEqual(gaps, [...gaps].sort((a, b) => a - b));
  assert.deepEqual(S.selected.map(s => s.id), S.gen.results[0].ids);
});
