// Conflict-free schedule search. Ported from index.html v7 (runGenerator) as a pure function.
import { hasTimeConflict } from './time.js';

/**
 * @param courses [{ key, title, combos: [[section, ...], ...] }]  one entry per course to place
 * @returns {{ results: section[][], truncated: boolean, empty: string[], clash: [string, string] | null }}
 */
export function generateSchedules(courses, { maxResults = 400, maxNodes = 80000 } = {}) {
  const empty = courses.filter(c => !c.combos.length).map(c => c.title);
  if (empty.length) return { results: [], truncated: false, empty, clash: null };
  const order = courses.slice().sort((a, b) => a.combos.length - b.combos.length);
  const results = [], acc = [];
  let nodes = 0;
  (function bt(i) {
    if (results.length >= maxResults || nodes > maxNodes) return;
    nodes++;
    if (i === order.length) { results.push(acc.slice()); return; }
    for (const combo of order[i].combos) {
      if (combo.some(s => acc.some(a => hasTimeConflict(a, s)))) continue;
      acc.push(...combo); bt(i + 1); acc.splice(acc.length - combo.length, combo.length);
    }
  })(0);
  let clash = null;
  if (!results.length) {
    // A pair of courses that can never fit together gives the user a concrete hint.
    outer: for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      const ok = order[i].combos.some(a => order[j].combos.some(b => !a.some(x => b.some(y => hasTimeConflict(x, y)))));
      if (!ok) { clash = [order[i].title, order[j].title]; break outer; }
    }
  }
  return { results, truncated: nodes > maxNodes || results.length >= maxResults, empty: [], clash };
}

/** Rank results by score (desc), then fewer days, then earlier end. */
export function rankResults(results, evaluate) {
  return results.map(secs => {
    const ev = evaluate(secs);
    return { ids: secs.map(s => s.id), score: ev.score, days: ev.days, end: ev.lastEnd, gaps: ev.gaps };
  }).sort((a, b) => b.score - a.score || a.days - b.days || a.end - b.end || a.gaps - b.gaps);
}
