// App state, persistence and the operations on it. Ported from index.html v7
// (basket, drafts, choosing sections, undo/redo, generator) with these fixes:
//  - undo/redo snapshots include `locked` and `skipped` (v7 restored sections but left
//    a course skipped after "No incluir" was undone)
//  - course info is cached per data version instead of being rebuilt on every render
//  - sections Uniandes stops returning are marked `stale` instead of lingering as offered
import { buildCourseInfo, kindOf, kindLabel, resolvePick, usableCombos } from '../core/sections.js';
import { hasTimeConflict } from '../core/time.js';
import { generateSchedules, rankResults } from '../core/generator.js';
import { evaluateSchedule, hardBusy, overlapsBusy } from '../core/score.js';
import { migrate, emptyState } from './migrate.js';
import { createLocalStore } from '../storage/local-store.js';

export const STORAGE_KEY = 'bannerScheduleBuilderState_v1';
export const BACKUP_KEY = 'bannerScheduleBuilderState_v1__v7backup';
const UNDO_LIMIT = 40;
export const PALETTE_SIZE = 8;

/** Persisted state plus runtime fields (selected sections of the current draft, generator session). */
export const S = { ...emptyState(), selected: [], gen: null, migratedFrom: null };
let storage = createLocalStore();
export const setStorage = s => { storage = s; };

// ─── Change notification ─────────────────────────────────────
const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = () => listeners.forEach(fn => fn());

// ─── Indexes and caches ──────────────────────────────────────
let byId = new Map(), byCode = new Map();
const infoCache = new Map();
export function reindex() {
  byId = new Map(S.sections.map(s => [s.id, s]));
  byCode = new Map();
  S.sections.forEach(s => { if (!byCode.has(s.code)) byCode.set(s.code, []); byCode.get(s.code).push(s); });
  infoCache.clear();
}
export const findSec = id => byId.get(id);
export const sectionsOf = code => byCode.get(code) || [];
export function courseInfo(code) {
  if (!infoCache.has(code)) infoCache.set(code, buildCourseInfo(code, sectionsOf(code).filter(s => !s.stale), S.rules.strictPairing !== false));
  return infoCache.get(code);
}

// ─── Persistence ─────────────────────────────────────────────
export function load() {
  const raw = storage.getRaw(STORAGE_KEY);
  let saved = null;
  if (raw !== null) { try { saved = JSON.parse(raw); } catch { saved = null; } }
  const { state, migratedFrom } = migrate(saved);
  if (migratedFrom && raw !== null && storage.getRaw(BACKUP_KEY) === null) storage.setRaw(BACKUP_KEY, raw);
  Object.assign(S, state, { selected: [], gen: null, migratedFrom });
  if (!S.drafts.length) S.drafts = [makeDraft('Horario 1')];
  if (!S.drafts.some(d => d.id === S.currentDraftId)) S.currentDraftId = S.drafts[0].id;
  reindex();
  refreshBasketMeta();
  S.selected = resolveDraftSections(S.currentDraftId);
  return { restored: S.basket.length > 0, migratedFrom };
}
export function save() {
  syncCurrentDraft();
  const { selected, gen, migratedFrom, ...persist } = S;
  return storage.setJSON(STORAGE_KEY, persist);
}
export function commit() { save(); emit(); }
export function afterDataChange() {
  reindex();
  refreshBasketMeta();
  S.selected = S.selected.map(s => findSec(s.id) || s);
  commit();
}

