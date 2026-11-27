// "Amigos": share your schedule by link or image, keep friends' schedules, see classes and free
// time in common, overlay a friend on your calendar, and "Armar juntos". No server: schedules
// travel inside links and friends are kept only in this browser.
import { S, commit, currentDraft, draftSections, findSec, courseInfo, ingestSections, addToBasket, itemForCode, chooseCombo, evaluate, creditsOf, courseTitle } from '../../state/store.js';
import { encodeShare, decodeShare, schedulePayload, groupPayload, readPayload, parseShareHash } from '../../core/share.js';
import { sharedClasses, commonFree, groupGenerate } from '../../core/social.js';
import { usableCombos, kindOf, kindLabel } from '../../core/sections.js';
import { hardBusy, overlapsBusy } from '../../core/score.js';
import { rankResults } from '../../core/generator.js';
import { DAYS, DAY_HEAD, fmtTimeAP, timeToMinutes, hasTimeConflict, schedText } from '../../core/time.js';
import { fmtCode } from '../../core/requirements.js';
import { getPensum, categoryForCode } from '../../core/pensum.js';
import { esc, data, handle, $ } from '../dom.js';
import { ui, PREVIEW, colorsFor, activePensum } from '../state.js';
import { TONES } from '../tones.js';
import { openDialog, closeDialog, toast, promptDialog } from '../layer.js';
import { miniWeek } from './horario-view.js';
import { drawWeek, canvasToBlob } from '../week-image.js';

// Where share links point. In the preview (claude.ai) or a local file, links go to the public site.
const SITE = 'https://himashiu.github.io/horario/';
const shareBase = () => (!PREVIEW && /^https?:/.test(location.protocol) ? location.origin + location.pathname : SITE);

const AVATAR_TONES = ['magenta', 'teal', 'orange', 'crimson', 'green', 'amber', 'yellow'];
export function avatarHtml(name, id, small = false) {
  let h = 0; for (const ch of String(id || name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const t = TONES[AVATAR_TONES[h % AVATAR_TONES.length]];
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
  return `<span class="avatar ${small ? 'avatar-sm' : ''}" style="background:${t.ink};color:${t.text}" aria-hidden="true">${esc(initials)}</span>`;
}
const ago = ts => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 2) return 'hace un momento'; if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24); return d === 1 ? 'ayer' : `hace ${d} días`;
};
const me = () => ({ id: 'me', name: S.profile.name || 'Tú', sections: S.selected });
const people = () => [me(), ...S.friends.map(f => ({ id: f.id, name: f.name, sections: f.sections }))];

// UI state for this view
const v = { compare: new Set(), compareInit: false, together: new Set(), courses: new Set(), groupResults: null, groupError: null };

// ─── Rendering ───────────────────────────────────────────────
export function renderFriends() {
  const el = $('#view-amigos'); if (!el) return;
  // Compare with everybody until the user picks.
  if (!v.compareInit && S.friends.length) { S.friends.forEach(f => v.compare.add(f.id)); v.compareInit = true; }
  el.innerHTML = `<div class="gutter" style="padding-block:20px 40px"><div class="max-w-5xl mx-auto flex flex-col gap-6">
    <p class="text-sm text-slate-600">Comparte tu horario por link o como imagen, guarda los de tus amigos y encuentren huecos y clases en común. Todo queda en tu navegador: no hay cuentas ni servidor.</p>
    ${shareCardHtml()}
    ${friendsListHtml()}
    ${S.friends.length ? compareHtml() : ''}
    ${S.friends.length ? togetherHtml() : ''}
  </div></div>`;
}

