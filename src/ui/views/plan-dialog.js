// "¿Cuándo me gradúo?": the projection in Mi pénsum (a chip and a card) and the dialog with the
// remaining pensum laid out semester by semester, in the pensum's own block style.
import { S, commit } from '../../state/store.js';
import { makeCtx } from '../../core/eligibility.js';
import { routeOf, toneOf, sortByCategory } from '../../core/pensum.js';
import { fmtCode } from '../../core/requirements.js';
import { planGraduation, fasterCap, termsFrom, termLabel, defaultStartTerm, isTerm, prevTerm } from '../../core/planner.js';
import { TONES, toneVars } from '../tones.js';
import { esc, data, handle } from '../dom.js';
import { activePensum, chosenKeys } from '../state.js';
import { openDialog } from '../layer.js';

const MIN_CR = 6, MAX_CR = 24;

function prefs() {
  const pr = S.prefs.plan || {};
  const cap = Math.round(Number(pr.maxCredits) || S.rules.creditTarget || 18);
  return {
    maxCredits: Math.min(MAX_CR, Math.max(MIN_CR, cap)),
    start: isTerm(pr.start) ? pr.start : isTerm(S.term) ? S.term : defaultStartTerm(),
    useBasket: pr.useBasket !== false,
  };
}
const setPref = (key, value) => { S.prefs.plan = { ...(S.prefs.plan || {}), [key]: value }; };

