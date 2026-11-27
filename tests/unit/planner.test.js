import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPensum, blocksOf } from '../../src/core/pensum.js';
import { makeCtx, isPassed, reqsOf } from '../../src/core/eligibility.js';
import { isTermMet, countOptions } from '../../src/core/requirements.js';
import { planGraduation, fasterCap, termLabel, nextTerm, prevTerm, defaultStartTerm, termsFrom } from '../../src/core/planner.js';

const imec = getPensum('imec'), fisica = getPensum('fisica'), civil = getPensum('civil');
const PROGRAMS = [[imec, 'calculo'], [imec, 'precalculo'], [fisica, 'unica'], [civil, 'unica']];

test('terms: labels, next and previous, and the semester being planned', () => {
  assert.equal(termLabel('202710'), '2027-10');
  assert.equal(nextTerm('202710'), '202720');
  assert.equal(nextTerm('202720'), '202810');
  assert.equal(prevTerm('202710'), '202620');
  assert.equal(prevTerm('202720'), '202710');
  assert.deepEqual(termsFrom('202720', 3), ['202720', '202810', '202820']);
  assert.equal(defaultStartTerm(new Date(2026, 10, 27)), '202710', 'in November, next January');
  assert.equal(defaultStartTerm(new Date(2027, 0, 10)), '202710', 'in January, the semester about to start');
  assert.equal(defaultStartTerm(new Date(2027, 3, 15)), '202720', 'in April, the second semester');
});

/**
 * Checks a plan the way a coordinator would: every block once, the credit cap, prerequisites
 * (and gates) passed in an earlier semester, corequisites in the same semester or before.
 */
function checkPlan(p, route, profile, plan, cap) {
  const ctx = makeCtx(p, route, profile);
  const groupOptions = new Set(ctx.blocks.filter(b => b.kind === 'group').flatMap(b => b.options));
  const inPlan = c => ctx.byCode.has(c) || groupOptions.has(c);
  const at = new Map(); // code → semester index
  plan.semesters.forEach((s, i) => s.blocks.forEach(b => { at.set(b.key, i); if (b.code) at.set(b.code, i); if (b.option) at.set(b.option, i); }));
  const keys = plan.semesters.flatMap(s => s.blocks.map(b => b.key));
  assert.equal(new Set(keys).size, keys.length, 'no block twice');
  const pending = ctx.blocks.filter(b => !(b.kind === 'course' ? isPassed(ctx, b.code) : b.kind === 'group' ? b.options.some(o => isPassed(ctx, o)) : ctx.passed.has(b.key)));
  assert.deepEqual(new Set(keys), new Set(pending.map(b => b.key)), 'every pending block is planned');
  plan.semesters.forEach((s, i) => {
    if (!s.fixed) assert.ok(s.credits <= cap || s.blocks.length === 1, `semester ${i + 1}: ${s.credits} cr over ${cap}`);
    assert.equal(s.credits, s.blocks.reduce((a, b) => a + b.credits, 0));
    for (const b of s.blocks) {
      if (b.kind === 'slot') continue;
      const blk = b.kind === 'group' ? (ctx.byCode.get(b.option) || ctx.blocks.find(x => x.key === b.key)) : ctx.byCode.get(b.code);
      const { req, gates, coreq } = reqsOf(ctx, blk);
      const metBefore = c => isPassed(ctx, c) || (at.has(c) && at.get(c) < i);
      const metBy = c => isPassed(ctx, c) || (at.has(c) && at.get(c) <= i);
      const outside = t => (typeof t === 'string' ? !inPlan(t) : Array.isArray(t) ? !t.some(inPlan) : !countOptions(t, p.groups).some(inPlan));
      for (const t of [...req, ...gates]) assert.ok(isTermMet(t, metBefore, p.groups) || outside(t), `${b.key} in semester ${i + 1} needs ${JSON.stringify(t)} before`);
      for (const t of coreq) assert.ok(isTermMet(t, metBy, p.groups) || outside(t), `${b.key} in semester ${i + 1} needs ${JSON.stringify(t)} with it`);
    }
  });
}

test('from scratch, every pensum fits its prerequisites, gates and corequisites into semesters', () => {
  for (const [p, route] of PROGRAMS) {
    const plan = planGraduation(makeCtx(p, route, {}), { maxCredits: 18 });
    assert.deepEqual(plan.unplaced, [], `${p.id}/${route}`);
    assert.equal(plan.remainingCredits, p.totalCredits);
    assert.ok(plan.semesters.length >= plan.minSemesters, 'never shorter than the prerequisite chains allow');
    assert.ok(plan.semesters.length <= 9, `${p.id}/${route}: ${plan.semesters.length} semesters`);
    checkPlan(p, route, {}, plan, 18);
  }
});

test('more credits per semester never take longer; fewer take longer', () => {
  for (const [p, route] of PROGRAMS) {
    const ctx = makeCtx(p, route, {});
    const n = cap => planGraduation(ctx, { maxCredits: cap }).semesters.length;
    assert.ok(n(21) <= n(18), `${p.id} 21 vs 18`);
    assert.ok(n(12) > n(18), `${p.id} 12 vs 18`);
    checkPlan(p, route, {}, planGraduation(ctx, { maxCredits: 12 }), 12);
  }
  const faster = fasterCap(makeCtx(imec, 'calculo', {}), { maxCredits: 15 });
  assert.ok(faster && faster.maxCredits > 15 && faster.semesters < planGraduation(makeCtx(imec, 'calculo', {}), { maxCredits: 15 }).semesters.length);
});

