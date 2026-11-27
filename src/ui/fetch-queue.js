// Loads sections from the Uniandes API one course at a time (300 ms apart, like v7).
import { S, ingestSections, afterDataChange } from '../state/store.js';
import { fetchRaw, mapUniandesSection, normalizeQuery } from '../data/uniandes-api.js';
import { ui, PREVIEW } from './state.js';
import { toast } from './layer.js';

const queue = [];
let running = false, previewWarned = false, lastFailToast = 0;
export const LARGE_RESULT = 150;

export function previewNotice() {
  if (previewWarned) return;
  previewWarned = true;
  toast('Esta vista previa no puede consultar Uniandes. Carga los datos demo o importa el JSON desde «Buscar».', 'info');
}

/** Queue exact course codes; their sections load in the background. */
export function queueFetch(codes) {
  if (PREVIEW) { previewNotice(); return; }
  codes.forEach(c => { if (c && !queue.includes(c) && !ui.loadingCodes.has(c)) { queue.push(c); ui.loadingCodes.add(c); } });
  run();
}
async function run() {
  if (running) return;
  running = true;
  let failed = 0, empty = 0;
  while (queue.length) {
    const code = queue.shift();
    try {
      const raw = await fetchRaw(code, S.term);
      if (!raw.length) empty++;
      else ingestSections(raw.map(mapUniandesSection), { exactCodes: [code] });
    } catch { failed++; }
    ui.loadingCodes.delete(code);
    afterDataChange();
    if (queue.length) await new Promise(r => setTimeout(r, 300));
  }
  running = false;
  if (failed && Date.now() - lastFailToast > 15000) { lastFailToast = Date.now(); toast('No se pudo conectar con Uniandes para cargar secciones. Puedes importar el JSON desde «Buscar».', 'warning'); }
  else if (empty) toast(`${empty} materia${empty > 1 ? 's' : ''} sin secciones en el periodo consultado.`, 'info');
}

/** Free search (code or words). Returns { codes, empty, count } or throws on network errors. */
export async function searchCourses(query) {
  const q = normalizeQuery(query);
  const raw = await fetchRaw(q, S.term);
  if (!raw.length) return { codes: [], empty: true, count: 0, raw };
  return { raw, count: raw.length, query: q };
}
export function ingestSearch(raw, query) {
  const exact = /^[A-Z]{4}\d{4}$/.test(query) ? [query] : [];
  return ingestSections(raw.map(mapUniandesSection), { exactCodes: exact });
}

/** Refresh seats for every course in "Mis materias". */
export async function refreshAll(manual) {
  if (PREVIEW) { if (manual) previewNotice(); return; }
  const codes = S.basket.map(b => b.code).filter(Boolean);
  if (!codes.length) { if (manual) toast('No hay materias para actualizar.', 'info'); return; }
  queueFetch(codes);
  ui.lastRefresh = new Date();
}
