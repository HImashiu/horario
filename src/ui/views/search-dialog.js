// "Buscar otra materia": search the Uniandes offer, import Banner JSON, or load demo data.
// One dialog instead of v7's stack of panels on the Materias page.
import { S, addToBasket, itemForCode, basketItem, fillSlot, courseInfo, creditsOf, afterDataChange, ingestSections, commit } from '../../state/store.js';
import { hasSeats } from '../../core/sections.js';
import { normalizeQuery } from '../../data/uniandes-api.js';
import { parseImport, parseItems } from '../../data/banner-import.js';
import { demoBannerItems } from '../../data/demo.js';
import { fmtCode } from '../../core/requirements.js';
import { esc, data, handle, $ } from '../dom.js';
import { ui, PREVIEW, activePensum } from '../state.js';
import { openDialog, closeDialog, dialogOpen, toast, confirmDialog } from '../layer.js';
import { searchCourses, ingestSearch, queueFetch, LARGE_RESULT } from '../fetch-queue.js';
import { categoryForCode } from '../../core/pensum.js';

let ctx = { slot: null, results: null, query: '', busy: false, error: null };

export function openSearch({ q = '', slot = null } = {}) {
  ctx = { slot: slot || null, results: null, query: q, busy: false, error: null };
  const slotItem = slot ? basketItem(slot) : null;
  openDialog({ title: slotItem ? `Elegir curso para «${esc(slotItem.title)}»` : 'Buscar una materia', wide: true, html: bodyHtml() });
  if (q) runSearch(q);
}

function bodyHtml() {
  return `<form class="flex flex-col sm:flex-row gap-2" data-submit="search:submit">
      <label class="sr-only" for="search-q">Código o nombre</label>
      <input id="search-q" name="q" class="input flex-1" placeholder="Código o nombre, ej. MATE1214 o Termodinámica" value="${esc(ctx.query)}" autofocus ${PREVIEW ? 'disabled' : ''}>
      <label class="sr-only" for="search-term">Periodo</label>
      <input id="search-term" name="term" class="input sm:w-36" placeholder="Periodo (opcional)" value="${esc(S.term)}" ${PREVIEW ? 'disabled' : ''}>
      <button class="btn btn-primary" ${PREVIEW ? 'disabled' : ''}><i class="fa-solid fa-magnifying-glass"></i>Buscar</button>
    </form>
    ${PREVIEW ? `<p class="text-sm pill-warn rounded px-3 py-2">Esta vista previa no puede consultar ofertadecursos.uniandes.edu.co. En el sitio publicado la búsqueda funciona desde tu navegador. Aquí puedes cargar los datos demo o pegar el JSON.</p>` : ''}
    <div id="search-results" class="flex flex-col gap-2">${resultsHtml()}</div>
    <details class="card" ${PREVIEW ? 'open' : ''}>
      <summary class="px-4 py-3 cursor-pointer font-semibold text-sm flex items-center gap-2"><i class="fa-solid fa-file-import text-faint"></i>Importar JSON de Banner o de la API <span class="ml-auto text-xs font-normal muted">si la búsqueda falla</span></summary>
      <div class="px-4 pb-4 flex flex-col gap-3">
        <ol class="text-xs muted list-decimal list-inside leading-relaxed">
          <li>En Banner, abre la búsqueda de cursos y presiona <kbd class="px-1 rounded border border-line bg-wash">F12</kbd>.</li>
          <li>Pestaña <b>Network</b> → <b>Fetch/XHR</b> → petición <code>searchResults</code>.</li>
          <li>Copia la respuesta y pégala aquí, o carga el archivo <code>.json</code>.</li>
        </ol>
        <label class="sr-only" for="import-text">JSON</label>
        <textarea id="import-text" class="input font-mono text-xs" rows="5" placeholder="Pega aquí el JSON…"></textarea>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-primary btn-sm" data-action="import:submit">Importar</button>
          <label class="btn btn-quiet btn-sm cursor-pointer"><i class="fa-regular fa-folder-open"></i>Cargar archivo<input type="file" accept=".json,application/json" class="sr-only" data-change="import:file"></label>
        </div>
      </div>
    </details>
    <div class="flex flex-wrap items-center gap-3 text-sm"><span class="muted">¿Solo quieres probar la app?</span><button class="btn btn-soft btn-sm" data-action="demo:load"><i class="fa-solid fa-wand-magic-sparkles"></i>Cargar datos demo</button></div>`;
}

