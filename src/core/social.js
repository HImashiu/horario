// Comparing schedules with friends: classes in common, common free time and "Armar juntos".
import { DAYS, timeToMinutes, hasTimeConflict } from './time.js';
import { generateSchedules } from './generator.js';

/** Classes in common between my sections and someone else's. */
export function sharedClasses(mine, theirs) {
  const mineByCode = groupBy(mine), theirsByCode = groupBy(theirs);
  const sameSection = [], sameCourse = [];
  for (const [code, my] of mineByCode) {
    const th = theirsByCode.get(code); if (!th) continue;
    const myNrcs = new Set(my.map(s => s.nrc));
    const shared = th.filter(s => myNrcs.has(s.nrc));
    if (shared.length === th.length && shared.length === my.length) sameSection.push({ code, title: my[0].title, sections: shared });
    else sameCourse.push({ code, title: my[0].title, mine: my, theirs: th, partial: shared });
  }
  return { sameSection, sameCourse };
}
const groupBy = list => { const m = new Map(); list.forEach(s => { if (!m.has(s.code)) m.set(s.code, []); m.get(s.code).push(s); }); return m; };

/**
 * Times when nobody in `people` (a list of section lists) has class.
 * Returns { Lunes: [[from, to], …], … } in minutes, keeping windows of at least `min` minutes.
 */
export function commonFree(people, { start = 7 * 60, end = 19 * 60, min = 60, days = DAYS } = {}) {
  const out = {};
  for (const day of days) {
    const busy = [];
    people.forEach(secs => secs.forEach(s => (s.schedules || []).forEach(sch => { if (sch.days.includes(day)) busy.push([timeToMinutes(sch.start_time), timeToMinutes(sch.end_time)]); })));
    busy.sort((a, b) => a[0] - b[0]);
    const free = [];
    let cursor = start;
    for (const [s, e] of busy) { if (s > cursor) free.push([cursor, Math.min(s, end)]); cursor = Math.max(cursor, e); if (cursor >= end) break; }
    if (cursor < end) free.push([cursor, end]);
    out[day] = free.filter(([a, b]) => b - a >= min);
  }
  return out;
}

/**
 * "Armar juntos": for courses everybody will take together, keep the combos that fit every
 * member's other classes, then search conflict-free choices with the normal generator.
 * members: [{ name, fixed: sections }]   courses: [{ key, title, combos }]
 */
export function groupCombos(courses, members) {
  return courses.map(c => ({ ...c, combos: c.combos.filter(combo => members.every(m => !combo.some(s => m.fixed.some(f => f.code !== s.code && hasTimeConflict(f, s))))) }));
}
export function groupGenerate(courses, members, opts) {
  const filtered = groupCombos(courses, members);
  const blockedBy = filtered.filter(c => !c.combos.length).map(c => {
    // Who makes this course impossible? The first member whose classes clash with every option.
    const orig = courses.find(o => o.key === c.key);
    const who = members.find(m => orig.combos.every(combo => combo.some(s => m.fixed.some(f => f.code !== s.code && hasTimeConflict(f, s)))));
    return { title: c.title, member: who?.name || null };
  });
  if (blockedBy.length) return { results: [], truncated: false, empty: blockedBy.map(b => b.title), blockedBy, clash: null };
  return { ...generateSchedules(filtered, opts), blockedBy: [] };
}
