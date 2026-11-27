import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPensum } from '../../src/core/pensum.js';
import { makeCtx, blockStatus, missing, missingCoreqs, closureForPass, closureForUnpass, progress, suggestSemester } from '../../src/core/eligibility.js';

const imec = getPensum('imec'), fisica = getPensum('fisica'), civil = getPensum('civil');
const block = (ctx, code) => ctx.byCode.get(code);

test('first-semester courses are available; later ones are locked until their prerequisites pass', () => {
  const ctx = makeCtx(imec, 'calculo', {});
  assert.equal(blockStatus(ctx, block(ctx, 'MATE1203')), 'available');
  assert.equal(blockStatus(ctx, block(ctx, 'MATE1214')), 'locked');
  assert.deepEqual(missing(ctx, block(ctx, 'MATE1214')), ['MATE1203']);
  const after = makeCtx(imec, 'calculo', { passed: ['MATE1203'] });
  assert.equal(blockStatus(after, block(after, 'MATE1214')), 'available');
});

test('the Cálculo route counts Precálculo as met by placement; the Precálculo route does not', () => {
  const calc = makeCtx(imec, 'calculo', {});
  assert.equal(blockStatus(calc, block(calc, 'IMEC1543')), 'available', 'Estática needs MATE 1201');
  const pre = makeCtx(imec, 'precalculo', {});
  assert.equal(blockStatus(pre, block(pre, 'IMEC1543')), 'locked');
});

test('marking a course passed marks its prerequisite chain, not its corequisites', () => {
  const ctx = makeCtx(imec, 'precalculo', {});
  const { toPass, toMeet, choices } = closureForPass(ctx, block(ctx, 'IMEC2522'));
  assert.deepEqual(new Set(toPass), new Set(['MATE1203', 'IMEC1543', 'MATE1201']));
  assert.ok(!toPass.includes('MATE1214'), 'MATE 1214 is a corequisite of IMEC 2522');
  assert.deepEqual(toMeet, []);
  assert.deepEqual(choices, []);
});

test('ESCR 1102 is satisfied through CCOM 1100, and the reading requirement is met, not passed', () => {
  const ctx = makeCtx(imec, 'calculo', {});
  const r = closureForPass(ctx, block(ctx, 'IMEC3709'));
  assert.ok(r.toPass.includes('CCOM1100'), 'CCOM 1100 marked for ESCR 1102');
  assert.ok(!r.toPass.includes('ESCR1102'));
  assert.deepEqual(r.toMeet, ['RLEC1']);
  assert.equal(r.choices.length, 1, 'IMEC 2540 o IMEC 2522 needs an answer');
  assert.deepEqual(new Set(r.choices[0].options), new Set(['IMEC2540', 'IMEC2522']));
});

test('count requirements (2 cursos de CPO1 o CPO2) come back as a choice', () => {
  const ctx = makeCtx(imec, 'calculo', { passed: ['IMEC2203'] });
  const r = closureForPass(ctx, block(ctx, 'IMEC3710'));
  const cpo = r.choices.find(c => c.options.includes('IMEC3345'));
  assert.ok(cpo);
  assert.equal(cpo.count, 1, 'one CPO course is already passed');
});

test('Civil gates: third-semester courses need CCOM 1100; fifth-semester ones the reading requirement', () => {
  const ctx = makeCtx(civil, 'unica', { passed: ['MATE1201', 'MATE1203'] });
  assert.equal(blockStatus(ctx, block(ctx, 'FISI1518')), 'locked');
  assert.deepEqual(missing(ctx, block(ctx, 'FISI1518')), ['CCOM1100']);
  const r = closureForPass(ctx, block(ctx, 'ICYA2001'));
  assert.ok(r.toPass.includes('CCOM1100'));
  assert.ok(r.toMeet.includes('RECLEC'));
});

test('un-marking a prerequisite un-marks what depended on it, but gates do not cascade', () => {
  const ctx = makeCtx(imec, 'calculo', { passed: ['MATE1203', 'MATE1214', 'MATE1105', 'MATE1207', 'MATE2301', 'CCOM1100', 'IMEC1543'] });
  assert.deepEqual(new Set(closureForUnpass(ctx, 'MATE1214')), new Set(['MATE1207', 'MATE2301']));
  const civ = makeCtx(civil, 'unica', { passed: ['CCOM1100', 'MATE1201', 'MATE1203', 'FISI1518'] });
  assert.deepEqual(closureForUnpass(civ, 'CCOM1100'), [], 'the Spanish gate does not clear the plan');
});

test('an any-of prerequisite survives un-marking one of its options', () => {
  const ctx = makeCtx(fisica, 'unica', { passed: ['FISI3515', 'FISI2551', 'FISI3981'] });
  assert.deepEqual(closureForUnpass(ctx, 'FISI3515'), [], 'FISI 3981 still has FISI 2551');
});

test('missing corequisites are reported unless chosen for next semester', () => {
  const ctx = makeCtx(fisica, 'unica', {});
  assert.deepEqual(missingCoreqs(ctx, block(ctx, 'FISI1518')), ['MATE1203']);
  const chosen = makeCtx(fisica, 'unica', {}, ['MATE1203']);
  assert.deepEqual(missingCoreqs(chosen, block(chosen, 'FISI1518')), []);
});

test('progress adds passed credits per category', () => {
  const ctx = makeCtx(fisica, 'unica', { passed: ['FISI1518', 'MATE1203', 'CCOM1100'] });
  const pr = progress(ctx);
  assert.equal(pr.total, 128);
  assert.equal(pr.done, 9);
  assert.equal(pr.byCat.get('integral').done, 3);
});

test('suggested semester follows the plan order, respects the credit target and keeps corequisites together', () => {
  const ctx = makeCtx(fisica, 'unica', {});
  const { picked, credits } = suggestSemester(ctx, 16);
  assert.ok(credits <= 17);
  assert.ok(picked.includes('FISI1518') && picked.includes('MATE1203'), 'Física 1 comes with its corequisite Cálculo Diferencial');
  const passedFirst = makeCtx(fisica, 'unica', { passed: ['FISI1518', 'MATE1203', 'ISIS1221', 'FISI1502', 'CCOM1100'] });
  const next = suggestSemester(passedFirst, 17).picked;
  assert.ok(next.includes('FISI1528') && next.includes('MATE1214'));
  assert.ok(!next.includes('FISI1538'), 'Ondas y Fluidos is still locked');
});
