// Saved-state migration (v7 → v8) and store behaviour, including the v7 bugs fixed in v8.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import v7 from '../fixtures/v7-state.json' with { type: 'json' };
import * as store from '../../src/state/store.js';
import { createLocalStore } from '../../src/storage/local-store.js';
import { parseItems } from '../../src/data/banner-import.js';
import { demoBannerItems } from '../../src/data/demo.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const ls = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
  return { map, store: createLocalStore(ls) };
}
const { S } = store;

let mem;
beforeEach(() => { mem = memoryStorage({ [store.STORAGE_KEY]: JSON.stringify(v7) }); store.setStorage(mem.store); store.resetHistory(); });

test('v7 state migrates to v8 keeping sections, courses, drafts and choices', () => {
  const { restored, migratedFrom } = store.load();
  assert.equal(migratedFrom, 7);
  assert.ok(restored);
  assert.equal(S.sections.length, v7.cleanedCourses.length);
  assert.deepEqual(S.basket.map(b => b.key), v7.basket.map(b => b.key));
  assert.equal(S.drafts.length, v7.drafts.length);
  assert.equal(S.currentDraftId, v7.currentDraftId);
  for (const d of v7.drafts) assert.deepEqual(S.drafts.find(x => x.id === d.id).sectionIds, d.sectionIds);
  assert.deepEqual(S.selected.map(s => s.id), v7.drafts.find(d => d.id === v7.currentDraftId).sectionIds);
  assert.equal(S.profile.program, 'imec', 'v7 pensum preference becomes the profile program');
});

test('v7 rules keep their effective values, including v7 defaults the user never changed', () => {
  store.load();
  assert.deepEqual(S.rules.freeDays, v7.rules['rule-monday-free'] ? ['Lunes'] : []);
  assert.equal(S.rules.busy.some(b => b.day === 'Martes' && b.soft), !!v7.rules['rule-tuesday-late']);
  assert.equal(S.rules.lateHour, 16);
  assert.equal(S.rules.earlyHour, Number(v7.rules['rule-no-early-hour']));
  assert.equal(S.rules.creditTarget, Number(v7.rules['credit-target']));
});

test('the original v7 data is backed up once, and v8 is saved under the same key', () => {
  store.load();
  assert.equal(mem.map.get(store.BACKUP_KEY), JSON.stringify(v7));
  store.save();
  const saved = JSON.parse(mem.map.get(store.STORAGE_KEY));
  assert.equal(saved.v, 8);
  assert.ok(!('selected' in saved) && !('gen' in saved), 'runtime fields are not persisted');
  store.load();
  assert.equal(store.S.migratedFrom, null, 'a v8 state loads without migrating again');
  assert.equal(mem.map.get(store.BACKUP_KEY), JSON.stringify(v7), 'the backup is not overwritten');
});

test('a fresh start has one empty draft and neutral rules', () => {
  mem = memoryStorage(); store.setStorage(mem.store);
  const { restored } = store.load();
  assert.ok(!restored);
  assert.equal(S.drafts.length, 1);
  assert.deepEqual(S.rules.freeDays, []);
  assert.deepEqual(S.rules.busy, []);
});

test('undo after "No incluir" restores both the sections and the course (v7 bug)', () => {
  store.load();
  const item = S.basket.find(b => S.selected.some(s => s.code === b.code) && !store.currentDraft().skipped.includes(b.key));
  const before = S.selected.map(s => s.id);
  assert.equal(store.toggleSkip(item.key), true);
  assert.ok(store.currentDraft().skipped.includes(item.key));
  assert.ok(!S.selected.some(s => s.code === item.code));
  assert.ok(store.undo());
  assert.ok(!store.currentDraft().skipped.includes(item.key), 'course is included again');
  assert.deepEqual(S.selected.map(s => s.id), before, 'its sections are back');
  assert.ok(store.redo());
  assert.ok(store.currentDraft().skipped.includes(item.key));
});

test('picking a complementaria of another magistral switches the magistral', () => {
  mem = memoryStorage(); store.setStorage(mem.store); store.load();
  store.ingestSections(parseItems(demoBannerItems()));
  store.addToBasket({ code: 'MATE1203', title: 'Cálculo Diferencial' });
  const s41 = S.sections.find(s => s.code === 'MATE1203' && s.section === '41');
  const s3 = S.sections.find(s => s.code === 'MATE1203' && s.section === '3');
  store.chooseSection(s3.id);
  const r = store.chooseSection(s41.id);
  assert.equal(r.note.type, 'switchMag');
  assert.deepEqual(S.selected.map(s => s.section).sort(), ['4', '41']);
});

test('generator runs on the store and "Cancelar" restores the previous schedule', () => {
  mem = memoryStorage(); store.setStorage(mem.store); store.load();
  const { codes } = store.ingestSections(parseItems(demoBannerItems()));
  codes.forEach(code => store.addToBasket({ code }));
  const r = store.runGenerator();
  assert.ok(r.ok);
  assert.equal(r.count, 215);
  assert.ok(S.selected.length > 0);
  store.cancelGen();
  assert.equal(S.selected.length, 0);
  assert.equal(S.gen, null);
});

test('sections no longer returned for an exact code are marked stale and leave the generator', () => {
  mem = memoryStorage(); store.setStorage(mem.store); store.load();
  const api = (nrc, section) => ({ id: `uniandes-${nrc}`, nrc: String(nrc), code: 'MATE1203', title: 'Cálculo', section, schedule_type: 'Magistral', instructors: ['X'], credits: 3, seats_available: 5, capacity: 10, schedules: [{ days: ['Lunes'], start_time: '09:30', end_time: '10:50', location: 'A' }] });
  store.ingestSections([api(1, '1'), api(2, '2')], { exactCodes: ['MATE1203'] });
  assert.equal(store.courseInfo('MATE1203').secs.length, 2);
  const res = store.ingestSections([api(1, '1')], { exactCodes: ['MATE1203'] });
  assert.equal(res.stale, 1);
  assert.equal(S.sections.find(s => s.nrc === '2').stale, true);
  assert.equal(store.courseInfo('MATE1203').secs.length, 1);
});
