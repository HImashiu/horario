// A PNG of the week, drawn on a canvas, to share on WhatsApp or Instagram.
import { DAYS, DAY_HEAD, timeToMinutes, fmtTime, fmtHour } from '../core/time.js';
import { kindOf } from '../core/sections.js';

const FONT = 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/** Draws the week of `sections` and returns the canvas (1200×860 CSS px, 2× pixels). */
export function drawWeek(sections, { title = 'Mi horario', subtitle = '', colorsFor, footer = 'Armador de Horarios · proyecto estudiantil' } = {}) {
  const W = 1200, H = 860, S = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  // Header
  ctx.fillStyle = '#101828'; ctx.font = `700 30px ${FONT}`; ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, title, W - 80), 40, 32);
  ctx.fillStyle = '#667085'; ctx.font = `400 16px ${FONT}`;
  ctx.fillText(fitText(ctx, subtitle, W - 80), 40, 72);
  // Range
  let mn = 7 * 60, mx = 18 * 60;
  sections.forEach(s => (s.schedules || []).forEach(sch => { mn = Math.min(mn, timeToMinutes(sch.start_time)); mx = Math.max(mx, timeToMinutes(sch.end_time)); }));
  const startH = Math.floor(mn / 60), endH = Math.ceil(mx / 60);
  const top = 130, left = 40 + 56, right = W - 40, bottom = H - 60;
  const colW = (right - left) / 6, rowH = (bottom - top - 30) / (endH - startH);
  const yOf = m => top + 30 + (m - startH * 60) * rowH / 60;
  // Grid
  ctx.font = `600 14px ${FONT}`; ctx.textAlign = 'center';
  DAY_HEAD.forEach((d, i) => { ctx.fillStyle = '#344054'; ctx.fillText(d, left + colW * i + colW / 2, top + 4); });
  ctx.textAlign = 'right'; ctx.font = `400 12px ${FONT}`;
  for (let h = startH; h <= endH; h++) {
    const y = yOf(h * 60);
    ctx.strokeStyle = '#F2F4F7'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    if (h < endH) { ctx.fillStyle = '#98A2B3'; ctx.fillText(fmtHour(h), left - 10, y - 6); }
  }
  for (let i = 0; i <= 6; i++) { const x = left + colW * i; ctx.strokeStyle = '#EAECF0'; ctx.beginPath(); ctx.moveTo(x, top + 26); ctx.lineTo(x, bottom - 30 + 30); ctx.stroke(); }
  // Blocks
  ctx.textAlign = 'left';
  sections.forEach(s => (s.schedules || []).forEach(sch => sch.days.forEach(d => {
    const di = DAYS.indexOf(d); if (di < 0) return;
    const c = colorsFor(s.code);
    const x = left + colW * di + 4, y = yOf(timeToMinutes(sch.start_time)) + 2, w = colW - 8, h = Math.max(24, yOf(timeToMinutes(sch.end_time)) - yOf(timeToMinutes(sch.start_time)) - 4);
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = c.bg; ctx.fill();
    ctx.lineWidth = kindOf(s) === 'comp' ? 2 : 1.5; ctx.setLineDash(kindOf(s) === 'comp' ? [6, 4] : []);
    ctx.strokeStyle = kindOf(s) === 'comp' ? c.sub : c.bd; ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); roundRect(ctx, x, y, w, h, 10); ctx.clip();
    ctx.fillStyle = c.sub; ctx.font = `700 11px ${FONT}`;
    ctx.fillText(fitText(ctx, `${kindOf(s) === 'mag' ? 'MAG' : 'COMP'} S${s.section}`, w - 16), x + 8, y + 7);
    ctx.fillStyle = c.tx; ctx.font = `600 13px ${FONT}`;
    if (h > 40) ctx.fillText(fitText(ctx, s.title, w - 16), x + 8, y + 23);
    ctx.fillStyle = c.sub; ctx.font = `400 12px ${FONT}`;
    if (h > 58) ctx.fillText(fitText(ctx, `${fmtTime(sch.start_time)}–${fmtTime(sch.end_time)}${sch.location && sch.location !== 'TBA' ? ' · ' + sch.location : ''}`, w - 16), x + 8, y + 41);
    ctx.restore();
  })));
  ctx.fillStyle = '#98A2B3'; ctx.font = `400 12px ${FONT}`; ctx.textAlign = 'right';
  ctx.fillText(footer, right, H - 28);
  return canvas;
}

export const canvasToBlob = canvas => new Promise(res => canvas.toBlob(b => res(b), 'image/png'));