// ─── Basket ("Mis materias") ─────────────────────────────────
export const basketItem = key => S.basket.find(b => b.key === key);
export const itemForCode = code => S.basket.find(b => b.code === code);
function nextColor() {
  const used = new Set(S.basket.map(b => b.color));
  for (let i = 0; i < PALETTE_SIZE; i++) if (!used.has(i)) return i;
  return S.basket.length % PALETTE_SIZE;
}
const normCode = c => String(c || '').replace(/[\s-]+/g, '').toUpperCase();
export function addToBasket({ key, code, title, credits, elective, slot, cat, source }) {
  code = code ? normCode(code) : null;
  key = key || code;
  const existing = basketItem(key);
  if (existing) { if (title && (!existing.title || existing.title === existing.code)) existing.title = title; return existing; }
  const item = {
    key, code, title: title || code,
    credits: (credits === undefined || credits === null || isNaN(parseFloat(credits))) ? null : parseFloat(credits),
    elective: !!elective, color: nextColor(),
  };
  if (slot) item.slot = slot;
  if (cat) item.cat = cat;
  if (source) item.source = source;
  S.basket.push(item);
  return item;
}
export function refreshBasketMeta() {
  S.basket.forEach(b => {
    if (!b.code) return;
    const s = sectionsOf(b.code)[0];
    if (!s) return;
    if (!b.title || b.title === b.code) b.title = s.title;
    if (b.credits === null && !isNaN(parseFloat(s.credits))) b.credits = parseFloat(s.credits);
  });
}
export const courseTitle = code => itemForCode(code)?.title || sectionsOf(code)[0]?.title || code;
export function creditsOf(code) {
  const b = itemForCode(code); if (b && b.credits !== null) return b.credits;
  const s = sectionsOf(code).find(x => !isNaN(parseFloat(x.credits)));
  return s ? parseFloat(s.credits) : null;
}
/** Whether removing this course also removes chosen sections from some draft. */
export function courseInUse(key) {
  const it = basketItem(key);
  return !!(it?.code && S.drafts.some(d => (d.id === S.currentDraftId ? S.selected.map(s => s.id) : d.sectionIds).some(id => findSec(id)?.code === it.code)));
}
export function removeFromBasket(key) {
  const it = basketItem(key); if (!it) return null;
  settleGen();
  S.basket = S.basket.filter(b => b.key !== key);
  if (it.code) {
    const ids = new Set(sectionsOf(it.code).map(s => s.id));
    syncCurrentDraft();
    S.drafts.forEach(d => { d.sectionIds = d.sectionIds.filter(id => !ids.has(id)); });
    S.selected = S.selected.filter(s => !ids.has(s.id));
  }
  S.drafts.forEach(d => { d.locked = d.locked.filter(k => k !== key); d.skipped = d.skipped.filter(k => k !== key); });
  return it;
}
/** Replace an elective placeholder by a real course, keeping its colour. */
export function fillSlot(slotKey, code, title, credits) {
  const repl = basketItem(slotKey);
  const it = addToBasket({ code, title, credits, cat: repl?.cat, slot: repl?.slot });
  if (repl && repl !== it) {
    if (!S.basket.some(b => b !== it && b !== repl && b.color === repl.color)) it.color = repl.color;
    S.basket = S.basket.filter(b => b.key !== slotKey);
    S.drafts.forEach(d => { d.locked = d.locked.filter(k => k !== slotKey); d.skipped = d.skipped.filter(k => k !== slotKey); });
  }
  return it;
}

// ─── Drafts ──────────────────────────────────────────────────
export const makeDraft = name => ({ id: 'draft-' + Date.now() + '-' + Math.floor(Math.random() * 1e6), name: name || 'Horario 1', sectionIds: [], locked: [], skipped: [] });
export const currentDraft = () => S.drafts.find(d => d.id === S.currentDraftId);
export function syncCurrentDraft() { const d = currentDraft(); if (d && !S.gen) d.sectionIds = S.selected.map(s => s.id); }
export function resolveDraftSections(id) {
  const d = S.drafts.find(x => x.id === id);
  if (!d) return [];
  if (id === S.currentDraftId && S.selected.length && !S.gen) return S.selected;
  return d.sectionIds.map(findSec).filter(Boolean);
}
export function draftSections(id) { return id === S.currentDraftId ? S.selected : (S.drafts.find(x => x.id === id)?.sectionIds || []).map(findSec).filter(Boolean); }
export function switchDraft(id) {
  if (id === S.currentDraftId || !S.drafts.some(d => d.id === id)) return false;
  if (S.gen) cancelGen(true);
  syncCurrentDraft();
  S.currentDraftId = id;
  S.selected = (S.drafts.find(d => d.id === id).sectionIds).map(findSec).filter(Boolean);
  return true;
}
export const nextDraftName = () => `Horario ${S.drafts.length + 1}`;
export function createDraft(name) {
  if (S.gen) cancelGen(true);
  syncCurrentDraft();
  const d = makeDraft(name || nextDraftName());
  S.drafts.push(d); S.currentDraftId = d.id; S.selected = [];
  return d;
}
export function duplicateDraft(id) {
  syncCurrentDraft();
  const src = S.drafts.find(d => d.id === id); if (!src) return null;
  const copy = { ...makeDraft(`${src.name} (copia)`), sectionIds: [...src.sectionIds], locked: [...src.locked], skipped: [...src.skipped] };
  S.drafts.push(copy); S.currentDraftId = copy.id; S.selected = copy.sectionIds.map(findSec).filter(Boolean);
  return copy;
}
export function renameDraft(id, name) { const d = S.drafts.find(x => x.id === id); if (d && name && name.trim()) d.name = name.trim(); return d; }
export function deleteDraft(id) {
  if (S.drafts.length <= 1) return false;
  if (S.gen) cancelGen(true);
  S.drafts = S.drafts.filter(x => x.id !== id);
  delete undoStacks[id]; delete redoStacks[id];
  if (S.currentDraftId === id) { S.currentDraftId = S.drafts[0].id; S.selected = S.drafts[0].sectionIds.map(findSec).filter(Boolean); }
  return true;
}

