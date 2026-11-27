// Uniandes public course API (ofertadecursos). Ported from index.html v7 (mapUniandesSeccion …).
// The API returns most numbers as strings ("maxenrol": "50"); v7 checked `typeof === 'number'`
// and showed seats as N/A. Numbers are parsed here.

export const UNIANDES_API = 'https://ofertadecursos.uniandes.edu.co/api/courses';
const DAY_MAP = { l: 'Lunes', m: 'Martes', i: 'Miércoles', j: 'Jueves', v: 'Viernes', s: 'Sábado', d: 'Domingo' };

export const normCode = c => String(c || '').replace(/[\s-]+/g, '').toUpperCase();
const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);

export function fmtMilitaryTime(t) {
  if (t === null || t === undefined || t === '') return '';
  const s = String(t).padStart(4, '0');
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/** Meeting dates, if the API sends them ("2027-01-25", "2027-01-25T00:00:00" or "25/01/2027"). */
function apiDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Magistral = 4-character course number; anything else (e.g. "1221C") is a complementaria of the base code. */
export function mapUniandesSection(item) {
  const courseRaw = String(item.course || '');
  const magistral = courseRaw.length === 4;
  const baseCourse = magistral ? courseRaw : courseRaw.replace(/[A-Za-z]+$/, '');
  const code = normCode(`${item.class || ''}${baseCourse}`);
  const nrc = String(item.nrc);
  let instructors = (item.instructors || []).map(p => p && p.name).filter(Boolean);
  if (!instructors.length) instructors = ['Por asignar'];
  const schedules = [];
  (item.schedules || []).forEach(sch => {
    const days = []; Object.keys(DAY_MAP).forEach(k => { if (sch[k]) days.push(DAY_MAP[k]); });
    const start = fmtMilitaryTime(sch.time_ini), end = fmtMilitaryTime(sch.time_fin);
    const dateStart = apiDate(sch.date_ini), dateEnd = apiDate(sch.date_fin);
    if (days.length && start && end) schedules.push({ days, start_time: start, end_time: end, location: sch.classroom || 'TBA', ...(dateStart && dateEnd ? { date_start: dateStart, date_end: dateEnd } : {}) });
  });
  const cap = num(item.maxenrol), enrolled = num(item.enrolled), avail = num(item.seatsavail);
  return {
    id: `uniandes-${nrc}`, nrc, code, title: titleCase(item.title || 'Sin título'), section: String(item.section),
    schedule_type: magistral ? 'Magistral' : 'Complementaria', instructional_method: 'Presencial', campus: item.campus || 'Campus Principal',
    seats_available: avail !== null ? avail : (cap !== null && enrolled !== null ? Math.max(0, cap - enrolled) : 'N/A'),
    capacity: cap ?? 'N/A', credits: num(item.credits) ?? 'N/A', instructors, schedules, enabled: true,
    term: item.term ? String(item.term) : undefined, ptrm: item.ptrm ? String(item.ptrm) : undefined, ptrmdesc: item.ptrmdesc || undefined,
  };
}

// The API sends titles in capitals ("CÁLCULO DIFERENCIAL"); show them like the pensum does.
const SMALL = new Set(['a', 'al', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'u', 'un', 'una', 'y', 'con']);
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;
export function titleCase(t) {
  const s = String(t).trim();
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().split(/(\s+)/).map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    if (ROMAN.test(w)) return w.toUpperCase();
    if (i > 0 && SMALL.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('');
}

export function normalizeQuery(q) {
  const m = String(q).trim().match(/^([A-Za-z]{4})\s*-?\s*(\d{4}[A-Za-z]?)$/);
  return m ? (m[1] + m[2]).toUpperCase() : String(q).trim();
}

export const searchUrl = (query, term = '') =>
  `${UNIANDES_API}?term=${encodeURIComponent(term || '')}&ptrm=&prefix=&attr=&nameInput=${encodeURIComponent(normalizeQuery(query).replace(/\s+/g, '_'))}`;

/** Fetch raw items for a query. Throws on network/CORS errors. */
export async function fetchRaw(query, term = '', fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(searchUrl(query, term));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
