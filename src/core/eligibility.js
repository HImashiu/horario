// What a student has passed, what is locked, and what follows from marking a course.
// Pure functions over the pensum data and the profile ({ passed, externalMet }).
import { blocksOf, routeOf } from './pensum.js';
import { isTermMet, countOptions, termCodes } from './requirements.js';

/**
 * Context for one pensum + route + profile.
 * `selected`: codes and block keys chosen for next semester (they satisfy corequisites).
 */
export function makeCtx(p, routeId, profile = {}, selected = []) {
  const route = routeOf(p, routeId);
  const blocks = blocksOf(p, route.id);
  const byCode = new Map(blocks.filter(b => b.kind === 'course').map(b => [b.code, b]));
  // Group options get the group's semester, so gates apply to them too.
  blocks.filter(b => b.kind === 'group').forEach(g => g.options.forEach(code => {
    if (!byCode.has(code) && p.courses[code]) {
      const c = p.courses[code];
      byCode.set(code, { key: code, kind: 'course', sem: g.sem, code, name: c.name, credits: c.credits, cat: g.cat, cats: [g.cat], req: [...(c.req || []), ...(g.req || [])], coreq: [...(c.coreq || []), ...(g.coreq || [])], option: true });
    }
  }));
  return {
    p, route, blocks, byCode,
    passed: new Set(profile.passed || []), met: new Set(profile.externalMet || []),
    assumed: new Set(route.assumed || []), selected: new Set(selected),
  };
}

export const isPassed = (ctx, code) => ctx.passed.has(code) || ctx.assumed.has(code) || ctx.met.has(code);
const isRequirement = (ctx, code) => ctx.p.external?.[code]?.kind === 'requirement';

/** Requirements of a block, with the pensum's gates ("para semestre ≥ N se necesita X"). */
export function reqsOf(ctx, b) {
  const gates = [];
  for (const r of ctx.p.rules || []) {
    if (r.type !== 'gate') continue;
    if (b.sem + 1 >= r.fromSemester || (r.also || []).includes(b.code)) gates.push(...r.requires.filter(c => c !== b.code));
  }
  return { req: b.req || [], gates, coreq: b.coreq || [] };
}

export function blockPassed(ctx, b) {
  if (b.kind === 'course') return isPassed(ctx, b.code);
  if (b.kind === 'group') return b.options.some(o => isPassed(ctx, o));
  return ctx.passed.has(b.key);
}

/** Requirement terms (prerequisites and gates) still missing for a block. */
export function missing(ctx, b) {
  const { req, gates } = reqsOf(ctx, b);
  const met = c => isPassed(ctx, c);
  return [...req, ...gates].filter(t => !isTermMet(t, met, ctx.p.groups));
}
/** Corequisites neither passed nor chosen for next semester. */
export function missingCoreqs(ctx, b, extra = new Set()) {
  const ok = c => isPassed(ctx, c) || ctx.selected.has(c) || extra.has(c);
  return (b.coreq || []).filter(t => !isTermMet(t, ok, ctx.p.groups));
}

/** 'passed' | 'locked' | 'available' */
export function blockStatus(ctx, b) {
  if (blockPassed(ctx, b)) return 'passed';
  if (b.kind === 'slot') return 'available';
  if (b.kind === 'group') return b.options.every(o => { const ob = ctx.byCode.get(o); return ob && missing(ctx, ob).length; }) ? 'locked' : 'available';
  return missing(ctx, b).length ? 'locked' : 'available';
}

/**
 * Marking `b` as passed also marks what it needed: its prerequisites (and theirs), and gate
 * requirements. Corequisites are NOT marked. Any-of terms with a single option in the plan are
 * resolved; others come back as `choices` for the user to answer.
 * @returns {{ toPass: string[], toMeet: string[], choices: {forCode, options, count}[] }}
 */
