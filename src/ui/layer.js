// Floating UI: popovers (positioned with Floating UI in a top-level layer, so scrolling
// containers can no longer clip them), dialogs (replacing prompt/confirm, which v7 used and
// which some embedded viewers do not show) and toasts.
import { computePosition, autoUpdate, flip, shift, offset, size } from '@floating-ui/dom';
import { esc } from './dom.js';

const layer = () => document.getElementById('layer');

// ─── Popovers ────────────────────────────────────────────────
let pop = null; // { id, anchor, el, cleanup, findAnchor }
/**
 * Open a popover next to `anchor` (an element, or a virtual { getBoundingClientRect, contextElement }).
 * `anchorSelector` lets it follow a re-rendered anchor; if none is found the popover closes.
 */
export function openPopover(anchor, html, { id = 'popover', placement = 'bottom-end', className = '', anchorSelector = null, label = '' } = {}) {
  closePopover();
  const el = document.createElement('div');
  el.className = `popover ${className}`;
  el.id = id;
  el.setAttribute('role', 'dialog');
  if (label) el.setAttribute('aria-label', label);
  el.innerHTML = html;
  layer().appendChild(el);
  const state = { id, anchor, el, anchorSelector };
  const update = () => {
    let a = state.anchor;
    if (a instanceof Element && !a.isConnected) {
      const next = state.anchorSelector && document.querySelector(state.anchorSelector);
      if (!next) { closePopover(); return; }
      a = state.anchor = next;
    }
    computePosition(a, el, {
      placement, strategy: 'fixed',
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 }), size({ padding: 8, apply({ availableHeight }) { el.style.maxHeight = `${Math.max(160, availableHeight)}px`; } })],
    }).then(({ x, y }) => { el.style.left = `${x}px`; el.style.top = `${y}px`; });
  };
  state.cleanup = autoUpdate(anchor, el, update);
  pop = state;
  el.querySelector('[autofocus]')?.focus();
  return el;
}
export function togglePopover(anchor, html, opts = {}) {
  if (pop && pop.id === (opts.id || 'popover')) { closePopover(); return null; }
  return openPopover(anchor, html, opts);
}
export function closePopover(id) {
  if (!pop || (id && pop.id !== id)) return;
  pop.cleanup?.(); pop.el.remove(); pop = null;
}
export const popoverOpen = id => !!pop && (!id || pop.id === id);
export const popoverEl = () => pop?.el || null;
export function refreshPopover(id, html) { if (pop && pop.id === id) pop.el.innerHTML = html; }

// ─── Dialogs ─────────────────────────────────────────────────
let dlgResolve = null, dlgOnClose = null;
const dlg = () => document.getElementById('dlg');
/**
 * Generic modal. `html` is the body; `buttons` render in the footer, each closing the
 * dialog with its value. Resolves with that value, or null when dismissed.
 */
export function openDialog({ title, html, buttons = [], wide = false, onClose = null, labelledBy = 'dlg-title' }) {
  const d = dlg();
  if (d.open) closeDialog(null);
  d.className = `dlg ${wide ? 'dlg-wide' : ''}`;
  d.setAttribute('aria-labelledby', labelledBy);
  d.innerHTML = `<form method="dialog" class="dlg-inner" data-dialog-form>
      <header class="dlg-head"><h2 id="dlg-title" class="dlg-title">${title}</h2>
        <button type="button" class="icon-btn" data-action="dialog:close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="dlg-body">${html}</div>
      ${buttons.length ? `<footer class="dlg-foot">${buttons.map(b => `<button type="${b.submit ? 'submit' : 'button'}" value="${esc(b.value)}" class="btn ${b.kind === 'primary' ? 'btn-primary' : b.kind === 'danger' ? 'btn-danger' : 'btn-quiet'}" ${b.submit ? '' : `data-action="dialog:close" data-value="${esc(b.value)}"`}>${esc(b.label)}</button>`).join('')}</footer>` : ''}
    </form>`;
  dlgOnClose = onClose;
  d.showModal();
  (d.querySelector('[autofocus]') || d.querySelector('.dlg-foot .btn-primary, .dlg-foot .btn-danger'))?.focus();
  return new Promise(resolve => { dlgResolve = resolve; });
}
export function closeDialog(value = null) {
  const d = dlg();
  if (d.open) d.close();
  const r = dlgResolve, cb = dlgOnClose; dlgResolve = null; dlgOnClose = null;
  cb?.(value);
  r?.(value);
}
export const dialogOpen = () => dlg()?.open;
export function installDialog() {
  const d = dlg();
  d.addEventListener('cancel', e => { e.preventDefault(); closeDialog(null); });
  d.addEventListener('submit', e => {
    if (!e.target.matches('[data-dialog-form]')) return;
    e.preventDefault();
    const btn = e.submitter;
    const input = d.querySelector('[data-dialog-value]');
    closeDialog(input ? input.value : (btn?.value ?? 'ok'));
  });
  d.addEventListener('click', e => { if (e.target === d) closeDialog(null); }); // backdrop
}

export async function confirmDialog({ title, body, confirm = 'Confirmar', danger = false, cancel = 'Cancelar' }) {
  const v = await openDialog({ title: esc(title), html: `<p class="dlg-text">${esc(body)}</p>`, buttons: [{ label: cancel, value: 'cancel' }, { label: confirm, value: 'ok', kind: danger ? 'danger' : 'primary', submit: true }] });
  return v === 'ok';
}
export async function promptDialog({ title, label, value = '', confirm = 'Guardar', placeholder = '' }) {
  const v = await openDialog({
    title: esc(title),
    html: `<label class="field"><span class="field-label">${esc(label)}</span><input class="input" data-dialog-value value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus maxlength="60"></label>`,
    buttons: [{ label: 'Cancelar', value: '' }, { label: confirm, value: 'ok', kind: 'primary', submit: true }],
  });
  return v === null || v === '' ? null : v;
}

// ─── Toasts ──────────────────────────────────────────────────
const ICON = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
export function toast(msg, type = 'info', action = null) {
  const box = document.getElementById('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const t = document.createElement('div');
  t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fa-solid ${ICON[type] || ICON.info} toast-icon" aria-hidden="true"></i><span class="toast-msg">${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-action'; b.textContent = action.label;
    b.onclick = () => { t.remove(); action.fn(); };
    t.appendChild(b);
  }
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('is-in'));
  setTimeout(() => { t.classList.remove('is-in'); setTimeout(() => t.remove(), 250); }, action ? 6500 : 3800);
}
