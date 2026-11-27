// "Mi pénsum": the visual pensum in the graphic language of the 2020 IMEC pensum.
// Tapping a block adds it to (or removes it from) next semester; its sections load in the background.
import { S, commit, basketItem, itemForCode, addToBasket, removeFromBasket, courseInUse, fillSlot } from '../../state/store.js';
import { PENSUMS, PROGRAM_IDS, getPensum, routeOf, blocksOf, sortByCategory, reqText, dependentsOf, toneOf, categoryOf, courseMeta, ROMAN, sourceDate } from '../../core/pensum.js';
import { listCodes, fmtCode } from '../../core/requirements.js';
import { TONES } from '../tones.js';
import { esc, data, handle, $, $$ } from '../dom.js';
import { ui, activePensum, pensumColorFor } from '../state.js';
import { openPopover, closePopover, confirmDialog, toast } from '../layer.js';
import { queueFetch } from '../fetch-queue.js';
import { openSearch } from './search-dialog.js';

const toneVars = tone => { const t = TONES[tone] || TONES.slate; return `--bg:${t.ink};--fg:${t.text};--sub:${t.text === '#FFFFFF' ? 'rgba(255,255,255,.82)' : 'rgba(35,37,47,.68)'};--rq:${t.fill}`; };

/** Basket item that represents a pensum block, if any. */
function itemForBlock(b) {
  if (b.kind === 'course') return itemForCode(b.code) || null;
  if (b.kind === 'slot') return basketItem(b.key) || S.basket.find(x => x.fromBlock === b.key) || null;
  return basketItem(b.key) || S.basket.find(x => x.fromBlock === b.key) || S.basket.find(x => x.code && b.options.includes(x.code)) || null;
}

export function renderPensumView() {
  const el = $('#view-pensum'); if (!el) return;
  const p = activePensum();
  el.innerHTML = p ? pensumHtml(p) : pickerHtml();
}

function pickerHtml() {
  return `<div class="gutter" style="padding-block:24px 40px">
    <div class="max-w-5xl mx-auto flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h2 class="text-xl sm:text-2xl font-semibold">¿Qué programa estudias?</h2>
        <p class="text-sm text-slate-600 max-w-2xl">Elige tu carrera para ver su pénsum. Tocas las materias que vas a ver el próximo semestre y armas el horario con sus secciones.</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        ${PROGRAM_IDS.map(id => programCard(PENSUMS[id])).join('')}
      </div>
      <p class="text-sm muted">¿Solo quieres buscar una materia? <button class="link" data-action="search:open">Busca por código o nombre</button>.</p>
    </div>
  </div>`;
}

function programCard(p) {
  const blocks = blocksOf(p, p.routes[0].id);
  const bySem = p.routes[0].semesters.map((_, i) => sortByCategory(p, blocks.filter(b => b.sem === i)));
  const cols = Math.max(...bySem.map(s => s.length));
  const mosaic = bySem.map(sem => Array.from({ length: cols }, (_, i) => sem[i] ? `<span style="background:${TONES[toneOf(p, sem[i].cat)].fill}"></span>` : '<span></span>').join('')).join('');
  return `<button class="program-card" data-action="program:set" ${data({ program: p.id })}>
    <span class="mosaic" style="grid-template-columns:repeat(${cols},1fr)" aria-hidden="true">${mosaic}</span>
    <span class="flex flex-col gap-1">
      <span class="text-base font-semibold leading-tight">${esc(p.program)}</span>
      <span class="text-sm muted">${esc(p.version)} · ${p.totalCredits} créditos · ${p.routes[0].semesters.length} semestres</span>
    </span>
  </button>`;
}

function pensumHtml(p) {
  const route = routeOf(p, S.profile.route);
  const blocks = blocksOf(p, route.id);
  const sems = route.semesters.map((s, i) => ({ n: i, credits: s.credits, blocks: sortByCategory(p, blocks.filter(b => b.sem === i)) }));
  const chosen = S.basket;
  const credits = chosen.reduce((a, b) => a + (b.credits || 0), 0);
  return `<div class="gutter">
    <div class="pensum-layout">
      <div class="flex flex-col gap-4 min-w-0">
        ${controlsHtml(p, route)}
        ${legendHtml(p)}
        <div class="psheet pgrid" id="pgrid">${sems.map(s => semHtml(p, s)).join('')}</div>
        ${trayBarHtml(chosen.length, credits)}
      </div>
      ${panelHtml(p, chosen, credits)}
    </div>
  </div>`;
}

