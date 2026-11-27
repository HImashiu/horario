// "Exportar": compare drafts side by side and get the NRCs. Ported from index.html v7
// (renderCompare, copyNRCs, buildSummaryText, exportManualText, printSchedule) without
// v7's trick of temporarily swapping the global selection to evaluate other drafts.
import { S, currentDraft, draftSections, courseState, isPending, courseTitle, creditsOf, evaluate, switchDraft, commit, findSec, courseInfo } from '../../state/store.js';
import { kindOf, kindLabel, kindName, seatText, countConflicts } from '../../core/sections.js';
import { DAYS, schedText, weeklyHours, fmtHours } from '../../core/time.js';
import { fmtCode } from '../../core/requirements.js';
import { esc, data, handle, $ } from '../dom.js';
import { ui, colorsFor, PREVIEW } from '../state.js';
import { toast, openDialog } from '../layer.js';
import { miniWeek } from './horario-view.js';

export function renderExport() {
  const el = $('#view-exportar'); if (!el) return;
  const rows = S.drafts.map(d => {
    const secs = draftSections(d.id);
    const ev = evaluate(secs);
    const pending = S.basket.map(b => courseState(b, { draft: d, selected: secs, loading: ui.loadingCodes })).filter(isPending).length;
    return { d, secs, ev, pending, conflicts: countConflicts(secs), on: d.id === S.currentDraftId };
  });
  const best = Math.max(...rows.map(r => r.secs.length ? r.ev.score : 0));
  const d = currentDraft();
  const secs = S.selected.slice().sort((a, b) => a.code.localeCompare(b.code) || (kindOf(a) === 'mag' ? -1 : 1));
  el.innerHTML = `<div class="gutter" style="padding-block:20px 32px"><div class="max-w-5xl mx-auto flex flex-col gap-6">
    <p class="text-sm text-slate-600">Compara tus horarios y copia los NRC para inscribirte en Banner.</p>
    <div class="card overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-sm min-w-[720px]">
      <thead class="bg-wash text-xs muted text-left"><tr>${['Horario', 'Semana', 'Materias', 'Créditos', 'Días · horas', 'Pendientes', 'Choques', 'Score'].map(h => `<th class="px-4 py-3 font-medium">${h}</th>`).join('')}</tr></thead>
      <tbody class="divide-y divide-line-2">${rows.map(r => `<tr class="${r.on ? 'bg-brand-50/60' : 'hover:bg-slate-50'} cursor-pointer" data-action="export:open" ${data({ id: r.d.id })}>
        <td class="px-4 py-3 font-semibold">${r.on ? '<i class="fa-solid fa-check text-brand-600 mr-1.5"></i>' : ''}${esc(r.d.name)}</td>
        <td class="px-4 py-3">${miniWeek(r.secs, [], 96, 44)}</td>
        <td class="px-4 py-3 tabular">${new Set(r.secs.map(s => s.code)).size}</td>
        <td class="px-4 py-3 tabular">${r.ev.totalCredits || '—'}</td>
        <td class="px-4 py-3 tabular">${r.ev.days} · ${fmtHours(weeklyHours(r.secs))} h</td>
        <td class="px-4 py-3 tabular ${r.pending ? 'text-warn font-bold' : 'text-ok'}">${r.pending}</td>
        <td class="px-4 py-3 tabular ${r.conflicts ? 'text-danger font-bold' : 'text-ok'}">${r.conflicts}</td>
        <td class="px-4 py-3 font-semibold tabular">${r.secs.length ? r.ev.score + '/10' : '—'}${r.secs.length && r.ev.score === best && rows.length > 1 ? ' <span class="pill pill-navy ml-1">mejor</span>' : ''}</td>
      </tr>`).join('')}</tbody></table></div></div>
    <div class="card p-5 flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-base font-semibold mr-auto">NRC de «${esc(d.name)}»</h2>
        <button class="btn btn-primary btn-sm" data-action="export:nrc"><i class="fa-solid fa-hashtag"></i>Copiar NRCs</button>
        <button class="btn btn-quiet btn-sm" data-action="export:summary">Copiar resumen</button>
        ${PREVIEW ? '' : `<button class="btn btn-quiet btn-sm" data-action="export:txt">Descargar .txt</button><button class="btn btn-quiet btn-sm" data-action="export:print">Imprimir</button>`}
      </div>
      ${secs.length ? `<div class="overflow-x-auto rounded border border-line"><table class="w-full text-sm min-w-[640px]">
        <thead class="bg-wash text-xs muted text-left"><tr>${['NRC', 'Materia', 'Tipo', 'Sección', 'Horario', 'Profesor'].map(h => `<th class="px-3 py-2.5 font-medium">${h}</th>`).join('')}</tr></thead>
        <tbody class="divide-y divide-line-2">${secs.map(s => `<tr>
          <td class="px-3 py-2.5 font-mono font-bold">${esc(s.nrc)}</td>
          <td class="px-3 py-2.5"><span class="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style="background:${colorsFor(s.code).dot}"></span>${esc(s.title)} <span class="text-xs muted">${esc(fmtCode(s.code))}</span></td>
          <td class="px-3 py-2.5"><span class="kind ${kindOf(s) === 'mag' ? 'kind-mag' : 'kind-comp'}">${kindName(s)}</span></td>
          <td class="px-3 py-2.5">${esc(s.section)}</td>
          <td class="px-3 py-2.5 text-xs tabular">${esc(schedText(s))}</td>
          <td class="px-3 py-2.5 text-xs muted">${esc(s.instructors.join(', '))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="text-sm muted">Este horario aún no tiene secciones.</p>`}
    </div>
    <div class="flex flex-wrap items-center gap-3 text-sm muted">
      <span>${S.sections.length} secciones cargadas de ${new Set(S.sections.map(s => s.code)).size} materias.</span>
      <button class="link" data-action="data:open">Ver todas las secciones cargadas</button>
    </div>
  </div></div>`;
}

// ─── Copy / download / print ─────────────────────────────────
function copyText(text, okMsg) {
  const fallback = () => {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    if (ok) toast(okMsg, 'success');
    else openDialog({ title: 'Copia este texto', html: `<textarea class="input font-mono text-xs" rows="10" readonly>${esc(text)}</textarea>`, buttons: [{ label: 'Cerrar', value: 'ok', kind: 'primary', submit: true }] });
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast(okMsg, 'success'), fallback); else fallback();
}
function downloadText(text, filename, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function copyNRCs() {
  if (!S.selected.length) { toast('No hay secciones en el horario.', 'warning'); return; }
  const lines = S.selected.slice().sort((a, b) => a.code.localeCompare(b.code)).map(s => `${s.nrc}\t${fmtCode(s.code)} ${kindName(s)} S${s.section} — ${s.title}`);
  copyText(lines.join('\n'), `${lines.length} NRC copiados.`);
}
function buildSummaryText(header) {
  let text = header;
  const byCode = {}; S.selected.forEach(s => (byCode[s.code] ||= []).push(s));
  Object.entries(byCode).forEach(([code, secs]) => {
    text += `• ${fmtCode(code)} - ${courseTitle(code)} (${creditsOf(code) ?? 'N/A'} créditos)\n`;
    secs.sort(a => kindOf(a) === 'mag' ? -1 : 1).forEach(s => {
      text += `  ${kindName(s)} S${s.section} · NRC ${s.nrc} · Cupos ${seatText(s)}\n`;
      s.schedules.forEach(sch => { text += `    ${sch.days.join(', ')}: ${sch.start_time}–${sch.end_time} [${sch.location}]\n`; });
      text += `    Profesor: ${s.instructors.join(', ')}\n`;
    });
    text += '\n';
  });
  return text;
}
export function copySummary() {
  if (!S.selected.length) { toast('No hay secciones en el horario.', 'warning'); return; }
  copyText(buildSummaryText(`HORARIO: ${currentDraft()?.name || ''}\n\n`), 'Resumen copiado.');
}
export function downloadSummary() {
  if (!S.selected.length) { toast('No hay secciones en el horario.', 'warning'); return; }
  const ev = evaluate(S.selected);
  const name = currentDraft()?.name || 'Horario';
  let text = buildSummaryText(`${name.toUpperCase()} — Score ${ev.score}/10 | ${fmtHours(weeklyHours(S.selected))} h/sem | ${ev.totalCredits} créditos\n${'='.repeat(50)}\n\n`);
  if (ev.flags.length) text += `Notas:\n${ev.flags.map(f => `  ${f.type === 'warn' ? '⚠' : f.type === 'ok' ? '✓' : 'ℹ'} ${f.text}`).join('\n')}\n`;
  downloadText(text, 'horario.txt', 'text/plain;charset=utf-8');
  toast('Descargado como horario.txt', 'success');
}
export function printSchedule() {
  if (!S.selected.length) { toast('No hay secciones para imprimir.', 'warning'); return; }
  const dayMap = Object.fromEntries(DAYS.map(d => [d, []]));
  S.selected.forEach(sec => sec.schedules.forEach(sch => sch.days.forEach(d => { if (dayMap[d]) dayMap[d].push({ sec, time: `${sch.start_time}–${sch.end_time}`, location: sch.location, start: sch.start_time }); })));
  DAYS.forEach(d => dayMap[d].sort((a, b) => a.start.localeCompare(b.start)));
  const ev = evaluate(S.selected);
  const name = currentDraft()?.name || 'Horario';
  const rows = S.selected.map(s => `<tr><td>${esc(s.nrc)}</td><td>${esc(fmtCode(s.code))}</td><td>${esc(s.title)}</td><td>${kindName(s)}</td><td>${esc(s.section)}</td><td>${esc(schedText(s))}</td><td>${s.schedules.map(sc => esc(sc.location)).join('<br>')}</td><td>${esc(s.instructors.join(', '))}</td></tr>`).join('');
  const days = DAYS.map(d => `<div class="day"><div class="dt">${d}</div>${dayMap[d].length ? dayMap[d].map(e => `<div class="en">${e.time} — ${esc(fmtCode(e.sec.code))} ${kindLabel(e.sec)} S${esc(e.sec.section)} (${esc(e.location)})</div>`).join('') : '<div class="en mu">Sin clases</div>'}</div>`).join('');
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(name)}</title><style>
    body{font-family:Archivo,Helvetica,Arial,sans-serif;padding:28px;color:#23252F}h1{font-size:20px;margin:0 0 4px;text-transform:uppercase}.meta{font-size:12px;color:#575C6E;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;margin-bottom:26px}th,td{border:1px solid #D8DAE3;padding:6px 8px;font-size:11px;text-align:left;vertical-align:top}th{background:#F5F6F9}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.day{break-inside:avoid}.dt{font-weight:800;font-size:12.5px;border-bottom:2px solid #282C44;margin-bottom:5px;padding-bottom:3px;text-transform:uppercase}.en{font-size:11px;padding:2px 0}.mu{color:#80859A}
    @media print{body{padding:12mm}}</style></head><body>
    <h1>${esc(name)}</h1><div class="meta">${new Set(S.selected.map(s => s.code)).size} materias · ${ev.totalCredits > 0 ? ev.totalCredits + ' créditos · ' : ''}${fmtHours(weeklyHours(S.selected))} h/semana · ${new Date().toLocaleDateString('es-CO')}</div>
    <table><thead><tr><th>NRC</th><th>Código</th><th>Materia</th><th>Tipo</th><th>Sec</th><th>Horario</th><th>Salón</th><th>Profesor</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="grid">${days}</div></body></html>`;
  const win = window.open('', '_blank');
  if (!win) { toast('El navegador bloqueó la ventana de impresión. Habilita las ventanas emergentes.', 'warning'); return; }
  win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 350);
}