test('what was passed is not planned again, and the plan gets shorter', () => {
  const firstFour = blocksOf(imec, 'calculo').filter(b => b.sem <= 3).map(b => (b.kind === 'group' ? b.options[0] : b.code || b.key));
  const profile = { passed: firstFour, externalMet: [] };
  const plan = planGraduation(makeCtx(imec, 'calculo', profile), { maxCredits: 18 });
  assert.ok(plan.semesters.length <= 5, `${plan.semesters.length} semesters after four`);
  assert.ok(!plan.semesters.some(s => s.blocks.some(b => b.code === 'MATE1203')));
  checkPlan(imec, 'calculo', profile, plan, 18);
});

test('the courses chosen for next semester stay together as the first semester', () => {
  const first = ['MATE1203', 'IMEC1000', 'slot:imec:cbu:1', 'IMEC2203'];
  const plan = planGraduation(makeCtx(imec, 'calculo', {}), { maxCredits: 18, first });
  const s1 = plan.semesters[0];
  assert.equal(s1.fixed, true);
  assert.deepEqual(new Set(s1.blocks.map(b => b.key)), new Set(['MATE1203', 'IMEC1000', 'slot:imec:cbu:1', 'grp:CPO1']));
  assert.equal(s1.blocks.find(b => b.key === 'grp:CPO1').option, 'IMEC2203', 'the option the student chose');
  assert.ok(!plan.semesters.slice(1).some(s => s.blocks.some(b => b.key === 'MATE1203')));
});

test('bottlenecks: courses whose chain sets the date; an option of "any one of five" is not one', () => {
  const plan = planGraduation(makeCtx(fisica, 'unica', {}), { maxCredits: 24 });
  assert.equal(plan.semesters.length, plan.minSemesters, 'with room to spare, the chains set the date');
  const all = plan.semesters.flatMap(s => s.blocks);
  const bn = new Set(all.filter(b => b.bottleneck).map(b => b.key));
  assert.ok(bn.has('MATE1203'), 'Cálculo Diferencial starts the longest chain');
  assert.ok(all.find(b => b.key === 'MATE1203').chain.length >= 4);
  // FISI 3981 needs any one of FISI 3515, 2551, 2528, 2632 or 3540: taking two of them early,
  // neither alone holds it back.
  for (const k of ['FISI2528', 'FISI2551']) assert.ok(!bn.has(k), `${k} is not a bottleneck`);
  // In a plan limited by credits, nothing is.
  const loose = planGraduation(makeCtx(imec, 'calculo', {}), { maxCredits: 18 });
  assert.ok(loose.semesters.length > loose.minSemesters);
});

test('Civil: without Español, the semester-3 rule holds everything back until CCOM 1100', () => {
  const passed = blocksOf(civil, 'unica').filter(b => b.sem <= 1 && b.code !== 'CCOM1100').map(b => b.code || b.key);
  const plan = planGraduation(makeCtx(civil, 'unica', { passed }), { maxCredits: 20 });
  const s1 = plan.semesters[0].blocks;
  assert.ok(s1.some(b => b.code === 'CCOM1100' && b.bottleneck), 'CCOM 1100 first, and it sets the pace');
  assert.ok(s1.every(b => b.kind === 'slot' || b.code === 'CCOM1100'), `only electives fit with it: ${s1.map(b => b.key)}`);
  const reading = plan.notes.find(n => n.code === 'RECLEC');
  assert.ok(reading && reading.kind === 'requirement' && reading.type === 'req');
  assert.equal(reading.semester, 1, 'needed by the first semester with fifth-semester courses');
});

test('notes: a lab corequisite outside the plan goes in the same semester; a requirement before', () => {
  const plan = planGraduation(makeCtx(imec, 'calculo', {}), { maxCredits: 18 });
  const lab = plan.notes.find(n => n.code === 'QUIM1104');
  const quimAt = plan.semesters.findIndex(s => s.blocks.some(b => b.code === 'QUIM1103'));
  assert.ok(lab && lab.type === 'coreq' && lab.semester === quimAt && lab.for.includes('QUIM1103'));
  const reading = plan.notes.find(n => n.code === 'RLEC1');
  assert.ok(reading && reading.type === 'req' && reading.for.includes('IMEC3709'));
  // Once met, the note goes away.
  const met = planGraduation(makeCtx(imec, 'calculo', { externalMet: ['RLEC1'] }), { maxCredits: 18 });
  assert.ok(!met.notes.some(n => n.code === 'RLEC1'));
});

test('Física: the integration elective (listed only by code) is planned with the final project', () => {
  const plan = planGraduation(makeCtx(fisica, 'unica', {}), { maxCredits: 18 });
  const where = key => plan.semesters.findIndex(s => s.blocks.some(b => b.key === key));
  assert.ok(where('grp:INTEG') >= 0 && where('grp:INTEG') <= where('grp:PFINAL'));
  assert.ok(!plan.notes.some(n => n.code === 'FISI3152' || n.code === 'FISI3760'), 'not an outside requirement');
});
