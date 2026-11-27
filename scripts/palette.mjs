// Derives the accessible "ink" shade of each pensum colour: the lightest version of
// the same hue whose contrast with its text colour reaches WCAG AA (4.5:1).
// Usage: node scripts/palette.mjs
export const FILLS = {
  yellow: '#E6D433', magenta: '#D61F84', teal: '#19A1B1', orange: '#F36020',
  crimson: '#B3252F', green: '#12AD6D', gray: '#969B9C', amber: '#F0A030', navy: '#282C44'
};
export const DARK_TEXT = '#23252F';
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const toHex = rgb => '#' + rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const lin = v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const luminance = h => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
/** Darken `fill` (same hue and saturation) until white text reaches `min` contrast. */
export function inkFor(fill, min = 4.5) {
  const [h, s, l0] = rgbToHsl(hex(fill));
  for (let l = l0; l > 0; l -= 0.005) { const c = toHex(hslToRgb([h, s, l])); if (contrast(c, '#FFFFFF') >= min) return c; }
  return '#000000';
}
export function derive() {
  const out = {};
  for (const [tone, fill] of Object.entries(FILLS)) {
    const darkOk = contrast(fill, DARK_TEXT) >= 4.5 && luminance(fill) > 0.35;
    const ink = darkOk ? fill : inkFor(fill);
    out[tone] = { fill, ink, text: darkOk ? DARK_TEXT : '#FFFFFF', contrast: +contrast(ink, darkOk ? DARK_TEXT : '#FFFFFF').toFixed(2) };
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) console.table(derive());