function shareCardHtml() {
  const d = currentDraft();
  return `<div class="card p-5 flex flex-col gap-4">
    <div class="flex items-center gap-3">${avatarHtml(S.profile.name || 'Tú', S.profile.shareId || 'me')}
      <div class="min-w-0"><h3 class="text-base font-semibold">Comparte tu horario</h3><p class="text-xs muted">El link lleva tu nombre y las secciones del horario elegido. No incluye tus materias aprobadas.</p></div></div>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="field"><span class="field-label">Tu nombre (lo ven tus amigos)</span><input id="share-name" class="input" maxlength="40" value="${esc(S.profile.name || '')}" placeholder="Ej. Juan Pablo" data-change="share:name"></label>
      <label class="field"><span class="field-label">Horario que compartes</span><select id="share-draft" class="input" data-change="share:draft">${S.drafts.map(x => `<option value="${esc(x.id)}" ${x.id === d.id ? 'selected' : ''}>${esc(x.name)} · ${evaluate(draftSections(x.id)).totalCredits} cr</option>`).join('')}</select></label>
    </div>
    <div class="flex flex-wrap gap-2">
      <button class="btn btn-primary" data-action="share:copy"><i class="fa-solid fa-link"></i>Copiar link</button>
      ${PREVIEW ? '' : `<button class="btn btn-quiet" data-action="share:image"><i class="fa-regular fa-image"></i>Descargar imagen</button>`}
      ${!PREVIEW && typeof navigator !== 'undefined' && navigator.share ? `<button class="btn btn-quiet" data-action="share:native"><i class="fa-solid fa-share-nodes"></i>Compartir</button>` : ''}
    </div>
    <form class="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100" data-submit="share:open">
      <label class="sr-only" for="share-paste">Link de un amigo</label>
      <input id="share-paste" name="link" class="input flex-1" placeholder="¿Te pasaron un link? Pégalo aquí para verlo">
      <button class="btn btn-soft">Abrir link</button>
    </form>
  </div>`;
}

function friendsListHtml() {
  if (!S.friends.length) return `<div class="card p-6 flex flex-col items-center text-center gap-2">
      <span class="w-11 h-11 rounded-full bg-brand-50 text-brand-600 grid place-items-center"><i class="fa-solid fa-user-group"></i></span>
      <p class="font-semibold">Aún no tienes horarios de amigos</p>
      <p class="text-sm muted max-w-md">Pídele a un amigo que use «Copiar link» en su Armador de Horarios y te lo mande. Al abrirlo podrás guardarlo aquí.</p>
    </div>`;
  const overlay = new Set(S.prefs.overlay || []);
  return `<div class="flex flex-col gap-3"><h3 class="text-sm font-semibold">Tus amigos (${S.friends.length})</h3>
    <div class="grid gap-3 sm:grid-cols-2">${S.friends.map(f => {
      const cr = new Set(f.sections.map(s => s.code)).size;
      const { sameSection } = sharedClasses(S.selected, f.sections);
      return `<div class="card p-4 flex flex-col gap-3">
        <div class="flex items-center gap-3">${avatarHtml(f.name, f.id)}
          <div class="min-w-0 flex-1"><p class="font-semibold truncate">${esc(f.name)}</p><p class="text-xs muted truncate">${esc(f.draft || 'Horario')} · ${cr} materia${cr === 1 ? '' : 's'} · ${esc(ago(f.at))}</p></div>
          <button class="icon-btn" data-action="friend:remove" ${data({ id: f.id })} aria-label="Quitar a ${esc(f.name)}"><i class="fa-regular fa-trash-can text-xs"></i></button></div>
        <div class="flex items-center gap-3">${miniWeek(f.sections, [], 120, 64)}
          <div class="min-w-0 flex-1 flex flex-col gap-1 text-xs">${sameSection.length ? `<span class="pill pill-ok self-start"><i class="fa-solid fa-people-group"></i>${sameSection.length} clase${sameSection.length > 1 ? 's' : ''} juntos</span>` : '<span class="muted">Sin clases juntos todavía</span>'}
            <span class="muted truncate">${esc([...new Set(f.sections.map(s => s.title))].slice(0, 3).join(' · '))}</span></div></div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-sm ${overlay.has(f.id) ? 'btn-soft' : 'btn-quiet'}" data-action="friend:overlay" ${data({ id: f.id })} aria-pressed="${overlay.has(f.id)}"><i class="fa-solid fa-layer-group"></i>${overlay.has(f.id) ? 'Superpuesto en tu horario' : 'Superponer en mi horario'}</button>
          <button class="btn btn-sm btn-quiet" data-action="friend:view" ${data({ id: f.id })}>Ver horario</button>
        </div></div>`;
    }).join('')}</div></div>`;
}

