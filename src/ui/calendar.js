// Week calendar. Ported from index.html v7 (renderCalendar, blockHtml, layoutLanes) with:
//  - course colours from the pensum palette (category colour, a shade per course)
//  - complementarias drawn like the pensum's requirement boxes (white with a coloured border)
//  - "¿Qué cabe aquí?" rendered in the top layer, so hovering its options no longer destroys it
import { S, findSec, courseInfo, basketItem, currentDraft, courseTitle, resultIdsFor } from '../state/store.js';
import { DAYS, DAY_HEAD, timeToMinutes, fmtTime, fmtTimeAP, fmtHour, hasTimeConflict } from '../core/time.js';
import { kindOf, kindLabel, hasSeats } from '../core/sections.js';
import { esc, data, isMobile, $ } from './dom.js';
import { ui, colorsFor } from './state.js';
import { openPopover, closePopover } from './layer.js';

export let lastCal = { startHour: 7, PX: 56 };

function calRange(extra) {
  let mn = 7 * 60, mx = 18 * 60;
  [...S.selected, ...extra].forEach(s => (s.schedules || []).forEach(sch => { mn = Math.min(mn, timeToMinutes(sch.start_time)); mx = Math.max(mx, timeToMinutes(sch.end_time)); }));
  return { startHour: Math.max(5, Math.floor(mn / 60)), endHour: Math.min(23, Math.ceil(mx / 60)) };
}
function layoutLanes(slots) {
  slots.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], clusterEnd = -1;
  const finish = () => { const lanes = []; cluster.forEach(x => { let li = lanes.findIndex(end => end <= x.s); if (li < 0) { li = lanes.length; lanes.push(x.e); } else lanes[li] = x.e; x.lane = li; }); cluster.forEach(x => { x.lanes = lanes.length; }); };
  slots.forEach(x => { if (cluster.length && x.s >= clusterEnd) { finish(); cluster = []; clusterEnd = -1; } cluster.push(x); clusterEnd = Math.max(clusterEnd, x.e); });
  if (cluster.length) finish();
  return slots;
}

