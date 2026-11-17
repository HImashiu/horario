module.exports = {
  content: ['./index.html'],
  theme: { extend: {
    fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    colors: { brand: { 50:'#eef2ff', 100:'#e0e7ff', 200:'#c7d2fe', 500:'#3b5bfd', 600:'#2f4bf0', 700:'#2539c9' } },
    boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)', pop: '0 12px 32px -8px rgba(16,24,40,.18)' }
  } }
};
