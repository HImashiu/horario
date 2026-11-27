// "Mi pénsum": the visual pensum in the graphic language of the pensum PDF (colourful blocks with
// rounded corners). Two modes:
//  - "Próximo semestre": tapping a block adds it to next semester (missing corequisites come
//    along; locked courses ask first); sections load in the background.
//  - "Ya aprobé": tapping marks the course as passed, together with its prerequisite chain.
import { S, commit, basketItem, itemForCode, addToBasket, removeFromBasket, courseInUse, fillSlot } from '../../state/store.js';
import { PENSUMS, PROGRAM_IDS, getPensum, routeOf, blocksOf, sortByCategory, reqText, dependentsOf, toneOf, categoryOf, courseMeta, categoryForCode, ROMAN, sourceDate } from '../../core/pensum.js';
import { makeCtx, blockStatus, blockPassed, missing, missingCoreqs, closureForPass, closureForUnpass, progress, suggestSemester, isPassed } from '../../core/eligibility.js';
import { listCodes, fmtCode, formatTerm } from '../../core/requirements.js';
import { TONES, toneVars } from '../tones.js';
import { esc, data, handle, $, $$ } from '../dom.js';
import { ui, activePensum, pensumColorFor, chosenKeys } from '../state.js';
import { gradCardHtml, gradChipHtml } from './plan-dialog.js';
import { openPopover, closePopover, openDialog, closeDialog, confirmDialog, toast } from '../layer.js';
import { queueFetch } from '../fetch-queue.js';
import { openSearch } from './search-dialog.js';

const mode = () => (S.prefs.pensumMode === 'history' ? 'history' : 'plan');
const routeId = p => routeOf(p, S.profile.route).id;

const ctxNow = p => makeCtx(p, routeId(p), S.profile, chosenKeys());

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

// ─── Program picker (first visit) ────────────────────────────
function pickerHtml() {
  return `<div class="gutter" style="padding-block:24px 40px">
    <div class="max-w-5xl mx-auto flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <h2 class="text-xl sm:text-2xl font-semibold">¿Qué programa estudias?</h2>
        <p class="text-sm text-slate-600 max-w-2xl">Elige tu carrera para ver su pénsum. Marcas lo que ya aprobaste, tocas lo que vas a ver el próximo semestre y armas el horario con sus secciones.</p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">${PROGRAM_IDS.map(id => programCard(PENSUMS[id])).join('')}</div>
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
    <span class="flex flex-col gap-1"><span class="text-base font-semibold leading-tight">${esc(p.program)}</span>
      <span class="text-sm muted">${esc(p.version)} · ${p.totalCredits} créditos · ${p.routes[0].semesters.length} semestres</span></span>
  </button>`;
}

// ─── The pensum ──────────────────────────────────────────────
function pensumHtml(p) {
  const ctx = ctxNow(p);
  const route = ctx.route;
  const sems = route.semesters.map((s, i) => ({ n: i, credits: s.credits, blocks: sortByCategory(p, ctx.blocks.filter(b => b.sem === i)) }));
  const credits = S.basket.reduce((a, b) => a + (b.credits || 0), 0);
  const history = mode() === 'history';
  return `<div class="gutter"><div class="pensum-layout">
    <div class="flex flex-col gap-4 min-w-0">
      ${controlsHtml(p, route, ctx)}
      ${bannerHtml(ctx)}
      ${legendHtml(p)}
      <div class="psheet pgrid ${history ? 'is-history' : ''}" id="pgrid">${sems.map(s => semHtml(p, s, ctx)).join('')}</div>
      ${trayBarHtml(S.basket.length, credits)}
    </div>
    ${panelHtml(p, ctx, credits)}
  </div></div>`;
}