export function renderCalendar() {
  const el = $('#cal-grid'); if (!el || ui.view !== 'horario') return;
  const mobile = isMobile();
  const dayIdxs = mobile ? [ui.mobileDay] : [0, 1, 2, 3, 4, 5];
  const focusCode = ui.focusKey ? basketItem(ui.focusKey)?.code : null;
  const hoverCode = ui.hoverKey ? basketItem(ui.hoverKey)?.code : null;
  const prevIds = ui.preview || ui.pinned;
  const prevSecs = prevIds ? prevIds.map(findSec).filter(Boolean) : [];
  const prevCode = prevSecs[0]?.code;
  const chosenIds = new Set(S.selected.map(s => s.id));
  const keepers = S.selected.filter(s => s.code !== prevCode);

  const main = [];
  S.selected.forEach(s => main.push({ sec: s, type: kindOf(s), focus: s.code === focusCode || s.code === hoverCode, faded: !!prevCode && s.code === prevCode && !prevIds.includes(s.id), conflict: S.selected.some(o => o.code !== s.code && hasTimeConflict(o, s)) }));
  prevSecs.forEach(s => { if (!chosenIds.has(s.id)) main.push({ sec: s, type: 'preview', conflict: keepers.some(o => hasTimeConflict(o, s)) }); });
  // Options of the open course: only those that fit, unless "Mostrar las que chocan" is on.
  const options = [];
  if (focusCode && ui.showOptions && !S.gen) {
    const used = new Set([...chosenIds, ...(prevIds || [])]);
    courseInfo(focusCode).secs.forEach(s => {
      if (used.has(s.id)) return;
      if (ui.onlySeats && !hasSeats(s)) return;
      const clash = S.selected.some(o => o.code !== focusCode && hasTimeConflict(o, s));
      if (clash && !ui.showClashing) return;
      options.push({ sec: s, type: clash ? 'option-clash' : 'option' });
    });
  }
  const { startHour, endHour } = calRange([...prevSecs, ...options.map(o => o.sec)]);
  const PX = mobile ? 64 : 56;
  const totalH = (endHour - startHour) * PX;
  lastCal = { startHour, PX };
  const now = new Date(), todayIdx = now.getDay() - 1;
  const nowTop = (now.getHours() * 60 + now.getMinutes() - startHour * 60) * PX / 60;
  const hint = $('#cal-hint');
  if (hint) hint.textContent = focusCode && ui.showOptions && !S.gen ? 'Clic en un contorno punteado para elegir esa opción' : (S.gen ? 'Vista de la opción generada' : 'Clic en un bloque para abrir su materia · clic en un espacio libre para ver qué cabe');

  const slotsOf = (list, day) => { const out = []; list.forEach(x => (x.sec.schedules || []).forEach(sch => { if (sch.days.includes(day)) out.push({ ...x, sch, s: timeToMinutes(sch.start_time), e: timeToMinutes(sch.end_time) }); })); return out; };
  let html = '';
  if (!mobile) {
    html += `<div class="cal-head"><div class="w-14 flex-shrink-0 border-r border-line-2"></div><div class="flex-1 grid grid-cols-6">` +
      dayIdxs.map(i => {
        const n = S.selected.reduce((a, s) => a + (s.schedules || []).filter(sch => sch.days.includes(DAYS[i])).length, 0);
        const today = i === todayIdx;
        return `<div class="py-2 text-center border-r border-line-2 last:border-r-0 ${today ? 'shadow-[inset_0_-2px_0_#2f4bf0]' : ''}">
          <div class="text-sm font-semibold ${today ? 'text-brand-700' : 'text-slate-800'}">${DAY_HEAD[i]}</div>
          <div class="text-[11px] muted">${n ? `${n} clase${n > 1 ? 's' : ''}` : 'libre'}</div></div>`;
      }).join('') + `</div></div>`;
  }
  html += `<div class="flex relative" style="height:${totalH}px"><div class="w-14 flex-shrink-0 border-r border-line-2 relative">`;
  for (let h = startHour; h < endHour; h++) html += `<div class="absolute right-2 text-[11px] muted whitespace-nowrap tabular" style="top:${(h - startHour) * PX + (h === startHour ? 3 : -7)}px">${fmtHour(h)}</div>`;
  html += `</div><div class="flex-1 relative"><div class="absolute inset-0 pointer-events-none">`;
  for (let h = startHour; h < endHour; h++) html += `<div class="border-t border-line-2" style="height:${PX}px"></div>`;
  html += `</div><div class="absolute inset-0 grid ${mobile ? 'grid-cols-1' : 'grid-cols-6'}">`;
  dayIdxs.forEach(di => {
    const day = DAYS[di];
    html += `<div class="cal-col ${di === 5 ? 'is-sat' : ''}" data-action="cal:slot" ${data({ day, di })}>`;
    if (di === todayIdx && nowTop > 0 && nowTop < totalH) html += `<div class="absolute left-0 right-0 z-[45] pointer-events-none flex items-center" style="top:${nowTop}px"><span class="w-2.5 h-2.5 rounded-full bg-navy -ml-1 ring-2 ring-white"></span><span class="flex-1 h-0.5 bg-navy"></span></div>`;
    const mainSlots = layoutLanes(slotsOf(main, day));
    const optSlots = slotsOf(options, day);
    optSlots.forEach(x => { x.narrow = mainSlots.some(m => Math.max(m.s, x.s) < Math.min(m.e, x.e)); });
    [...optSlots, ...mainSlots].forEach(x => { html += blockHtml(x, startHour, PX); });
    html += `</div>`;
  });
  html += `</div></div></div>`;
  if (!S.selected.length && !main.length && !options.length) {
    html = `<div class="relative">${html}<div class="absolute inset-x-0 top-24 flex justify-center pointer-events-none gutter"><div class="pointer-events-auto max-w-xs text-center bg-white/95 card p-5 flex flex-col gap-2 items-center">
      <p class="font-semibold">Tu horario está vacío</p>
      <p class="text-sm muted">${S.basket.length ? 'Genera las combinaciones sin choques, o abre una materia de la lista para elegir su sección.' : 'Primero elige en tu pénsum las materias que vas a ver.'}</p>
      ${S.basket.length ? `<button class="btn btn-primary" data-action="gen:run"><i class="fa-solid fa-wand-magic-sparkles"></i>Generar horarios</button>` : `<button class="btn btn-primary" data-action="nav" data-view="pensum">Ir a mi pénsum</button>`}
    </div></div></div>`;
  }
  el.innerHTML = html;
}

