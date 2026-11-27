module.exports = {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 500: '#3b5bfd', 600: '#2f4bf0', 700: '#2539c9' },
        navy: { DEFAULT: 'var(--navy)', 2: 'var(--navy-2)', 3: 'var(--navy-3)' },
        ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)',
        line: { DEFAULT: 'var(--line)', 2: 'var(--line-2)' }, wash: 'var(--wash)', paper: 'var(--paper)',
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        ok: { DEFAULT: 'var(--ok)', soft: 'var(--ok-soft)' },
        warn: { DEFAULT: 'var(--warn)', soft: 'var(--warn-soft)' },
      },
    },
    boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)', pop: '0 12px 32px -8px rgba(16,24,40,.18)' },
  },
};