function controlsHtml(p, route) {
  const routes = p.routes.length > 1 ? `<div class="flex flex-wrap items-center gap-2">
      <span class="eyebrow">Ruta</span>
      <div class="seg" role="group" aria-label="Ruta del plan">${p.routes.map(r => `<button data-action="route:set" ${data({ route: r.id })} aria-pressed="${r.id === route.id}" title="${esc(r.hint || '')}">${esc(r.label.replace('Ruta ', ''))}</button>`).join('')}</div>
      ${!S.profile.route ? `<span class="pill pill-warn"><i class="fa-solid fa-circle-info"></i>Elige la ruta según tu examen de clasificación</span>` : ''}
    </div>` : '';
  return `<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
    <div class="seg" role="group" aria-label="Programa">${PROGRAM_IDS.map(id => `<button data-action="program:set" ${data({ program: id })} aria-pressed="${id === p.id}">${esc(PENSUMS[id].program)}</button>`).join('')}</div>
    ${routes}
    <span class="text-xs muted ml-auto">${esc(p.version)} · ${p.totalCredits} créditos</span>
  </div>`;
}

function legendHtml(p) {
  return `<div class="flex flex-col gap-2">
    <div class="legend">${p.categories.map(c => `<span class="legend-item"><span class="legend-sw" style="background:${TONES[c.tone].fill}"></span>${esc(c.label)}</span>`).join('')}</div>
    <p class="text-xs muted">Toca una materia para agregarla a tu próximo semestre. Pasa el mouse sobre ella para ver qué pide y qué desbloquea. Debajo de cada materia: prerrequisitos, y en <b class="text-slate-800">negrita</b> los correquisitos.</p>
  </div>`;
}

function semHtml(p, s) {
  return `<section class="psem" aria-label="Semestre ${ROMAN[s.n]}">
    <div class="psem-label"><span class="psem-roman">${ROMAN[s.n]}</span><span class="psem-credits">${s.credits} créditos</span></div>
    <div class="psem-row">${s.blocks.map(b => blockHtml(p, b)).join('')}</div>
  </section>`;
}

function blockHtml(p, b) {
  const tone = toneOf(p, b.cat);
  const item = itemForBlock(b);
  const selected = !!item;
  const loading = b.kind === 'course' && ui.loadingCodes.has(b.code);
  const reqs = reqText(p, b.req), coreqs = reqText(p, b.coreq);
  const reqHtml = [...reqs.map(esc), ...coreqs.map(t => `<b>${esc(t)}</b>`)].join(' · ');
  let bg = '';
  if (b.cats.length > 1) {
    const extra = b.cats.slice(1).map(c => TONES[toneOf(p, c)].fill);
    bg = `;background:linear-gradient(90deg, var(--bg) 0 ${100 - extra.length * 7}%, ${extra.map((c, i) => `${c} ${100 - (extra.length - i) * 7}% ${100 - (extra.length - i - 1) * 7}%`).join(', ')})`;
  }
  const codeLine = b.kind === 'course' ? fmtCode(b.code) : b.kind === 'group' ? 'ELIGE UNO' : (b.slot === 'cbu' ? 'CBU' : b.slot === 'cle' ? 'CLE' : 'ELECTIVA');
  const opts = b.kind === 'group' ? `<span class="pb-opts">${b.options.map(o => esc(fmtCode(o))).join(' · ')}</span>` : '';
  const filled = item && b.kind !== 'course' && item.code ? `<span class="pb-opts">${esc(fmtCode(item.code))} · ${esc(item.title)}</span>` : '';
  const name = b.kind === 'course' ? b.name : b.name;
  const tag = selected ? `<span class="pb-check" title="${loading ? 'Buscando secciones…' : 'En tu próximo semestre'}"><i class="fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-check'}"></i></span>` : '';
  const label = `${b.kind === 'course' ? fmtCode(b.code) + ' ' : ''}${name}, ${b.credits} créditos${selected ? ', en tu próximo semestre' : ''}`;
  return `<div class="pcell"><div class="relative">
    <button class="pblock ${selected ? 'is-selected' : ''}" style="${toneVars(tone)}${bg}" data-action="pensum:toggle" data-hover="pensum:hover" ${data({ key: b.key, hkey: b.key })} aria-pressed="${selected}" aria-label="${esc(label)}">
      <span class="pb-code">${esc(codeLine)}</span>
      <span class="pb-name">${esc(name)}</span>
      ${opts}${filled}
      <span class="pb-cr ${TONES[tone].text === '#FFFFFF' ? '' : 'is-dark'}" aria-hidden="true">${b.credits}</span>
      ${tag}
    </button>
    <button class="pinfo" style="color:${TONES[tone].text}" data-action="pensum:info" ${data({ key: b.key })} aria-label="Detalles de ${esc(name)}"><i class="fa-solid fa-ellipsis"></i></button></div>
    <div class="preq ${reqHtml ? '' : 'is-empty'}" style="--rq:${TONES[tone].fill}"><span>${reqHtml || '—'}</span></div>
  </div>`;
}