// ─── Undo / redo ─────────────────────────────────────────────
let undoStacks = {}, redoStacks = {};
function snapshot() { const d = currentDraft(); return { ids: S.selected.map(s => s.id), locked: [...(d?.locked || [])], skipped: [...(d?.skipped || [])] }; }
function restore(snap) { const d = currentDraft(); S.selected = snap.ids.map(findSec).filter(Boolean); if (d) { d.locked = [...snap.locked]; d.skipped = [...snap.skipped]; } }
export function pushUndo() {
  (undoStacks[S.currentDraftId] ||= []).push(snapshot());
  if (undoStacks[S.currentDraftId].length > UNDO_LIMIT) undoStacks[S.currentDraftId].shift();
  redoStacks[S.currentDraftId] = [];
}
export const canUndo = () => !!(S.gen || undoStacks[S.currentDraftId]?.length);
export const canRedo = () => !!redoStacks[S.currentDraftId]?.length;
export function undo() {
  if (S.gen) { cancelGen(true); return 'gen'; }
  const stack = undoStacks[S.currentDraftId];
  if (!stack?.length) return false;
  (redoStacks[S.currentDraftId] ||= []).push(snapshot());
  restore(stack.pop());
  return true;
}
export function redo() {
  const stack = redoStacks[S.currentDraftId];
  if (!stack?.length) return false;
  (undoStacks[S.currentDraftId] ||= []).push(snapshot());
  restore(stack.pop());
  return true;
}
export function resetHistory() { undoStacks = {}; redoStacks = {}; }

// ─── Choosing sections ───────────────────────────────────────
export function setCourseSections(code, secs) { S.selected = S.selected.filter(s => s.code !== code).concat(secs.filter(Boolean)); }
const conflictFor = secs => { for (const c of secs) { const o = S.selected.find(o => o.code !== c.code && hasTimeConflict(c, o)); if (o) return o; } return null; };
export function chooseCombo(ids) {
  const secs = ids.map(findSec).filter(Boolean);
  if (!secs.length) return null;
  settleGen();
  const code = secs[0].code;
  if (!itemForCode(code)) addToBasket({ code, title: secs[0].title, credits: secs[0].credits });
  pushUndo();
  setCourseSections(code, secs);
  return { code, secs, conflictWith: conflictFor(secs) };
}
export function chooseSection(id) {
  const sec = findSec(id); if (!sec) return null;
  settleGen();
  if (!itemForCode(sec.code)) addToBasket({ code: sec.code, title: sec.title, credits: sec.credits });
  const info = courseInfo(sec.code);
  const { secs, note } = resolvePick(info, S.selected.filter(s => s.code === sec.code), sec);
  pushUndo();
  setCourseSections(sec.code, secs);
  return { sec, secs, note, conflictWith: conflictFor(secs) };
}
/** Ids that would be chosen together if `id` were picked (for previews). */
export function resultIdsFor(id) {
  const sec = findSec(id); if (!sec) return [String(id)];
  return resolvePick(courseInfo(sec.code), S.selected.filter(s => s.code === sec.code), sec).secs.map(s => s.id);
}
export function unchooseSection(id) {
  const sec = findSec(id); if (!sec) return null;
  settleGen();
  pushUndo();
  let droppedComp = null;
  if (kindOf(sec) === 'mag') {
    const comps = S.selected.filter(s => s.code === sec.code && kindOf(s) === 'comp');
    S.selected = S.selected.filter(s => s.id !== sec.id && !comps.includes(s));
    droppedComp = comps[0] || null;
  } else S.selected = S.selected.filter(s => s.id !== sec.id);
  return { sec, droppedComp };
}
export function clearCourse(key) {
  const it = basketItem(key); if (!it?.code) return null;
  if (!S.selected.some(s => s.code === it.code)) return null;
  settleGen();
  pushUndo(); setCourseSections(it.code, []);
  return it;
}
export function toggleLock(key) {
  const d = currentDraft(); if (!d) return null;
  const on = d.locked.includes(key);
  d.locked = on ? d.locked.filter(k => k !== key) : [...d.locked, key];
  return !on;
}
export function toggleSkip(key) {
  const d = currentDraft(); const it = basketItem(key); if (!d || !it) return null;
  settleGen();
  pushUndo();
  const on = d.skipped.includes(key);
  if (!on && it.code) setCourseSections(it.code, []);
  d.skipped = on ? d.skipped.filter(k => k !== key) : [...d.skipped, key];
  return !on;
}

