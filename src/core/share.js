// Share links without a server: the schedule travels inside the link itself.
//   #ver=<data>    a person's schedule (name, draft name and minimal section data)
//   #grupo=<data>  sections chosen together with "Armar juntos"
// <data> is compact JSON, deflate-raw compressed and base64url encoded ("z" prefix), or plain
// base64url JSON ("j" prefix) where CompressionStream is not available.

const DAY_BITS = { Lunes: 1, Martes: 2, 'Miércoles': 4, Jueves: 8, Viernes: 16, 'Sábado': 32, Domingo: 64 };
const BIT_DAYS = Object.entries(DAY_BITS);
const hhmm = t => String(t || '').replace(':', '').padStart(4, '0');
const unhhmm = s => `${String(s).padStart(4, '0').slice(0, 2)}:${String(s).padStart(4, '0').slice(2, 4)}`;
const kindOf = s => { const t = (s.schedule_type || '').toLowerCase(); return (t.includes('complementaria') || t.includes('laboratorio')) ? 'c' : 'm'; };

/** Section → compact array: [code, title, nrc, section, kind, schedules, credits, ptrm] */
export function packSection(s) {
  const sch = (s.schedules || []).map(x => [x.days.reduce((a, d) => a | (DAY_BITS[d] || 0), 0), hhmm(x.start_time), hhmm(x.end_time), x.location && x.location !== 'TBA' ? x.location : '']);
  const out = [s.code, s.title, String(s.nrc), String(s.section), kindOf(s), sch];
  const cr = Number(s.credits);
  if (!isNaN(cr) || s.ptrm) out.push(isNaN(cr) ? null : cr);
  if (s.ptrm) out.push(String(s.ptrm));
  return out;
}
/** Compact array → a section object the app understands. Ids are by NRC so they merge with API data. */
export function unpackSection(a) {
  const [code, title, nrc, section, kind, sch = [], credits = null, ptrm] = a;
  return {
    id: `uniandes-${nrc}`, nrc: String(nrc), code, title, section: String(section),
    schedule_type: kind === 'c' ? 'Complementaria' : 'Magistral', instructional_method: 'Presencial', campus: 'Campus Principal',
    seats_available: 'N/A', capacity: 'N/A', credits: credits ?? 'N/A', instructors: ['—'], enabled: true, shared: true,
    ...(ptrm ? { ptrm } : {}),
    schedules: sch.map(([bits, start, end, loc]) => ({ days: BIT_DAYS.filter(([, b]) => bits & b).map(([d]) => d), start_time: unhhmm(start), end_time: unhhmm(end), location: loc || 'TBA' })),
  };
}

const toB64u = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64u = str => { const b = str.replace(/-/g, '+').replace(/_/g, '/'); const s = atob(b + '==='.slice((b.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); };
const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

export async function encodeShare(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (canCompress()) { try { return 'z' + toB64u(await pipe(bytes, new CompressionStream('deflate-raw'))); } catch { /* fall back */ } }
  return 'j' + toB64u(bytes);
}
export async function decodeShare(str) {
  const s = String(str || '').trim();
  if (!s || !/^[zj][A-Za-z0-9_-]+$/.test(s)) throw new Error('El link está incompleto o dañado.');
  let bytes = fromB64u(s.slice(1));
  if (s[0] === 'z') {
    if (!canCompress()) throw new Error('Este navegador no puede abrir el link.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  const obj = JSON.parse(new TextDecoder().decode(bytes));
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.s)) throw new Error('El link no contiene un horario.');
  return obj;
}

/** Payload for "#ver=": who shares, which draft, and its sections. */
export const schedulePayload = ({ id, name, draft, program, sections }) => ({ v: 1, t: 'ver', i: id, n: name, d: draft, p: program || null, at: Date.now(), s: sections.map(packSection) });
/** Payload for "#grupo=": the sections chosen together, and who took part. */
export const groupPayload = ({ id, name, members, sections }) => ({ v: 1, t: 'grupo', i: id, n: name, m: members, at: Date.now(), s: sections.map(packSection) });

/** Reads a decoded payload into { kind, id, name, draft, program, members, at, sections }. */
export function readPayload(obj) {
  return { kind: obj.t === 'grupo' ? 'grupo' : 'ver', id: String(obj.i || ''), name: String(obj.n || 'Sin nombre').slice(0, 40), draft: String(obj.d || '').slice(0, 60), program: obj.p || null, members: Array.isArray(obj.m) ? obj.m.map(String).slice(0, 12) : [], at: Number(obj.at) || null, sections: obj.s.map(unpackSection) };
}

/** "#ver=…" or "#grupo=…" from a hash or a full link; null when it is not a share link. */
export function parseShareHash(text) {
  const m = String(text || '').match(/#(ver|grupo)=([zj][A-Za-z0-9_-]+)/);
  return m ? { kind: m[1], data: m[2] } : null;
}
