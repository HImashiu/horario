// Seat alerts in the UI: the bell on full sections, the list in the top bar, the check every few
// minutes while the page is open, and the notice (a toast, and a browser notification if allowed).
import { S, commit, itemForCode } from '../state/store.js';
import { makeWatch, updateWatches, seatsOf } from '../core/watch.js';
import { kindLabel } from '../core/sections.js';
import { fmtCode } from '../core/requirements.js';
import { esc, data, handle } from './dom.js';
import { ui, PREVIEW } from './state.js';
import { toast, togglePopover, refreshPopover, closePopover } from './layer.js';
import { queueFetch, onIngest } from './fetch-queue.js';
import { openSearch } from './views/search-dialog.js';

const MINUTES = [2, 5, 10, 15];
export const watchMinutes = () => (MINUTES.includes(S.prefs.watchMinutes) ? S.prefs.watchMinutes : 5);
export const isWatched = nrc => S.watch.some(w => w.nrc === String(nrc));
const notifState = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
const labelOf = w => `${fmtCode(w.code)} ${kindLabel({ schedule_type: w.kind })} S${w.section}`;
const seatsText = n => (n === 1 ? '1 cupo' : `${n} cupos`);

// ─── Buttons ─────────────────────────────────────────────────
/** Bell for the full sections among `sections` (course panel rows). */
export function watchButtonHtml(sections) {
  const full = sections.filter(s => !s.stale && seatsOf(s) !== null && seatsOf(s) <= 0);
  if (!full.length) return '';
  const on = full.every(s => isWatched(s.nrc));
  const label = on ? 'Dejar de avisarme' : 'Avísame si se abre cupo';
  return `<button class="icon-btn !w-8 !h-8 flex-shrink-0 ${on ? 'is-watching' : ''}" data-action="watch:toggle" ${data({ nrcs: full.map(s => s.nrc).join(',') })} aria-pressed="${on}" title="${label}" aria-label="${label}"><i class="fa-${on ? 'solid' : 'regular'} fa-bell text-[13px]"></i></button>`;
}

/** Top bar: the bell with the list of alerts, while there are any. */
export function watchTopbarHtml() {
  if (!S.watch.length) return '';
  const open = S.watch.filter(w => w.seats > 0).length;
  return `<button class="icon-btn relative flex-shrink-0" id="watch-btn" data-action="watch:list" aria-label="Alertas de cupo: ${S.watch.length}${open ? `, ${open} con cupo` : ''}" title="Alertas de cupo"><i class="fa-${open ? 'solid' : 'regular'} fa-bell"></i>${open ? `<span class="bell-dot">${open}</span>` : ''}</button>`;
}

