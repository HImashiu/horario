// Requirement expressions used by the pensum data.
//
// A requirement list (`req` or `coreq`) is an AND of terms. Each term is one of:
//   "MATE1203"                          a single course or external requirement
//   ["IMEC2540", "IMEC2522"]            any one of these (an OR group)
//   { count: 2, from: ["CPO1", "CPO2"] } at least `count` courses taken from the
//                                       options of these groups (or plain codes)

/** Expand a `{count, from}` term into the course codes it can be satisfied with. */
export function countOptions(term, groups = {}) {
  const out = [];
  for (const id of term.from || []) {
    if (groups[id]) out.push(...groups[id].options);
    else out.push(id);
  }
  return [...new Set(out)];
}

/** Every code a term mentions. */
export function termCodes(term, groups = {}) {
  if (typeof term === 'string') return [term];
  if (Array.isArray(term)) return term.slice();
  if (term && typeof term === 'object') return countOptions(term, groups);
  return [];
}

/** All codes mentioned by a requirement list. */
export function listCodes(list, groups = {}) {
  return [...new Set((list || []).flatMap(t => termCodes(t, groups)))];
}

/**
 * Whether one term is satisfied.
 * `isMet(code)` says whether a single code counts (passed, assumed, or — for
 * corequisites — taken at the same time).
 */
export function isTermMet(term, isMet, groups = {}) {
  if (typeof term === 'string') return !!isMet(term);
  if (Array.isArray(term)) return term.some(c => isMet(c));
  if (term && typeof term === 'object') {
    const n = countOptions(term, groups).filter(c => isMet(c)).length;
    return n >= (term.count || 1);
  }
  return true;
}

/** Terms of a list that are not satisfied. */
export function unmetTerms(list, isMet, groups = {}) {
  return (list || []).filter(t => !isTermMet(t, isMet, groups));
}

/** "MATE1203" → "MATE 1203"; anything that is not a course code is returned as is. */
export function fmtCode(code) {
  const m = String(code).match(/^([A-Z]{4})-?\s?(\d{4}[A-Z]?)$/);
  return m ? `${m[1]} ${m[2]}` : String(code);
}

/** Human text for one term. `label(code)` may turn external ids into names. */
export function formatTerm(term, groups = {}, label = fmtCode) {
  if (typeof term === 'string') return label(term);
  if (Array.isArray(term)) return term.length > 1 ? `(${term.map(label).join(' o ')})` : label(term[0]);
  if (term && typeof term === 'object') {
    const names = (term.from || []).map(id => groups[id]?.short || label(id));
    const n = term.count || 1;
    return `${n} curso${n > 1 ? 's' : ''} de ${names.join(' o ')}`;
  }
  return '';
}
