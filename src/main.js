// Entry point: shell (rail, top bar, tab bar), routing and global keys.
import { S, load, subscribe, commit, currentDraft, switchDraft, courseState, isPending, evaluate, undo, redo, applyGen, cancelGen, clearAll, draftSections } from './state/store.js';
import { getPensum } from './core/pensum.js';
import { esc, data, handle, installDelegation, $, isMobile } from './ui/dom.js';
import { ui, PREVIEW } from './ui/state.js';
import { COURSE_PALETTE } from './ui/tones.js';
import { installDialog, closePopover, popoverOpen, dialogOpen, closeDialog, confirmDialog, toast } from './ui/layer.js';
import { renderPensumView } from './ui/views/pensum-view.js';
import { renderHorario, renderPanel } from './ui/views/horario-view.js';
import { renderExport } from './ui/views/export-view.js';
import { renderCalendar } from './ui/calendar.js';
import { refreshAll } from './ui/fetch-queue.js';
import './ui/views/search-dialog.js';

const VIEWS = {
  pensum: { label: 'Mi pénsum', icon: 'fa-table-cells', render: renderPensumView },
  horario: { label: 'Horario', icon: 'fa-calendar-week', render: renderHorario },
  exportar: { label: 'Exportar', icon: 'fa-arrow-up-from-bracket', render: renderExport },
};

function pendingCount() {
  const ctx = { draft: currentDraft(), selected: S.selected, loading: ui.loadingCodes };
  return S.basket.map(b => courseState(b, ctx)).filter(isPending).length;
}

function renderRail() {
  const pending = pendingCount();
  const p = getPensum(S.profile.program);
  $('#rail').innerHTML = `
    <div class="brand"><div class="brand-logo"><i class="fa-solid fa-calendar-check text-sm"></i></div>
      <div class="min-w-0"><p class="brand-name">Armador de Horarios</p><p class="brand-note">Uniandes · v8</p></div></div>
    <nav class="nav" aria-label="Secciones">${Object.entries(VIEWS).map(([id, v]) => `
      <button class="nav-item" data-action="nav" ${data({ view: id })} ${ui.view === id ? 'aria-current="page"' : ''}>
        <i class="fa-solid ${v.icon} w-4 text-center"></i>${v.label}
        ${id === 'pensum' && S.basket.length ? `<span class="nav-badge">${S.basket.length}</span>` : ''}
        ${id === 'horario' && pending ? `<span class="nav-badge is-warn" title="Materias pendientes">${pending}</span>` : ''}
      </button>`).join('')}</nav>
    <div class="rail-h"><span>Mis horarios</span><button class="icon-btn !w-7 !h-7" data-action="draft:new" aria-label="Nuevo horario" title="Nuevo horario"><i class="fa-solid fa-plus text-[11px]"></i></button></div>
    <div class="px-3 flex flex-col gap-0.5 overflow-y-auto flex-1 min-h-0">${S.drafts.map((d, i) => {
      const cr = evaluate(draftSections(d.id)).totalCredits;
      return `<button class="draft-item" data-action="rail:draft" ${data({ id: d.id })} aria-current="${d.id === S.currentDraftId}">
        <span class="w-2 h-2 rounded-full flex-shrink-0" style="background:${COURSE_PALETTE[i % COURSE_PALETTE.length].dot}"></span><span class="truncate flex-1">${esc(d.name)}</span><span class="text-xs muted font-normal tabular">${cr} cr</span></button>`;
    }).join('')}</div>
    <div class="rail-foot">
      ${p ? `<button class="rail-btn" data-action="nav" data-view="pensum"><i class="fa-solid fa-graduation-cap w-4 text-slate-400"></i><span class="truncate">${esc(p.program)}</span></button>` : ''}
      <button class="rail-btn is-danger" data-action="app:clear"><i class="fa-regular fa-trash-can w-4 text-slate-400"></i>Vaciar todo</button>
    </div>`;
}

function renderTopbar() {
  const p = getPensum(S.profile.program);
  const title = ui.view === 'pensum' ? (p ? `Mi pénsum <span class="sub">· ${esc(p.program)}</span>` : `Elige tu programa`)
    : ui.view === 'horario' ? `Horario` : `Comparar y exportar`;
  $('#topbar').className = 'topbar gutter';
  $('#topbar').innerHTML = `<div class="flex items-center gap-3 min-w-0 flex-1">
      <span class="lg:hidden brand-logo !w-8 !h-8"><i class="fa-solid fa-calendar-check text-xs"></i></span>
      <h1 class="ptitle truncate">${title}</h1></div>
    ${ui.view === 'horario' ? `<div id="top-metrics" class="hidden lg:flex items-center gap-1.5"></div>` : ''}
    ${ui.view === 'exportar' ? `<button class="btn btn-quiet btn-sm hidden sm:inline-flex" data-action="search:open"><i class="fa-solid fa-magnifying-glass"></i>Buscar materia</button>` : ''}
    ${PREVIEW ? `<span class="pill pill-warn" title="Esta vista previa usa datos de ejemplo">Vista previa</span>` : ''}`;
}