// ─── Course status ───────────────────────────────────────────
export function courseState(item, ctx = { draft: currentDraft(), selected: S.selected, loading: new Set() }) {
  const draft = ctx.draft;
  const skipped = !!draft?.skipped?.includes(item.key), locked = !!draft?.locked?.includes(item.key);
  if (!item.code) return { item, status: 'nosections', skipped, locked, chosen: [], info: null };
  const info = courseInfo(item.code);
  const chosen = ctx.selected.filter(s => s.code === item.code);
  const mag = chosen.find(s => kindOf(s) === 'mag'), comp = chosen.find(s => kindOf(s) === 'comp');
  let status;
  if (!info.secs.length) status = ctx.loading.has(item.code) ? 'loading' : 'nosections';
  else if (!chosen.length) status = 'none';
  else if (mag && !comp && info.compsFor(mag).length) status = 'needcomp';
  else if (!mag && comp && info.mags.length) status = 'needmag';
  else if (mag && comp && !info.compatible(mag, comp)) status = 'mismatch';
  else status = 'complete';
  let conflictWith = null;
  const others = ctx.selected.filter(s => s.code !== item.code);
  for (const c of chosen) { const o = others.find(o => hasTimeConflict(c, o)); if (o) { conflictWith = o; break; } }
  const stale = chosen.filter(s => s.stale);
  return { item, info, chosen, mag, comp, status, conflictWith, skipped, locked, stale };
}
export const isPending = st => !st.skipped && (!!st.conflictWith || ['needcomp', 'needmag', 'mismatch', 'none'].includes(st.status));

// ─── Score ───────────────────────────────────────────────────
export const evaluate = secs => evaluateSchedule(secs, S.rules, creditsOf);

// ─── Generator session ───────────────────────────────────────
/**
 * Starts a generator session. Returns { ok, count, dropped } or { ok:false, error, kind }.
 * Hard busy blocks exclude sections. When nothing fits and some courses are optional, it tries
 * again leaving out as few optional courses as possible.
 */
export function runGenerator() {
  if (S.gen) cancelGen(true);
  const draft = currentDraft();
  const onlySeats = !!S.rules.genOnlySeats;
  const busy = hardBusy(S.rules);
  const skippedNoSec = [], courses = [];
  S.basket.forEach(b => {
    if (draft.skipped.includes(b.key)) return;
    if (!b.code || !courseInfo(b.code).secs.length) { skippedNoSec.push(b); return; }
    const info = courseInfo(b.code);
    const chosen = S.selected.filter(s => s.code === b.code);
    let combos = draft.locked.includes(b.key) && chosen.length ? [chosen] : usableCombos(info, onlySeats);
    if (busy.length) combos = combos.filter(c => !c.some(s => busy.some(blk => overlapsBusy(s, blk))));
    courses.push({ key: b.key, title: b.title, combos, optional: !!b.optional });
  });
  if (!courses.length) return { ok: false, kind: 'nocourses', error: 'Agrega materias con secciones cargadas para generar horarios.' };
  let run = generateSchedules(courses), dropped = [];
  if (!run.results.length) {
    const optional = courses.filter(c => c.optional);
    outer: for (let k = 1; k <= optional.length; k++) {
      for (const drop of subsets(optional, k)) {
        const r = generateSchedules(courses.filter(c => !drop.includes(c)));
        if (r.results.length) { run = r; dropped = drop.map(c => c.title); break outer; }
      }
    }
  }
  const { results, truncated, empty, clash } = run;
  if (empty.length) return { ok: false, kind: 'empty', error: `${empty.join(', ')} no tiene${empty.length > 1 ? 'n' : ''} opciones${onlySeats ? ' con cupo' : ''}${busy.length ? ' fuera de tus horas ocupadas' : ''}.` };
  if (!results.length) return { ok: false, kind: 'clash', error: `No hay combinación sin choques con todas tus materias.${clash ? ` ${clash[0]} y ${clash[1]} siempre se cruzan.` : ''} Marca alguna como opcional, quita un candado o una hora ocupada.` };
  pushUndo();
  S.gen = { results: rankResults(results, evaluate), index: 0, snapshot: S.selected.map(s => s.id), skipped: skippedNoSec.map(b => b.title), dropped, locked: draft.locked.length, truncated, sort: 'score' };
  applyGen(0);
  return { ok: true, count: S.gen.results.length, dropped };
}
function subsets(list, k, start = 0, acc = [], out = []) {
  if (acc.length === k) { out.push(acc.slice()); return out; }
  for (let i = start; i < list.length && out.length < 200; i++) { acc.push(list[i]); subsets(list, k, i + 1, acc, out); acc.pop(); }
  return out;
}
/** Re-sort generator results: 'score' | 'days' | 'end' | 'gaps', and show the first of the new order. */
export function sortGen(by) {
  if (!S.gen) return;
  const keys = { score: (a, b) => b.score - a.score || a.days - b.days || a.end - b.end, days: (a, b) => a.days - b.days || b.score - a.score, end: (a, b) => a.end - b.end || b.score - a.score, gaps: (a, b) => a.gaps - b.gaps || b.score - a.score };
  S.gen.results.sort(keys[by] || keys.score);
  S.gen.sort = by;
  applyGen(0);
}
export function toggleOptional(key) { const it = basketItem(key); if (!it) return null; it.optional = !it.optional; return it.optional; }

