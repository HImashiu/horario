// "Avísame si se abre cupo": the sections a student watches, and which of them just opened.
// There is no server: the page checks while it is open (see ui/watch.js).

const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? null : Number(v));
export const seatsOf = s => num(s?.seats_available);

/** A watch for a full section. */
export function makeWatch(s, now = Date.now()) {
  return { nrc: String(s.nrc), code: s.code, section: String(s.section), kind: s.schedule_type || '', title: s.title || '', seats: seatsOf(s), addedAt: now, checkedAt: null, openedAt: null };
}

/**
 * Compares the watches with the sections now loaded (`findByNrc`). Returns new watch objects and
 * the ones that went from no seats to some: each opening is reported once, and again only after
 * the section fills up and opens again.
 */
export function updateWatches(watches, findByNrc, now = Date.now()) {
  const opened = [];
  const next = watches.map(w => {
    const s = findByNrc(w.nrc);
    if (!s) return w;
    const seats = seatsOf(s);
    if (seats === null) return { ...w, checkedAt: now };
    const out = { ...w, seats, checkedAt: now };
    if (seats > 0 && !(w.seats > 0)) { out.openedAt = now; opened.push({ watch: out, section: s }); }
    if (seats <= 0) out.openedAt = null;
    return out;
  });
  return { watches: next, opened };
}