function renderTabbar() {
  const pending = pendingCount();
  $('#tabbar').innerHTML = Object.entries(VIEWS).map(([id, v]) => `
    <button data-action="nav" ${data({ view: id })} ${ui.view === id ? 'aria-current="page"' : ''}><i class="fa-solid ${v.icon}"></i>${v.label}
      ${id === 'horario' && pending ? `<span class="tab-dot">${pending}</span>` : ''}</button>`).join('');
}

function renderAll() {
  renderRail(); renderTopbar(); renderTabbar();
  Object.keys(VIEWS).forEach(id => { const el = document.getElementById(`view-${id}`); if (el) el.hidden = id !== ui.view; });
  VIEWS[ui.view].render();
}

function setView(view, { push = true } = {}) {
  if (!VIEWS[view]) view = 'pensum';
  const changed = ui.view !== view;
  closePopover();
  ui.view = view;
  if (push && location.hash !== `#${view}`) { try { history.replaceState(null, '', `#${view}`); } catch { location.hash = view; } }
  const go = () => { renderAll(); if (changed) document.getElementById(`view-${view}`)?.scrollTo?.(0, 0); };
  if (changed && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(go);
  else go();
}
window.__nav = view => setView(view);

handle({
  'nav': ({ view }) => setView(view),
  'rail:draft': ({ id }) => { switchDraft(id); ui.pinned = ui.preview = null; setView('horario'); },
  'app:clear': async () => {
    if (!S.sections.length && !S.basket.length) { toast('No hay nada que borrar.', 'info'); return; }
    if (!(await confirmDialog({ title: '¿Vaciar todo?', body: 'Se borran tus materias, las secciones cargadas y todos tus horarios. No se puede deshacer.', confirm: 'Vaciar todo', danger: true }))) return;
    clearAll(); ui.focusKey = null; commit(); toast('Se borró todo.', 'info');
  },
  'dialog:close': ({ value }) => closeDialog(value ?? null),
});

document.addEventListener('keydown', e => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'Escape') {
    if (dialogOpen()) return; // <dialog> handles its own Escape
    if (popoverOpen()) { closePopover(); return; }
    if (ui.pinned) { ui.pinned = null; renderPanel(); renderCalendar(); return; }
    if (ui.focusKey && ui.view === 'horario' && tag !== 'input') { ui.focusKey = null; commit(); }
    return;
  }
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || dialogOpen()) return;
  if (ui.view !== 'horario') return;
  const key = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z') { e.preventDefault(); if (undo()) commit(); }
  else if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && key === 'z') || key === 'y')) { e.preventDefault(); if (redo()) commit(); }
  else if (S.gen && e.key === 'ArrowRight') { applyGen(S.gen.index + 1); commit(); }
  else if (S.gen && e.key === 'ArrowLeft') { applyGen(S.gen.index - 1); commit(); }
});

let lastMobile = null, resizeT = null;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (isMobile() !== lastMobile) { lastMobile = isMobile(); renderAll(); } }, 120); });
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS[v] && v !== ui.view) setView(v, { push: false }); });

let refreshTimer = null;
function syncAutoRefresh() {
  clearInterval(refreshTimer); refreshTimer = null;
  if (S.autoRefresh.on && !PREVIEW) refreshTimer = setInterval(() => refreshAll(false), Math.max(2, S.autoRefresh.minutes) * 60 * 1000);
}

(function init() {
  installDelegation(document);
  installDialog();
  lastMobile = isMobile();
  const { restored, migratedFrom } = load();
  subscribe(renderAll);
  const fromHash = location.hash.slice(1);
  setView(VIEWS[fromHash] ? fromHash : (restored && S.profile.program ? 'horario' : 'pensum'));
  syncAutoRefresh();
  if (migratedFrom) toast('Tu información pasó a la nueva versión: tus materias y horarios siguen aquí.', 'info');
  else if (restored) toast(`Bienvenido de vuelta: ${S.basket.length} materias y ${S.drafts.length} horario${S.drafts.length > 1 ? 's' : ''}.`, 'info');
  setInterval(() => { if (ui.view === 'horario' && !ui.dragIds && !popoverOpen('slot-popup')) renderCalendar(); }, 60 * 1000);
})();
