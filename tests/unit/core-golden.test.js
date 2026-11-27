// Characterization: the ported modules must behave like the original v7 app on its demo data.
// Golden values come from tests/tools/capture-v7-golden.cjs run against the v7 index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import golden from '../fixtures/golden-v7.json' with { type: 'json' };
import { demoBannerItems } from '../../src/data/demo.js';
import { parseItems } from '../../src/data/banner-import.js';
import { buildCourseInfo, usableCombos } from '../../src/core/sections.js';
import { generateSchedules } from '../../src/core/generator.js';
import { evaluateSchedule } from '../../src/core/score.js';

const sections = parseItems(demoBannerItems());
const codes = [...new Set(sections.map(s => s.code))];
const infoOf = code => buildCourseInfo(code, sections.filter(s => s.code === code), true);

test('demo import yields the same section ids as v7', () => {
  assert.deepEqual(sections.map(s => s.id), golden.sectionIds);
});

test('magistral ↔ complementaria pairing matches v7 for every course', () => {
  for (const code of codes) {
    const info = infoOf(code), g = golden.info[code];
    assert.equal(info.secs.length, g.secs, code);
    assert.deepEqual(info.mags.map(s => s.id), g.mags, `${code} mags`);
    assert.deepEqual(info.comps.map(s => s.id), g.comps, `${code} comps`);
    assert.equal(info.linked, g.linked, `${code} linked`);
    assert.deepEqual(Object.fromEntries(info.parent), g.parent, `${code} parent`);
    assert.deepEqual(info.combos.map(c => c.map(s => s.id)), g.combos, `${code} combos`);
  }
});

test('generator finds exactly the v7 set of schedules, with the same scores', () => {
  const courses = codes.map(code => ({ key: code, title: code, combos: usableCombos(infoOf(code), false) }));
  const { results, truncated } = generateSchedules(courses);
  assert.equal(results.length, golden.generator.count);
  assert.equal(truncated, golden.generator.truncated);
  const rules = { ...golden.rules, creditTarget: Number(golden.creditTarget) };
  const mine = new Map(results.map(secs => {
    const ev = evaluateSchedule(secs, rules, () => 3);
    return [secs.map(s => s.id).sort().join(','), { score: ev.score, days: ev.days, end: ev.lastEnd }];
  }));
  for (const g of golden.generator.all) {
    const key = g.ids.join(',');
    assert.ok(mine.has(key), `missing schedule ${key}`);
    assert.deepEqual(mine.get(key), { score: g.score, days: g.days, end: g.end }, key);
  }
});
