'use client';

// Tracés des kanji : KanjiVG (https://kanjivg.tagaini.net), licence CC BY-SA 3.0 — chargés à la demande,
// puis gardés en mémoire (partagés par l'animation du tracé et le module de dessin).
const cache = new Map<string, string[]>();
const inflight = new Map<string, Promise<string[]>>();

export function loadKanjiPaths(char: string): Promise<string[]> {
  const cached = cache.get(char);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(char);
  if (pending) return pending;

  const code = (char.codePointAt(0) ?? 0).toString(16).padStart(5, '0');
  const promise = fetch(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${code}.svg`)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    })
    .then((txt) => {
      const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
      const ds = Array.from(doc.querySelectorAll('path'))
        .map((p) => p.getAttribute('d') || '')
        .filter(Boolean);
      if (ds.length === 0) throw new Error('vide');
      cache.set(char, ds);
      return ds;
    })
    .finally(() => inflight.delete(char));
  inflight.set(char, promise);
  return promise;
}