function trayBarHtml(n, credits) {
  return `<div class="tray-bar">
    <span class="flex-1 min-w-0 text-sm whitespace-nowrap overflow-hidden text-ellipsis"><b class="font-semibold">${n} ${n === 1 ? 'materia' : 'materias'}</b> <span class="muted">· ${credits} cr</span></span>
    <button class="btn btn-quiet btn-sm" data-action="search:open"><i class="fa-solid fa-magnifying-glass"></i><span class="hidden sm:inline">Buscar otra</span></button>
    <button class="btn btn-primary btn-sm" data-action="nav" data-view="horario" ${n ? '' : 'disabled'}>Armar horario <i class="fa-solid fa-arrow-right"></i></button>
  </div>`;
}

function panelHtml(p, chosen, credits) {
  const notes = [...(p.rules || []).map(r => esc(r.text)), ...p.notes.map(n => `<b>${esc(n.title)}.</b> ${esc(n.text)}`)];
  return `<aside class="side" aria-label="Tu próximo semestre y notas del pénsum">
    <div class="card p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2"><h2 class="text-sm font-semibold">Tu próximo semestre</h2><span class="text-xs muted ml-auto tabular">${chosen.length} · ${credits} cr</span></div>
      <div class="flex flex-col gap-2">${chosen.length ? chosen.map(b => trayItem(b)).join('') : `<p class="text-sm muted">Toca las materias del pénsum que vas a ver. Aparecen aquí con sus créditos.</p>`}</div>
      <button class="btn btn-primary w-full" data-action="nav" data-view="horario" ${chosen.length ? '' : 'disabled'}>Armar horario <i class="fa-solid fa-arrow-right"></i></button>
      <button class="btn btn-quiet w-full" data-action="search:open"><i class="fa-solid fa-magnifying-glass"></i>Buscar otra materia</button>
    </div>
    <div class="card p-4 flex flex-col gap-3">
      <h2 class="text-sm font-semibold">Ten en cuenta</h2>
      ${notes.map(n => `<p class="note">${n}</p>`).join('')}
      <p class="note text-xs !text-slate-500">Fuente: <a class="link" href="${esc(p.source)}" target="_blank" rel="noopener">${esc(p.sourceTitle)}</a>, consultado el ${esc(sourceDate(p.retrieved))}. Verifica tu plan con la coordinación de tu programa.</p>
      <p class="text-xs text-slate-400">Proyecto estudiantil. No es un sitio oficial de la Universidad de los Andes.</p>
    </div>
  </aside>`;
}

function trayItem(b) {
  const c = pensumColorFor(b.key);
  return `<div class="tray-item">
    <span class="tray-sw" style="background:${c.fill}"></span>
    <span class="flex-1 min-w-0"><span class="block text-sm font-medium truncate">${esc(b.title)}</span><span class="block text-xs muted">${esc(b.code ? fmtCode(b.code) : 'Electiva')}${b.credits !== null ? ` · ${b.credits} cr` : ''}${ui.loadingCodes.has(b.code) ? ' · buscando secciones…' : ''}</span></span>
    <button class="tray-x" data-action="basket:remove" ${data({ key: b.key })} aria-label="Quitar ${esc(b.title)}"><i class="fa-solid fa-xmark"></i></button>
  </div>`;
}