export function applyGen(i) {
  if (!S.gen) return;
  const n = S.gen.results.length;
  S.gen.index = ((i % n) + n) % n;
  S.selected = S.gen.results[S.gen.index].ids.map(findSec).filter(Boolean);
}
export function useGen() { if (!S.gen) return; S.gen = null; }
export function settleGen() { if (S.gen) S.gen = null; }
export function cancelGen(silent) {
  if (!S.gen) return;
  S.selected = S.gen.snapshot.map(findSec).filter(Boolean);
  S.gen = null;
  undoStacks[S.currentDraftId]?.pop();
}
export function saveGenAsNew() {
  if (!S.gen) return null;
  const ids = S.gen.results[S.gen.index].ids, idx = S.gen.index + 1;
  const src = currentDraft();
  cancelGen(true);
  syncCurrentDraft();
  const d = { ...makeDraft(`${src.name} · opción ${idx}`), sectionIds: ids, locked: [...src.locked], skipped: [...src.skipped] };
  S.drafts.push(d); S.currentDraftId = d.id; S.selected = ids.map(findSec).filter(Boolean);
  return d;
}

// ─── Loading sections ────────────────────────────────────────
/**
 * Merge sections by NRC, keeping the original id so drafts and undo history keep pointing at them.
 * `exactCodes`: codes that were queried exactly; their API sections that are no longer returned
 * become `stale` (shown as "ya no se ofrece" and left out of the generator).
 */
export function ingestSections(mapped, { exactCodes = [] } = {}) {
  let added = 0, updated = 0; const codes = new Set(), seenNrc = new Set();
  mapped.forEach(item => {
    codes.add(item.code); seenNrc.add(item.nrc);
    const idx = S.sections.findIndex(c => c.nrc === item.nrc);
    if (idx >= 0) { item.id = S.sections[idx].id; item.enabled = S.sections[idx].enabled; S.sections[idx] = item; updated++; }
    else { S.sections.push(item); added++; }
  });
  let stale = 0;
  for (const code of exactCodes) {
    S.sections.forEach(s => {
      if (s.code !== code || !String(s.id).startsWith('uniandes-')) return;
      const isStale = !seenNrc.has(s.nrc);
      if (isStale && !s.stale) stale++;
      if (isStale) s.stale = true; else delete s.stale;
    });
  }
  reindex();
  S.selected = S.selected.map(s => findSec(s.id) || s);
  return { added, updated, codes: [...codes], stale };
}

export function setRule(key, value) {
  S.rules[key] = value;
  if (key === 'strictPairing') infoCache.clear();
}

export function clearAll() {
  S.sections = []; S.basket = []; S.selected = []; S.gen = null; S.watch = [];
  S.drafts = [makeDraft('Horario 1')]; S.currentDraftId = S.drafts[0].id;
  resetHistory(); reindex();
}

export const summaryLabel = s => `${kindLabel(s)} S${s.section}`;
