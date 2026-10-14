// Vidéos YouTube pour les questions (bandes-annonces, pubs, extraits) : la question ne garde que le LIEN dans questions.media_url
// (avec début/fin facultatifs, ex. https://www.youtube.com/watch?v=XXXXXXXXXXX&start=12&end=40).
import { shuffle } from '@/lib/deezer';

export type YouTubeInfo = { id: string; start?: number; end?: number };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// "90", "1m30s", "1h2m3s" -> secondes
function seconds(v: string | null): number | undefined {
  if (!v) return undefined;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(v.trim());
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Lien YouTube (watch, youtu.be, embed, shorts) -> identifiant + début/fin (paramètres t, start, end). */
export function youtubeInfo(url?: string | null): YouTubeInfo | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else id = /^\/(?:embed|shorts|live|v)\/([^/?]+)/.exec(u.pathname)?.[1] ?? null;
  }
  if (!id || !VIDEO_ID.test(id)) return null;
  const start = seconds(u.searchParams.get('start') ?? u.searchParams.get('t'));
  const end = seconds(u.searchParams.get('end'));
  return { id, ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) };
}

export function youtubeUrl(info: YouTubeInfo): string {
  return `https://www.youtube.com/watch?v=${info.id}${info.start !== undefined ? `&start=${info.start}` : ''}${info.end !== undefined ? `&end=${info.end}` : ''}`;
}

export type TextQuestion = {
  prompt: string;
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice: 'a' | 'b' | 'c' | 'd';
  explanation: string;
  media_url: string;
};

export function buildTextQuestion(prompt: string, correct: string, distractors: string[], mediaUrl: string, explanation: string): TextQuestion {
  const letters = ['a', 'b', 'c', 'd'] as const;
  const options = shuffle([correct, ...distractors.slice(0, 3)]);
  return {
    prompt,
    choice_a: options[0],
    choice_b: options[1],
    choice_c: options[2],
    choice_d: options[3],
    correct_choice: letters[options.indexOf(correct)],
    explanation,
    media_url: mediaUrl,
  };
}

/** 3 années plausibles (proches de la bonne, jamais dans le futur). */
export function yearDistractors(year: number, now = new Date().getFullYear()): string[] {
  const deltas = shuffle([-10, -7, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 7, 10]);
  const out: number[] = [];
  for (const d of deltas) {
    const y = year + d;
    if (y <= now && !out.includes(y)) out.push(y);
    if (out.length === 3) break;
  }
  return out.map(String);
}

// ---- Lecteur YouTube (navigateur uniquement) ----
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApi: Promise<any> | null = null;
/** Charge l'API « IFrame Player » de YouTube une seule fois. */
export function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youTubeApi) {
    youTubeApi = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });
  }
  return youTubeApi;
}

export type ProbeResult = { ok: boolean; code?: number; unknown?: boolean };

/**
 * Teste qu'une vidéo se lit VRAIMENT depuis ce navigateur (vidéo existante, intégration autorisée, disponible dans ton pays) :
 * on crée un petit lecteur YouTube (200×200, taille minimale exigée), on attend une éventuelle erreur, puis on le retire.
 */
export async function probeYouTube(id: string, host: HTMLElement, timeoutMs = 9000): Promise<ProbeResult> {
  let YT: any;
  try {
    YT = await Promise.race([loadYouTubeApi(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
  } catch {
    return { ok: false, unknown: true };
  }
  return new Promise((resolve) => {
    const el = document.createElement('div');
    host.appendChild(el);
    let player: any;
    let done = false;
    const finish = (r: ProbeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        player?.destroy();
      } catch {
        /* déjà retiré */
      }
      el.remove();
      resolve(r);
    };
    const timer = setTimeout(() => finish({ ok: false, unknown: true }), timeoutMs);
    player = new YT.Player(el, {
      width: 200,
      height: 200,
      videoId: id,
      playerVars: { rel: 0, playsinline: 1 },
      events: {
        onReady: () => setTimeout(() => finish({ ok: true }), 1500), // une vidéo indisponible signale son erreur juste après
        onError: (e: { data: number }) => finish({ ok: false, code: e.data }),
      },
    });
  });
}

/** Explication lisible d'un code d'erreur du lecteur YouTube. */
export function youtubeErrorLabel(code?: number): string {
  if (code === 100) return 'vidéo introuvable ou privée';
  if (code === 101 || code === 150) return "intégration interdite ou vidéo indisponible dans ton pays";
  if (code === 2) return 'identifiant de vidéo invalide';
  return 'vidéo indisponible';
}