function controlsHtml(p, route, ctx) {
  const pr = progress(ctx);
  const routes = p.routes.length > 1 ? `<div class="flex items-center gap-2">
      <span class="eyebrow">Ruta</span>
      <div class="seg" role="group" aria-label="Ruta del plan">${p.routes.map(r => `<button data-action="route:set" ${data({ route: r.id })} aria-pressed="${r.id === route.id}" title="${esc(r.hint || '')}">${esc(r.label.replace('Ruta ', ''))}</button>`).join('')}</div>
      ${!S.profile.route ? `<span class="pill pill-warn"><i class="fa-solid fa-circle-info"></i>Elige la ruta según tu examen de clasificación</span>` : ''}
    </div>` : '';
  const chosenEmphasis = (p.emphases || []).find(e => e.id === S.profile.emphasis);
  const emphasis = p.emphases?.length ? `<label class="flex items-center gap-2"><span class="eyebrow">Énfasis</span>
      <select class="input !w-auto !py-1.5 !text-sm" data-change="emphasis:set" aria-label="Tu énfasis" title="Las electivas de énfasis muestran solo los cursos del que elijas">
        <option value="">Sin elegir</option>${p.emphases.map(e => `<option value="${esc(e.id)}" ${e.id === chosenEmphasis?.id ? 'selected' : ''}>${esc(e.label)}</option>`).join('')}
      </select></label>` : '';
  return `<div class="flex flex-wrap items-center gap-x-4 gap-y-3">
    <div class="seg" role="group" aria-label="Programa">${PROGRAM_IDS.map(id => `<button data-action="program:set" ${data({ program: id })} aria-pressed="${id === p.id}">${esc(PENSUMS[id].program)}</button>`).join('')}</div>
    ${routes}${emphasis}
    <span class="text-xs muted ml-auto tabular">${esc(p.version)} · ${pr.done}/${p.totalCredits} créditos aprobados</span>
    ${gradChipHtml(p)}
  </div>
  <div class="flex flex-wrap items-center gap-3">
    <div class="seg" role="group" aria-label="Qué hace un toque">
      <button data-action="pensum:mode" data-mode="plan" aria-pressed="${mode() === 'plan'}"><i class="fa-solid fa-calendar-plus mr-1.5 text-[11px]"></i>Próximo semestre</button>
      <button data-action="pensum:mode" data-mode="history" aria-pressed="${mode() === 'history'}"><i class="fa-solid fa-check-double mr-1.5 text-[11px]"></i>Ya aprobé</button>
    </div>
    <span class="text-xs muted">${mode() === 'history' ? 'Toca las materias que ya aprobaste: sus prerrequisitos se marcan solos.' : 'Toca una materia para agregarla a tu próximo semestre; sus correquisitos se agregan solos.'}</span>
  </div>`;
}

function bannerHtml(ctx) {
  if (mode() === 'history') return `<div class="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3">
      <i class="fa-solid fa-check-double text-brand-600"></i>
      <p class="text-sm text-slate-700 flex-1 min-w-[14rem]">Marcando lo que ya aprobaste. Si marcas una materia, sus prerrequisitos también quedan aprobados; si la desmarcas, también las que dependían de ella.</p>
      <button class="btn btn-primary btn-sm" data-action="pensum:mode" data-mode="plan">Listo</button>
    </div>`;
  if (ctx.passed.size || S.prefs.historyIntro === 'done') return '';
  return `<div class="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-card">
      <span class="w-9 h-9 rounded-full bg-brand-50 text-brand-600 grid place-items-center flex-shrink-0"><i class="fa-solid fa-graduation-cap"></i></span>
      <p class="text-sm text-slate-700 flex-1 min-w-[14rem]"><b class="font-semibold">¿Ya cursaste semestres?</b> Marca lo que aprobaste y te mostramos qué puedes ver y qué está bloqueado.</p>
      <button class="btn btn-primary btn-sm" data-action="pensum:mode" data-mode="history">Marcar lo que ya aprobé</button>
      <button class="btn btn-quiet btn-sm" data-action="pensum:intro-done">Voy en primer semestre</button>
    </div>`;
}

function legendHtml(p) {
  return `<div class="flex flex-col gap-2">
    <div class="legend">${p.categories.map(c => `<span class="legend-item"><span class="legend-sw" style="background:${TONES[c.tone].fill}"></span>${esc(c.label)}</span>`).join('')}
      <span class="legend-item"><i class="fa-solid fa-lock text-[11px] text-slate-400"></i>Bloqueada</span>
      <span class="legend-item"><i class="fa-solid fa-circle-check text-[12px] text-slate-400"></i>Aprobada</span></div>
    <p class="text-xs muted">Pasa el mouse sobre una materia para ver qué pide y qué desbloquea. Debajo de cada una: prerrequisitos, y en <b class="text-slate-800">negrita</b> los correquisitos.</p>
  </div>`;
}

function semHtml(p, s, ctx) {
  return `<section class="psem" aria-label="Semestre ${ROMAN[s.n]}">
    <div class="psem-label"><span class="psem-roman">${ROMAN[s.n]}</span><span class="psem-credits">${s.credits} créditos</span></div>
    <div class="psem-row">${s.blocks.map(b => blockHtml(p, b, ctx)).join('')}</div>
  </section>`;
}

