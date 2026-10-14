// Aides « blind test » : la question ne garde que le lien du morceau Deezer (colonne questions.media_url),
// l'extrait de 30 s est demandé à Deezer au moment de jouer (le lien d'aperçu expire, on ne le stocke pas).

export type DeezerTrack = {
  id: number;
  title: string;
  titleShort: string;
  preview: string;
  link: string;
  artist: { id: number; name: string };
  album: { title: string; cover: string };
  year?: string;
  rank?: number; // popularité Deezer (plus grand = plus écouté)
};

export type AskKind = 'artist' | 'title';

const TRACK_RE = /deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?track\/(\d+)/i;

/** Identifiant du morceau à partir d'un lien Deezer (null si ce n'est pas un lien de morceau). */
export function deezerTrackId(url?: string | null): string | null {
  const m = url ? TRACK_RE.exec(url) : null;
  return m ? m[1] : null;
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Choisit n mauvaises réponses plausibles : distinctes entre elles et différentes (ou contenant) la bonne réponse. */
export function pickDistractors(correct: string, candidates: string[], n = 3): string[] {
  const good = norm(correct);
  const seen = new Set<string>([good]);
  const out: string[] = [];
  for (const c of shuffle(candidates)) {
    const k = norm(c);
    if (!k || seen.has(k) || k.includes(good) || good.includes(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length === n) break;
  }
  return out;
}

export type BuiltQuestion = {
  prompt: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: 'a' | 'b' | 'c' | 'd';
  explanation: string;
  media_url: string;
};

export function buildQuestion(track: DeezerTrack, ask: AskKind, distractors: string[]): BuiltQuestion {
  const correct = ask === 'artist' ? track.artist.name : track.titleShort;
  const letters = ['a', 'b', 'c', 'd'] as const;
  const options = shuffle([correct, ...distractors.slice(0, 3)]);
  const correctIndex = options.indexOf(correct);
  const detail = [track.album.title ? `album « ${track.album.title} »` : '', track.year ?? ''].filter(Boolean).join(', ');
  return {
    prompt:
      ask === 'artist'
        ? "🎧 Écoute l'extrait : qui interprète ce morceau ?"
        : "🎧 Écoute l'extrait : quel est le titre de ce morceau ?",
    choice_a: options[0],
    choice_b: options[1],
    choice_c: options[2],
    choice_d: options[3],
    correct_choice: letters[correctIndex],
    explanation: `« ${track.titleShort} » — ${track.artist.name}${detail ? ` (${detail})` : ''}`,
    media_url: `https://www.deezer.com/track/${track.id}`,
  };
}