function blockHtml(x, startHour, PX) {
  const s = x.sec, c = colorsFor(s.code);
  const top = (x.s - startHour * 60) * PX / 60 + 1, h = Math.max(20, (x.e - x.s) * PX / 60 - 3);
  let left = '3px', width = 'calc(100% - 6px)';
  if (x.type.startsWith('option')) { if (x.narrow) { left = '60%'; width = 'calc(40% - 3px)'; } }
  else if (x.lanes > 1) { left = `calc(${x.lane * 100 / x.lanes}% + 2px)`; width = `calc(${100 / x.lanes}% - 4px)`; }
  const tight = x.narrow || (x.lanes || 1) > 2;
  let look, kindColor = c.sub, titleColor = c.tx, label = `${kindLabel(s)} S${s.section}`, z = 20, action = '', title = `${s.title} · ${kindOf(s) === 'mag' ? 'Magistral' : 'Complementaria'} S${s.section}`;
  switch (x.type) {
    case 'mag': look = `background:${c.bg};border:1px solid ${c.bd};`; action = `data-action="cal:block" ${data({ code: s.code })}`; title += ' · clic para abrir la materia'; break;
    case 'comp': look = `background:repeating-linear-gradient(135deg,${c.bg} 0 7px,#fff 7px 14px);border:1.5px dashed ${c.sub};`; action = `data-action="cal:block" ${data({ code: s.code })}`; title += ' · clic para abrir la materia'; break;
    case 'preview':
      look = x.conflict ? 'background:rgba(225,29,72,.08);border:2px dashed #e11d48;' : 'background:rgba(47,75,240,.10);border:2px dashed #2f4bf0;';
      kindColor = x.conflict ? '#be123c' : '#2539c9'; titleColor = x.conflict ? '#9f1239' : '#1e2a8a';
      label = `${kindLabel(s)} S${s.section} · ${x.conflict ? 'CHOCA' : 'VISTA PREVIA'}`; z = 30;
      if (ui.pinned && ui.pinned.includes(s.id)) { action = `data-action="cal:pinned"`; title += ' · clic para elegir'; }
      break;
    case 'option': look = `background:rgba(255,255,255,.88);border:1.5px dotted ${c.sub};`; label = `${kindLabel(s)} S${s.section} · OPCIÓN`; z = x.narrow ? 25 : 10; action = `data-action="cal:option" data-hover="cal:option" ${data({ id: s.id, hkey: s.id })}`; title += ' · clic para elegir'; break;
    case 'option-clash': look = 'background:rgba(255,241,242,.92);border:1.5px dotted #e11d48;'; kindColor = '#be123c'; titleColor = '#9f1239'; label = `${kindLabel(s)} S${s.section} · CHOCA`; z = x.narrow ? 25 : 10; action = `data-action="cal:option" ${data({ id: s.id })}`; title += ' · choca con tu horario'; break;
  }
  if (x.focus) look += `box-shadow:0 0 0 2px #fff,0 0 0 4px ${c.dot};`;
  if (x.conflict && (x.type === 'mag' || x.type === 'comp')) look += 'box-shadow:0 0 0 2px #fff,0 0 0 4px #e11d48;';
  if (x.faded) look += 'opacity:.35;';
  if (s.stale) look += 'opacity:.55;';
  const compact = h < 46;
  const inner = tight
    ? `<div class="text-[10px] font-bold leading-tight" style="color:${kindColor}">S${esc(s.section)}</div><div class="text-[10px] leading-tight" style="color:${kindColor}">${fmtTime(x.sch.start_time)}</div>`
    : compact
    ? `<div class="truncate text-[11px] leading-tight"><b style="color:${kindColor}">${esc(label)}</b> <span style="color:${titleColor}">${esc(s.title)}</span></div>`
    : `<div class="text-[10px] font-bold tracking-wide truncate" style="color:${kindColor}">${esc(label)}${s.stale ? ' · YA NO SE OFRECE' : ''}</div>
       <div class="text-xs font-semibold leading-tight ${h >= 80 ? 'line-clamp-2' : 'truncate'}" style="color:${titleColor}">${esc(s.title)}</div>
       <div class="text-[11px] truncate tabular" style="color:${kindColor}">${fmtTime(x.sch.start_time)}–${fmtTime(x.sch.end_time)}${h >= 72 ? ` · ${esc(x.sch.location)}` : ''}</div>`;
  const tag = action ? 'button' : 'div';
  return `<${tag} ${action ? `type="button" ${action}` : ''} title="${esc(title)}" class="cal-block ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1.5'}" style="top:${top}px;height:${h}px;left:${left};width:${width};z-index:${z};${look}">${inner}</${tag}>`;
}