function blockHtml(p, b, ctx) {
  const tone = toneOf(p, b.cat);
  const item = itemForBlock(b);
  const status = blockStatus(ctx, b);
  const history = mode() === 'history';
  const selected = !!item && !history;
  const loading = b.kind === 'course' && ui.loadingCodes.has(b.code);
  const reqs = reqText(p, b.req), coreqs = reqText(p, b.coreq);
  const reqHtml = [...reqs.map(esc), ...coreqs.map(t => `<b>${esc(t)}</b>`)].join(' · ');
  const lack = status === 'locked' ? (b.kind === 'group' ? [] : missing(ctx, b)) : [];
  let bg = '';
  if (b.cats.length > 1 && status !== 'locked') {
    const extra = b.cats.slice(1).map(c => TONES[toneOf(p, c)].fill);
    bg = `;background:linear-gradient(90deg, var(--bg) 0 ${100 - extra.length * 7}%, ${extra.map((c, i) => `${c} ${100 - (extra.length - i) * 7}% ${100 - (extra.length - i - 1) * 7}%`).join(', ')})`;
  }
  const codeLine = b.kind === 'course' ? fmtCode(b.code) : b.kind === 'group' ? 'ELIGE UNO' : (b.slot === 'cbu' ? 'CBU' : b.slot === 'cle' ? 'CLE' : 'ELECTIVA');
  const opts = b.kind === 'group' ? `<span class="pb-opts">${b.options.map(o => esc(fmtCode(o))).join(' · ')}</span>` : '';
  const passedOpt = b.kind === 'group' ? b.options.find(o => isPassed(ctx, o)) : null;
  const filled = (item && b.kind !== 'course' && item.code) ? `<span class="pb-opts">${esc(fmtCode(item.code))} · ${esc(item.title)}</span>`
    : passedOpt ? `<span class="pb-opts">Aprobada: ${esc(fmtCode(passedOpt))}</span>` : '';
  let cls = '';
  let badge = '';
  if (history) {
    cls = status === 'passed' ? 'is-marked' : 'is-unmarked';
    if (status === 'passed') badge = `<span class="pb-state is-done" aria-hidden="true"><i class="fa-solid fa-check"></i></span>`;
  } else if (status === 'passed') {
    cls = 'is-passed'; badge = `<span class="pb-state is-done" aria-hidden="true"><i class="fa-solid fa-check"></i></span>`;
  } else if (status === 'locked') {
    cls = 'is-locked'; badge = `<span class="pb-state is-lock" aria-hidden="true"><i class="fa-solid fa-lock"></i></span>`;
  }
  if (selected) { cls += ' is-selected'; badge = `<span class="pb-check" aria-hidden="true"><i class="fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-check'}"></i></span>`; }
  const stateText = history ? (status === 'passed' ? ', aprobada' : ', sin marcar') : status === 'passed' ? ', aprobada' : status === 'locked' ? `, bloqueada: falta ${lack.map(t => formatTerm(t, p.groups)).join(', ')}` : '';
  const label = `${b.kind === 'course' ? fmtCode(b.code) + ' ' : ''}${b.name}, ${b.credits} créditos${stateText}${selected ? ', en tu próximo semestre' : ''}`;
  const title = status === 'locked' && !history ? `Te falta: ${lack.map(t => formatTerm(t, p.groups)).join(' · ')}` : '';
  return `<div class="pcell"><div class="relative">
    <button class="pblock ${cls}" style="${toneVars(tone)}${bg}" data-action="pensum:toggle" data-hover="pensum:hover" ${data({ key: b.key, hkey: b.key })} aria-pressed="${history ? status === 'passed' : selected}" aria-label="${esc(label)}" ${title ? `title="${esc(title)}"` : ''}>
      <span class="pb-code">${esc(codeLine)}</span>
      <span class="pb-name">${esc(b.name)}</span>
      ${opts}${filled}
      <span class="pb-cr ${TONES[tone].text === '#FFFFFF' ? '' : 'is-dark'}" aria-hidden="true">${b.credits}</span>
      ${badge}
    </button>
    <button class="pinfo" style="color:${status === 'locked' && !history ? 'var(--muted)' : TONES[tone].text}" data-action="pensum:info" ${data({ key: b.key })} aria-label="Detalles de ${esc(b.name)}"><i class="fa-solid fa-ellipsis"></i></button></div>
    <div class="preq ${reqHtml ? '' : 'is-empty'} ${lack.length ? 'is-missing' : ''}" style="--rq:${TONES[tone].fill}"><span>${reqHtml || '—'}</span></div>
  </div>`;
}

function trayBarHtml(n, credits) {
  return `<div class="tray-bar">
    <span class="flex-1 min-w-0 text-sm whitespace-nowrap overflow-hidden text-ellipsis"><b class="font-semibold">${n} ${n === 1 ? 'materia' : 'materias'}</b> <span class="muted">· ${credits} cr</span></span>
    <button class="btn btn-quiet btn-sm" data-action="search:open"><i class="fa-solid fa-magnifying-glass"></i><span class="hidden sm:inline">Buscar otra</span></button>
    <button class="btn btn-primary btn-sm" data-action="nav" data-view="horario" ${n ? '' : 'disabled'}>Armar horario <i class="fa-solid fa-arrow-right"></i></button>
  </div>`;
}

