// JSON import (Banner "searchResults", the Uniandes API, or this app's own export).
// Ported from index.html v7 (processRawJSON) as a pure function.
import { mapUniandesSection, normCode, fmtMilitaryTime, titleCase } from './uniandes-api.js';

const BANNER_DAYS = [['monday', 'Lunes'], ['tuesday', 'Martes'], ['wednesday', 'Miércoles'], ['thursday', 'Jueves'], ['friday', 'Viernes'], ['saturday', 'Sábado'], ['sunday', 'Domingo']];

/** @returns {{ sections: object[], error: string | null }} */
export function parseImport(text) {
  const input = String(text || '').trim();
  if (!input) return { sections: [], error: 'Pega un JSON o carga un archivo primero.' };
  let parsed;
  try { parsed = JSON.parse(input); } catch { return { sections: [], error: 'Error de sintaxis JSON. Revisa el texto.' }; }
  const rawList = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? (parsed.data || parsed.courses || [parsed]) : []);
  if (!Array.isArray(rawList) || !rawList.length) return { sections: [], error: 'No se encontraron registros en el JSON.' };
  const sections = parseItems(rawList);
  return sections.length ? { sections, error: null } : { sections, error: 'No se reconoció ninguna sección en el JSON.' };
}

export function parseItems(rawList) {
  const out = [];
  rawList.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    // This app's own format
    if (item.nrc && item.code && Array.isArray(item.schedules)) {
      out.push({ ...item, code: normCode(item.code), nrc: String(item.nrc), id: item.id || `sec-${item.nrc}`, enabled: item.enabled ?? true, credits: item.credits ?? 'N/A', instructors: item.instructors?.length ? item.instructors : ['Por asignar'], schedule_type: item.schedule_type || 'Magistral', section: String(item.section ?? '1') });
      return;
    }
    // Uniandes API
    if (item.course !== undefined && item.class !== undefined && item.nrc) { out.push(mapUniandesSection(item)); return; }
    // Banner
    const code = normCode((item.subject || '') + (item.courseNumber || '') || item.code || item.subjectCourse || 'CURSO');
    const nrc = String(item.courseReferenceNumber || item.nrc || index);
    let instructors = [];
    if (Array.isArray(item.faculty)) instructors = item.faculty.map(f => f.displayName || f.fullName || f.name).filter(Boolean);
    else if (Array.isArray(item.instructors)) instructors = item.instructors;
    if (!instructors.length) instructors = ['Por asignar'];
    const schedules = [];
    (item.meetingsFaculty || item.meetings || []).forEach(m => {
      const t = m.meetingTime || m;
      const days = BANNER_DAYS.filter(([k]) => t[k]).map(([, v]) => v);
      let start = t.beginTime || t.startTime || '', end = t.endTime || '';
      if (start && !String(start).includes(':')) start = fmtMilitaryTime(start);
      if (end && !String(end).includes(':')) end = fmtMilitaryTime(end);
      const building = t.building || t.buildingDescription || '', room = t.room || t.roomNumber || '';
      if (days.length && start && end) schedules.push({ days, start_time: start, end_time: end, location: (building || room) ? `${building} ${room}`.trim() : 'TBA' });
    });
    out.push({
      id: `sec-${nrc}`, nrc, code, title: titleCase(item.courseTitle || item.title || 'Sin título'),
      section: String(item.sequenceNumber || item.section || '1'),
      schedule_type: item.scheduleTypeDescription || item.scheduleType || 'Magistral',
      instructional_method: item.instructionalMethodDescription || item.instructionalMethod || 'Presencial',
      campus: item.campusDescription || item.campus || 'Campus Principal',
      seats_available: item.seatsAvailable ?? item.openSeats ?? 'N/A',
      capacity: item.maximumEnrollment ?? item.capacity ?? 'N/A',
      credits: item.creditHourLow ?? item.creditHours ?? item.credits ?? 'N/A',
      instructors, schedules, enabled: true,
    });
  });
  return out;
}