// ─── Hover: what it needs, what it unlocks ───────────────────
function highlight(key) {
  const grid = document.getElementById('pgrid'); if (!grid) return;
  $$('.pblock.is-hover, .pblock.is-req, .pblock.is-coreq, .pblock.is-unlocks', grid).forEach(el => el.classList.remove('is-hover', 'is-req', 'is-coreq', 'is-unlocks'));
  grid.classList.toggle('has-hover', !!key);
  if (!key) return;
  const p = activePensum(); if (!p) return;
  const b = blocksOf(p, routeOf(p, S.profile.route).id).find(x => x.key === key); if (!b) return;
  const mark = (codes, cls) => codes.forEach(code => $$(`.pblock[data-key="${CSS.escape(code)}"]`, grid).forEach(el => el.classList.add(cls)));
  $$(`.pblock[data-key="${CSS.escape(key)}"]`, grid).forEach(el => el.classList.add('is-hover'));
  mark(listCodes(b.req, p.groups), 'is-req');
  mark(listCodes(b.coreq, p.groups), 'is-coreq');
  const own = b.kind === 'group' ? b.options : [b.code];
  mark([...new Set(own.filter(Boolean).flatMap(c => dependentsOf(p, c).map(d => d.code)))], 'is-unlocks');
}

// ─── Details popover ─────────────────────────────────────────
function infoHtml(p, b) {
  const tone = toneOf(p, b.cat), cat = categoryOf(p, b.cat);
  const item = itemForBlock(b);
  const reqs = reqText(p, b.req), coreqs = reqText(p, b.coreq);
  const deps = b.kind === 'course' ? dependentsOf(p, b.code) : [];
  const slot = b.kind === 'slot' ? p.slotKinds?.[b.slot] : null;
  const row = (label, value) => value ? `<div class="flex gap-3 text-sm"><span class="w-28 flex-shrink-0 muted">${label}</span><span class="min-w-0">${value}</span></div>` : '';
  let body = `<div class="flex flex-col gap-3 p-3" style="width:min(360px,calc(100vw - 32px))">
    <div class="flex items-start gap-3"><span class="legend-sw mt-1" style="background:${TONES[tone].fill}"></span>
      <div class="min-w-0"><p class="text-xs muted">${esc(b.kind === 'course' ? fmtCode(b.code) : (b.kind === 'group' ? 'Elige un curso' : 'Electiva'))} · ${b.credits} créditos · ${esc(cat?.label || '')}</p>
      <p class="font-semibold leading-snug">${esc(b.name)}</p></div></div>
    ${row('Prerrequisitos', reqs.map(esc).join(' · '))}
    ${row('Correquisitos', coreqs.map(t => `<b>${esc(t)}</b>`).join(' · '))}
    ${row('Lo necesitan', deps.map(d => esc(fmtCode(d.code))).join(' · '))}
    ${b.note ? row('Nota', esc(b.note)) : ''}`;
  if (b.kind === 'group') {
    body += `<div class="flex flex-col gap-1.5"><p class="eyebrow">Opciones</p>${b.options.map(o => {
      const m = courseMeta(p, o), inB = !!itemForCode(o);
      return `<div class="flex items-center gap-2 text-sm"><span class="flex-1 min-w-0"><b>${esc(fmtCode(o))}</b> ${esc(m?.name || '')}${m?.req?.length ? `<span class="block text-xs muted">Pide: ${esc(reqText(p, m.req).join(' · '))}</span>` : ''}</span>
        <button class="btn btn-sm ${inB ? 'btn-quiet' : 'btn-primary'}" data-action="pensum:pick" ${data({ key: b.key, code: o })} ${inB ? 'disabled' : ''}>${inB ? 'Agregada' : 'Agregar'}</button></div>`;
    }).join('')}${b.hint ? `<p class="text-xs muted">${esc(b.hint)}</p>` : ''}</div>`;
  }
  if (slot) body += slotGuideHtml(p, b, slot);
  body += `<div class="flex gap-2 pt-1">${b.kind === 'group' ? '' : `<button class="btn btn-sm ${item ? 'btn-quiet' : 'btn-primary'}" data-action="pensum:toggle" ${data({ key: b.key })}>${item ? 'Quitar del próximo semestre' : 'Agregar al próximo semestre'}</button>`}
    ${b.kind === 'course' ? `<button class="btn btn-sm btn-quiet" data-action="search:open" ${data({ q: b.code })}>Ver secciones</button>` : ''}</div></div>`;
  return body;
}

