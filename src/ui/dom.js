// Small DOM helpers and event delegation. Markup declares behaviour with data attributes
// (data-action, data-change, data-input, data-submit, data-hover) instead of inline onclick
// strings, which removes v7's quoting helper (jsq) and keeps handlers in modules.

export const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
/** data-* attributes from an object: data({ key: 'MATE1203' }) → data-key="MATE1203" */
export const data = obj => Object.entries(obj).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
export const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
export const isWide = () => window.matchMedia('(min-width: 1024px)').matches;
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const handlers = new Map();
export function handle(map) { for (const [k, v] of Object.entries(map)) handlers.set(k, v); }
const call = (name, el, e) => { const fn = handlers.get(name); if (fn) fn(el.dataset, el, e); };

export function installDelegation(root = document) {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    call(el.dataset.action, el, e);
  });
  root.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) call(el.dataset.change, el, e); });
  root.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el) call(el.dataset.input, el, e); });
  root.addEventListener('submit', e => { const el = e.target.closest('[data-submit]'); if (el) { e.preventDefault(); call(el.dataset.submit, el, e); } });
  root.addEventListener('keydown', e => {
    const el = e.target.closest('[data-keydown]');
    if (el) call(el.dataset.keydown, el, e);
  });
  // Hover: one "current" element; leaving it calls `<name>:leave`. Elements are compared by
  // data-hover + data-hkey, so a re-render under a still pointer does not flicker.
  let hoverEl = null, hoverKey = null;
  const keyOf = el => el ? `${el.dataset.hover}|${el.dataset.hkey || ''}` : null;
  const setHover = (el, e) => {
    const k = keyOf(el);
    if (k === hoverKey) { hoverEl = el; return; }
    if (hoverEl) call(hoverEl.dataset.hover + ':leave', hoverEl, e);
    hoverEl = el; hoverKey = k;
    if (el) call(el.dataset.hover, el, e);
  };
  root.addEventListener('mouseover', e => setHover(e.target.closest('[data-hover]'), e));
  root.addEventListener('mouseout', e => { if (!e.relatedTarget) setHover(null, e); });
  root.addEventListener('focusin', e => { const el = e.target.closest('[data-hover]'); if (el) setHover(el, e); });
  root.addEventListener('focusout', e => { if (!e.relatedTarget?.closest?.('[data-hover]')) setHover(null, e); });
  // Drag sources: data-drag="<ids>" (comma-separated section ids)
  root.addEventListener('dragstart', e => { const el = e.target.closest('[data-drag]'); if (el) call('drag:start', el, e); });
  root.addEventListener('dragend', e => { const el = e.target.closest('[data-drag]'); if (el) call('drag:end', el, e); });
}
