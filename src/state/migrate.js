// Saved-state migrations. v7 (and the older v6 without a basket) become v8.
import { DEFAULT_RULES } from '../core/score.js';

export const STATE_VERSION = 8;

const V7_RULE_IDS = {
  'rule-monday-free': ['mondayFree', Boolean], 'rule-tuesday-late': ['tuesdayLate', Boolean],
  'rule-no-early': ['noEarly', Boolean], 'rule-no-early-hour': ['earlyHour', v => parseInt(v, 10)],
  'rule-no-late': ['noLate', Boolean], 'rule-no-late-hour': ['lateHour', v => parseInt(v, 10)],
  'credit-target': ['creditTarget', v => parseFloat(v)], 'rule-strict-pairing': ['strictPairing', Boolean],
  'rule-gen-seats': ['genOnlySeats', Boolean],
};

export function emptyState() {
  return {
    v: STATE_VERSION, sections: [], basket: [], drafts: [], currentDraftId: null,
    rules: { ...DEFAULT_RULES }, autoRefresh: { on: false, minutes: 5 }, term: '',
    profile: { program: null, route: null, emphasis: null, passed: [], externalMet: [], name: '', shareId: null },
    prefs: { pensumMode: 'plan', overlay: [] },
    // Friends' schedules received through share links (kept only in this browser).
    friends: [],
    // Seat alerts: full sections to check while the page is open.
    watch: [],
  };
}

/** Turns any saved object into a v8 state. Returns { state, migratedFrom }. */
export function migrate(saved) {
  const base = emptyState();
  if (!saved || typeof saved !== 'object') return { state: base, migratedFrom: null };
  if (saved.v === STATE_VERSION) {
    return { state: { ...base, ...saved, rules: { ...base.rules, ...saved.rules }, profile: { ...base.profile, ...saved.profile }, prefs: { ...base.prefs, ...saved.prefs }, autoRefresh: { ...base.autoRefresh, ...saved.autoRefresh } }, migratedFrom: null };
  }
  // v7 / v6
  const st = base;
  st.sections = Array.isArray(saved.cleanedCourses) ? saved.cleanedCourses : [];
  st.basket = Array.isArray(saved.basket) ? saved.basket : [];
  if (!Array.isArray(saved.basket)) {
    // v6 had no basket: every loaded course was "mine".
    const seen = new Set();
    st.sections.forEach(s => { if (seen.has(s.code)) return; seen.add(s.code); st.basket.push({ key: s.code, code: s.code, title: s.title, credits: null, elective: false, color: st.basket.length }); });
  }
  st.drafts = Array.isArray(saved.drafts) ? saved.drafts : [];
  st.drafts.forEach(d => { d.locked ||= []; d.skipped ||= []; d.sectionIds ||= []; });
  st.currentDraftId = saved.currentDraftId || null;
  // v7 saved its form controls by element id. Those values were the user's effective rules
  // (v7's own defaults included), so they are kept as they were.
  const raw = saved.rules || {};
  const rules = { ...st.rules };
  if (Object.keys(raw).length) {
    rules.mondayFree = false; rules.tuesdayLate = false; rules.noEarly = false; rules.noLate = false;
    for (const [id, [key, cast]] of Object.entries(V7_RULE_IDS)) if (id in raw) rules[key] = cast(raw[id]);
    if ('auto-refresh-toggle' in raw) st.autoRefresh.on = !!raw['auto-refresh-toggle'];
    if ('auto-refresh-interval' in raw) st.autoRefresh.minutes = parseFloat(raw['auto-refresh-interval']) || 5;
  }
  // v7's "Lunes libre" and "Martes después de 9:30" become a free day and a soft busy block,
  // which score exactly as before (see core/score.js).
  rules.freeDays = rules.mondayFree ? ['Lunes'] : [];
  rules.busy = rules.tuesdayLate ? [{ id: 'v7-tuesday', day: 'Martes', start: '00:00', end: '09:30', soft: true, label: 'Martes antes de 9:30' }] : [];
  rules.mondayFree = false; rules.tuesdayLate = false;
  if (!(rules.earlyHour >= 5)) rules.earlyHour = DEFAULT_RULES.earlyHour;
  if (!(rules.lateHour >= 10)) rules.lateHour = DEFAULT_RULES.lateHour;
  if (!(rules.creditTarget > 0)) rules.creditTarget = DEFAULT_RULES.creditTarget;
  st.rules = rules;
  const major = saved.prefs?.pensumMajor;
  if (major === 'imec' || major === 'fisica') st.profile.program = major;
  return { state: st, migratedFrom: saved.v || 6 };
}
