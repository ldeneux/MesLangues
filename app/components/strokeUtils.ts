'use client';

// Outils communs au dessin de kanji / kana (module « S'entraîner » et mode « Écrire »).
// Les tracés KanjiVG vivent dans un carré de 109 x 109. Un trait de l'utilisateur est comparé au modèle
// par trois points (début, milieu, fin) : cela contrôle à la fois l'emplacement, l'ordre et le sens du trait.
// La vérification est approximative : elle sert à s'entraîner, pas à noter.
export type Pt = { x: number; y: number };
export type Stroke = Pt[];
export type Sample = { start: Pt; mid: Pt; end: Pt };

export const BOX = 109;
export const TOLERANCE = 26; // écart accepté, en unités du carré (≈ 24 % de la largeur)
export const MIN_STEP = 0.4;

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Échantillonne un trait modèle ; offsetX décale le modèle (deuxième caractère d'une combinaison de kana). */
export function sampleModel(d: string, offsetX = 0): Sample {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  el.setAttribute('d', d);
  const len = el.getTotalLength();
  const at = (l: number): Pt => {
    const p = el.getPointAtLength(l);
    return { x: p.x + offsetX, y: p.y };
  };
  return { start: at(0), mid: at(len / 2), end: at(len) };
}

export function sampleStroke(s: Stroke): Sample {
  let total = 0;
  for (let i = 1; i < s.length; i++) total += dist(s[i - 1], s[i]);
  let acc = 0;
  let mid = s[0];
  for (let i = 1; i < s.length; i++) {
    const d = dist(s[i - 1], s[i]);
    if (acc + d >= total / 2) {
      const t = d === 0 ? 0 : (total / 2 - acc) / d;
      mid = { x: s[i - 1].x + (s[i].x - s[i - 1].x) * t, y: s[i - 1].y + (s[i].y - s[i - 1].y) * t };
      break;
    }
    acc += d;
  }
  return { start: s[0], mid, end: s[s.length - 1] };
}

export function strokeMatches(user: Sample, model: Sample): boolean {
  return dist(user.start, model.start) <= TOLERANCE && dist(user.mid, model.mid) <= TOLERANCE && dist(user.end, model.end) <= TOLERANCE;
}
