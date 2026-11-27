import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWatch, updateWatches, seatsOf } from '../../src/core/watch.js';

const sec = seats => ({ nrc: '99999', code: 'MATE1203', section: '1', schedule_type: 'Magistral', title: 'Cálculo Diferencial', seats_available: seats, capacity: 30 });

test('a watch remembers the section and its seats; the API sends numbers or "N/A"', () => {
  const w = makeWatch(sec(0), 1000);
  assert.deepEqual(w, { nrc: '99999', code: 'MATE1203', section: '1', kind: 'Magistral', title: 'Cálculo Diferencial', seats: 0, addedAt: 1000, checkedAt: null, openedAt: null });
  assert.equal(seatsOf(sec('3')), 3);
  assert.equal(seatsOf(sec('N/A')), null);
});

test('an opening is reported once, and again only after the section fills up and opens again', () => {
  let ws = [makeWatch(sec(0), 0)];
  const step = (seats, t) => { const r = updateWatches(ws, () => sec(seats), t); ws = r.watches; return r.opened.length; };
  assert.equal(step(0, 1), 0, 'still full');
  assert.equal(ws[0].checkedAt, 1);
  assert.equal(step(2, 2), 1, 'a seat opened');
  assert.equal(ws[0].seats, 2);
  assert.equal(ws[0].openedAt, 2);
  assert.equal(step(1, 3), 0, 'still open: no second notice');
  assert.equal(step(0, 4), 0, 'full again');
  assert.equal(ws[0].openedAt, null);
  assert.equal(step(1, 5), 1, 'opened again');
});

test('sections not loaded or without seat data leave the watch as it was', () => {
  const ws = [makeWatch(sec(0), 0)];
  const missing = updateWatches(ws, () => undefined, 9);
  assert.equal(missing.watches[0], ws[0]);
  assert.deepEqual(missing.opened, []);
  const unknown = updateWatches(ws, () => sec('N/A'), 9);
  assert.equal(unknown.watches[0].seats, 0);
  assert.equal(unknown.watches[0].checkedAt, 9);
  assert.deepEqual(unknown.opened, []);
});
