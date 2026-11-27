// UI-only state (not persisted) and helpers shared by the views.
import { S, itemForCode, basketItem } from '../state/store.js';
import { getPensum, categoryForCode, toneOf } from '../core/pensum.js';
import { courseColors, COURSE_PALETTE } from './tones.js';

export const ui = {
  view: 'pensum',
  focusKey: null, panelTab: 'combos', onlyFree: false, onlySeats: false, showOptions: true,
  listFilter: 'all', hoverKey: null, preview: null, pinned: null, mobilePane: 'list',
  mobileDay: Math.min(Math.max(new Date().getDay() - 1, 0), 5),
  pensumHover: null, electiveSearch: null, lastSearch: null, dragIds: null,
  loadingCodes: new Set(), slotPopup: null,
};

export const PREVIEW = typeof window !== 'undefined' && !!window.__PREVIEW__;
export const activePensum = () => getPensum(S.profile.program);

/** Pensum category of a basket item or code, if the active pensum knows it. */
export function catFor(code, item = itemForCode(code)) {
  if (item?.cat) return item.cat;
  const p = activePensum();
  return p ? categoryForCode(p, code) : null;
}
export function toneForItem(item) {
  const p = activePensum();
  const cat = item?.cat || (item?.code ? catFor(item.code, item) : null);
  return p && cat ? toneOf(p, cat) : 'slate';
}
/** Schedule colours for a course code (or basket key): v7's pastel palette, by basket colour. */
export function colorsFor(codeOrKey) {
  const item = itemForCode(codeOrKey) || basketItem(codeOrKey);
  if (item) return COURSE_PALETTE[(item.color ?? 0) % COURSE_PALETTE.length];
  let h = 0; for (const ch of String(codeOrKey)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_PALETTE[h % COURSE_PALETTE.length];
}
/** The pensum colour of a course (used where the pensum is shown). */
export function pensumColorFor(codeOrKey) {
  const item = itemForCode(codeOrKey) || basketItem(codeOrKey);
  return courseColors(toneForItem(item || { code: codeOrKey }), 0);
}