function compareHtml() {
  const chosen = people().filter(p => p.id === 'me' || v.compare.has(p.id));
  const free = commonFree(chosen.map(p => p.sections));
  const chips = S.friends.map(f => `<button class="chip" data-action="compare:toggle" ${data({ id: f.id })} aria-pressed="${v.compare.has(f.id)}">${avatarHtml(f.name, f.id, true)}${esc(f.name)}</button>`).join('');
  return `<div class="card p-5 flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2"><h3 class="text-base font-semibold mr-2">Huecos y clases en común</h3>
      <span class="chip" aria-pressed="true">${avatarHtml(S.profile.name || 'Tú', S.profile.shareId || 'me', true)}Tú</span>${chips}</div>
    ${freeWeekHtml(free, chosen.length)}
    <div class="flex flex-col gap-3">${S.friends.filter(f => v.compare.has(f.id)).map(f => sharedHtml(f)).join('')}</div>
  </div>`;
}

function freeWeekHtml(free, n) {
  const start = 7 * 60, end = 19 * 60, H = 220;
  const y = m => ((m - start) / (end - start)) * H;
  const cols = DAYS.map((d, i) => `<div class="relative border-l border-slate-100 first:border-l-0" style="height:${H}px">${(free[d] || []).map(([a, b]) => `<span class="absolute left-1 right-1 rounded-md bg-emerald-100 border border-emerald-300 text-[10px] text-emerald-900 px-1 overflow-hidden" style="top:${y(a)}px;height:${Math.max(14, y(b) - y(a))}px" title="${d} ${fmtTimeAP(a)}–${fmtTimeAP(b)}">${fmtTimeAP(a).replace(' ', '')}</span>`).join('')}</div>`).join('');
  const hours = [7, 9, 11, 13, 15, 17, 19].map(h => `<span class="absolute right-1 text-[10px] muted" style="top:${y(h * 60) - 6}px">${h % 12 || 12}${h < 12 ? 'am' : 'pm'}</span>`).join('');
  const list = DAYS.flatMap(d => (free[d] || []).filter(([a, b]) => b - a >= 90).map(([a, b]) => `${DAY_HEAD[DAYS.indexOf(d)]} ${fmtTimeAP(a)}–${fmtTimeAP(b)}`)).slice(0, 6);
  return `<div class="flex flex-col gap-2"><p class="text-sm"><b class="font-semibold">Huecos en común</b> <span class="muted">· ${n === 1 ? 'tus horas libres' : `cuando ${n === 2 ? 'los dos están' : `los ${n} están`} libres (7 AM–7 PM, mínimo 1 hora)`}</span></p>
    <div class="week"><div class="week-head"><span></span>${DAY_HEAD.map(d => `<span>${d}</span>`).join('')}</div>
      <div class="grid" style="grid-template-columns:38px repeat(6,minmax(0,1fr))"><div class="relative" style="height:${H}px">${hours}</div>${cols}</div></div>
    ${list.length ? `<p class="text-xs muted">Ratos largos: ${list.map(esc).join(' · ')}</p>` : ''}</div>`;
}