function listHtml() {
  const time = t => new Date(t).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  const rows = S.watch.map(w => `<div class="flex items-center gap-2 text-sm">
      <span class="flex-1 min-w-0"><span class="block truncate"><b class="font-semibold">${esc(labelOf(w))}</b> <span class="muted">NRC ${esc(w.nrc)}</span></span>
        <span class="block text-xs ${w.seats > 0 ? 'text-emerald-700 font-semibold' : 'muted'}">${w.seats > 0 ? `¡${seatsText(w.seats)}!` : 'Sin cupo'}${w.checkedAt ? `<span class="font-normal muted"> · revisado ${time(w.checkedAt)}</span>` : ''}</span></span>
      <button class="btn btn-sm btn-quiet" data-action="watch:go" ${data({ code: w.code })}>Ver</button>
      <button class="tray-x" data-action="watch:remove" ${data({ nrc: w.nrc })} aria-label="Quitar la alerta de NRC ${esc(w.nrc)}"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
  const n = notifState();
  const notif = n === 'granted' ? '<p class="text-xs muted"><i class="fa-solid fa-check text-emerald-600 mr-1"></i>Avisos del navegador activados.</p>'
    : n === 'denied' ? '<p class="text-xs muted">Los avisos del navegador están bloqueados: te avisamos dentro de la página.</p>'
    : n === 'unsupported' ? '' : '<button class="btn btn-sm btn-soft self-start" data-action="watch:notify"><i class="fa-regular fa-bell"></i>Activar avisos del navegador</button>';
  return `<div class="p-3 flex flex-col gap-3" style="width:min(380px,calc(100vw - 32px))">
    <div><p class="font-semibold">Alertas de cupo</p>
      <p class="text-xs muted">${PREVIEW ? 'La vista previa no consulta cupos en Uniandes; en el sitio sí.' : `Revisamos cada ${watchMinutes()} min mientras esta página esté abierta (no hay servidor que revise por ti).`}</p></div>
    <div class="flex flex-col gap-2">${rows}</div>
    <div class="flex flex-wrap items-center gap-2 pt-3 border-t border-line-2">
      ${PREVIEW ? '' : '<button class="btn btn-sm btn-quiet" data-action="watch:check"><i class="fa-solid fa-rotate"></i>Revisar ahora</button>'}
      <div class="seg ml-auto" role="group" aria-label="Cada cuántos minutos revisar">${MINUTES.map(m => `<button data-action="watch:minutes" ${data({ m })} aria-pressed="${m === watchMinutes()}">${m} min</button>`).join('')}</div>
    </div>
    ${notif}
  </div>`;
}
const refreshList = () => refreshPopover('watch-pop', listHtml());

// ─── Watching ────────────────────────────────────────────────
function toggleWatch(nrcs) {
  const secs = nrcs.map(n => S.sections.find(s => String(s.nrc) === n)).filter(Boolean);
  if (!secs.length) return;
  if (secs.every(s => isWatched(s.nrc))) {
    S.watch = S.watch.filter(w => !nrcs.includes(w.nrc));
    toast('Listo: ya no te avisamos de esa sección.', 'info');
    commit(); syncWatchTimer();
    return;
  }
  const first = !S.watch.length;
  secs.forEach(s => { if (!isWatched(s.nrc)) S.watch.push(makeWatch(s)); });
  commit(); syncWatchTimer();
  const what = secs.length === 1 ? `${fmtCode(secs[0].code)} S${secs[0].section}` : `${secs.length} secciones`;
  toast(PREVIEW ? 'Alerta guardada. La vista previa no consulta cupos; en el sitio te avisamos cuando se abra.' : `Te avisamos si se abre cupo en ${what}. Revisamos cada ${watchMinutes()} min mientras esta página esté abierta.`, 'success');
  if (first && notifState() === 'default') askNotifications();
}

async function askNotifications() {
  if (notifState() === 'default') { try { await Notification.requestPermission(); } catch { /* older browsers */ } }
  refreshList();
}

let timer = null, timerMinutes = null;
/** Keeps the periodic check running while there are alerts (never in the preview). */
export function syncWatchTimer(restart = false) {
  if (PREVIEW || !S.watch.length) { clearInterval(timer); timer = null; timerMinutes = null; return; }
  const m = watchMinutes();
  if (timer && timerMinutes === m && !restart) return;
  clearInterval(timer);
  timerMinutes = m;
  timer = setInterval(() => checkNow(false), m * 60 * 1000);
}
export function checkNow(manual) {
  if (PREVIEW) { if (manual) toast('La vista previa no consulta cupos.', 'info'); return; }
  const codes = [...new Set(S.watch.map(w => w.code))];
  if (!codes.length) return;
  queueFetch(codes);
  if (manual) toast('Revisando cupos…', 'info');
}

// Every time sections arrive from Uniandes, compare the watched ones.
onIngest(() => {
  if (!S.watch.length) return;
  const { watches, opened } = updateWatches(S.watch, nrc => S.sections.find(s => String(s.nrc) === nrc));
  S.watch = watches;
  opened.forEach(({ watch }) => announce(watch));
  refreshList();
});

function goTo(code) {
  closePopover();
  const it = itemForCode(code);
  if (it) { ui.focusKey = it.key; window.__nav?.('horario'); commit(); }
  else openSearch({ q: code });
}

let baseTitle = null;
function announce(w) {
  toast(`¡Se abrió cupo en ${labelOf(w)} (NRC ${w.nrc})! Hay ${seatsText(w.seats)}.`, 'success', { label: 'Ver', fn: () => goTo(w.code) });
  if (notifState() === 'granted') {
    try {
      const n = new Notification('Se abrió un cupo', { body: `${labelOf(w)} · NRC ${w.nrc}: ${seatsText(w.seats)}`, tag: `cupo-${w.nrc}` });
      n.onclick = () => { window.focus(); goTo(w.code); n.close(); };
    } catch { /* some phones only allow notifications from a service worker: the toast remains */ }
  }
  if (document.hidden) {
    if (baseTitle === null) baseTitle = document.title;
    document.title = `(¡Cupo!) ${baseTitle}`;
    const back = () => { if (!document.hidden) { document.title = baseTitle; document.removeEventListener('visibilitychange', back); } };
    document.addEventListener('visibilitychange', back);
  }
}

handle({
  'watch:toggle': ({ nrcs }) => toggleWatch(String(nrcs).split(',')),
  'watch:list': (_, el) => togglePopover(el, listHtml(), { id: 'watch-pop', placement: 'bottom-end', anchorSelector: '#watch-btn', label: 'Alertas de cupo' }),
  'watch:remove': ({ nrc }) => {
    S.watch = S.watch.filter(w => w.nrc !== String(nrc));
    commit(); syncWatchTimer();
    if (S.watch.length) refreshList(); else closePopover('watch-pop');
  },
  'watch:check': () => checkNow(true),
  'watch:minutes': ({ m }) => { S.prefs.watchMinutes = Number(m); commit(); syncWatchTimer(true); refreshList(); },
  'watch:notify': () => askNotifications(),
  'watch:go': ({ code }) => goTo(code),
});
