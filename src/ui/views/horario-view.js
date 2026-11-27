// "Horario": your courses, the open course's options and the week calendar.
// Ported from index.html v7 (renderPanel, courseListHtml, coursePanelHtml, comboRowHtml,
// sectionRowHtml, renderGenBar, miniWeek, renderMobileLayout) onto data-action handlers.
import {
  S, commit, findSec, courseInfo, basketItem, itemForCode, currentDraft, courseState, isPending, courseTitle, creditsOf, evaluate,
  chooseCombo, chooseSection, unchooseSection, clearCourse, removeFromBasket, courseInUse, toggleLock, toggleSkip,
  switchDraft, createDraft, duplicateDraft, renameDraft, deleteDraft, nextDraftName, undo, redo, canUndo, canRedo,
  runGenerator, applyGen, useGen, cancelGen, saveGenAsNew, setRule, resultIdsFor, draftSections,
} from '../../state/store.js';
import { kindOf, kindLabel, structureLabel, hasSeats, seatText, countConflicts } from '../../core/sections.js';
import { DAYS, schedText, hasTimeConflict, weeklyHours, fmtHours, fmtTimeAP, timeToMinutes, daysUsed } from '../../core/time.js';
import { totalCredits } from '../../core/score.js';
import { fmtCode } from '../../core/requirements.js';
import { esc, data, handle, isMobile, $ } from '../dom.js';
import { ui, colorsFor, PREVIEW } from '../state.js';
import { openPopover, togglePopover, closePopover, popoverOpen, refreshPopover, confirmDialog, promptDialog, toast } from '../layer.js';
import { renderCalendar, renderMobileDays, openSlotPopup } from '../calendar.js';
import { queueFetch, refreshAll } from '../fetch-queue.js';
import { openSearch } from './search-dialog.js';
import { copyNRCs, copySummary, downloadSummary, printSchedule } from './export-view.js';
import { activePensum } from '../state.js';