function sharedHtml(f) {
  const { sameSection, sameCourse } = sharedClasses(S.selected, f.sections);
  if (!sameSection.length && !sameCourse.length) return `<p class="text-sm muted">${avatarHtml(f.name, f.id, true)} Con ${esc(f.name)} no tienen materias en común en este horario.</p>`;
  const others = code => S.selected.filter(s => s.code !== code);
  const busy = hardBusy(S.rules);
  return `<div class="flex flex-col gap-2"><p class="text-sm font-semibold flex items-center gap-2">${avatarHtml(f.name, f.id, true)}Con ${esc(f.name)}</p>
    ${sameSection.map(x => `<div class="flex items-center gap-2 text-sm rounded-xl bg-emerald-50 px-3 py-2"><i class="fa-solid fa-people-group text-emerald-700"></i><span class="flex-1 min-w-0">Ven juntos <b class="font-semibold">${esc(x.title)}</b> <span class="muted">${x.sections.map(s => `${kindLabel(s)} S${esc(s.section)}`).join(' + ')}</span></span></div>`).join('')}
    ${sameCourse.map(x => {
      const theirIds = x.theirs.map(s => s.nrc);
      const fits = !x.theirs.some(s => others(x.code).some(o => hasTimeConflict(o, s)) || busy.some(b => overlapsBusy(s, b)));
      return `<div class="flex flex-wrap items-center gap-2 text-sm rounded-xl bg-slate-50 px-3 py-2"><i class="fa-solid fa-book-open text-slate-400"></i>
        <span class="flex-1 min-w-[12rem]"><b class="font-semibold">${esc(x.title)}</b>: tú en ${x.mine.map(s => `S${esc(s.section)}`).join(' + ')}, ${esc(f.name)} en ${x.theirs.map(s => `S${esc(s.section)}`).join(' + ')} <span class="muted">(${esc(x.theirs.map(schedText).join(' · '))})</span></span>
        ${fits ? `<button class="btn btn-sm btn-soft" data-action="friend:switch" ${data({ id: f.id, nrcs: theirIds.join(',') })}>Cámbiate a ${x.theirs.map(s => `S${esc(s.section)}`).join(' + ')}</button>` : `<span class="text-xs muted">Su sección choca con tu horario</span>`}
      </div>`;
    }).join('')}</div>`;
}

function togetherHtml() {
  const codes = S.basket.filter(b => b.code && courseInfo(b.code).secs.length).map(b => b.code);
  const res = v.groupResults;
  return `<div class="card p-5 flex flex-col gap-4">
    <div><h3 class="text-base font-semibold">Armar juntos</h3><p class="text-sm muted">Elige con quién y qué materias quieren ver juntos. Buscamos secciones que les sirvan a todos sin chocar con sus otras clases.</p></div>
    <div class="flex flex-wrap items-center gap-2"><span class="text-xs muted w-20">Con</span>${S.friends.map(f => `<button class="chip" data-action="together:friend" ${data({ id: f.id })} aria-pressed="${v.together.has(f.id)}">${avatarHtml(f.name, f.id, true)}${esc(f.name)}</button>`).join('')}</div>
    <div class="flex flex-wrap items-center gap-2"><span class="text-xs muted w-20">Materias</span>${codes.length ? codes.map(c => `<button class="chip" data-action="together:course" ${data({ code: c })} aria-pressed="${v.courses.has(c)}">${esc(courseTitle(c))}</button>`).join('') : '<span class="text-xs muted">Agrega materias con secciones cargadas en Mi pénsum.</span>'}</div>
    <div><button class="btn btn-primary" data-action="together:run" ${v.together.size && v.courses.size ? '' : 'disabled'}><i class="fa-solid fa-wand-magic-sparkles"></i>Buscar secciones para todos</button></div>
    ${v.groupError ? `<p class="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">${esc(v.groupError)}</p>` : ''}
    ${res ? `<div class="grid gap-3 sm:grid-cols-2">${res.slice(0, 6).map((r, i) => `<div class="rounded-xl border border-slate-200 p-3 flex gap-3">
      ${miniWeek(r.secs, S.selected.filter(s => !v.courses.has(s.code)), 96, 56)}
      <div class="min-w-0 flex-1 flex flex-col gap-1.5"><p class="text-sm font-semibold">Opción ${i + 1} <span class="text-xs muted font-normal">· tu score ${r.score}/10</span></p>
        <p class="text-xs text-slate-600">${esc(groupByCode(r.secs).map(([code, secs]) => `${courseTitle(code)} ${secs.map(s => 'S' + s.section).join('+')}`).join(' · '))}</p>
        <div class="flex flex-wrap gap-1.5"><button class="btn btn-sm btn-primary" data-action="together:apply" ${data({ i })}>Aplicar a mi horario</button><button class="btn btn-sm btn-quiet" data-action="together:link" ${data({ i })}>Copiar link para el grupo</button></div></div>
    </div>`).join('')}</div>` : ''}
  </div>`;
}
const groupByCode = secs => { const m = new Map(); secs.forEach(s => { if (!m.has(s.code)) m.set(s.code, []); m.get(s.code).push(s); }); return [...m]; };

