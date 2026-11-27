// The pensum palette, sampled from the 2020 IMEC pensum PDF. `ink` is the same hue darkened
// only as much as needed for WCAG AA text contrast (see scripts/palette.mjs).
export const TONES = {
  yellow: { fill: '#E6D433', ink: '#E6D433', text: '#23252F' },
  magenta: { fill: '#D61F84', ink: '#D61F84', text: '#FFFFFF' },
  teal: { fill: '#19A1B1', ink: '#14808D', text: '#FFFFFF' },
  orange: { fill: '#F36020', ink: '#D0470B', text: '#FFFFFF' },
  crimson: { fill: '#B3252F', ink: '#B3252F', text: '#FFFFFF' },
  green: { fill: '#12AD6D', ink: '#0E8654', text: '#FFFFFF' },
  gray: { fill: '#969B9C', ink: '#717677', text: '#FFFFFF' },
  amber: { fill: '#F0A030', ink: '#F0A030', text: '#23252F' },
  slate: { fill: '#5A6178', ink: '#4F5569', text: '#FFFFFF' },
};

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const toHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
function hsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgb([h, s, l]) {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const shift = (h, dl) => { const [a, b, c] = hsl(hex(h)); return toHex(rgb([a, b, Math.max(0, Math.min(1, c + dl))])); };
const mix = (h, w) => { const c = hex(h); return toHex(c.map(v => v + (1 - v) * w)); };

// v7's per-course palette for the schedule (pastel blocks), kept as it was.
export const COURSE_PALETTE = [
  { dot: '#10b981', bg: '#ecfdf5', bd: '#6ee7b7', tx: '#064e3b', sub: '#047857' },
  { dot: '#8b5cf6', bg: '#f5f3ff', bd: '#c4b5fd', tx: '#4c1d95', sub: '#6d28d9' },
  { dot: '#0ea5e9', bg: '#f0f9ff', bd: '#7dd3fc', tx: '#0c4a6e', sub: '#0369a1' },
  { dot: '#f59e0b', bg: '#fffbeb', bd: '#fcd34d', tx: '#78350f', sub: '#b45309' },
  { dot: '#3b82f6', bg: '#eff6ff', bd: '#93c5fd', tx: '#1e3a8a', sub: '#1d4ed8' },
  { dot: '#f43f5e', bg: '#fff1f2', bd: '#fda4af', tx: '#881337', sub: '#be123c' },
  { dot: '#14b8a6', bg: '#f0fdfa', bd: '#5eead4', tx: '#134e4a', sub: '#0f766e' },
  { dot: '#f97316', bg: '#fff7ed', bd: '#fdba74', tx: '#7c2d12', sub: '#c2410c' },
];

/**
 * Colours for one course on the calendar. Courses that share a pensum colour get
 * different shades of it (0, 1, 2 …) so they stay distinguishable.
 * Light text tones only get darker (contrast grows); dark-text tones alternate.
 */
export function courseColors(tone = 'slate', shade = 0) {
  const t = TONES[tone] || TONES.slate;
  const steps = t.text === '#FFFFFF' ? [0, -0.07, -0.13, -0.04, -0.1] : [0, -0.06, 0.05, -0.11, 0.09];
  const bg = shift(t.ink, steps[shade % steps.length]);
  return {
    tone, bg, text: t.text, fill: t.fill,
    sub: t.text === '#FFFFFF' ? 'rgba(255,255,255,.82)' : 'rgba(35,37,47,.72)',
    soft: mix(t.fill, 0.86), line: t.text === '#FFFFFF' ? bg : shift(t.ink, -0.22),
  };
}