/** The projection for the active pensum with the student's settings. */
export function currentPlan(p = activePensum()) {
  if (!p) return null;
  const pr = prefs();
  const ctx = makeCtx(p, routeOf(p, S.profile.route).id, S.profile);
  const chosen = chosenKeys();
  const first = pr.useBasket ? chosen : [];
  const opts = { maxCredits: pr.maxCredits, first };
  const plan = planGraduation(ctx, opts);
  const terms = termsFrom(pr.start, Math.max(1, plan.semesters.length));
  // How many of the courses chosen for next semester are in this pensum (for the toggle).
  const set = new Set(chosen);
  const basketBlocks = ctx.blocks.filter(b => set.has(b.key) || (b.code && set.has(b.code)) || (b.kind === 'group' && b.options.some(o => set.has(o)))).length;
  return { p, pr, ctx, opts, plan, terms, basketBlocks, end: plan.semesters.length ? terms[plan.semesters.length - 1] : null };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const listCodes = codes => {
  const f = codes.map(c => (c.startsWith('grp:') || c.startsWith('slot:') ? c.replace(/^\w+:/, '') : fmtCode(c)));
  return f.length <= 3 ? f.join(', ').replace(/, ([^,]*)$/, ' y $1') : `${f.slice(0, 2).join(', ')} y ${f.length - 2} más`;
};

// ─── In Mi pénsum ────────────────────────────────────────────
/** A small button in the pensum controls: the projected graduation term. */
export function gradChipHtml(p) {
  const cur = currentPlan(p);
  if (!cur || !cur.end) return '';
  return `<button class="chip" data-action="plan:open" title="Ver tu plan semestre a semestre"><i class="fa-solid fa-graduation-cap text-[11px]"></i>Te graduarías en <b class="font-semibold tabular">${esc(termLabel(cur.end))}</b></button>`;
}

/** The side card: when, how many semesters, and the way into the dialog. */
export function gradCardHtml(p) {
  const cur = currentPlan(p);
  if (!cur) return '';
  const { plan, pr, ctx, end } = cur;
  if (!end) {
    return `<div class="card p-4 flex items-center gap-3"><span class="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center flex-shrink-0"><i class="fa-solid fa-graduation-cap"></i></span>
      <p class="text-sm"><b class="font-semibold">Marcaste todo el pénsum como aprobado.</b> Verifica tu grado con la coordinación de tu programa.</p></div>`;
  }
  const n = plan.semesters.length;
  return `<div class="card p-4 flex flex-col gap-2">
    <h2 class="text-sm font-semibold">¿Cuándo me gradúo?</h2>
    <div class="flex items-baseline gap-2 flex-wrap"><span class="text-2xl font-bold tabular tracking-tight">${esc(termLabel(end))}</span>
      <span class="text-xs muted">${plural(n, 'semestre', 'semestres')} más · ${pr.maxCredits} cr por semestre</span></div>
    ${ctx.passed.size ? '' : '<p class="text-xs muted">Proyección desde cero: marca lo que ya aprobaste para afinarla.</p>'}
    <button class="btn btn-soft w-full" data-action="plan:open"><i class="fa-solid fa-route"></i>Ver mi plan semestre a semestre</button>
  </div>`;
}

// ─── The dialog ──────────────────────────────────────────────
function miniBlock(p, b) {
  const tone = toneOf(p, b.cat);
  const codeLine = b.kind === 'course' ? fmtCode(b.code) : b.kind === 'group' ? 'ELIGE UNO' : 'ELECTIVA';
  const why = b.bottleneck ? `Marca el ritmo: si la aplazas, te gradúas después. Cadena: ${b.chain.map(k => (k.startsWith('grp:') ? 'proyecto' : fmtCode(k))).join(' → ')}` : '';
  return `<div class="pblock is-mini ${b.bottleneck ? 'is-bottleneck' : ''}" style="${toneVars(tone)}" role="listitem" aria-label="${esc(`${b.kind === 'course' ? fmtCode(b.code) + ' ' : ''}${b.name}, ${b.credits} créditos${b.bottleneck ? ', marca el ritmo' : ''}`)}" ${why ? `title="${esc(why)}"` : ''}>
    <span class="pb-code">${esc(codeLine)}</span>
    <span class="pb-name">${esc(b.name)}</span>
    <span class="pb-cr ${TONES[tone]?.text === '#FFFFFF' ? '' : 'is-dark'}" aria-hidden="true">${b.credits}</span>
    ${b.bottleneck ? '<span class="pb-bolt" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>' : ''}
  </div>`;
}

function noteText(n, terms) {
  const when = esc(termLabel(terms[n.semester]));
  const who = esc(listCodes(n.for));
  if (n.kind === 'requirement') return `<b>${esc(n.label)}</b>: cúmplelo antes de ${when}; lo ${n.for.length > 1 ? 'piden' : 'pide'} ${who}.`;
  if (n.type === 'coreq') return `<b>${esc(fmtCode(n.code))}</b>${n.label !== n.code ? ` ${esc(n.label)}` : ''}: inscríbelo junto con ${who} (${when}).`;
  return `<b>${esc(fmtCode(n.code))}</b>${n.label !== n.code ? ` ${esc(n.label)}` : ''} no está en el plan y lo ${n.for.length > 1 ? 'piden' : 'pide'} ${who}: apruébalo antes de ${when}.`;
}

function bodyHtml() {
  const cur = currentPlan();
  if (!cur) return '<p class="dlg-text">Elige primero tu programa en Mi pénsum.</p>';
  const { p, pr, ctx, opts, plan, terms, basketBlocks, end } = cur;
  const startOptions = [...new Set([...termsFrom(prevTerm(defaultStartTerm()), 4), pr.start])].sort();
  const controls = `<div class="flex flex-wrap items-center gap-x-5 gap-y-3">
    <div class="flex items-center gap-2"><span class="text-sm">Créditos por semestre</span>
      <span class="stepper"><button type="button" class="icon-btn !w-8 !h-8" data-action="plan:credits" data-delta="-1" aria-label="Menos créditos" ${pr.maxCredits <= MIN_CR ? 'disabled' : ''}><i class="fa-solid fa-minus text-[11px]"></i></button>
        <output class="w-8 text-center font-semibold tabular" id="plan-credits">${pr.maxCredits}</output>
        <button type="button" class="icon-btn !w-8 !h-8" data-action="plan:credits" data-delta="1" aria-label="Más créditos" ${pr.maxCredits >= MAX_CR ? 'disabled' : ''}><i class="fa-solid fa-plus text-[11px]"></i></button></span></div>
    <label class="flex items-center gap-2 text-sm">Empiezas en
      <select class="input !w-auto !py-1.5" data-change="plan:start" aria-label="Primer semestre del plan">${startOptions.map(t => `<option value="${t}" ${t === pr.start ? 'selected' : ''}>${termLabel(t)}</option>`).join('')}</select></label>
    ${basketBlocks ? `<label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" class="w-4 h-4 accent-[var(--navy)]" data-change="plan:basket" ${pr.useBasket ? 'checked' : ''}>Empezar con lo que elegí (${plural(basketBlocks, 'materia', 'materias')})</label>` : ''}
  </div>`;
  if (!end) return controls + '<p class="dlg-text">No te queda nada por ver en este pénsum.</p>';

  const n = plan.semesters.length;
  const bottlenecks = plan.semesters.flatMap(s => s.blocks).filter(b => b.bottleneck);
  let insight;
  if (bottlenecks.length) {
    insight = `<span class="pb-bolt !static flex-shrink-0" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span><span><b class="font-semibold">${plural(bottlenecks.length, 'materia marca', 'materias marcan')} el ritmo:</b> si aplazas una, te gradúas después. No dejes para luego ${esc(listCodes(bottlenecks.map(b => b.code || b.key)))}.</span>`;
  } else {
    const faster = fasterCap(ctx, opts);
    insight = `<i class="fa-solid fa-scale-balanced text-slate-400 mt-0.5"></i><span>Lo que define tu fecha son los créditos por semestre${faster ? `: con ${faster.maxCredits} terminarías en <b class="font-semibold">${esc(termLabel(termsFrom(pr.start, faster.semesters).pop()))}</b>` : ''}.</span>`;
  }
  const notes = plan.notes.map(x => `<li>${noteText(x, terms)}</li>`);
  if (plan.unplaced.length) notes.push(`<li><b>Sin ubicar:</b> ${esc(plan.unplaced.map(u => u.name).join(', '))}. Revisa sus requisitos en el pénsum.</li>`);

  return `${controls}
    <div class="flex flex-wrap items-end gap-x-6 gap-y-2">
      <div><p class="text-xs muted">Terminarías en</p><p class="text-3xl font-bold tabular tracking-tight" id="plan-end">${esc(termLabel(end))}</p></div>
      <p class="text-sm muted pb-1">${plural(n, 'semestre', 'semestres')} · ${plan.remainingCredits} créditos por ver${plan.minSemesters < n ? ` · con prerrequisitos, lo mínimo serían ${plan.minSemesters}` : ''}</p>
    </div>
    <p class="flex items-start gap-2 text-sm">${insight}</p>
    ${notes.length ? `<ul class="plan-notes">${notes.join('')}</ul>` : ''}
    <div class="plan-sems" role="list" aria-label="Semestres del plan">${plan.semesters.map((s, i) => `
      <section class="psem plan-sem" role="listitem" aria-label="${esc(termLabel(terms[i]))}">
        <div class="psem-label"><span class="plan-term tabular">${esc(termLabel(terms[i]))}</span><span class="psem-credits">${s.credits} créditos${s.fixed ? ' · tu elección' : ''}</span></div>
        <div class="plan-row" role="list">${sortByCategory(p, s.blocks).map(b => miniBlock(p, b)).join('')}</div>
      </section>`).join('')}</div>
    <p class="text-xs muted">Es una proyección con los requisitos del pénsum: no tiene en cuenta cupos, horarios, cursos intersemestrales ni materias perdidas. Verifícala con la coordinación de tu programa.</p>`;
}

const refresh = () => { const body = document.querySelector('#dlg .dlg-body'); if (body && document.getElementById('plan-credits')) body.innerHTML = bodyHtml(); };

export function openPlanDialog() {
  return openDialog({ title: '¿Cuándo me gradúo?', html: bodyHtml(), wide: true, buttons: [{ label: 'Cerrar', value: 'ok', kind: 'primary', submit: true }] });
}

handle({
  'plan:open': () => openPlanDialog(),
  'plan:credits': ({ delta }) => { setPref('maxCredits', Math.min(MAX_CR, Math.max(MIN_CR, prefs().maxCredits + Number(delta)))); commit(); refresh(); },
  'plan:start': (_, el) => { if (isTerm(el.value)) { setPref('start', el.value); commit(); refresh(); } },
  'plan:basket': (_, el) => { setPref('useBasket', !!el.checked); commit(); refresh(); },
});