// ─── Links ───────────────────────────────────────────────────
function ensureShareId() { if (!S.profile.shareId) S.profile.shareId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); return S.profile.shareId; }
async function askName() {
  if (S.profile.name) return S.profile.name;
  const name = await promptDialog({ title: '¿Cómo te llamas?', label: 'Tu nombre, como lo verán tus amigos', confirm: 'Listo', placeholder: 'Ej. Juan Pablo' });
  if (!name) return null;
  S.profile.name = name.trim().slice(0, 40); commit();
  return S.profile.name;
}
async function buildLink(draftId) {
  const name = await askName(); if (!name) return null;
  const d = S.drafts.find(x => x.id === draftId) || currentDraft();
  const secs = draftSections(d.id);
  if (!secs.length) { toast('Ese horario aún no tiene secciones. Arma tu horario primero.', 'warning'); return null; }
  const payload = schedulePayload({ id: ensureShareId(), name, draft: d.name, program: S.profile.program, sections: secs });
  return `${shareBase()}#ver=${await encodeShare(payload)}`;
}
function copyText(text, ok) {
  const fallback = () => openDialog({ title: 'Copia el link', html: `<textarea class="input font-mono text-xs" rows="4" readonly>${esc(text)}</textarea><p class="text-xs muted">Selecciónalo y cópialo.</p>`, buttons: [{ label: 'Cerrar', value: 'ok', kind: 'primary', submit: true }] });
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(ok, 'success'), fallback); else fallback();
}

/** Opens a "#ver=…" or "#grupo=…" link: shows it and offers what to do with it. */
export async function openShareLink(kind, dataStr) {
  let p;
  try { p = readPayload(await decodeShare(dataStr)); }
  catch (e) { toast(e.message || 'No se pudo abrir el link.', 'error'); return; }
  if (p.id && p.id === S.profile.shareId) { toast('Ese es tu propio link.', 'info'); return; }
  if (p.kind === 'grupo') { openGroupDialog(p); return; }
  const known = S.friends.find(f => f.id === p.id);
  const html = `<div class="flex items-center gap-3">${avatarHtml(p.name, p.id)}<div><p class="font-semibold">${esc(p.name)}</p><p class="text-xs muted">${esc(p.draft || 'Horario')}${p.program && getPensum(p.program) ? ` · ${esc(getPensum(p.program).program)}` : ''}${p.at ? ` · compartido ${esc(ago(p.at))}` : ''}</p></div></div>
    <div class="flex justify-center">${miniWeek(p.sections, [], 420, 200)}</div>
    <ul class="text-sm flex flex-col gap-1">${groupByCode(p.sections).map(([code, secs]) => `<li><b class="font-semibold">${esc(secs[0].title)}</b> <span class="muted">${esc(fmtCode(code))} · ${secs.map(s => `${kindLabel(s)} S${esc(s.section)}`).join(' + ')}</span></li>`).join('')}</ul>
    ${known ? `<p class="text-xs muted">Ya tenías a ${esc(p.name)}: se actualiza con este horario.</p>` : ''}`;
  const choice = await openDialog({ title: `Horario de ${esc(p.name)}`, html, buttons: [{ label: 'Cerrar', value: '' }, { label: 'Guardar como amigo', value: 'save' }, { label: 'Superponer con mi horario', value: 'overlay', kind: 'primary', submit: true }] });
  if (!choice) return;
  saveFriend(p);
  if (choice === 'overlay') { S.prefs.overlay = [...new Set([...(S.prefs.overlay || []), p.id])]; commit(); window.__nav?.('horario'); toast(`Ves el horario de ${p.name} superpuesto en gris.`, 'success'); }
  else { commit(); window.__nav?.('amigos'); toast(`${p.name} guardado en Amigos.`, 'success'); }
}
function saveFriend(p) {
  const rec = { id: p.id || 'f-' + Date.now(), name: p.name, draft: p.draft, program: p.program, at: p.at || Date.now(), savedAt: Date.now(), sections: p.sections };
  const i = S.friends.findIndex(f => f.id === rec.id);
  if (i >= 0) S.friends[i] = rec; else S.friends.push(rec);
  v.compare.add(rec.id);
}

