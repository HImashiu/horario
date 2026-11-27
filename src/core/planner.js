// "¿Cuándo me gradúo?": lays out what is left of the pensum into future semesters, respecting
// prerequisites, the pensum's gates, corequisites (same semester or before) and a credit cap.
// Pure functions over a context from eligibility.makeCtx.
import { isPassed, blockPassed, reqsOf } from './eligibility.js';
import { countOptions, termCodes } from './requirements.js';

// ─── Terms (Banner periods) ──────────────────────────────────
// 202710 = first semester of 2027 (January–May), 202720 = second (August–December).
const TERM_RE = /^(\d{4})(10|20)$/;
export const isTerm = t => TERM_RE.test(String(t || ''));
export const termLabel = t => (isTerm(t) ? `${String(t).slice(0, 4)}-${String(t).slice(4)}` : String(t || ''));
export function nextTerm(t) {
  const [, y, s] = String(t).match(TERM_RE) || [];
  if (!y) return t;
  return s === '10' ? `${y}20` : `${Number(y) + 1}10`;
}
export function prevTerm(t) {
  const [, y, s] = String(t).match(TERM_RE) || [];
  if (!y) return t;
  return s === '20' ? `${y}10` : `${Number(y) - 1}20`;
}
/** The semester a student is planning: from August, next year's first one; from February, this year's second. */
export function defaultStartTerm(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1;
  if (m >= 8) return `${y + 1}10`;
  if (m <= 1) return `${y}10`;
  return `${y}20`;
}
export function termsFrom(start, n) {
  const out = [start];
  while (out.length < n) out.push(nextTerm(out[out.length - 1]));
  return out;
}

// ─── Planner ─────────────────────────────────────────────────
/**
 * @param ctx      from makeCtx(p, route, profile)
 * @param options  maxCredits: credit cap per semester.
 *                 first: codes / block keys the student already chose for the first semester; that
 *                 semester is taken as they chose it (even over the cap).
 *                 maxSemesters: safety stop.
 * @returns {{
 *   semesters: { blocks: PlannedBlock[], credits: number, fixed: boolean }[],
 *   unplaced: { key, name, credits }[],
 *   notes: { code, label, kind, type, semester, for: string[] }[],
 *   remainingCredits: number, minSemesters: number,
 * }}
 * PlannedBlock: { key, kind, code, name, credits, cat, sem, option, bottleneck, chain }
 *   bottleneck: moving it one semester later would delay graduation (through what depends on it).
 */