function slotGuideHtml(p, b, slot) {
  let html = `<div class="flex flex-col gap-2"><p class="text-sm">${esc(slot.hint || '')}</p>`;
  const options = slot.options || [];
  if (slot.emphasis && p.emphases) {
    html += p.emphases.map(e => `<div class="flex flex-col gap-1"><p class="eyebrow">${esc(e.label)}</p>${(slot.emphasis === 'required' ? [e.required] : e.electives).map(code => optionRow(p, b, code)).join('')}</div>`).join('');
  }
  if (options.length) html += `<div class="flex flex-col gap-1 max-h-56 overflow-y-auto">${options.map(code => optionRow(p, b, code)).join('')}</div>`;
  if (slot.queries?.length) html += `<div class="flex flex-wrap gap-1.5">${slot.queries.map(q => `<button class="chip" data-action="search:open" ${data({ q, slot: b.key })}><i class="fa-solid fa-magnifying-glass text-[10px]"></i>${esc(q)}</button>`).join('')}</div>`;
  return html + `</div>`;
}
function optionRow(p, b, code) {
  const m = courseMeta(p, code), inB = !!itemForCode(code);
  return `<div class="flex items-center gap-2 text-sm"><span class="flex-1 min-w-0 truncate"><b>${esc(fmtCode(code))}</b> ${esc(m?.name || '')}</span>
    <button class="btn btn-sm ${inB ? 'btn-quiet' : 'btn-primary'}" data-action="pensum:pick" ${data({ key: b.key, code })} ${inB ? 'disabled' : ''}>${inB ? 'Agregada' : 'Usar'}</button></div>`;
}

// ─── Actions ─────────────────────────────────────────────────
const blockByKey = key => { const p = activePensum(); return p ? blocksOf(p, routeOf(p, S.profile.route).id).find(b => b.key === key) : null; };

async function removeItem(item) {
  if (courseInUse(item.key) && !(await confirmDialog({ title: `¿Quitar ${item.title}?`, body: 'También sale de tus horarios, con las secciones que elegiste.', confirm: 'Quitar', danger: true }))) return false;
  removeFromBasket(item.key);
  return true;
}

handle({
  'program:set': async ({ program }) => {
    if (!getPensum(program)) return;
    if (S.profile.program && S.profile.program !== program && S.basket.length) {
      // Keep the basket: courses stay, only the pensum view changes.
      toast(`Ahora ves el pénsum de ${getPensum(program).program}. Tus materias se mantienen.`, 'info');
    }
    S.profile.program = program;
    document.getElementById('view-pensum')?.scrollTo?.(0, 0);
    if (getPensum(program).routes.length < 2) S.profile.route = getPensum(program).routes[0].id;
    else if (!getPensum(program).routes.some(r => r.id === S.profile.route)) S.profile.route = null;
    commit();
  },
  'route:set': ({ route }) => { S.profile.route = route; commit(); },
  'pensum:toggle': async ({ key }) => {
    closePopover();
    const p = activePensum(); const b = blockByKey(key); if (!p || !b) return;
    if (b.kind === 'group') { openInfo(key); return; }
    const item = itemForBlock(b);
    if (item) { if (await removeItem(item)) { toast(`${item.title} salió de tu próximo semestre.`, 'info'); commit(); } return; }
    if (b.kind === 'course') {
      addToBasket({ code: b.code, title: b.name, credits: b.credits, cat: b.cat, source: 'pensum' });
      queueFetch([b.code]);
    } else {
      addToBasket({ key: b.key, title: b.name, credits: b.credits, elective: true, slot: b.slot, cat: b.cat, source: 'pensum' });
    }
    commit();
  },
  'pensum:pick': ({ key, code }) => {
    const p = activePensum(); const b = blockByKey(key); if (!p || !b) return;
    const m = courseMeta(p, code);
    let it;
    if (basketItem(key)) it = fillSlot(key, code, m?.name, m?.credits);
    else it = addToBasket({ code, title: m?.name || code, credits: m?.credits, cat: b.cat, slot: b.slot });
    it.fromBlock = key;
    queueFetch([code]);
    closePopover();
    toast(`${it.title} agregada a tu próximo semestre.`, 'success');
    commit();
  },
  'pensum:info': ({ key }) => openInfo(key),
  'pensum:hover': ({ key }) => highlight(key),
  'pensum:hover:leave': () => highlight(null),
  'basket:remove': async ({ key }) => { const it = basketItem(key); if (it && await removeItem(it)) { toast(`${it.title} salió de tu próximo semestre.`, 'info'); commit(); } },
});

function openInfo(key) {
  const p = activePensum(); const b = blockByKey(key); if (!p || !b) return;
  const anchor = document.querySelector(`.pblock[data-key="${CSS.escape(key)}"]`);
  if (!anchor) return;
  openPopover(anchor, infoHtml(p, b), { id: 'pensum-info', placement: 'bottom-start', anchorSelector: `.pblock[data-key="${CSS.escape(key)}"]`, label: b.name });
}

export { openSearch };