/** Section objects of another person, mapped onto mine when I already loaded that NRC. */
function adoptSections(secs) {
  const fresh = secs.filter(s => !S.sections.some(x => x.nrc === s.nrc));
  if (fresh.length) ingestSections(fresh);
  return secs.map(s => S.sections.find(x => x.nrc === s.nrc)).filter(Boolean);
}

async function openGroupDialog(p) {
  const html = `<p class="dlg-text">${esc(p.name)} propone que ${p.members.length > 2 ? 'el grupo vea' : 'vean'} juntos estas secciones${p.members.length ? ` (${esc(p.members.join(', '))})` : ''}:</p>
    <ul class="text-sm flex flex-col gap-1">${groupByCode(p.sections).map(([code, secs]) => `<li><b class="font-semibold">${esc(secs[0].title)}</b> <span class="muted">${secs.map(s => `${kindLabel(s)} S${esc(s.section)} (${esc(schedText(s))})`).join(' + ')}</span></li>`).join('')}</ul>
    <p class="text-xs muted">Al aplicar, esas materias quedan con estas secciones en tu horario actual. Puedes deshacerlo.</p>`;
  const choice = await openDialog({ title: 'Armar juntos', html, buttons: [{ label: 'Cerrar', value: '' }, { label: 'Aplicar a mi horario', value: 'apply', kind: 'primary', submit: true }] });
  if (choice !== 'apply') return;
  applySections(p.sections);
  window.__nav?.('horario');
}
function applySections(secs) {
  const mine = adoptSections(secs);
  const pensum = activePensum();
  for (const [code, list] of groupByCode(mine)) {
    if (!itemForCode(code)) addToBasket({ code, title: list[0].title, credits: list[0].credits, cat: pensum ? categoryForCode(pensum, code) || undefined : undefined, source: 'grupo' });
    chooseCombo(list.map(s => s.id));
  }
  commit();
  toast('Secciones aplicadas a tu horario.', 'success');
}