// ─── Shell of the view (rendered once, then parts update) ────
export function renderHorario() {
  const el = $('#view-horario'); if (!el) return;
  if (!el.dataset.built) {
    el.innerHTML = `
      <div id="hz-toolbar" class="toolbar gutter"></div>
      <div id="hz-genbar"></div>
      <div id="hz-mobile-seg" class="md:hidden gutter pb-2"></div>
      <div class="flex-1 min-h-0 flex gap-4 gutter pb-4 overflow-hidden">
        <aside id="course-panel" class="panel"></aside>
        <div id="cal-pane" class="panel flex-1 min-w-0 isolate">
          <div class="hidden md:flex flex-shrink-0 h-9 px-3 items-center gap-4 border-b border-line-2 text-xs muted overflow-x-auto">
            <span class="flex items-center gap-1.5 whitespace-nowrap"><span class="w-3.5 h-2.5 rounded-[3px] bg-sky-50 border border-sky-300"></span>Magistral</span>
            <span class="flex items-center gap-1.5 whitespace-nowrap"><span class="w-3.5 h-2.5 rounded-[3px] border-[1.5px] border-dashed border-sky-700" style="background:repeating-linear-gradient(135deg,#e0f2fe 0 3px,#fff 3px 6px)"></span>Complementaria</span>
            <span class="flex items-center gap-1.5 whitespace-nowrap"><span class="w-3.5 h-2.5 rounded-[3px] border-[1.5px] border-dotted border-sky-700"></span>Otras opciones</span>
            <span class="flex items-center gap-1.5 whitespace-nowrap"><span class="w-3.5 h-2.5 rounded-[3px] border-2 border-dashed border-brand-600 bg-brand-50"></span>Vista previa</span>
            <span id="cal-hint" class="ml-auto whitespace-nowrap"></span>
          </div>
          <div id="mobile-days" class="md:hidden flex-shrink-0 p-2 flex gap-1.5 border-b border-line-2"></div>
          <div id="cal-scroll" class="flex-1 min-h-0 overflow-auto"><div id="cal-grid" class="md:min-w-[640px]"></div></div>
        </div>
      </div>`;
    el.dataset.built = '1';
    const grid = $('#cal-grid');
    grid.addEventListener('dragover', e => { if (!ui.dragIds) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    grid.addEventListener('drop', e => { e.preventDefault(); const ids = ui.dragIds; ui.dragIds = null; ui.preview = null; if (ids) doChooseCombo(ids); });
  }
  renderToolbar(); renderGenBar(); renderPanel(); renderMobileLayout(); renderMobileDays(); renderCalendar();
}

function renderToolbar() {
  const d = currentDraft();
  const multi = S.drafts.length > 1;
  $('#hz-toolbar').innerHTML = `
    <div class="flex items-center gap-1 mr-auto min-w-0">
      <button class="icon-btn is-bordered" data-action="draft:cycle" data-dir="-1" aria-label="Horario anterior" ${multi ? '' : 'disabled'}><i class="fa-solid fa-chevron-left text-xs"></i></button>
      <button class="min-w-0 flex items-center gap-2 px-2 h-9 rounded hover:bg-wash" data-action="draft:menu" data-anchor="draft-menu" ${data({ id: d.id })} aria-label="Opciones de ${esc(d.name)}">
        <span class="text-base sm:text-lg font-semibold truncate max-w-[11rem] sm:max-w-[16rem]">${esc(d.name)}</span><i class="fa-solid fa-caret-down text-xs muted"></i></button>
      <button class="icon-btn is-bordered" data-action="draft:cycle" data-dir="1" aria-label="Horario siguiente" ${multi ? '' : 'disabled'}><i class="fa-solid fa-chevron-right text-xs"></i></button>
    </div>
    <button class="icon-btn is-bordered" data-action="undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" ${canUndo() ? '' : 'disabled'}><i class="fa-solid fa-rotate-left text-xs"></i></button>
    <button class="icon-btn is-bordered" data-action="redo" title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" ${canRedo() ? '' : 'disabled'}><i class="fa-solid fa-rotate-right text-xs"></i></button>
    <button class="btn btn-quiet" data-action="rules:open" data-anchor="rules" aria-label="Restricciones"><i class="fa-solid fa-sliders text-xs"></i><span class="hidden sm:inline">Restricciones</span></button>
    <button class="btn btn-quiet" data-action="export:menu" data-anchor="export-menu" aria-label="Exportar"><i class="fa-solid fa-arrow-up-from-bracket text-xs"></i><span class="hidden sm:inline">Exportar</span></button>
    <button class="btn btn-primary" data-action="gen:run"><i class="fa-solid fa-wand-magic-sparkles text-xs"></i>Generar<span class="hidden sm:inline"> horarios</span></button>
    <div class="lg:hidden w-full flex items-center gap-1.5 overflow-x-auto">${metricsHtml(true)}</div>`;
  const top = document.getElementById('top-metrics'); if (top) top.innerHTML = metricsHtml();
}

function metricsHtml(compact) {
  if (!S.basket.length) return `<span class="text-xs muted">Agrega materias para empezar</span>`;
  const secs = S.selected;
  const pending = S.basket.map(b => courseState(b, ctx())).filter(isPending).length;
  const conflicts = countConflicts(secs);
  const ev = evaluate(secs);
  const target = S.rules.creditTarget;
  return `<span class="metric tabular ${ev.totalCredits > target ? 'pill-warn' : ''}">${ev.totalCredits}/${target} cr</span>
    <span class="metric ${conflicts ? 'pill-bad' : 'pill-ok'}"><i class="fa-solid ${conflicts ? 'fa-triangle-exclamation' : 'fa-check'}"></i>${conflicts ? `${conflicts} choque${conflicts > 1 ? 's' : ''}` : 'Sin choques'}</span>
    ${pending ? `<button class="metric pill-warn" data-action="list:filter" data-filter="pending"><i class="fa-solid fa-circle-exclamation"></i>${pending} pendiente${pending > 1 ? 's' : ''}</button>` : ''}
    <span class="metric tabular">${daysUsed(secs).size} días · ${fmtHours(weeklyHours(secs))} h</span>
    ${compact ? '' : `<span class="metric" title="Según tus restricciones">Score ${secs.length ? ev.score : '–'}/10</span>`}`;
}

const ctx = () => ({ draft: currentDraft(), selected: S.selected, loading: ui.loadingCodes });

// ─── Generator bar (Phase 2 replaces it with a gallery) ──────
function renderGenBar() {
  const el = $('#hz-genbar');
  if (!S.gen) { el.className = ''; el.innerHTML = ''; return; }
  const g = S.gen, r = g.results[g.index];
  const ev = evaluate(S.selected);
  el.className = 'gutter pb-3';
  el.innerHTML = `<div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5 rounded-xl bg-brand-50 border border-brand-200">
    <span class="text-sm font-semibold text-brand-700">Opción ${g.index + 1} de ${g.results.length}${g.truncated ? '+' : ''}</span>
    <span class="text-sm text-slate-700">sin choques · ${ev.days} días · termina ${fmtTimeAP(ev.lastEnd)} · Score ${r.score}/10</span>
    ${g.skipped.length ? `<span class="text-xs text-amber-800">No incluye: ${esc(g.skipped.join(', '))} (sin secciones)</span>` : ''}
    <div class="flex items-center gap-1.5 ml-auto">
      <button class="icon-btn !w-8 !h-8 border border-brand-200 bg-white text-brand-700" data-action="gen:step" data-dir="-1" aria-label="Opción anterior"><i class="fa-solid fa-chevron-left text-[10px]"></i></button>
      <button class="icon-btn !w-8 !h-8 border border-brand-200 bg-white text-brand-700" data-action="gen:step" data-dir="1" aria-label="Opción siguiente"><i class="fa-solid fa-chevron-right text-[10px]"></i></button>
      <button class="btn btn-sm btn-quiet hidden sm:inline-flex" data-action="gen:save">Guardar como nuevo</button>
      <button class="btn btn-sm btn-primary" data-action="gen:use">Usar esta</button>
      <button class="btn btn-sm text-slate-600 hover:text-slate-900" data-action="gen:cancel">Cancelar</button>
    </div></div>`;
}

// ─── Left panel ──────────────────────────────────────────────
export function renderPanel() {
  const el = $('#course-panel'); if (!el) return;
  const it = ui.focusKey ? basketItem(ui.focusKey) : null;
  const prevKey = el.dataset.key, prevTop = el.querySelector('[data-scroll]')?.scrollTop || 0;
  if (!it) { ui.focusKey = null; el.innerHTML = courseListHtml(); }
  else el.innerHTML = `<div data-scroll class="flex-1 min-h-0 overflow-y-auto">${coursePanelHtml(courseState(it, ctx()))}</div>`;
  el.dataset.key = String(ui.focusKey);
  const sc = el.querySelector('[data-scroll]');
  if (sc && prevKey === el.dataset.key) sc.scrollTop = prevTop;
}

function statusChip(st) {
  const chip = (label, cls) => `<span class="pill ${cls}">${label}</span>`;
  if (st.skipped) return chip('No incluida', 'pill-neutral');
  if (st.conflictWith) return chip('Choque', 'pill-bad');
  switch (st.status) {
    case 'complete': return chip('Completa', 'pill-ok');
    case 'needcomp': return chip('Falta complementaria', 'pill-warn');
    case 'needmag': return chip('Falta magistral', 'pill-warn');
    case 'mismatch': return chip('No corresponden', 'pill-warn');
    case 'none': return chip('Sin elegir', 'pill-neutral');
    case 'loading': return chip('Buscando…', 'pill-neutral');
    default: return chip(st.item.elective ? 'Electiva' : 'Sin secciones', 'pill-neutral');
  }
}
function statusHint(st) {
  if (st.skipped) return 'No se incluye en este horario.';
  if (st.conflictWith) return `Choca con ${courseTitle(st.conflictWith.code)} S${st.conflictWith.section}.`;
  switch (st.status) {
    case 'needcomp': return `Falta la complementaria de la magistral S${st.mag.section}.`;
    case 'needmag': return `Falta la magistral de la complementaria S${st.comp.section}.`;
    case 'mismatch': return `La complementaria S${st.comp.section} no es de la magistral S${st.mag.section}.`;
    case 'none': return `${st.info.combos.length} ${st.info.combos.length === 1 ? 'opción' : 'opciones'} · elige una.`;
    case 'loading': return 'Buscando secciones en Uniandes…';
    case 'nosections': return st.item.elective ? 'Electiva: elige el curso que ocupará este cupo.' : 'Sin secciones cargadas: búscalas o importa el JSON.';
    default: return st.stale?.length ? 'Una sección elegida ya no se ofrece.' : '';
  }
}

function courseListHtml() {
  const states = S.basket.map(b => courseState(b, ctx()));
  const pending = states.filter(isPending);
  if (ui.listFilter === 'pending' && !pending.length) ui.listFilter = 'all';
  const list = ui.listFilter === 'pending' ? pending : states;
  const cr = totalCredits(S.selected, creditsOf).total;
  let html = `<div class="p-4 border-b border-line-2 flex flex-col gap-3 flex-shrink-0">
    <div class="flex items-center gap-2"><h2 class="text-[15px] font-semibold">Mis materias</h2>
      <span class="text-xs muted tabular">${S.basket.length} · ${cr} cr elegidos</span>
      <button class="btn btn-sm btn-quiet ml-auto" data-action="nav" data-view="pensum"><i class="fa-solid fa-plus text-[10px]"></i>Agregar</button></div>
    ${S.basket.length ? `<div class="seg w-full"><button class="flex-1" data-action="list:filter" data-filter="all" aria-pressed="${ui.listFilter === 'all'}">Todas (${states.length})</button><button class="flex-1" data-action="list:filter" data-filter="pending" aria-pressed="${ui.listFilter === 'pending'}">Pendientes (${pending.length})</button></div>` : ''}
  </div><div data-scroll class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">`;
  if (!S.basket.length) {
    html += `<div class="flex flex-col items-center gap-3 py-10 px-4 text-center">
      <p class="text-sm muted">Elige en tu pénsum las materias que vas a ver, o búscalas por código.</p>
      <button class="btn btn-primary" data-action="nav" data-view="pensum">Ir a mi pénsum</button>
      <button class="link text-xs" data-action="demo:load">o prueba con datos demo</button></div>`;
  }
  list.forEach(st => {
    const it = st.item, c = colorsFor(it.key), info = st.info;
    const meta = [it.code ? fmtCode(it.code) : 'Electiva', it.credits !== null ? `${it.credits} cr` : (it.code && creditsOf(it.code) !== null ? `${creditsOf(it.code)} cr` : ''), info ? structureLabel(info) : ''].filter(Boolean).join(' · ');
    const hint = statusHint(st);
    const hintCls = st.conflictWith ? 'text-danger' : isPending(st) ? 'text-warn' : 'muted';
    html += `<div class="course-card group ${st.skipped ? 'is-skipped' : ''}">
      <div class="flex items-start gap-2 p-3 pb-2">
        <button class="flex-1 min-w-0 text-left flex items-start gap-2.5" data-action="course:focus" data-hover="course:hover" ${data({ key: it.key, hkey: it.key })}>
          <span class="w-2.5 h-2.5 mt-1.5 rounded-full flex-shrink-0 ${st.skipped ? 'opacity-40' : ''}" style="background:${c.dot}"></span>
          <span class="min-w-0 flex-1"><span class="block text-sm font-semibold truncate ${st.skipped ? 'muted' : ''}">${esc(it.title)}</span>
          <span class="block text-xs muted truncate">${esc(meta)}</span></span>
        </button>
        <span class="flex items-center gap-0.5 flex-shrink-0">
          ${it.code ? `<button class="icon-btn !w-7 !h-7 ${st.locked ? 'text-navy' : 'md:opacity-0 group-hover:opacity-100 focus:opacity-100'}" data-action="course:lock" ${data({ key: it.key })} aria-pressed="${st.locked}" title="${st.locked ? 'Con candado: el generador no la cambia' : 'Poner candado'}" aria-label="${st.locked ? 'Quitar candado' : 'Poner candado'}"><i class="fa-solid ${st.locked ? 'fa-lock' : 'fa-lock-open'} text-[11px]"></i></button>` : ''}
          <button class="icon-btn !w-7 !h-7 ${st.skipped ? '' : 'md:opacity-0 group-hover:opacity-100 focus:opacity-100'}" data-action="course:skip" ${data({ key: it.key })} aria-pressed="${st.skipped}" title="${st.skipped ? 'Incluir en este horario' : 'No incluir en este horario'}" aria-label="${st.skipped ? 'Incluir en este horario' : 'No incluir en este horario'}"><i class="fa-regular ${st.skipped ? 'fa-eye-slash' : 'fa-eye'} text-[11px]"></i></button>
          ${statusChip(st)}
        </span>
      </div>
      ${st.chosen.length ? `<div class="px-3 pb-1 flex flex-col gap-1 pl-8">${st.chosen.slice().sort(a => kindOf(a) === 'mag' ? -1 : 1).map(s => `<div class="flex items-center gap-1.5 text-xs">
        <span class="kind ${kindOf(s) === 'mag' ? 'kind-mag' : 'kind-comp'}">${kindLabel(s)}</span><span class="truncate tabular">S${esc(s.section)} · ${esc(schedText(s))}</span></div>`).join('')}</div>` : ''}
      ${hint ? `<button class="w-full text-left px-3 pl-8 pb-2.5 text-xs ${hintCls} hover:underline" data-action="course:focus" ${data({ key: it.key })}>${esc(hint)}${isPending(st) || st.status === 'nosections' ? ' →' : ''}</button>` : '<div class="h-1.5"></div>'}
    </div>`;
  });
  return html + `</div>`;
}

// Mini week: `focus` sections in colour, `context` in grey, clashes in red.
const MINI_START = 6 * 60, MINI_END = 21 * 60;
export function miniWeek(focus, context = [], w = 84, h = 50) {
  const cw = w / 6, span = MINI_END - MINI_START;
  let html = `<span class="mini-week" style="width:${w}px;height:${h}px" aria-hidden="true">`;
  for (let i = 1; i < 6; i++) html += `<span class="absolute top-0 bottom-0 border-l border-line-2" style="left:${i * cw}px"></span>`;
  const draw = (s, mode) => (s.schedules || []).forEach(sch => sch.days.forEach(d => {
    const di = DAYS.indexOf(d); if (di < 0) return;
    const st = timeToMinutes(sch.start_time), en = timeToMinutes(sch.end_time);
    const top = Math.max(0, (st - MINI_START) / span * h), hh = Math.max(3, (en - st) / span * h);
    const c = colorsFor(s.code);
    let style;
    if (mode === 'ctx') style = 'background:#d0d5dd';
    else if (mode === 'clash') style = kindOf(s) === 'comp' ? 'border:1px dashed #e11d48;background:#fff1f2;box-sizing:border-box' : 'background:#e11d48';
    else style = kindOf(s) === 'comp' ? `border:1px dashed ${c.sub};background:#fff;box-sizing:border-box` : `background:${c.dot}`;
    html += `<span class="absolute rounded-[2px]" style="left:${di * cw + 1.5}px;width:${cw - 3}px;top:${top}px;height:${hh}px;${style}"></span>`;
  }));
  context.forEach(s => draw(s, 'ctx'));
  focus.forEach(s => draw(s, context.some(o => o.code !== s.code && hasTimeConflict(o, s)) ? 'clash' : 'main'));
  return html + `</span>`;
}

function comboRowHtml(combo, st, others) {
  const ids = combo.map(s => s.id).join(',');
  const chosenNow = combo.length === st.chosen.length && combo.every(s => st.chosen.some(c => c.id === s.id));
  const clash = others.find(o => combo.some(s => hasTimeConflict(s, o)));
  const self = combo.length > 1 && hasTimeConflict(combo[0], combo[1]);
  const full = combo.some(s => !hasSeats(s));
  const pinned = ui.pinned && ui.pinned.join(',') === ids;
  const chip = chosenNow ? '<span class="pill pill-navy">Elegida</span>' : clash || self ? '<span class="pill pill-bad">Choca</span>' : full ? '<span class="pill pill-neutral">Llena</span>' : '<span class="pill pill-ok">Sin choques</span>';
  const detail = clash ? `Choca con ${esc(courseTitle(clash.code))} S${esc(clash.section)}` : self ? 'La magistral y la complementaria se cruzan' : `Cupos ${combo.map(seatText).join(' · ')} · ${esc(combo[0].instructors[0])}`;
  return `<div class="opt-row ${chosenNow ? 'is-chosen' : pinned ? 'is-pinned' : ''} ${clash || self ? 'opacity-80' : ''}" data-hover="combo:preview" draggable="true" ${data({ ids, hkey: ids, drag: ids })}>
    <div class="flex items-center gap-3 p-2.5">
      <button class="flex-1 min-w-0 flex items-center gap-3 text-left" data-action="combo:pin" ${data({ ids })} aria-label="Vista previa de ${esc(combo.map(s => `${kindLabel(s)} S${s.section}`).join(' + '))}">
        ${miniWeek(combo, others)}
        <span class="min-w-0 flex-1 flex flex-col gap-0.5">
          <span class="flex items-center gap-1.5 flex-wrap"><span class="text-sm font-semibold">${combo.map(s => `S${esc(s.section)}`).join(' + ')}</span>${chip}</span>
          <span class="block text-xs truncate tabular">${combo.map(s => esc(schedText(s))).join(' · ')}</span>
          <span class="block text-[11px] ${clash || self ? 'text-danger' : 'muted'} truncate">${detail}</span>
        </span>
      </button>
      ${chosenNow ? '' : `<button class="btn btn-sm ${clash || self ? 'btn-quiet' : 'btn-primary'}" data-action="combo:choose" ${data({ ids })}>Elegir</button>`}
    </div></div>`;
}

function sectionRowHtml(s, st, others, opts = {}) {
  const chosen = st.chosen.some(c => c.id === s.id);
  const clash = others.find(o => hasTimeConflict(o, s));
  const ids = opts.previewIds || resultIdsFor(s.id).join(',');
  const note = opts.note || (s.stale ? 'Ya no se ofrece' : clash ? `Choca con ${esc(courseTitle(clash.code))} S${esc(clash.section)}` : !hasSeats(s) ? 'Sin cupos' : `Cupos ${seatText(s)} · ${esc(s.instructors[0])}`);
  const noteCls = opts.note ? 'muted' : clash || s.stale ? 'text-danger' : 'muted';
  const action = chosen ? `<button class="btn btn-sm btn-quiet" data-action="section:unchoose" ${data({ id: s.id })}>Quitar</button>`
    : `<button class="btn btn-sm ${opts.change || clash ? 'btn-quiet' : 'btn-primary'}" data-action="section:choose" ${data({ id: s.id })}>${opts.change ? 'Cambiar' : 'Elegir'}</button>`;
  return `<div class="opt-row flex items-center gap-2.5 p-2 ${chosen ? 'is-chosen' : ''}" data-hover="combo:preview" draggable="true" ${data({ ids, hkey: ids, drag: ids })}>
    <button class="flex-1 min-w-0 flex items-center gap-2 text-left" data-action="combo:pin" ${data({ ids })}>
      <span class="kind ${kindOf(s) === 'mag' ? 'kind-mag' : 'kind-comp'}">${kindLabel(s)}</span>
      <span class="min-w-0 flex-1"><span class="block text-xs font-semibold truncate tabular">S${esc(s.section)} · ${esc(schedText(s))} <span class="font-normal muted">NRC ${esc(s.nrc)}</span></span>
      <span class="block text-[11px] ${noteCls} truncate">${note}</span></span>
    </button>${action}</div>`;
}

function coursePanelHtml(st) {
  const it = st.item, c = colorsFor(it.key), info = st.info;
  let html = `<div class="p-4 border-b border-line-2 flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <button class="btn btn-sm btn-quiet -ml-1" data-action="course:close"><i class="fa-solid fa-arrow-left text-xs"></i>Mis materias</button>
      <button class="icon-btn ml-auto" data-action="course:menu" data-anchor="course-menu" ${data({ key: it.key })} aria-label="Más opciones"><i class="fa-solid fa-ellipsis"></i></button>
    </div>
    <div class="flex items-start gap-2.5"><span class="w-2.5 h-2.5 mt-2 rounded-full flex-shrink-0" style="background:${c.dot}"></span>
      <div class="flex-1 min-w-0"><h2 class="text-[17px] font-semibold leading-snug">${esc(it.title)}</h2>
        <p class="text-xs muted">${esc([it.code ? fmtCode(it.code) : 'Electiva', it.credits !== null ? `${it.credits} cr` : '', info ? structureLabel(info) : ''].filter(Boolean).join(' · '))}</p></div>
      ${statusChip(st)}</div>`;

  if (!info || !info.secs.length) {
    if (it.elective) {
      html += `<p class="text-sm">Este es un cupo de electiva. Busca el curso que vas a ver y úsalo aquí.</p>
        <div class="flex flex-wrap gap-2"><button class="btn btn-primary btn-sm" data-action="search:open" ${data({ slot: it.key })}><i class="fa-solid fa-magnifying-glass"></i>Elegir curso</button>
        ${activePensum() ? `<button class="btn btn-quiet btn-sm" data-action="nav" data-view="pensum">Ver opciones en el pénsum</button>` : ''}</div></div>`;
    } else {
      html += `</div><div class="p-4 flex flex-col gap-3">
        <p class="text-sm">${st.status === 'loading' ? 'Buscando secciones en Uniandes…' : 'Todavía no hay secciones cargadas para esta materia.'}</p>
        <div class="flex flex-wrap gap-2"><button class="btn btn-primary btn-sm" data-action="course:fetch" ${data({ key: it.key })}><i class="fa-solid fa-magnifying-glass"></i>Buscar en Uniandes</button>
        <button class="btn btn-quiet btn-sm" data-action="search:open" ${data({ q: it.code || '' })}>Importar JSON</button></div></div>`;
    }
    return html;
  }

  const both = info.mags.length && info.comps.length;
  if (both) {
    const box = (s, k) => s
      ? `<div class="flex-1 min-w-0 px-2.5 py-2 rounded-lg ${k === 'mag' ? '' : 'bg-white'}" style="${k === 'mag' ? `background:${c.bg};border:1px solid ${c.bd}` : `border:1.5px dashed ${c.sub}`}"><p class="text-[10px] font-bold tracking-wide" style="color:${c.sub}">${k === 'mag' ? 'MAGISTRAL' : 'COMPLEMENTARIA'} · S${esc(s.section)}</p><p class="text-xs truncate tabular" style="color:${c.tx}">${esc(schedText(s))}</p></div>`
      : `<div class="flex-1 min-w-0 px-2.5 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50"><p class="text-[10px] font-bold tracking-wide muted">${k === 'mag' ? 'MAGISTRAL' : 'COMPLEMENTARIA'}</p><p class="text-xs muted">Por elegir</p></div>`;
    html += `<div class="flex items-center gap-1.5">${box(st.mag, 'mag')}<i class="fa-solid fa-arrow-right text-[11px] text-faint"></i>${box(st.comp, 'comp')}</div>`;
    let expl;
    if (!info.linked) expl = 'Tus datos no indican qué complementaria va con cuál magistral, así que cualquier pareja vale.';
    else if (st.mag) { const cs = info.compsFor(st.mag); expl = cs.length ? `Con la magistral S${st.mag.section} puedes tomar ${cs.map(x => 'S' + x.section).join(', ')}.` : `La magistral S${st.mag.section} no tiene complementarias asociadas.`; }
    else expl = 'Cada complementaria pertenece a una magistral (S4 → S41, S42). Elige una combinación, o primero la magistral.';
    html += `<p class="text-xs muted leading-relaxed">${esc(expl)}</p>
      <div class="seg w-full" role="tablist"><button class="flex-1" role="tab" aria-selected="${ui.panelTab === 'combos'}" aria-pressed="${ui.panelTab === 'combos'}" data-action="panel:tab" data-tab="combos">Combinaciones (${info.combos.length})</button><button class="flex-1" role="tab" aria-selected="${ui.panelTab !== 'combos'}" aria-pressed="${ui.panelTab !== 'combos'}" data-action="panel:tab" data-tab="sections">Por sección</button></div>`;
  } else if (st.conflictWith) {
    html += `<p class="text-xs text-danger">Choca con ${esc(courseTitle(st.conflictWith.code))} S${esc(st.conflictWith.section)}. Elige otra sección o cambia esa materia.</p>`;
  }
  const fchip = (k, label) => `<button class="chip" data-action="filter:toggle" ${data({ filter: k })} aria-pressed="${!!ui[k]}">${ui[k] ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}${label}</button>`;
  html += `<div class="flex flex-wrap gap-1.5">${fchip('onlyFree', 'Sin choques')}${fchip('onlySeats', 'Con cupos')}${fchip('showOptions', 'Opciones en el calendario')}${ui.showOptions ? fchip('showClashing', 'Mostrar las que chocan') : ''}</div></div>`;

  const others = S.selected.filter(s => s.code !== it.code);
  html += `<div class="p-3 flex flex-col gap-2">`;
  if (both && ui.panelTab === 'combos') {
    let rows = info.combos.map(combo => {
      const chosenNow = combo.length === st.chosen.length && combo.every(s => st.chosen.some(c2 => c2.id === s.id));
      const clash = others.some(o => combo.some(s => hasTimeConflict(s, o))) || (combo.length > 1 && hasTimeConflict(combo[0], combo[1]));
      const full = combo.some(s => !hasSeats(s));
      return { combo, chosenNow, clash, full, score: evaluate([...others, ...combo]).score };
    });
    const total = rows.length;
    rows = rows.filter(r => r.chosenNow || ((!ui.onlyFree || !r.clash) && (!ui.onlySeats || !r.full)));
    rows.sort((a, b) => (b.chosenNow - a.chosenNow) || (a.clash - b.clash) || (a.full - b.full) || (b.score - a.score));
    const free = rows.filter(r => !r.clash).length;
    html += `<p class="text-xs muted px-1">${total} combinaciones · ${free} sin choques${rows.length < total ? ` · ${total - rows.length} ocultas por filtros` : ''} · ${isMobile() ? 'toca una para verla en el horario' : 'pasa el mouse para verla en el horario'}</p>`;
    html += rows.map(r => comboRowHtml(r.combo, st, others)).join('') || `<p class="text-sm muted p-2">Ninguna combinación con estos filtros.</p>`;
  } else {
    const keep = s => st.chosen.some(c2 => c2.id === s.id) || ((!ui.onlyFree || !others.some(o => hasTimeConflict(o, s))) && (!ui.onlySeats || hasSeats(s)));
    if (both && info.linked) {
      const orphans = info.comps.filter(cp => !info.parent.get(cp.id));
      info.mags.forEach(m => {
        const isChosen = st.mag?.id === m.id;
        const comps = info.comps.filter(cp => info.parent.get(cp.id) === m.id);
        if (!keep(m) && !comps.some(keep)) return;
        html += `<div class="rounded-xl border ${isChosen ? 'border-brand-500' : 'border-slate-200'} p-2 flex flex-col gap-1.5">
          ${sectionRowHtml(m, st, others)}
          ${comps.length ? `<div class="ml-3 pl-3 border-l-2 flex flex-col gap-1.5" style="border-color:${c.bd}">${comps.filter(keep).map(cp => {
            const change = st.mag && st.mag.id !== m.id;
            return sectionRowHtml(cp, st, others, change ? { change: true, note: `Cambia tu magistral a S${esc(m.section)}`, previewIds: `${m.id},${cp.id}` } : (!st.mag ? { previewIds: `${m.id},${cp.id}` } : {}));
          }).join('') || '<p class="text-[11px] muted px-1">Sus complementarias quedan ocultas por los filtros.</p>'}</div>` : '<p class="ml-3 text-[11px] muted">Sin complementarias asociadas.</p>'}
        </div>`;
      });
      if (orphans.length) html += `<div class="rounded-xl border border-slate-200 p-2 flex flex-col gap-1.5"><p class="text-[11px] font-semibold muted px-1">Complementarias sin magistral identificada</p>${orphans.filter(keep).map(cp => sectionRowHtml(cp, st, others)).join('')}</div>`;
    } else {
      [['Magistrales', info.mags], ['Complementarias', info.comps]].filter(([, l]) => l.length).forEach(([label, list]) => {
        const shown = list.filter(keep);
        html += `<p class="text-[11px] font-bold muted px-1 pt-1">${label} (${list.length})</p>` + (shown.map(s => sectionRowHtml(s, st, others)).join('') || '<p class="text-xs muted px-1">Ocultas por los filtros.</p>');
      });
    }
  }
  return html + `</div>`;
}

// ─── Phone layout: list or calendar; an open course takes the full screen ──
function renderMobileLayout() {
  const panel = $('#course-panel'), cal = $('#cal-pane'), seg = $('#hz-mobile-seg');
  const m = isMobile();
  const focused = !!ui.focusKey;
  if (!m) { panel.className = 'panel w-[340px] flex-shrink-0'; cal.classList.remove('hidden'); seg.innerHTML = ''; return; }
  const pane = focused ? 'list' : ui.mobilePane;
  panel.className = `panel w-full ${pane === 'list' ? '' : 'hidden'}`;
  cal.classList.toggle('hidden', pane === 'list');
  seg.innerHTML = focused ? '' : `<div class="seg w-full"><button class="flex-1" data-action="mobile:pane" data-pane="list" aria-pressed="${pane === 'list'}">Materias (${S.basket.length})</button><button class="flex-1" data-action="mobile:pane" data-pane="cal" aria-pressed="${pane === 'cal'}">Horario</button></div>`;
}

// ─── Restrictions popover ────────────────────────────────────
function rulesHtml() {
  const r = S.rules;
  const cb = (key, label, extra = '') => `<label class="flex items-center gap-2.5 cursor-pointer text-sm"><input type="checkbox" class="w-4 h-4 accent-[var(--navy)]" data-change="rule:set" ${data({ rule: key })} ${r[key] ? 'checked' : ''}>${label}${extra}</label>`;
  const sel = (key, opts) => `<select class="input !h-8 !w-auto !py-0" data-change="rule:set" ${data({ rule: key })} aria-label="Hora">${opts.map(([v, l]) => `<option value="${v}" ${Number(r[key]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `<div class="w-80 max-w-full p-3 flex flex-col gap-3">
    <p class="eyebrow">Preferencias del score</p>
    ${cb('mondayFree', 'Lunes libre')}
    ${cb('tuesdayLate', 'Martes después de 9:30 AM')}
    <div class="flex items-center gap-2">${cb('noEarly', 'Sin clases antes de')}${sel('earlyHour', [[7, '7 AM'], [8, '8 AM'], [9, '9 AM'], [10, '10 AM']])}</div>
    <div class="flex items-center gap-2">${cb('noLate', 'Terminar antes de')}${sel('lateHour', [[13, '1 PM'], [14, '2 PM'], [15, '3 PM'], [16, '4 PM'], [17, '5 PM'], [18, '6 PM'], [19, '7 PM']])}</div>
    <label class="flex items-center gap-2 text-sm">Meta de créditos <input type="number" min="1" max="30" class="input !h-8 !w-16" data-change="rule:set" data-rule="creditTarget" value="${esc(r.creditTarget)}"></label>
    <p class="eyebrow pt-2 border-t border-line-2">Secciones</p>
    <label class="flex items-start gap-2.5 cursor-pointer text-sm"><input type="checkbox" class="w-4 h-4 mt-0.5 accent-[var(--navy)]" data-change="rule:set" data-rule="strictPairing" ${r.strictPairing ? 'checked' : ''}><span>Exigir que la complementaria sea de su magistral<span class="block text-xs muted">S4 → S41, S42. Desactívalo si tus datos no siguen ese patrón.</span></span></label>
    ${cb('genOnlySeats', 'El generador solo usa secciones con cupo')}
    <p class="eyebrow pt-2 border-t border-line-2">Cupos</p>
    <button class="btn btn-sm btn-quiet self-start" data-action="seats:refresh"><i class="fa-solid fa-rotate"></i>Actualizar cupos ahora</button>
  </div>`;
}

function exportMenuHtml() {
  return `<div class="w-56 max-w-full">
    <button class="menu-item" data-action="export:nrc"><i class="fa-solid fa-hashtag"></i>Copiar NRCs</button>
    <button class="menu-item" data-action="export:summary"><i class="fa-regular fa-copy"></i>Copiar resumen</button>
    ${PREVIEW ? '' : `<button class="menu-item" data-action="export:txt"><i class="fa-regular fa-file-lines"></i>Descargar .txt</button>
    <button class="menu-item" data-action="export:print"><i class="fa-solid fa-print"></i>Imprimir</button>`}
    <button class="menu-item" data-action="nav" data-view="exportar"><i class="fa-solid fa-table-columns"></i>Comparar horarios</button>
  </div>`;
}

function draftMenuHtml(id) {
  return `<div class="w-56 max-w-full">
    ${S.drafts.map(d => `<button class="menu-item ${d.id === S.currentDraftId ? 'font-extrabold' : ''}" data-action="draft:switch" ${data({ id: d.id })}><i class="fa-solid ${d.id === S.currentDraftId ? 'fa-check' : 'fa-calendar'}"></i><span class="truncate">${esc(d.name)}</span></button>`).join('')}
    <div class="border-t border-line-2 my-1"></div>
    <button class="menu-item" data-action="draft:new"><i class="fa-solid fa-plus"></i>Nuevo horario</button>
    <button class="menu-item" data-action="draft:rename" ${data({ id })}><i class="fa-solid fa-pen"></i>Renombrar</button>
    <button class="menu-item" data-action="draft:duplicate" ${data({ id })}><i class="fa-regular fa-copy"></i>Duplicar</button>
    ${S.drafts.length > 1 ? `<button class="menu-item is-danger" data-action="draft:delete" ${data({ id })}><i class="fa-regular fa-trash-can"></i>Eliminar</button>` : ''}
  </div>`;
}

// ─── Actions ─────────────────────────────────────────────────
function doChooseCombo(ids) {
  const r = chooseCombo(ids); if (!r) return;
  ui.pinned = null; ui.preview = null;
  toast(`${courseTitle(r.code)}: ${r.secs.map(s => `${kindLabel(s)} S${s.section}`).join(' + ')}${r.conflictWith ? ` · ojo, choca con ${courseTitle(r.conflictWith.code)}` : ''}`, r.conflictWith ? 'warning' : 'success');
  commit();
}
function noteText(note) {
  if (!note) return '';
  if (note.type === 'dropComp') return `Quitamos la complementaria S${note.comp.section}: no es de la magistral S${note.mag.section}.`;
  if (note.type === 'switchMag') return `Cambiamos la magistral a S${note.mag.section}: la complementaria S${note.comp.section} depende de ella.`;
  return `Agregamos la magistral S${note.mag.section}, de la que depende la complementaria S${note.comp.section}.`;
}
function chooseSectionAction(id) {
  closePopover('slot-popup');
  const r = chooseSection(id); if (!r) return;
  ui.pinned = null; ui.preview = null;
  const msg = noteText(r.note);
  if (msg) toast(msg, 'info', { label: 'Deshacer', fn: () => { undo(); commit(); } });
  else toast(`${courseTitle(r.sec.code)}: ${kindLabel(r.sec)} S${r.sec.section} elegida${r.conflictWith ? ` · choca con ${courseTitle(r.conflictWith.code)}` : ''}`, r.conflictWith ? 'warning' : 'success');
  commit();
}
function focusCourse(key) {
  const it = basketItem(key); if (!it) return;
  ui.focusKey = key; ui.pinned = null; ui.preview = null;
  const info = it.code ? courseInfo(it.code) : null;
  ui.panelTab = info && info.mags.length && info.comps.length ? 'combos' : 'sections';
  if (ui.view !== 'horario') window.__nav?.('horario'); else commit();
  document.getElementById('course-panel')?.scrollTo?.(0, 0);
}
export { focusCourse };

handle({
  'draft:cycle': ({ dir }) => { if (S.drafts.length < 2) return; const i = S.drafts.findIndex(d => d.id === S.currentDraftId); if (switchDraft(S.drafts[(i + Number(dir) + S.drafts.length) % S.drafts.length].id)) { ui.pinned = ui.preview = null; commit(); } },
  'draft:menu': ({ id }, el) => togglePopover(el, draftMenuHtml(id), { id: 'draft-menu', placement: 'bottom-start', anchorSelector: '[data-anchor="draft-menu"]' }),
  'draft:switch': ({ id }) => { closePopover(); if (switchDraft(id)) { ui.pinned = ui.preview = null; commit(); } },
  'draft:new': async () => { closePopover(); const name = await promptDialog({ title: 'Nuevo horario', label: 'Nombre', value: nextDraftName(), confirm: 'Crear' }); if (name === null) return; const d = createDraft(name); window.__nav?.('horario'); commit(); toast(`«${d.name}» creado.`, 'success'); },
  'draft:rename': async ({ id }) => { closePopover(); const d = S.drafts.find(x => x.id === id); if (!d) return; const name = await promptDialog({ title: 'Renombrar horario', label: 'Nombre', value: d.name }); if (name) { renameDraft(id, name); commit(); } },
  'draft:duplicate': ({ id }) => { closePopover(); const c = duplicateDraft(id); if (c) { commit(); toast(`«${c.name}» creado.`, 'success'); } },
  'draft:delete': async ({ id }) => { closePopover(); const d = S.drafts.find(x => x.id === id); if (!d) return; if (await confirmDialog({ title: `¿Eliminar «${d.name}»?`, body: 'Esta acción no se puede deshacer.', confirm: 'Eliminar', danger: true })) { deleteDraft(id); commit(); toast('Horario eliminado.', 'info'); } },
  'undo': () => { const r = undo(); if (!r) { toast('Nada que deshacer.', 'info'); return; } ui.pinned = null; commit(); toast(r === 'gen' ? 'Volviste a tu horario anterior.' : 'Acción deshecha.', 'info'); },
  'redo': () => { if (!redo()) { toast('Nada que rehacer.', 'info'); return; } ui.pinned = null; commit(); toast('Acción rehecha.', 'info'); },
  'rules:open': (_, el) => togglePopover(el, rulesHtml(), { id: 'rules', anchorSelector: '[data-anchor="rules"]', label: 'Restricciones' }),
  'rule:set': ({ rule }, el) => {
    const v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(1, Math.min(30, parseFloat(el.value) || 18)) : parseInt(el.value, 10);
    setRule(rule, v); commit(); refreshPopover('rules', rulesHtml());
  },
  'seats:refresh': () => { closePopover(); refreshAll(true); },
  'export:menu': (_, el) => togglePopover(el, exportMenuHtml(), { id: 'export-menu', anchorSelector: '[data-anchor="export-menu"]' }),
  'export:nrc': () => { closePopover(); copyNRCs(); },
  'export:summary': () => { closePopover(); copySummary(); },
  'export:txt': () => { closePopover(); downloadSummary(); },
  'export:print': () => { closePopover(); printSchedule(); },
  'gen:run': () => {
    const r = runGenerator();
    if (!r.ok) { toast(r.error, r.kind === 'nocourses' ? 'warning' : 'error'); return; }
    ui.focusKey = null; ui.pinned = null; ui.preview = null;
    if (isMobile()) ui.mobilePane = 'cal';
    if (ui.view !== 'horario') window.__nav?.('horario'); else commit();
  },
  'gen:step': ({ dir }) => { if (!S.gen) return; applyGen(S.gen.index + Number(dir)); commit(); },
  'gen:use': () => { useGen(); commit(); toast('Listo: este es tu horario. Puedes ajustarlo materia por materia.', 'success', { label: 'Deshacer', fn: () => { undo(); commit(); } }); },
  'gen:save': () => { const d = saveGenAsNew(); if (d) { commit(); toast(`Guardado como «${d.name}».`, 'success'); } },
  'gen:cancel': () => { cancelGen(); commit(); toast('Volviste a tu horario anterior.', 'info'); },
  'course:focus': ({ key }) => focusCourse(key),
  'course:close': () => { ui.focusKey = null; ui.pinned = null; ui.preview = null; commit(); },
  'course:hover': ({ key }) => { if (ui.hoverKey === key) return; ui.hoverKey = key; renderCalendar(); },
  'course:hover:leave': () => { ui.hoverKey = null; renderCalendar(); },
  'course:lock': ({ key }) => { const on = toggleLock(key); toast(on ? 'Con candado: el generador deja esta materia como está.' : 'Candado quitado: el generador puede cambiarla.', 'info'); commit(); },
  'course:skip': ({ key }) => { const on = toggleSkip(key); if (on !== null) { toast(on ? 'No se incluye en este horario.' : 'De nuevo en este horario.', 'info', { label: 'Deshacer', fn: () => { undo(); commit(); } }); commit(); } },
  'course:menu': ({ key }, el) => {
    const st = courseState(basketItem(key), ctx());
    togglePopover(el, `<div class="w-60 max-w-full">
      ${st.chosen.length ? `<button class="menu-item" data-action="course:clear" ${data({ key })}><i class="fa-solid fa-eraser"></i>Quitar de este horario</button>` : ''}
      ${st.item.code ? `<button class="menu-item" data-action="course:fetch" ${data({ key })}><i class="fa-solid fa-rotate"></i>Actualizar secciones y cupos</button>` : ''}
      <button class="menu-item is-danger" data-action="course:remove" ${data({ key })}><i class="fa-regular fa-trash-can"></i>Quitar de Mis materias</button></div>`, { id: 'course-menu', anchorSelector: '[data-anchor="course-menu"]' });
  },
  'course:clear': ({ key }) => { closePopover(); const it = clearCourse(key); if (it) { toast(`${it.title} quitada de este horario.`, 'info', { label: 'Deshacer', fn: () => { undo(); commit(); } }); commit(); } },
  'course:remove': async ({ key }) => {
    closePopover();
    const it = basketItem(key); if (!it) return;
    if (courseInUse(key) && !(await confirmDialog({ title: `¿Quitar ${it.title}?`, body: 'También sale de todos tus horarios.', confirm: 'Quitar', danger: true }))) return;
    removeFromBasket(key); if (ui.focusKey === key) ui.focusKey = null;
    toast(`${it.title} quitada de Mis materias.`, 'info'); commit();
  },
  'course:fetch': ({ key }) => { closePopover(); const it = basketItem(key); if (it?.code) { queueFetch([it.code]); commit(); } },
  'panel:tab': ({ tab }) => { ui.panelTab = tab; renderPanel(); },
  'filter:toggle': ({ filter }) => { ui[filter] = !ui[filter]; renderPanel(); renderCalendar(); },
  'list:filter': ({ filter }) => { ui.listFilter = filter; ui.focusKey = null; if (ui.view !== 'horario') window.__nav?.('horario'); else renderPanel(); },
  'combo:preview': ({ ids }) => { const v = ids.split(','); if (JSON.stringify(v) === JSON.stringify(ui.preview)) return; ui.preview = v; renderCalendar(); },
  'combo:preview:leave': () => { if (!ui.preview) return; ui.preview = null; renderCalendar(); },
  'combo:pin': ({ ids }) => {
    const v = ids.split(',');
    ui.pinned = JSON.stringify(v) === JSON.stringify(ui.pinned) ? null : v;
    if (ui.pinned && isMobile()) {
      const first = v.map(findSec).filter(Boolean).flatMap(s => s.schedules.map(sch => ({ d: DAYS.indexOf(sch.days[0]), t: timeToMinutes(sch.start_time) }))).filter(x => x.d >= 0).sort((a, b) => a.d - b.d || a.t - b.t)[0];
      if (first) ui.mobileDay = first.d;
      ui.mobilePane = 'cal'; ui.focusKey = null;
      commit();
      return;
    }
    renderPanel(); renderCalendar();
  },
  'combo:choose': ({ ids }) => doChooseCombo(ids.split(',')),
  'section:choose': ({ id }) => chooseSectionAction(id),
  'section:unchoose': ({ id }) => { const r = unchooseSection(id); if (!r) return; toast(`Quitamos ${kindLabel(r.sec)} S${r.sec.section}${r.droppedComp ? ` y su complementaria S${r.droppedComp.section}` : ''}.`, 'info', { label: 'Deshacer', fn: () => { undo(); commit(); } }); commit(); },
  'cal:block': ({ code }) => { const it = itemForCode(code); if (it) focusCourse(it.key); },
  'cal:option': ({ id }) => chooseSectionAction(id),
  'cal:pinned': () => { if (ui.pinned) doChooseCombo(ui.pinned); },
  'cal:slot': (_, el, e) => { if (e.target !== el) return; openSlotPopup(el, e.clientY); },
  'slot:preview': ({ id }) => { ui.preview = resultIdsFor(id); renderCalendar(); },
  'slot:preview:leave': () => { ui.preview = null; renderCalendar(); },
  'mobile:pane': ({ pane }) => { ui.mobilePane = pane; commit(); },
  'mobile:day': ({ day }) => { ui.mobileDay = Number(day); renderCalendar(); renderMobileDays(); },
  'drag:start': (_, el, e) => { ui.dragIds = el.dataset.drag.split(','); ui.preview = ui.dragIds; try { e.dataTransfer.setData('text/plain', el.dataset.drag); e.dataTransfer.effectAllowed = 'copy'; } catch { /* ignore */ } renderCalendar(); },
  'drag:end': () => { ui.dragIds = null; ui.preview = null; renderCalendar(); },
});