export function renderMobileDays() {
  const el = $('#mobile-days'); if (!el) return;
  el.innerHTML = DAYS.map((d, i) => {
    const n = S.selected.reduce((a, s) => a + (s.schedules || []).filter(sch => sch.days.includes(d)).length, 0);
    const on = i === ui.mobileDay;
    return `<button data-action="mobile:day" ${data({ day: i })} class="flex-1 h-12 rounded-xl border flex flex-col items-center justify-center ${on ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-200 text-slate-700'}" aria-pressed="${on}">
      <span class="text-xs">${DAY_HEAD[i]}</span><span class="text-sm font-bold ${on ? '' : n ? 'text-slate-900' : 'text-slate-400'}">${n || '–'}</span></button>`;
  }).join('');
}

// ─── "¿Qué cabe aquí?" ───────────────────────────────────────
export function openSlotPopup(colEl, clientY) {
  if (S.gen) return;
  const day = colEl.dataset.day, di = Number(colEl.dataset.di);
  const rect = colEl.getBoundingClientRect();
  const y = clientY - rect.top;
  const { startHour, PX } = lastCal;
  const clickedMin = startHour * 60 + (y / PX) * 60;
  const draft = currentDraft();
  const codes = new Set(S.basket.filter(b => b.code && !draft.skipped.includes(b.key)).map(b => b.code));
  const candidates = S.sections
    .filter(sec => codes.has(sec.code) && !sec.stale && !S.selected.some(s => s.id === sec.id))
    .filter(sec => (sec.schedules || []).some(sch => sch.days.includes(day)))
    .filter(sec => !S.selected.some(s => s.code !== sec.code && hasTimeConflict(s, sec)))
    .map(sec => { const sch = sec.schedules.find(s => s.days.includes(day)); return { sec, sch, dist: Math.abs(timeToMinutes(sch.start_time) - clickedMin) }; })
    .filter(c => c.dist <= 180)
    .sort((a, b) => a.dist - b.dist).slice(0, 6);
  // A virtual anchor that follows the calendar when it scrolls or re-renders.
  const anchor = {
    contextElement: $('#cal-scroll'),
    getBoundingClientRect() {
      const col = document.querySelector(`.cal-col[data-di="${di}"]`) || colEl;
      const r = col.getBoundingClientRect();
      const top = r.top + (clickedMin - lastCal.startHour * 60) * lastCal.PX / 60;
      return { x: r.left, y: top, left: r.left, top, right: r.left + r.width, bottom: top, width: r.width, height: 0 };
    },
  };
  const html = candidates.length
    ? `<div class="w-72 max-w-full"><p class="text-[11px] font-bold muted px-2 py-1.5">Caben cerca de las ${fmtTimeAP(Math.round(clickedMin / 30) * 30)} · ${esc(day)}</p>` + candidates.map(c => `
      <button class="menu-item" data-action="section:choose" data-hover="slot:preview" ${data({ id: c.sec.id, hkey: c.sec.id })}>
        <span class="w-1.5 h-8 rounded-full flex-shrink-0" style="background:${colorsFor(c.sec.code).dot}"></span>
        <span class="min-w-0 flex-1"><span class="block text-xs font-bold truncate">${esc(c.sec.title)}</span><span class="block text-[11px] muted">${kindLabel(c.sec)} S${esc(c.sec.section)} · ${fmtTimeAP(c.sch.start_time)}</span></span>
        <i class="fa-solid fa-plus text-[10px]"></i></button>`).join('') + `</div>`
    : `<p class="w-64 max-w-full text-center text-xs muted py-4 px-2">Ninguna de tus materias cabe en este espacio.</p>`;
  openPopover(anchor, html, { id: 'slot-popup', placement: 'right-start', label: '¿Qué cabe aquí?' });
}
export const slotPreviewIds = id => resultIdsFor(id);
export { closePopover as closeSlotPopup };
export const titleOf = courseTitle;