// ─── Actions ─────────────────────────────────────────────────
handle({
  'share:name': (_, el) => { S.profile.name = el.value.trim().slice(0, 40); commit(); },
  'share:draft': () => {},
  'share:copy': async () => { const link = await buildLink($('#share-draft')?.value); if (link) copyText(link, 'Link copiado. Mándaselo a tus amigos.'); },
  'share:native': async () => { const link = await buildLink($('#share-draft')?.value); if (!link) return; try { await navigator.share({ title: 'Mi horario', text: `Mi horario (${S.profile.name})`, url: link }); } catch { /* cancelled */ } },
  'share:image': async () => {
    const d = S.drafts.find(x => x.id === $('#share-draft')?.value) || currentDraft();
    const secs = draftSections(d.id);
    if (!secs.length) { toast('Ese horario aún no tiene secciones.', 'warning'); return; }
    const ev = evaluate(secs);
    const canvas = drawWeek(secs, { title: `${S.profile.name ? S.profile.name + ' · ' : ''}${d.name}`, subtitle: `${new Set(secs.map(s => s.code)).size} materias · ${ev.totalCredits} créditos`, colorsFor });
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], 'horario.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: d.name }); return; } catch { /* fall back to download */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'horario.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Imagen descargada: horario.png', 'success');
  },
  'share:open': (_, form) => { const parsed = parseShareHash(form.link.value); if (!parsed) { toast('Ese texto no es un link de horario. Debe contener «#ver=».', 'warning'); return; } form.link.value = ''; openShareLink(parsed.kind, parsed.data); },
  'friend:remove': ({ id }) => { const f = S.friends.find(x => x.id === id); if (!f) return; const before = [...S.friends]; S.friends = S.friends.filter(x => x.id !== id); S.prefs.overlay = (S.prefs.overlay || []).filter(x => x !== id); commit(); toast(`${f.name} quitado de Amigos.`, 'info', { label: 'Deshacer', fn: () => { S.friends = before; commit(); } }); },
  'friend:overlay': ({ id }) => { const set = new Set(S.prefs.overlay || []); set.has(id) ? set.delete(id) : set.add(id); S.prefs.overlay = [...set]; commit(); if (set.has(id)) toast('Lo verás en gris en tu Horario.', 'info', { label: 'Ir', fn: () => window.__nav?.('horario') }); },
  'friend:view': ({ id }) => { const f = S.friends.find(x => x.id === id); if (!f) return; openDialog({ title: `Horario de ${esc(f.name)}`, html: `<div class="flex justify-center">${miniWeek(f.sections, [], 420, 200)}</div><ul class="text-sm flex flex-col gap-1">${groupByCode(f.sections).map(([code, secs]) => `<li><b class="font-semibold">${esc(secs[0].title)}</b> <span class="muted">${secs.map(s => `${kindLabel(s)} S${esc(s.section)} · ${esc(schedText(s))}`).join(' + ')}</span></li>`).join('')}</ul>`, buttons: [{ label: 'Cerrar', value: 'ok', kind: 'primary', submit: true }] }); },
  'friend:switch': ({ id, nrcs }) => { const f = S.friends.find(x => x.id === id); if (!f) return; const secs = f.sections.filter(s => nrcs.split(',').includes(s.nrc)); const mine = adoptSections(secs); const r = chooseCombo(mine.map(s => s.id)); if (r) { commit(); toast(`Listo: ves ${courseTitle(r.code)} con ${f.name}.`, 'success'); } },
  'compare:toggle': ({ id }) => { v.compare.has(id) ? v.compare.delete(id) : v.compare.add(id); renderFriends(); },
  'together:friend': ({ id }) => { v.together.has(id) ? v.together.delete(id) : v.together.add(id); v.groupResults = null; renderFriends(); },
  'together:course': ({ code }) => { v.courses.has(code) ? v.courses.delete(code) : v.courses.add(code); v.groupResults = null; renderFriends(); },
  'together:run': () => {
    const codes = [...v.courses];
    const busy = hardBusy(S.rules);
    const courses = codes.map(code => ({ key: code, title: courseTitle(code), combos: usableCombos(courseInfo(code), !!S.rules.genOnlySeats).filter(c => !c.some(s => busy.some(b => overlapsBusy(s, b)))) }));
    const members = [{ name: 'tú', fixed: S.selected.filter(s => !v.courses.has(s.code)) }, ...S.friends.filter(f => v.together.has(f.id)).map(f => ({ name: f.name, fixed: f.sections.filter(s => !v.courses.has(s.code)) }))];
    const r = groupGenerate(courses, members);
    v.groupError = null; v.groupResults = null;
    if (r.blockedBy?.length) v.groupError = r.blockedBy.map(b => `${b.title} no tiene una sección que le sirva a ${b.member === 'tú' ? 'ti' : b.member || 'todos'}.`).join(' ');
    else if (!r.results.length) v.groupError = `No hay forma de verlas todas juntos sin choques${r.clash ? `: ${r.clash[0]} y ${r.clash[1]} siempre se cruzan` : ''}. Prueba con menos materias.`;
    else {
      const myFixed = members[0].fixed;
      v.groupResults = rankResults(r.results, secs => evaluate([...myFixed, ...secs])).map(x => ({ ...x, secs: x.ids.map(findSec).filter(Boolean) }));
    }
    renderFriends();
  },
  'together:apply': ({ i }) => { const r = v.groupResults?.[Number(i)]; if (!r) return; applySections(r.secs); },
  'together:link': async ({ i }) => {
    const r = v.groupResults?.[Number(i)]; if (!r) return;
    const name = await askName(); if (!name) return;
    const members = [name, ...S.friends.filter(f => v.together.has(f.id)).map(f => f.name)];
    copyText(`${shareBase()}#grupo=${await encodeShare(groupPayload({ id: ensureShareId(), name, members, sections: r.secs }))}`, 'Link del grupo copiado.');
  },
});

export { ensureShareId };