export function planGraduation(ctx, { maxCredits = 18, first = [], maxSemesters = 16 } = {}) {
  const p = ctx.p, groups = p.groups || {};
  const rest = ctx.blocks.filter(b => !blockPassed(ctx, b));
  const remainingCredits = rest.reduce((a, b) => a + (b.credits || 0), 0);
  // Group options count as part of the plan even when the pensum lists them only as external
  // courses (Física's "Electivo de integración": FISI 3152 or FISI 3760).
  const groupOptions = new Set(ctx.blocks.filter(b => b.kind === 'group').flatMap(b => b.options));
  const inPlan = c => ctx.byCode.has(c) || groupOptions.has(c);
  const passed = c => isPassed(ctx, c);

  // Codes outside this plan (the English reading requirement, a lab listed only as a corequisite…)
  // are assumed to be met; the student gets a note with the semester they are first needed.
  /** Whether a term holds, given `met`. Options outside the plan count only when none is in it. */
  function termOk(t, met) {
    if (typeof t === 'string') return met(t) || !inPlan(t);
    if (Array.isArray(t)) return t.some(met) || !t.some(inPlan);
    const opts = countOptions(t, groups), need = t.count || 1;
    const have = opts.filter(met).length;
    if (have >= need) return true;
    if (opts.some(c => inPlan(c) && !met(c))) return false; // still to take through the plan
    return have + opts.filter(c => !inPlan(c)).length >= need;
  }
  /** Codes outside the plan that a term relies on (for the notes). */
  function outsideOf(t) {
    if (typeof t === 'string') return passed(t) || inPlan(t) ? [] : [t];
    if (Array.isArray(t)) return t.some(passed) || t.some(inPlan) ? [] : t.slice();
    const opts = countOptions(t, groups);
    if (opts.filter(passed).length >= (t.count || 1) || opts.some(inPlan)) return [];
    return opts.filter(c => !passed(c));
  }

  const optionBlock = o => ctx.byCode.get(o);
  /** The course that stands for a group block: its first option whose requirements hold. */
  function pickOption(b, met) {
    for (const o of b.options) {
      if (met(o)) continue;
      const ob = optionBlock(o);
      if (!ob) return o; // listed only by code: no known requirements
      const { req, gates } = reqsOf(ctx, ob);
      if ([...req, ...gates].every(t => termOk(t, met))) return o;
    }
    return null;
  }
  /** Requirements that must hold before the semester (prerequisites and gates). */
  function reqTerms(b, option) {
    if (b.kind === 'slot') return []; // electives: the course chosen decides (as in blockStatus)
    const { req, gates } = reqsOf(ctx, b.kind === 'group' ? optionBlock(option) || b : b);
    return [...req, ...gates];
  }
  const coreqTerms = (b, option) => (b.kind === 'group' ? (optionBlock(option)?.coreq || b.coreq || []) : b.coreq || []);

  // Remaining block that provides a code (a course, or a group through one of its options).
  const provider = new Map();
  rest.forEach(b => {
    if (b.kind === 'course') provider.set(b.code, b);
    if (b.kind === 'group') b.options.forEach(o => { if (!provider.has(o)) provider.set(o, b); });
  });

  // ── Earliest finish ignoring credits: the shortest possible plan (a lower bound) ──
  const efMemo = new Map(), efVisiting = new Set();
  function termEf(t) {
    const one = c => (passed(c) || !inPlan(c) || !provider.has(c) ? 0 : ef(provider.get(c)));
    if (typeof t === 'string') return one(t);
    if (Array.isArray(t)) return t.some(inPlan) ? Math.min(...t.filter(c => inPlan(c) || passed(c)).map(one)) : 0;
    const opts = countOptions(t, groups), need = t.count || 1;
    const vals = opts.filter(c => inPlan(c) || passed(c)).map(one).sort((a, b) => a - b);
    return vals.length >= need ? vals[need - 1] : (vals[vals.length - 1] || 0);
  }
  function efOf(b, option) {
    const reqMax = Math.max(0, ...reqTerms(b, option).map(termEf));
    const coMax = Math.max(0, ...coreqTerms(b, option).map(termEf));
    return Math.max(1 + reqMax, coMax, 1);
  }
  function ef(b) {
    if (efMemo.has(b.key)) return efMemo.get(b.key);
    if (efVisiting.has(b.key)) return 1;
    efVisiting.add(b.key);
    const v = b.kind === 'group' ? Math.min(...b.options.filter(o => !passed(o)).map(o => efOf(b, o)), 99) : efOf(b, null);
    efVisiting.delete(b.key);
    efMemo.set(b.key, v);
    return v;
  }
  const minSemesters = rest.length ? Math.max(...rest.map(ef)) : 0;

  // ── Height (longest chain of what depends on a block), used only to order choices ──
  const deps = new Map(rest.map(b => [b.key, { req: [], co: [] }]));
  rest.forEach(b => {
    const opts = b.kind === 'group' ? b.options : [null];
    const reqCodes = opts.flatMap(o => reqTerms(b, o).flatMap(t => termCodes(t, groups)));
    const coCodes = opts.flatMap(o => coreqTerms(b, o).flatMap(t => termCodes(t, groups)));
    new Set(reqCodes).forEach(c => { const y = provider.get(c); if (y && y.key !== b.key) deps.get(y.key).req.push(b.key); });
    new Set(coCodes).forEach(c => { const y = provider.get(c); if (y && y.key !== b.key) deps.get(y.key).co.push(b.key); });
  });
  const hMemo = new Map(), hVisiting = new Set();
  function height(key) {
    if (hMemo.has(key)) return hMemo.get(key);
    if (hVisiting.has(key)) return 1;
    hVisiting.add(key);
    let h = 1;
    deps.get(key).req.forEach(x => { h = Math.max(h, 1 + height(x)); });
    deps.get(key).co.forEach(x => { h = Math.max(h, height(x)); });
    hVisiting.delete(key);
    hMemo.set(key, h);
    return h;
  }
  // Order: the pensum's own order (relative to where the student is), except that a course whose
  // chain of dependents would otherwise delay graduation moves up to when it must start.
  const level = Math.min(...rest.filter(b => b.kind !== 'slot').map(b => b.sem), Infinity);
  const base = Number.isFinite(level) ? level : 0;
  const urgency = b => Math.min(b.sem - base, minSemesters - height(b.key));
  const priority = (a, b) => urgency(a) - urgency(b) || height(b.key) - height(a.key) || a.sem - b.sem || b.credits - a.credits || a.key.localeCompare(b.key);

  // ── Semester by semester ──
  const done = new Set(); // codes and block keys passed during the simulation
  const isMetBy = known => c => passed(c) || known.has(c);
  const semesters = [];
  let pending = rest.slice();
  const markDone = (b, option) => { done.add(b.key); if (b.code) done.add(b.code); if (option) done.add(option); };

  const firstSet = new Set(first || []);
  if (firstSet.size) {
    const chosen = pending.filter(b => firstSet.has(b.key) || (b.code && firstSet.has(b.code)) || (b.kind === 'group' && b.options.some(o => firstSet.has(o))));
    if (chosen.length) {
      const met = isMetBy(done);
      const items = chosen.map(b => ({ b, option: b.kind === 'group' ? (b.options.find(o => firstSet.has(o)) || pickOption(b, met) || b.options[0]) : null }));
      semesters.push({ items, credits: chosen.reduce((a, b) => a + (b.credits || 0), 0), fixed: true });
      items.forEach(({ b, option }) => markDone(b, option));
      pending = pending.filter(b => !chosen.includes(b));
    }
  }

  while (pending.length && semesters.length < maxSemesters) {
    const metBefore = isMetBy(new Set(done));
    // Available: requirements met by what was passed before this semester.
    const avail = [];
    for (const b of pending) {
      const option = b.kind === 'group' ? pickOption(b, metBefore) : null;
      if (b.kind === 'group' && !option) continue;
      if (reqTerms(b, option).every(t => termOk(t, metBefore))) avail.push({ b, option });
    }
    avail.sort((x, y) => priority(x.b, y.b));
    const availByCode = new Map();
    avail.forEach(a => { if (a.b.code) availByCode.set(a.b.code, a); if (a.option) availByCode.set(a.option, a); });

    const take = [], takenKeys = new Set(), takenCodes = new Set();
    let credits = 0;
    const metNow = c => metBefore(c) || takenCodes.has(c);
    for (const a of avail) {
      if (takenKeys.has(a.b.key)) continue;
      // Corequisites not met yet come along in the same semester (if they can be taken now).
      const bring = [], bringCodes = new Set();
      let ok = true;
      for (const t of coreqTerms(a.b, a.option)) {
        const metT = c => metNow(c) || bringCodes.has(c);
        if (termOk(t, metT)) continue;
        const want = typeof t === 'string' ? [t] : Array.isArray(t) ? t : countOptions(t, groups);
        let need = typeof t === 'object' && !Array.isArray(t) ? (t.count || 1) - want.filter(metT).length : 1;
        for (const c of want) {
          if (need <= 0) break;
          const cand = availByCode.get(c);
          if (!cand || takenKeys.has(cand.b.key) || cand.b.key === a.b.key || bring.includes(cand)) continue;
          bring.push(cand); bringCodes.add(c); if (cand.b.code) bringCodes.add(cand.b.code); need--;
        }
        if (need > 0) { ok = false; break; }
      }
      if (!ok) continue;
      const add = [a, ...bring];
      const cr = add.reduce((s, x) => s + (x.b.credits || 0), 0);
      if (credits + cr > maxCredits && take.length) continue;
      add.forEach(x => { take.push(x); takenKeys.add(x.b.key); if (x.b.code) takenCodes.add(x.b.code); if (x.option) takenCodes.add(x.option); });
      credits += cr;
      if (credits >= maxCredits) break;
    }
    if (!take.length) break; // what is left cannot be taken
    semesters.push({ items: take, credits, fixed: false });
    take.forEach(x => markDone(x.b, x.option));
    pending = pending.filter(b => !takenKeys.has(b.key));
  }

  // ── Bottlenecks: what each planned block really relies on, then how late it could move ──
  const semOf = new Map(), chosenOption = new Map();
  semesters.forEach((s, i) => s.items.forEach(x => { semOf.set(x.b.key, i); if (x.option) chosenOption.set(x.b.key, x.option); }));
  const plannedAt = c => {
    const y = provider.get(c);
    if (!y || !semOf.has(y.key)) return undefined;
    if (y.kind === 'group' && chosenOption.get(y.key) !== c) return undefined;
    return semOf.get(y.key);
  };
  const reliedBy = new Map([...semOf.keys()].map(k => [k, { req: [], co: [] }]));
  function relyOn(t, at, sameSemester) {
    const ok = c => { const s = plannedAt(c); return s !== undefined && (sameSemester ? s <= at : s < at); };
    const codes = termCodes(t, groups);
    if (codes.some(passed)) {
      if (typeof t === 'string' || Array.isArray(t)) return [];
      if (codes.filter(passed).length >= (t.count || 1)) return [];
    }
    const using = codes.filter(ok);
    if (typeof t === 'string') return using;
    if (Array.isArray(t)) return using.length === 1 ? using : []; // two options taken: neither is critical
    const need = (t.count || 1) - codes.filter(passed).length;
    return using.length === need ? using : [];
  }
  semesters.forEach((s, i) => s.items.forEach(({ b, option }) => {
    reqTerms(b, option).forEach(t => relyOn(t, i, false).forEach(c => reliedBy.get(provider.get(c).key)?.req.push(b.key)));
    coreqTerms(b, option).forEach(t => relyOn(t, i, true).forEach(c => { const y = provider.get(c).key; if (y !== b.key) reliedBy.get(y)?.co.push(b.key); }));
  }));
  const last = semesters.length - 1;
  const latest = new Map([...semOf.keys()].map(k => [k, last]));
  for (let changed = true, guard = 0; changed && guard < 60; guard++) {
    changed = false;
    for (const key of latest.keys()) {
      const d = reliedBy.get(key);
      let l = last;
      d.req.forEach(x => { l = Math.min(l, latest.get(x) - 1); });
      d.co.forEach(x => { l = Math.min(l, latest.get(x)); });
      if (l !== latest.get(key)) { latest.set(key, l); changed = true; }
    }
  }
  const isBottleneck = key => reliedBy.get(key).req.length > 0 && latest.get(key) <= semOf.get(key);
  const chainOf = key => {
    const out = [key];
    for (let cur = key, guard = 0; guard < 20; guard++) {
      const next = reliedBy.get(cur).req.find(x => latest.get(x) <= semOf.get(x));
      if (!next || out.includes(next)) break;
      out.push(next); cur = next;
    }
    return out;
  };

  // ── Notes: requirements outside the plan, with the semester they are first needed ──
  const notes = new Map();
  semesters.forEach((s, i) => s.items.forEach(({ b, option }) => {
    const add = (t, type) => outsideOf(t).forEach(c => {
      const ext = p.external?.[c];
      const n = notes.get(c) || { code: c, label: ext?.label || c, kind: ext?.kind || 'course', type, semester: i, for: [] };
      if (i < n.semester) n.semester = i;
      if (type === 'req') n.type = 'req';
      const who = b.code || option || b.key;
      if (!n.for.includes(who)) n.for.push(who);
      notes.set(c, n);
    });
    reqTerms(b, option).forEach(t => add(t, 'req'));
    coreqTerms(b, option).forEach(t => add(t, 'coreq'));
  }));

  return {
    semesters: semesters.map(s => ({
      fixed: s.fixed,
      credits: s.credits,
      blocks: s.items.map(({ b, option }) => {
        const bn = isBottleneck(b.key);
        return { key: b.key, kind: b.kind, code: b.code || null, name: b.name, credits: b.credits, cat: b.cat, sem: b.sem, option, bottleneck: bn, chain: bn ? chainOf(b.key) : [] };
      }).sort((x, y) => (y.bottleneck - x.bottleneck) || x.sem - y.sem),
    })),
    unplaced: pending.map(b => ({ key: b.key, name: b.name, credits: b.credits })),
    notes: [...notes.values()].sort((a, b) => a.semester - b.semester || a.code.localeCompare(b.code)),
    remainingCredits, minSemesters,
  };
}

/**
 * The smallest credit cap above `maxCredits` (up to `upTo`) that finishes in fewer semesters,
 * or null. For "con 19 créditos terminarías un semestre antes".
 */
export function fasterCap(ctx, opts, upTo = 22) {
  const base = planGraduation(ctx, opts);
  for (let c = opts.maxCredits + 1; c <= upTo; c++) {
    const r = planGraduation(ctx, { ...opts, maxCredits: c });
    if (r.semesters.length < base.semesters.length && !r.unplaced.length) return { maxCredits: c, semesters: r.semesters.length };
  }
  return null;
}
