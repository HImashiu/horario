import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, schedulePayload, readPayload, parseShareHash, packSection, unpackSection } from '../../src/core/share.js';
import { sharedClasses, commonFree, groupGenerate } from '../../src/core/social.js';
import { parseItems } from '../../src/data/banner-import.js';
import { demoBannerItems } from '../../src/data/demo.js';
import { buildCourseInfo, usableCombos } from '../../src/core/sections.js';
import { hasTimeConflict } from '../../src/core/time.js';

const demo = parseItems(demoBannerItems());
const byCodeSec = (code, section) => demo.find(s => s.code === code && s.section === section);
const sec = (code, nrc, day, start, end) => ({ id: `x${nrc}`, code, nrc: String(nrc), title: code, section: '1', schedule_type: 'Magistral', schedules: [{ days: [day], start_time: start, end_time: end, location: 'A' }] });

test('a schedule survives the round trip through a share link', async () => {
  const sections = [byCodeSec('MATE1203', '4'), byCodeSec('MATE1203', '41'), byCodeSec('QUIM1103', '1')];
  const data = await encodeShare(schedulePayload({ id: 'abc', name: 'Ana', draft: 'Plan A', program: 'imec', sections }));
  assert.match(data, /^z[A-Za-z0-9_-]+$/, 'compressed, URL-safe');
  const p = readPayload(await decodeShare(data));
  assert.equal(p.name, 'Ana'); assert.equal(p.draft, 'Plan A'); assert.equal(p.program, 'imec');
  assert.deepEqual(p.sections.map(s => s.nrc), sections.map(s => s.nrc));
  assert.deepEqual(p.sections.map(s => s.schedules), sections.map(s => s.schedules));
  assert.deepEqual(p.sections.map(s => s.schedule_type === 'Complementaria'), [false, true, false]);
});

test('a whole demo schedule fits in a link of reasonable length', async () => {
  const data = await encodeShare(schedulePayload({ id: 'abc', name: 'Ana', draft: 'Horario 1', sections: demo.slice(0, 12) }));
  assert.ok(data.length < 1500, `link data is ${data.length} chars`);
});

test('damaged or foreign links are rejected with a readable message', async () => {
  await assert.rejects(decodeShare('zabc$'), /incompleto o dañado/);
  await assert.rejects(decodeShare(''), /incompleto o dañado/);
  assert.deepEqual(parseShareHash('https://x.github.io/horario/#ver=zAbc_-1'), { kind: 'ver', data: 'zAbc_-1' });
  assert.equal(parseShareHash('#horario'), null);
});

test('packing keeps days, times, kind, credits and part of term', () => {
  const s = { ...byCodeSec('FISI1518', '21'), ptrm: '8A' };
  const back = unpackSection(packSection(s));
  assert.equal(back.code, 'FISI1518'); assert.equal(back.schedule_type, 'Complementaria'); assert.equal(back.ptrm, '8A');
  assert.deepEqual(back.schedules[0].days, s.schedules[0].days); assert.equal(back.credits, 3);
});

test('classes in common: same section, or same course in another section', () => {
  const mine = [byCodeSec('MATE1203', '4'), byCodeSec('MATE1203', '41'), byCodeSec('QUIM1103', '1')];
  const theirs = [byCodeSec('MATE1203', '4'), byCodeSec('MATE1203', '41'), byCodeSec('QUIM1103', '2'), byCodeSec('ISIS1221', '1')];
  const { sameSection, sameCourse } = sharedClasses(mine, theirs);
  assert.deepEqual(sameSection.map(x => x.code), ['MATE1203']);
  assert.deepEqual(sameCourse.map(x => x.code), ['QUIM1103']);
});

test('common free time: windows of at least an hour when nobody has class', () => {
  const a = [sec('A', 1, 'Lunes', '07:00', '08:20'), sec('B', 2, 'Lunes', '11:00', '12:20')];
  const b = [sec('C', 3, 'Lunes', '09:30', '10:50'), sec('D', 4, 'Lunes', '14:00', '18:00')];
  const free = commonFree([a, b]);
  // 8:20–9:30 (70 min), 12:20–2:00 PM and 6–7 PM; 10:50–11:00 is too short.
  assert.deepEqual(free.Lunes, [[8 * 60 + 20, 9 * 60 + 30], [12 * 60 + 20, 14 * 60], [18 * 60, 19 * 60]]);
  assert.deepEqual(free.Martes, [[7 * 60, 19 * 60]]);
});

test('"Armar juntos" picks sections that fit every member', () => {
  const courses = ['MATE1203', 'QUIM1103'].map(code => ({ key: code, title: code, combos: usableCombos(buildCourseInfo(code, demo.filter(s => s.code === code)), false) }));
  // Ana works Wednesday 2–4 PM and Thursday mornings.
  const ana = { name: 'Ana', fixed: [sec('TRAB', 9, 'Miércoles', '14:00', '16:00'), sec('TRAB', 10, 'Jueves', '07:00', '12:00')] };
  const me = { name: 'Yo', fixed: [byCodeSec('ISIS1221', '10')] };
  const r = groupGenerate(courses, [me, ana]);
  assert.ok(r.results.length > 0);
  for (const res of r.results) for (const s of res) {
    for (const m of [me, ana]) assert.ok(!m.fixed.some(f => hasTimeConflict(f, s)), `${s.code} S${s.section} fits ${m.name}`);
  }
});

test('"Armar juntos" says who blocks a course when no section fits everyone', () => {
  const courses = [{ key: 'FISI1518', title: 'Física 1', combos: usableCombos(buildCourseInfo('FISI1518', demo.filter(s => s.code === 'FISI1518')), false) }];
  const busyNoon = ['Lunes', 'Miércoles', 'Viernes'].map((d, i) => sec('X', 20 + i, d, '12:00', '14:00'));
  const r = groupGenerate(courses, [{ name: 'Yo', fixed: [] }, { name: 'Ana', fixed: busyNoon }]);
  assert.equal(r.results.length, 0);
  assert.deepEqual(r.blockedBy, [{ title: 'Física 1', member: 'Ana' }]);
});