function resultsHtml() {
  if (ctx.busy) return `<div class="skeleton h-16"></div><div class="skeleton h-16"></div>`;
  if (ctx.error) return `<p class="text-sm text-danger">${esc(ctx.error)}</p>`;
  if (!ctx.results) return '';
  if (!ctx.results.length) return `<p class="text-sm muted">Sin resultados para «${esc(ctx.query)}». Prueba con el código (ej. IMEC1543) o una palabra del nombre.</p>`;
  const shown = ctx.results.slice(0, 25);
  return `<p class="text-xs muted">${ctx.results.length} materia${ctx.results.length === 1 ? '' : 's'} para «${esc(ctx.query)}»</p>` + shown.map(code => {
    const info = courseInfo(code); if (!info.secs.length) return '';
    const inB = !!itemForCode(code);
    const free = info.secs.filter(hasSeats).length;
    const cr = creditsOf(code);
    return `<div class="card p-3 flex flex-wrap items-center gap-3">
      <div class="flex-1 min-w-[12rem]"><p class="font-semibold text-sm">${esc(info.secs[0].title)}</p><p class="text-xs muted">${esc(fmtCode(code))}${cr !== null ? ` · ${cr} cr` : ''}</p>
        <div class="flex flex-wrap gap-1.5 mt-1.5"><span class="pill pill-neutral">${info.mags.length} magistral${info.mags.length === 1 ? '' : 'es'}</span>${info.comps.length ? `<span class="pill pill-neutral">${info.comps.length} complementaria${info.comps.length === 1 ? '' : 's'}</span>` : ''}<span class="pill ${free ? 'pill-ok' : 'pill-bad'}">${free} con cupo</span></div></div>
      ${inB && !ctx.slot ? `<span class="pill pill-ok"><i class="fa-solid fa-check"></i>En tu próximo semestre</span>` : `<button class="btn btn-sm btn-primary" data-action="search:add" ${data({ code })}>${ctx.slot ? 'Usar este' : 'Agregar'}</button>`}
    </div>`;
  }).join('') + (ctx.results.length > shown.length ? `<p class="text-xs muted">y ${ctx.results.length - shown.length} más; afina la búsqueda.</p>` : '');
}
const paint = () => { const el = $('#search-results'); if (el) el.innerHTML = resultsHtml(); };

async function runSearch(q) {
  const query = normalizeQuery(q);
  if (!query) return;
  if (PREVIEW) { ctx.error = 'La vista previa no puede consultar Uniandes. Usa los datos demo o pega el JSON.'; paint(); return; }
  ctx.query = query; ctx.busy = true; ctx.error = null; paint();
  try {
    const r = await searchCourses(query);
    if (r.empty) { ctx.results = []; }
    else {
      if (r.count > LARGE_RESULT && !(await confirmDialog({ title: `«${query}» trajo ${r.count} secciones`, body: '¿Cargarlas todas? Puedes afinar la búsqueda con un código, ej. IMEC1543.', confirm: 'Cargar todas' }))) { ctx.busy = false; openSearch({ q: query, slot: ctx.slot }); return; }
      const res = ingestSearch(r.raw, r.query);
      ctx.results = res.codes;
      afterDataChange();
      if (!dialogOpen()) openSearch({ q: '', slot: ctx.slot });
    }
  } catch (e) {
    ctx.error = 'No se pudo conectar con Uniandes (bloqueo del navegador o sin conexión). Importa el JSON abajo.';
  }
  ctx.busy = false; paint();
}

function addCode(code) {
  const p = activePensum();
  const title = courseInfo(code).secs[0]?.title;
  let it;
  if (ctx.slot && basketItem(ctx.slot)) { it = fillSlot(ctx.slot, code, title, creditsOf(code)); ctx.slot = null; closeDialog(); }
  else it = addToBasket({ code, title, credits: creditsOf(code), cat: p ? categoryForCode(p, code) || undefined : undefined, source: 'search' });
  toast(`${it.title} agregada a tu próximo semestre.`, 'success');
  commit();
  paint();
}

function importText(text) {
  const { sections, error } = parseImport(text);
  if (error) { toast(error, error.includes('sintaxis') ? 'error' : 'warning'); return; }
  const { added, updated, codes } = ingestSections(sections);
  const p = activePensum();
  codes.forEach(code => addToBasket({ code, title: sections.find(s => s.code === code)?.title, cat: p ? categoryForCode(p, code) || undefined : undefined, source: 'import' }));
  afterDataChange();
  toast(`${codes.length} materias importadas: ${added} secciones nuevas${updated ? `, ${updated} actualizadas` : ''}.`, 'success');
  closeDialog();
}

handle({
  'search:open': ({ q, slot }) => openSearch({ q: q || '', slot: slot || null }),
  'search:submit': (_, form) => { S.term = (form.term?.value || '').trim(); runSearch(form.q.value); },
  'search:add': ({ code }) => addCode(code),
  'import:submit': () => importText($('#import-text')?.value || ''),
  'import:file': (_, input) => {
    const f = input.files?.[0]; if (!f) return;
    if (!f.name.toLowerCase().endsWith('.json')) { toast('Selecciona un archivo .json', 'warning'); return; }
    const r = new FileReader();
    r.onload = e => importText(String(e.target.result || ''));
    r.onerror = () => toast('No se pudo leer el archivo.', 'error');
    r.readAsText(f);
    input.value = '';
  },
  'demo:load': () => {
    const { added, updated, codes } = ingestSections(parseItems(demoBannerItems()));
    const p = activePensum();
    codes.forEach(code => addToBasket({ code, title: courseInfo(code).secs[0]?.title, cat: p ? categoryForCode(p, code) || undefined : undefined, source: 'demo' }));
    afterDataChange();
    closeDialog();
    toast(`Datos demo cargados: ${codes.length} materias (${added + updated} secciones de ejemplo).`, 'success');
  },
  'dialog:close': ({ value }) => closeDialog(value ?? null),
});

export { queueFetch };