export function closureForPass(ctx, b) {
  const toPass = new Set(), toMeet = new Set(), choices = [];
  const done = c => isPassed(ctx, c) || toPass.has(c) || toMeet.has(c);
  const add = code => {
    if (done(code)) return;
    if (isRequirement(ctx, code)) { toMeet.add(code); return; }
    toPass.add(code);
    const blk = ctx.byCode.get(code);
    if (blk) visit(blk);
  };
  function visit(block) {
    const { req, gates } = reqsOf(ctx, block);
    for (const t of [...req, ...gates]) {
      if (isTermMet(t, done, ctx.p.groups)) continue;
      if (typeof t === 'string') add(t);
      else if (Array.isArray(t)) {
        const inPlan = t.filter(c => ctx.byCode.has(c));
        if (inPlan.length === 1) add(inPlan[0]);
        else choices.push({ forCode: block.code || block.key, options: inPlan.length ? inPlan : t, count: 1 });
      } else {
        const opts = countOptions(t, ctx.p.groups);
        const have = opts.filter(done).length;
        choices.push({ forCode: block.code || block.key, options: opts, count: (t.count || 1) - have });
      }
    }
  }
  // Groups are marked through the option the student took (ctx.byCode has each option).
  if (b.kind === 'course') visit(b);
  return { toPass: [...toPass], toMeet: [...toMeet], choices };
}

/**
 * Un-marking `code` also un-marks passed courses that needed it as a prerequisite (and those
 * that needed them). Gates are not followed: un-marking CCOM 1100 does not clear the whole plan.
 */
export function closureForUnpass(ctx, code) {
  const out = new Set();
  const queue = [code];
  const courses = [...ctx.byCode.values()];
  while (queue.length) {
    const c = queue.shift();
    for (const b of courses) {
      if (out.has(b.code) || b.code === code || !ctx.passed.has(b.code)) continue;
      for (const t of b.req || []) {
        if (!termCodes(t, ctx.p.groups).includes(c)) continue;
        const still = isTermMet(t, x => x !== code && !out.has(x) && isPassed(ctx, x), ctx.p.groups);
        if (!still) { out.add(b.code); queue.push(b.code); break; }
      }
    }
  }
  return [...out];
}

/** Credits passed, overall and per category. */
export function progress(ctx) {
  const byCat = new Map(ctx.p.categories.map(c => [c.id, { done: 0, total: 0 }]));
  let done = 0, total = 0;
  for (const b of ctx.blocks) {
    const cat = byCat.get(b.cat); total += b.credits; if (cat) cat.total += b.credits;
    if (blockPassed(ctx, b)) { done += b.credits; if (cat) cat.done += b.credits; }
  }
  return { done, total, byCat };
}

/**
 * Next-semester suggestion: available blocks in plan order (earliest semester first), up to the
 * credit target, keeping corequisites together. Returns block keys (and coreq codes).
 */
export function suggestSemester(ctx, target = 18) {
  const picked = [], pickedSet = new Set();
  let credits = 0;
  const order = ctx.blocks.slice().sort((a, b) => a.sem - b.sem);
  for (const b of order) {
    if (credits >= target) break;
    if (ctx.selected.has(b.code) || ctx.selected.has(b.key) || blockStatus(ctx, b) !== 'available') continue;
    // Corequisites that are in the plan come along; skip the block if they do not fit.
    const co = missingCoreqs(ctx, b, pickedSet).map(t => (typeof t === 'string' ? t : Array.isArray(t) ? t.find(c => ctx.byCode.has(c)) || t[0] : null)).filter(Boolean);
    const coBlocks = co.map(c => ctx.byCode.get(c)).filter(Boolean).filter(x => blockStatus(ctx, x) === 'available');
    const extra = coBlocks.reduce((a, x) => a + x.credits, 0);
    if (credits + b.credits + extra > target + 1) continue;
    picked.push(b.kind === 'course' ? b.code : b.key); pickedSet.add(b.code || b.key);
    coBlocks.forEach(x => { if (!pickedSet.has(x.code)) { picked.push(x.code); pickedSet.add(x.code); } });
    credits += b.credits + extra;
  }
  return { picked, credits };
}
