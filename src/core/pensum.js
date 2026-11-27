// Access to the pensum data (data/pensums/*.json) and helpers to read it.
import imec from '../../data/pensums/imec.json' with { type: 'json' };
import fisica from '../../data/pensums/fisica.json' with { type: 'json' };
import civil from '../../data/pensums/civil.json' with { type: 'json' };
import { listCodes, formatTerm, fmtCode } from './requirements.js';

export const PENSUMS = { imec, fisica, civil };
export const PROGRAM_IDS = ['imec', 'fisica', 'civil'];
export const getPensum = id => PENSUMS[id] || null;
export const routeOf = (p, routeId) => p.routes.find(r => r.id === routeId) || p.routes[0];
export const categoryOf = (p, id) => p.categories.find(c => c.id === id) || null;
export const toneOf = (p, catId) => categoryOf(p, catId)?.tone || 'slate';
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Name, credits and requirements of a code in this pensum (course, group option or external). */
export function courseMeta(p, code) {
  if (p.courses[code]) return { code, ...p.courses[code] };
  if (p.external?.[code]) return { code, name: p.external[code].label, external: true, kind: p.external[code].kind };
  for (const slot of Object.values(p.slotKinds || {})) if (slot.optionNames?.[code]) return { code, name: slot.optionNames[code] };
  return null;
}

/**
 * Every block of a route, in semester order, with a stable key.
 * kind: 'course' | 'slot' | 'group'
 */
export function blocksOf(p, routeId) {
  const route = routeOf(p, routeId);
  const out = [], occurrence = {};
  route.semesters.forEach((sem, si) => sem.items.forEach((it, ii) => {
    if (typeof it === 'string') {
      const c = p.courses[it];
      out.push({ key: it, kind: 'course', sem: si, code: it, name: c.name, credits: c.credits, cat: c.cat, cats: [c.cat], req: c.req || [], coreq: c.coreq || [], note: c.note });
    } else if (it.group) {
      const g = p.groups[it.group];
      out.push({ key: `grp:${it.group}`, kind: 'group', sem: si, group: it.group, name: g.label, credits: it.credits, cat: it.cat, cats: [it.cat], options: g.options, req: g.req || [], coreq: g.coreq || [], hint: g.hint });
    } else {
      // Slot keys count occurrences of each kind ("CBU 2" is cbu:2), so they stay the same across routes.
      occurrence[it.slot] = (occurrence[it.slot] || 0) + 1;
      out.push({ key: `slot:${p.id}:${it.slot}:${occurrence[it.slot]}`, kind: 'slot', sem: si, slot: it.slot, name: it.label, credits: it.credits, cat: it.cat, cats: it.cats || [it.cat], req: [], coreq: [] });
    }
  }));
  return out;
}

/** Order blocks within a semester like the 2020 pensum: by category, in legend order. */
export function sortByCategory(p, blocks) {
  const order = new Map(p.categories.map((c, i) => [c.id, i]));
  return blocks.slice().sort((a, b) => (order.get(a.cat) ?? 99) - (order.get(b.cat) ?? 99));
}

/** Text for a requirement list, e.g. "MATE 1214 · MATE 1105". */
export function reqText(p, list) {
  const label = code => (p.external?.[code]?.kind === 'requirement' ? p.external[code].label : fmtCode(code));
  return (list || []).map(t => formatTerm(t, p.groups || {}, label));
}

/** Codes (courses and group options) that list `code` among their requirements. */
export function dependentsOf(p, code) {
  const out = [];
  for (const [c, meta] of Object.entries(p.courses)) {
    if (listCodes(meta.req, p.groups).includes(code)) out.push({ code: c, type: 'req' });
    else if (listCodes(meta.coreq, p.groups).includes(code)) out.push({ code: c, type: 'coreq' });
  }
  return out;
}

/** The pensum category for a course code (when it appears in the pensum or as an option). */
export function categoryForCode(p, code) {
  if (!p || !code) return null;
  if (p.courses[code]) return p.courses[code].cat;
  for (const route of p.routes) for (const sem of route.semesters) for (const it of sem.items) {
    if (it.group && p.groups[it.group]?.options.includes(code)) return it.cat;
  }
  for (const e of p.emphases || []) if (e.required === code || e.electives.includes(code)) return 'ruta';
  for (const [kind, slot] of Object.entries(p.slotKinds || {})) if (slot.options?.includes(code)) {
    for (const route of p.routes) for (const sem of route.semesters) for (const it of sem.items) if (it.slot === kind) return it.cat;
  }
  return null;
}

export const sourceDate = iso => { const d = new Date(iso + 'T12:00:00'); return isNaN(d) ? iso : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }); };