// ─── All loaded sections ("Datos") ───────────────────────────
function dataTableHtml(q = '') {
  const ql = q.toLowerCase().trim();
  const list = S.sections.filter(c => !ql || String(c.code).toLowerCase().includes(ql) || String(c.nrc).includes(ql) || String(c.title).toLowerCase().includes(ql) || c.instructors.some(i => String(i).toLowerCase().includes(ql)));
  if (!list.length) return `<p class="text-sm muted p-4 text-center">No se encontraron secciones.</p>`;
  return `<table class="w-full text-left text-sm min-w-[860px]"><thead class="bg-wash text-xs muted"><tr>${['NRC', 'Código', 'Materia', 'Tipo', 'Sec', 'Cr.', 'Profesor', 'Horario y salón', 'Cupos'].map(h => `<th class="px-3 py-2.5 font-bold">${h}</th>`).join('')}</tr></thead>
    <tbody class="divide-y divide-line-2">${list.slice(0, 500).map(c => `<tr class="${c.stale ? 'opacity-60' : ''}">
      <td class="px-3 py-2 font-mono text-xs">${esc(c.nrc)}</td><td class="px-3 py-2 font-bold text-xs">${esc(fmtCode(c.code))}</td><td class="px-3 py-2">${esc(c.title)}${c.stale ? ' <span class="pill pill-bad">ya no se ofrece</span>' : ''}</td>
      <td class="px-3 py-2"><span class="kind ${kindOf(c) === 'mag' ? 'kind-mag' : 'kind-comp'}">${kindLabel(c)}</span></td><td class="px-3 py-2">${esc(c.section)}</td><td class="px-3 py-2">${esc(c.credits ?? 'N/A')}</td>
      <td class="px-3 py-2 muted">${esc(c.instructors.join(', '))}</td><td class="px-3 py-2 text-xs tabular">${c.schedules.map(s => `${esc(schedText({ schedules: [s] }))} <span class="muted">(${esc(s.location)})</span>`).join('<br>') || '<span class="muted">Sin horario</span>'}</td>
      <td class="px-3 py-2 font-mono text-xs">${esc(seatText(c))}</td></tr>`).join('')}</tbody></table>`;
}

handle({
  'export:open': ({ id }) => { switchDraft(id); window.__nav?.('horario'); },
  'data:open': () => openDialog({
    title: 'Secciones cargadas', wide: true,
    html: `<input class="input" placeholder="Filtrar por código, NRC o profesor…" data-input="data:filter" aria-label="Filtrar secciones" autofocus>
      <div id="data-table" class="overflow-x-auto rounded border border-line">${dataTableHtml()}</div>
      <div class="flex gap-2"><button class="btn btn-quiet btn-sm" data-action="data:copy">Copiar JSON</button>${PREVIEW ? '' : '<button class="btn btn-quiet btn-sm" data-action="data:download">Descargar .json</button>'}</div>`,
  }),
  'data:filter': (_, el) => { const t = $('#data-table'); if (t) t.innerHTML = dataTableHtml(el.value); },
  'data:copy': () => copyText(JSON.stringify(S.sections, null, 2), 'JSON copiado.'),
  'data:download': () => downloadText(JSON.stringify(S.sections, null, 2), 'secciones.json', 'application/json'),
});
