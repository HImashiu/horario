// Storage behind one small interface, so a cloud backend can replace it later.
// Every call is wrapped: private windows and blocked storage must not break the app.

export function createLocalStore(ls = globalThis.localStorage) {
  return {
    getRaw(key) { try { return ls?.getItem(key) ?? null; } catch { return null; } },
    setRaw(key, value) { try { ls?.setItem(key, value); return true; } catch { return false; } },
    remove(key) { try { ls?.removeItem(key); } catch { /* ignore */ } },
    getJSON(key) { const raw = this.getRaw(key); if (raw === null) return null; try { return JSON.parse(raw); } catch { return null; } },
    setJSON(key, value) { return this.setRaw(key, JSON.stringify(value)); },
  };
}