function panelHtml(p, ctx, credits) {
  const pr = progress(ctx);
  const pct = v => Math.round(v * 100);
  const notes = [...(p.rules || []).map(r => esc(r.text)), ...p.notes.map(n => `<b>${esc(n.title)}.</b> ${esc(n.text)}`)];
  return `<aside class="side" aria-label="Tu avance, tu próximo semestre y notas del pénsum">
    <div class="card p-4 flex flex-col gap-3">
      <div class="flex items-baseline gap-2"><h2 class="text-sm font-semibold">Tu avance</h2><span class="ml-auto text-sm tabular"><b class="font-semibold">${pr.done}</b><span class="muted"> / ${pr.total} cr</span></span></div>
      <div class="h-2 rounded-full bg-slate-100 overflow-hidden"><div class="h-full rounded-full bg-brand-600" style="width:${pct(pr.done / pr.total)}%"></div></div>
      <div class="flex flex-col gap-1.5">${p.categories.map(c => { const v = pr.byCat.get(c.id); return v && v.total ? `<div class="flex items-center gap-2 text-xs"><span class="legend-sw !w-2.5 !h-2.5" style="background:${TONES[c.tone].fill}"></span><span class="flex-1 min-w-0 truncate text-slate-600">${esc(c.label)}</span><span class="tabular text-slate-500">${v.done}/${v.total}</span></div>` : ''; }).join('')}</div>
      ${pr.done ? '' : `<button class="btn btn-quiet btn-sm" data-action="pensum:mode" data-mode="history"><i class="fa-solid fa-check-double"></i>Marcar lo que ya aprobé</button>`}
    </div>
    ${gradCardHtml(p)}
    <div class="card p-4 flex flex-col gap-3">
      <div class="flex items-center gap-2"><h2 class="text-sm font-semibold">Tu próximo semestre</h2><span class="text-xs muted ml-auto tabular">${S.basket.length} · ${credits} cr</span></div>
      <div class="flex flex-col gap-2">${S.basket.length ? S.basket.map(b => trayItem(b)).join('') : `<p class="text-sm muted">Toca las materias del pénsum que vas a ver, o deja que te sugiramos un semestre.</p>`}</div>
      <button class="btn btn-soft w-full" data-action="pensum:suggest"><i class="fa-solid fa-wand-magic-sparkles"></i>Sugerir mi semestre</button>
      <button class="btn btn-primary w-full" data-action="nav" data-view="horario" ${S.basket.length ? '' : 'disabled'}>Armar horario <i class="fa-solid fa-arrow-right"></i></button>
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
  const b = blocksOf(p, routeId(p)).find(x => x.key === key); if (!b) return;
  const mark = (codes, cls) => codes.forEach(code => $$(`.pblock[data-key="${CSS.escape(code)}"]`, grid).forEach(el => el.classList.add(cls)));
  $$(`.pblock[data-key="${CSS.escape(key)}"]`, grid).forEach(el => el.classList.add('is-hover'));
  mark(listCodes(b.req, p.groups), 'is-req');
  mark(listCodes(b.coreq, p.groups), 'is-coreq');
  const own = b.kind === 'group' ? b.options : [b.code];
  mark([...new Set(own.filter(Boolean).flatMap(c => dependentsOf(p, c).map(d => d.code)))], 'is-unlocks');
}

// ─── Details popover ─────────────────────────────────────────
function infoHtml(p, b, ctx) {
  const tone = toneOf(p, b.cat), cat = categoryOf(p, b.cat);
  const item = itemForBlock(b);
  const status = blockStatus(ctx, b);
  const reqs = reqText(p, b.req), coreqs = reqText(p, b.coreq);
  const deps = b.kind === 'course' ? dependentsOf(p, b.code) : [];
  const lack = status === 'locked' && b.kind === 'course' ? missing(ctx, b) : [];
  const slot = b.kind === 'slot' ? p.slotKinds?.[b.slot] : null;
  const row = (label, value) => value ? `<div class="flex gap-3 text-sm"><span class="w-28 flex-shrink-0 muted">${label}</span><span class="min-w-0">${value}</span></div>` : '';
  let body = `<div class="flex flex-col gap-3 p-3" style="width:min(380px,calc(100vw - 32px))">
    <div class="flex items-start gap-3"><span class="legend-sw mt-1" style="background:${TONES[tone].fill}"></span>
      <div class="min-w-0"><p class="text-xs muted">${esc(b.kind === 'course' ? fmtCode(b.code) : (b.kind === 'group' ? 'Elige un curso' : 'Electiva'))} · ${b.credits} créditos · ${esc(cat?.label || '')}</p>
      <p class="font-semibold leading-snug">${esc(b.name)}</p></div>
      ${status === 'passed' ? '<span class="pill pill-ok ml-auto">Aprobada</span>' : status === 'locked' ? '<span class="pill pill-neutral ml-auto"><i class="fa-solid fa-lock text-[10px]"></i>Bloqueada</span>' : ''}</div>
    ${lack.length ? `<p class="text-sm rounded-lg bg-amber-50 text-amber-900 px-3 py-2">Te falta: <b class="font-semibold">${esc(lack.map(t => formatTerm(t, p.groups)).join(' · '))}</b></p>` : ''}
    ${row('Prerrequisitos', reqs.map(esc).join(' · '))}
    ${row('Correquisitos', coreqs.map(t => `<b>${esc(t)}</b>`).join(' · '))}
    ${row('Lo necesitan', deps.map(d => esc(fmtCode(d.code))).join(' · '))}
    ${b.note ? row('Nota', esc(b.note)) : ''}`;
  if (b.kind === 'group') {
    body += `<div class="flex flex-col gap-1.5"><p class="eyebrow">Opciones</p>${b.options.map(o => {
      const m = courseMeta(p, o), inB = !!itemForCode(o), passed = isPassed(ctx, o);
      const ob = ctx.byCode.get(o); const oLack = ob ? missing(ctx, ob) : [];
      const action = mode() === 'history'
        ? `<button class="btn btn-sm ${passed ? 'btn-quiet' : 'btn-primary'}" data-action="history:option" ${data({ code: o })}>${passed ? 'Desmarcar' : 'La aprobé'}</button>`
        : `<button class="btn btn-sm ${inB || passed ? 'btn-quiet' : 'btn-primary'}" data-action="pensum:pick" ${data({ key: b.key, code: o })} ${inB || passed ? 'disabled' : ''}>${passed ? 'Aprobada' : inB ? 'Agregada' : 'Agregar'}</button>`;
      return `<div class="flex items-center gap-2 text-sm"><span class="flex-1 min-w-0"><b class="font-semibold">${esc(fmtCode(o))}</b> ${esc(m?.name || '')}${m?.req?.length ? `<span class="block text-xs ${oLack.length && !passed ? 'text-amber-700' : 'muted'}">${oLack.length && !passed ? 'Te falta' : 'Pide'}: ${esc((oLack.length && !passed ? oLack.map(t => formatTerm(t, p.groups)) : reqText(p, m.req)).join(' · '))}</span>` : ''}</span>${action}</div>`;
    }).join('')}${b.hint ? `<p class="text-xs muted">${esc(b.hint)}</p>` : ''}</div>`;
  }
  if (slot) body += slotGuideHtml(p, b, slot);
  const primary = b.kind === 'group' ? '' : mode() === 'history'
    ? `<button class="btn btn-sm ${status === 'passed' ? 'btn-quiet' : 'btn-primary'}" data-action="pensum:toggle" ${data({ key: b.key })}>${status === 'passed' ? 'Desmarcar' : 'La aprobé'}</button>`
    : status === 'passed' ? `<button class="btn btn-sm btn-quiet" data-action="history:unpass" ${data({ key: b.key })}>Desmarcar como aprobada</button>`
    : `<button class="btn btn-sm ${item ? 'btn-quiet' : 'btn-primary'}" data-action="pensum:toggle" ${data({ key: b.key })}>${item ? 'Quitar del próximo semestre' : 'Agregar al próximo semestre'}</button>`;
  body += `<div class="flex flex-wrap gap-2 pt-1">${primary}${b.kind === 'course' ? `<button class="btn btn-sm btn-quiet" data-action="search:open" ${data({ q: b.code })}>Ver secciones</button>` : ''}</div></div>`;
  return body;
}
function slotGuideHtml(p, b, slot) {
  let html = `<div class="flex flex-col gap-2"><p class="text-sm">${esc(slot.hint || '')}</p>`;
  if (slot.emphasis && p.emphases) {
    // With an emphasis chosen, only its courses; otherwise all of them, by emphasis.
    const mine = p.emphases.find(e => e.id === S.profile.emphasis);
    html += (mine ? [mine] : p.emphases).map(e => `<div class="flex flex-col gap-1"><p class="eyebrow">${esc(e.label)}</p>${(slot.emphasis === 'required' ? [e.required] : e.electives).map(code => optionRow(p, b, code)).join('')}</div>`).join('');
    if (!mine) html += `<p class="text-xs muted">Elige tu énfasis arriba del pénsum para ver solo sus cursos.</p>`;
  }
  if (slot.options?.length) html += `<div class="flex flex-col gap-1 max-h-56 overflow-y-auto">${slot.options.map(code => optionRow(p, b, code)).join('')}</div>`;
  if (slot.queries?.length) html += `<div class="flex flex-wrap gap-1.5">${slot.queries.map(q => `<button class="chip" data-action="search:open" ${data({ q, slot: b.key })}><i class="fa-solid fa-magnifying-glass text-[10px]"></i>${esc(q)}</button>`).join('')}</div>`;
  return html + `</div>`;
}
function optionRow(p, b, code) {
  const m = courseMeta(p, code), inB = !!itemForCode(code);
  return `<div class="flex items-center gap-2 text-sm"><span class="flex-1 min-w-0 truncate"><b class="font-semibold">${esc(fmtCode(code))}</b> ${esc(m?.name || '')}</span>
    <button class="btn btn-sm ${inB ? 'btn-quiet' : 'btn-primary'}" data-action="pensum:pick" ${data({ key: b.key, code })} ${inB ? 'disabled' : ''}>${inB ? 'Agregada' : 'Usar'}</button></div>`;
}

// ─── Next semester ───────────────────────────────────────────
const blockByKey = key => { const p = activePensum(); return p ? blocksOf(p, routeId(p)).find(b => b.key === key) : null; };

async function removeItem(item) {
  if (courseInUse(item.key) && !(await confirmDialog({ title: `¿Quitar ${item.title}?`, body: 'También sale de tus horarios, con las secciones que elegiste.', confirm: 'Quitar', danger: true }))) return false;
  removeFromBasket(item.key);
  return true;
}

/** Adds a block to next semester with its missing corequisites. Returns the keys added. */
function addBlock(p, ctx, b) {
  const added = [], warn = [];
  if (b.kind === 'course') { addToBasket({ code: b.code, title: b.name, credits: b.credits, cat: b.cat, source: 'pensum' }); added.push(b.code); }
  else addToBasket({ key: b.key, title: b.name, credits: b.credits, elective: true, slot: b.slot, cat: b.cat, source: 'pensum' });
  for (const t of missingCoreqs(ctx, b)) {
    const code = typeof t === 'string' ? t : Array.isArray(t) ? (t.find(c => ctx.byCode.has(c)) || t[0]) : null;
    if (!code) { warn.push(formatTerm(t, p.groups)); continue; }
    if (p.external?.[code]?.kind === 'requirement' || itemForCode(code)) continue;
    const meta = courseMeta(p, code);
    addToBasket({ code, title: meta?.name || fmtCode(code), credits: meta?.credits ?? null, cat: categoryForCode(p, code) || undefined, source: 'coreq' });
    added.push(code);
  }
  const fetchCodes = added.filter(Boolean);
  if (fetchCodes.length) queueFetch(fetchCodes);
  return { coreqs: added.slice(b.kind === 'course' ? 1 : 0), warn };
}

async function lockedDialog(p, ctx, b) {
  const lack = missing(ctx, b);
  const v = await openDialog({
    title: `${esc(b.name)} está bloqueada`,
    html: `<p class="dlg-text">Para verla te falta: <b class="text-slate-900 font-semibold">${esc(lack.map(t => formatTerm(t, p.groups)).join(' · '))}</b>.</p>
      <p class="dlg-text">Si ya las aprobaste, márcalas y queda desbloqueada. También puedes agregarla igual, por ejemplo si tienes un permiso de la coordinación.</p>`,
    buttons: [{ label: 'Cancelar', value: '' }, { label: 'Agregar de todos modos', value: 'force' }, { label: 'Ya las aprobé', value: 'pass', kind: 'primary', submit: true }],
  });
  if (v === 'force') { const r = addBlock(p, ctx, b); toastAdded(b, r, true); commit(); }
  if (v === 'pass') {
    const before = snapshot();
    const r = await passChain({ ...b, kind: 'course' }, { self: false });
    toast(r.marked.length || r.met.length ? passedMessage(p, null, r).replace(/^Listo, y sus prerrequisitos /, 'Marcamos como aprobadas: ') : 'No se marcó nada.', 'success', { label: 'Deshacer', fn: () => restore(before) });
    commit();
  }
}

function toastAdded(b, r, forced) {
  const extra = r.coreqs.length ? ` con su correquisito ${r.coreqs.map(fmtCode).join(', ')}` : '';
  toast(`${b.name} agregada${forced ? ' (con requisitos pendientes)' : ''}${extra}.`, forced ? 'warning' : 'success');
  if (r.warn.length) toast(`Ojo: ${b.name} también pide ${r.warn.join(', ')} (aprobados o este semestre).`, 'warning');
}

// ─── History ("Ya aprobé") ───────────────────────────────────
const snapshot = () => ({ passed: [...S.profile.passed], met: [...S.profile.externalMet] });
function restore(snap) { S.profile.passed = snap.passed; S.profile.externalMet = snap.met; commit(); }

async function askChoices(p, choices) {
  if (!choices.length) return [];
  let picked = [];
  const v = await openDialog({
    title: '¿Cuáles aprobaste?',
    html: choices.map((c, i) => `<fieldset class="flex flex-col gap-1.5"><legend class="text-sm mb-1">Para <b class="font-semibold">${esc(fmtCode(c.forCode))} ${esc(p.courses[c.forCode]?.name || '')}</b> se necesita${c.count > 1 ? 'n' : ''} ${c.count} de estas:</legend>
      ${c.options.map(o => `<label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" class="w-4 h-4 accent-[var(--navy)]" data-change="choice:sync" value="${esc(o)}">${esc(fmtCode(o))} ${esc(courseMeta(p, o)?.name || '')}</label>`).join('')}</fieldset>`).join('') +
      `<input type="hidden" data-dialog-value value="[]">`,
    buttons: [{ label: 'No sé / omitir', value: '' }, { label: 'Marcar', value: 'ok', kind: 'primary', submit: true }],
  });
  try { picked = v ? JSON.parse(v) : []; } catch { picked = []; }
  return picked;
}

/**
 * Marks what a block needs (its prerequisite chain and requirements) as passed; with `self`, the
 * course itself too. Any-of / count requirements with several options are asked in a dialog.
 * Returns { marked: codes, met: requirement ids }.
 */
async function passChain(blk, { self = true } = {}) {
  const p = activePensum(); if (!p) return { marked: [], met: [] };
  const ctx = ctxNow(p);
  const marked = new Set(self && blk.code ? [blk.code] : []), met = new Set();
  const queue = [blk];
  while (queue.length) {
    const cur = queue.shift();
    const r = closureForPass(makeCtx(p, routeId(p), { passed: [...S.profile.passed, ...marked], externalMet: [...S.profile.externalMet, ...met] }), cur);
    r.toPass.forEach(c => marked.add(c));
    r.toMeet.forEach(c => met.add(c));
    if (r.choices.length) {
      const chosen = await askChoices(p, r.choices);
      for (const c of chosen) if (!marked.has(c)) { marked.add(c); const cb = ctx.byCode.get(c); if (cb) queue.push(cb); }
    }
  }
  S.profile.passed = [...new Set([...S.profile.passed, ...marked])];
  S.profile.externalMet = [...new Set([...S.profile.externalMet, ...met])];
  return { marked: [...marked], met: [...met] };
}
const passedMessage = (p, code, { marked, met }) => {
  const others = marked.filter(c => c !== code);
  const reqs = met.map(c => p.external?.[c]?.label || c);
  return `${code ? `${fmtCode(code)} aprobada` : 'Listo'}${others.length ? `, y sus prerrequisitos ${others.map(fmtCode).join(', ')}` : ''}${reqs.length ? `; requisito cumplido: ${reqs.join(', ')}` : ''}.`;
};
async function passCode(code) {
  const p = activePensum(); if (!p) return null;
  const b = ctxNow(p).byCode.get(code);
  if (!b) { S.profile.passed = [...new Set([...S.profile.passed, code])]; return { marked: [code], met: [] }; }
  return passChain(b);
}

function unpassCode(code) {
  const p = activePensum(); if (!p) return [];
  const ctx = ctxNow(p);
  const cascade = closureForUnpass(ctx, code);
  const gone = new Set([code, ...cascade]);
  S.profile.passed = S.profile.passed.filter(c => !gone.has(c));
  return cascade;
}

async function toggleHistory(b) {
  const p = activePensum(); if (!p) return;
  const ctx = ctxNow(p);
  const before = snapshot();
  if (b.kind === 'group') { openInfo(b.key); return; }
  if (b.kind === 'slot') {
    const on = ctx.passed.has(b.key);
    S.profile.passed = on ? S.profile.passed.filter(k => k !== b.key) : [...S.profile.passed, b.key];
    toast(on ? `${b.name}: sin marcar.` : `${b.name}: aprobada.`, 'info', { label: 'Deshacer', fn: () => restore(before) });
    commit(); return;
  }
  if (blockPassed(ctx, b)) {
    const cascade = unpassCode(b.code);
    toast(`${fmtCode(b.code)} sin marcar${cascade.length ? `, y las que dependían de ella: ${cascade.map(fmtCode).join(', ')}` : ''}.`, 'info', { label: 'Deshacer', fn: () => restore(before) });
    commit(); return;
  }
  const r = await passCode(b.code);
  commit();
  if (r) toast(passedMessage(p, b.code, r), 'success', { label: 'Deshacer', fn: () => restore(before) });
}

// ─── Actions ─────────────────────────────────────────────────
handle({
  'program:set': ({ program }) => {
    if (!getPensum(program)) return;
    if (S.profile.program && S.profile.program !== program && (S.basket.length || S.profile.passed.length)) toast(`Ahora ves el pénsum de ${getPensum(program).program}. Tus materias se mantienen.`, 'info');
    S.profile.program = program;
    document.getElementById('view-pensum')?.scrollTo?.(0, 0);
    if (getPensum(program).routes.length < 2) S.profile.route = getPensum(program).routes[0].id;
    else if (!getPensum(program).routes.some(r => r.id === S.profile.route)) S.profile.route = null;
    commit();
  },
  'route:set': ({ route }) => { S.profile.route = route; commit(); },
  'emphasis:set': (_, el) => { S.profile.emphasis = el.value || null; commit(); },
  'pensum:mode': ({ mode: m }) => { closePopover(); S.prefs.pensumMode = m === 'history' ? 'history' : 'plan'; if (m === 'history') S.prefs.historyIntro = 'done'; commit(); },
  'pensum:intro-done': () => { S.prefs.historyIntro = 'done'; commit(); },
  'pensum:toggle': async ({ key }) => {
    closePopover();
    const p = activePensum(); const b = blockByKey(key); if (!p || !b) return;
    if (mode() === 'history') { await toggleHistory(b); return; }
    const ctx = ctxNow(p);
    const item = itemForBlock(b);
    if (item) { if (await removeItem(item)) { toast(`${item.title} salió de tu próximo semestre.`, 'info'); commit(); } return; }
    if (b.kind === 'group') { openInfo(key); return; }
    const status = blockStatus(ctx, b);
    if (status === 'passed') { toast(`Ya aprobaste ${b.name}.`, 'info', { label: 'Desmarcar', fn: () => { const before = snapshot(); unpassCode(b.code); commit(); toast(`${fmtCode(b.code)} sin marcar.`, 'info', { label: 'Deshacer', fn: () => restore(before) }); } }); return; }
    if (status === 'locked') { await lockedDialog(p, ctx, b); return; }
    const r = addBlock(p, ctx, b);
    toastAdded(b, r, false);
    commit();
  },
  'pensum:pick': ({ key, code }) => {
    const p = activePensum(); const b = blockByKey(key); if (!p || !b) return;
    const m = courseMeta(p, code);
    const it = basketItem(key) ? fillSlot(key, code, m?.name, m?.credits) : addToBasket({ code, title: m?.name || code, credits: m?.credits, cat: b.cat, slot: b.slot });
    it.fromBlock = key;
    queueFetch([code]);
    closePopover();
    toast(`${it.title} agregada a tu próximo semestre.`, 'success');
    commit();
  },
  'pensum:suggest': () => {
    const p = activePensum(); if (!p) return;
    const ctx = ctxNow(p);
    const have = S.basket.reduce((a, b) => a + (b.credits || 0), 0);
    const target = Math.max(0, (S.rules.creditTarget || 18) - have);
    if (!target) { toast(`Ya tienes ${have} créditos, tu meta es ${S.rules.creditTarget}. Cámbiala en Horario → Restricciones.`, 'info'); return; }
    const { picked } = suggestSemester(ctx, target);
    if (!picked.length) { toast(ctx.passed.size ? 'No encontramos materias disponibles para sugerir.' : 'Marca primero lo que ya aprobaste para sugerirte el semestre.', 'info'); return; }
    const beforeKeys = new Set(S.basket.map(b => b.key));
    const toFetch = [];
    picked.forEach(k => {
      const b = ctx.blocks.find(x => x.key === k) || ctx.byCode.get(k);
      if (!b) return;
      if (b.kind === 'course') { addToBasket({ code: b.code, title: b.name, credits: b.credits, cat: b.cat, source: 'suggest' }); toFetch.push(b.code); }
      else addToBasket({ key: b.key, title: b.name, credits: b.credits, elective: true, slot: b.slot, cat: b.cat, source: 'suggest' });
    });
    queueFetch(toFetch);
    const added = S.basket.filter(b => !beforeKeys.has(b.key));
    toast(`Sugerimos ${added.length} materias (${added.reduce((a, b) => a + (b.credits || 0), 0)} cr) según tu pénsum.`, 'success', { label: 'Deshacer', fn: () => { added.forEach(b => removeFromBasket(b.key)); commit(); } });
    commit();
  },
  'pensum:info': ({ key }) => openInfo(key),
  'pensum:hover': ({ key }) => highlight(key),
  'pensum:hover:leave': () => highlight(null),
  'history:option': async ({ code }) => {
    closePopover();
    const before = snapshot();
    const p = activePensum(); const ctx = ctxNow(p);
    if (isPassed(ctx, code)) { const c = unpassCode(code); toast(`${fmtCode(code)} sin marcar${c.length ? `, y ${c.map(fmtCode).join(', ')}` : ''}.`, 'info', { label: 'Deshacer', fn: () => restore(before) }); commit(); return; }
    const r = await passCode(code);
    commit();
    if (r) toast(passedMessage(p, code, r), 'success', { label: 'Deshacer', fn: () => restore(before) });
  },
  'history:unpass': ({ key }) => {
    closePopover();
    const b = blockByKey(key); if (!b?.code) return;
    const before = snapshot();
    const c = unpassCode(b.code);
    toast(`${fmtCode(b.code)} sin marcar${c.length ? `, y las que dependían de ella: ${c.map(fmtCode).join(', ')}` : ''}.`, 'info', { label: 'Deshacer', fn: () => restore(before) });
    commit();
  },
  'choice:sync': (_, el) => {
    const form = el.closest('form'); if (!form) return;
    const vals = [...form.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
    const hidden = form.querySelector('[data-dialog-value]'); if (hidden) hidden.value = JSON.stringify(vals);
  },
  'basket:remove': async ({ key }) => { const it = basketItem(key); if (it && await removeItem(it)) { toast(`${it.title} salió de tu próximo semestre.`, 'info'); commit(); } },
});

function openInfo(key) {
  const p = activePensum(); const b = blockByKey(key); if (!p || !b) return;
  const anchor = document.querySelector(`.pblock[data-key="${CSS.escape(key)}"]`);
  if (!anchor) return;
  openPopover(anchor, infoHtml(p, b, ctxNow(p)), { id: 'pensum-info', placement: 'bottom-start', anchorSelector: `.pblock[data-key="${CSS.escape(key)}"]`, label: b.name });
}

export { openSearch };
