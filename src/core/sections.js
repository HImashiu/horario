// Magistral ↔ complementaria structure. Ported from index.html v7 (kindOf, courseInfo …).
import { hasTimeConflict } from './time.js';

export const kindOf = s => { const t = (s.schedule_type || '').toLowerCase(); return (t.includes('complementaria') || t.includes('laboratorio')) ? 'comp' : 'mag'; };
export const kindLabel = s => kindOf(s) === 'mag' ? 'MAG' : 'COMP';
export const kindName = s => kindOf(s) === 'mag' ? 'Magistral' : 'Complementaria';

const num = v => (v === null || v === undefined || v === '' || v === 'N/A' || isNaN(Number(v))) ? null : Number(v);

export function seatTone(available, capacity) {
  const a = num(available), c = num(capacity);
  if (a === null || c === null) return 'unknown';
  if (a <= 0) return 'full';
  if (c > 0 && a / c < 0.2) return 'low';
  return 'ok';
}
export const hasSeats = s => seatTone(s.seats_available, s.capacity) !== 'full';
export const seatText = s => `${num(s.seats_available) ?? '–'}/${num(s.capacity) ?? '–'}`;

/**
 * Pairing for one course's sections. A complementaria belongs to the magistral
 * whose section number is its longest prefix (S4 → S41, S42).
 */
export function buildCourseInfo(code, secs, strictPairing = true) {
  const mags = secs.filter(s => kindOf(s) === 'mag'), comps = secs.filter(s => kindOf(s) === 'comp');
  const parent = new Map(); let linked = false;
  if (strictPairing && mags.length && comps.length) {
    comps.forEach(c => {
      let best = null;
      mags.forEach(m => { if (String(c.section).startsWith(String(m.section)) && (!best || String(m.section).length > String(best.section).length)) best = m; });
      if (best) { parent.set(c.id, best.id); linked = true; }
    });
  }
  const compatible = (m, c) => { if (!linked) return true; const p = parent.get(c.id); return !p || p === m.id; };
  const compsFor = m => comps.filter(c => compatible(m, c));
  const combos = [];
  if (mags.length) mags.forEach(m => { const cs = comps.length ? compsFor(m) : []; if (cs.length) cs.forEach(c => combos.push([m, c])); else combos.push([m]); });
  else comps.forEach(c => combos.push([c]));
  return { code, secs, mags, comps, linked, parent, compatible, compsFor, combos };
}

export function structureLabel(info) {
  if (!info.secs.length) return 'sin secciones';
  if (info.mags.length && info.comps.length) return 'magistral + complementaria';
  return info.mags.length ? 'solo magistral' : 'solo complementaria';
}

/** Combos a generator may use: no internal clash, optionally only with seats. */
export function usableCombos(info, onlySeats) {
  let combos = info.combos.filter(c => !(c.length > 1 && hasTimeConflict(c[0], c[1])));
  if (onlySeats) combos = combos.filter(c => c.every(hasSeats));
  return combos;
}

export function countConflicts(sections) {
  let n = 0;
  for (let i = 0; i < sections.length; i++) for (let j = i + 1; j < sections.length; j++)
    if (sections[i].code !== sections[j].code && hasTimeConflict(sections[i], sections[j])) n++;
  return n;
}

/** Sections chosen together when `sec` is picked, honouring magistral ↔ complementaria. */
export function resolvePick(info, chosen, sec) {
  let mag = chosen.find(s => kindOf(s) === 'mag'), comp = chosen.find(s => kindOf(s) === 'comp');
  let note = null;
  if (kindOf(sec) === 'mag') {
    mag = sec;
    if (comp && !info.compatible(mag, comp)) { note = { type: 'dropComp', comp, mag }; comp = null; }
  } else {
    comp = sec;
    const pid = info.parent.get(sec.id);
    if (pid && (!mag || mag.id !== pid)) {
      const p = info.secs.find(s => s.id === pid);
      note = { type: mag ? 'switchMag' : 'addMag', mag: p, comp: sec };
      mag = p;
    }
  }
  return { secs: [mag, comp].filter(Boolean), note };
}
