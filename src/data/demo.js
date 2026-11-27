// Demo sections in Banner format (synthetic: invented NRCs, rooms and names).
// Ported unchanged from index.html v7 (loadSampleData); the order matters because NRCs are sequential.
export function demoBannerItems() {
  const mt = (days, b, e, bld, room) => ({ meetingTime: Object.assign({ beginTime: b, endTime: e, building: bld, room }, Object.fromEntries(days.map(d => [d, true]))) });
  let n = 70000;
  const sec = (subj, num, title, seq, type, seats, max, cr, prof, meets) => ({ nrc: String(++n), subject: subj, courseNumber: num, courseTitle: title, sequenceNumber: seq, scheduleTypeDescription: type, instructionalMethodDescription: 'Presencial', campusDescription: 'Campus Principal', seatsAvailable: seats, maximumEnrollment: max, creditHourLow: cr, faculty: [{ displayName: prof }], meetingsFaculty: meets });
  const M = 'Magistral', C = 'Complementaria', L = 'Laboratorio';
  return [
    sec('IMEC', '1543', 'Estática', '1', M, 15, 30, 3, 'Juan Casas Rodríguez', [mt(['tuesday', 'thursday'], '1100', '1220', 'ML', '201')]),
    sec('IMEC', '1543', 'Estática', '2', M, 8, 30, 3, 'Daniel Serrano Ruiz', [mt(['tuesday', 'thursday'], '1400', '1520', 'ML', '202')]),
    sec('ISIS', '1221', 'Introducción a la Programación', '1', M, 5, 25, 3, 'Juan Oyuela Matiz', [mt(['monday', 'wednesday'], '0630', '0750', 'W', '101')]),
    sec('ISIS', '1221', 'Introducción a la Programación', '10', M, 12, 25, 3, 'Fernando Calvo Silva', [mt(['tuesday', 'friday'], '0800', '0920', 'W', '102')]),
    sec('ISIS', '1221', 'Introducción a la Programación', '11', M, 20, 25, 3, 'Por asignar', [mt(['wednesday', 'friday'], '0930', '1050', 'W', '103')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '3', M, 0, 40, 3, 'Claudia Ríos Martínez', [mt(['monday', 'wednesday', 'friday'], '0900', '1020', 'SD', '301')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '31', C, 6, 20, 3, 'Monitor MATE', [mt(['tuesday'], '0700', '0820', 'SD', '305')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '32', C, 9, 20, 3, 'Monitor MATE', [mt(['thursday'], '1400', '1520', 'SD', '305')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '4', M, 11, 40, 3, 'Andrés Gómez Pardo', [mt(['tuesday', 'thursday'], '0930', '1050', 'SD', '302')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '41', C, 8, 20, 3, 'Monitor MATE', [mt(['friday'], '0930', '1050', 'SD', '306')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '42', C, 12, 20, 3, 'Monitor MATE', [mt(['monday'], '1400', '1520', 'SD', '306')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '5', M, 20, 40, 3, 'Laura Pinzón', [mt(['tuesday', 'thursday'], '1600', '1720', 'SD', '303')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '51', C, 15, 20, 3, 'Monitor MATE', [mt(['wednesday'], '1600', '1720', 'SD', '307')]),
    sec('MATE', '1203', 'Cálculo Diferencial', '52', C, 4, 20, 3, 'Monitor MATE', [mt(['saturday'], '0900', '1020', 'SD', '307')]),
    sec('QUIM', '1103', 'Química', '1', M, 18, 35, 3, 'Laura Méndez', [mt(['wednesday', 'friday'], '1100', '1220', 'Q', '305')]),
    sec('QUIM', '1103', 'Química', '11', L, 6, 18, 3, 'Lab. Química', [mt(['wednesday'], '1400', '1550', 'Q', 'LAB1')]),
    sec('QUIM', '1103', 'Química', '12', L, 4, 18, 3, 'Lab. Química', [mt(['thursday'], '1100', '1250', 'Q', 'LAB1')]),
    sec('QUIM', '1103', 'Química', '13', L, 2, 18, 3, 'Lab. Química', [mt(['friday'], '1400', '1550', 'Q', 'LAB2')]),
    sec('QUIM', '1103', 'Química', '2', M, 9, 35, 3, 'Jorge Patiño', [mt(['monday', 'wednesday'], '1600', '1720', 'Q', '306')]),
    sec('QUIM', '1103', 'Química', '21', L, 10, 18, 3, 'Lab. Química', [mt(['tuesday'], '1400', '1550', 'Q', 'LAB1')]),
    sec('QUIM', '1103', 'Química', '22', L, 7, 18, 3, 'Lab. Química', [mt(['saturday'], '0800', '0950', 'Q', 'LAB2')]),
    sec('FISI', '1518', 'Física 1', '2', M, 22, 45, 3, 'Carlos Ávila', [mt(['monday', 'wednesday'], '1230', '1350', 'O', '105')]),
    sec('FISI', '1518', 'Física 1', '21', C, 10, 25, 3, 'Monitor FISI', [mt(['friday'], '1230', '1350', 'O', '201')]),
    sec('FISI', '1518', 'Física 1', '3', M, 14, 45, 3, 'Paula Ruiz', [mt(['wednesday', 'friday'], '1230', '1350', 'O', '106')]),
    sec('FISI', '1518', 'Física 1', '31', C, 9, 20, 3, 'Monitor FISI', [mt(['thursday'], '1400', '1520', 'O', '202')]),
    sec('FISI', '1518', 'Física 1', '32', C, 11, 20, 3, 'Monitor FISI', [mt(['monday'], '0700', '0820', 'O', '202')]),
    sec('FISI', '1518', 'Física 1', '33', C, 0, 20, 3, 'Monitor FISI', [mt(['tuesday'], '0930', '1050', 'O', '203')]),
  ];
}
