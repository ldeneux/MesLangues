import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pickDistractors, shuffle } from '@/lib/deezer';
import { buildTextQuestion, yearDistractors, youtubeUrl } from '@/lib/media';
import { ensurePack, insertErrorMessage } from '@/lib/packs';

// Films cultes ou récents (TMDB) : listes + bande-annonce YouTube + réalisateur. Clé gratuite : variable TMDB_API_KEY.
// Usage non commercial uniquement, avec mention de TMDB (affichée sur la page /medias).
export const dynamic = 'force-dynamic';

const TMDB = 'https://api.themoviedb.org/3';

async function tmdb(path: string): Promise<any> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("Clé TMDB absente : ajoute TMDB_API_KEY (clé gratuite themoviedb.org) dans .env.local et dans les variables Vercel.");
  const bearer = key.startsWith('eyJ'); // jeton v4 ; sinon clé v3
  const url = `${TMDB}${path}${bearer ? '' : `${path.includes('?') ? '&' : '?'}api_key=${key}`}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000), headers: bearer ? { Authorization: `Bearer ${key}` } : undefined });
  if (res.status === 401) throw new Error('Clé TMDB refusée (401).');
  if (!res.ok) throw new Error(`TMDB a répondu ${res.status}`);
  return res.json();
}

const listPath = (kind: string, page: number, decade?: number): string | null => {
  switch (kind) {
    case 'top_rated':
      return `/movie/top_rated?language=fr-FR&page=${page}`;
    case 'popular':
      return `/movie/popular?language=fr-FR&page=${page}`;
    case 'now_playing':
      return `/movie/now_playing?language=fr-FR&region=FR&page=${page}`;
    case 'trending':
      return `/trending/movie/week?language=fr-FR&page=${page}`;
    case 'decade':
      return decade
        ? `/discover/movie?language=fr-FR&sort_by=vote_count.desc&vote_count.gte=300&primary_release_date.gte=${decade}-01-01&primary_release_date.lte=${decade + 9}-12-31&page=${page}`
        : null;
    default:
      return null;
  }
};

// GET /api/tmdb?status=1 | ?list=top_rated|popular|now_playing|trending|decade[&decade=1980][&pages=5]
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get('status')) return NextResponse.json({ configured: !!process.env.TMDB_API_KEY });
  try {
    const kind = params.get('list') ?? '';
    const decade = Number(params.get('decade')) || undefined;
    const pages = Math.min(5, Math.max(1, Number(params.get('pages')) || 5));
    if (!listPath(kind, 1, decade)) return NextResponse.json({ error: 'Liste inconnue.' }, { status: 400 });
    const results = await Promise.all(Array.from({ length: pages }, (_, i) => tmdb(listPath(kind, i + 1, decade)!)));
    const seen = new Set<number>();
    const movies = results
      .flatMap((r) => r.results ?? [])
      .filter((m: any) => !m.adult && m.title && !seen.has(m.id) && seen.add(m.id))
      .map((m: any) => ({
        id: m.id,
        title: m.title,
        year: m.release_date ? m.release_date.slice(0, 4) : '',
        poster: m.poster_path ? `https://image.tmdb.org/t/p/w154${m.poster_path}` : '',
        votes: m.vote_count ?? 0,
      }));
    return NextResponse.json({ movies });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'TMDB injoignable' }, { status: 502 });
  }
}

type Kind = 'title' | 'director' | 'year';
const PROMPTS: Record<Kind, string> = {
  title: '🎬 De quel film est cette bande-annonce ?',
  director: '🎬 Qui a réalisé le film de cette bande-annonce ?',
  year: '🎬 En quelle année est sorti le film de cette bande-annonce ?',
};

// Meilleure bande-annonce YouTube : officielle, « Trailer » avant « Teaser », français avant anglais
function pickTrailer(videos: any[] | undefined): string | null {
  const score = (v: any) => (v.official ? 4 : 0) + (v.type === 'Trailer' ? 2 : 0) + (v.iso_639_1 === 'fr' ? 1 : 0);
  const list = (videos ?? []).filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser') && v.key).sort((a, b) => score(b) - score(a));
  return list[0]?.key ?? null;
}

// POST /api/tmdb { action: 'bulk', movieIds (10 au plus), titles: string[], ask: 'title'|'director'|'year'|'mix', categoryId, levelId }
export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const { movieIds, titles, ask, categoryId, levelId } = (await req.json()) as {
      movieIds: number[];
      titles: string[];
      ask: Kind | 'mix';
      categoryId: string;
      levelId: string;
    };
    if (!Array.isArray(movieIds) || movieIds.length === 0 || movieIds.length > 10 || !categoryId || !levelId || !['title', 'director', 'year', 'mix'].includes(ask)) {
      return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
    }
    const { packId, packName, error: packError } = await ensurePack(supabaseAdmin, 'Cinéma', categoryId, levelId);
    if (!packId) return NextResponse.json({ error: packError }, { status: 500 });

    const settled = await Promise.allSettled(
      movieIds.map((id) => tmdb(`/movie/${id}?language=fr-FR&append_to_response=videos,credits&include_video_language=fr,en,null`))
    );
    const films = settled
      .filter((s): s is PromiseFulfilledResult<any> => s.status === 'fulfilled')
      .map((s) => s.value)
      .map((m) => ({
        title: m.title as string,
        year: m.release_date ? Number(m.release_date.slice(0, 4)) : undefined,
        director: (m.credits?.crew ?? []).find((c: any) => c.job === 'Director')?.name as string | undefined,
        trailer: pickTrailer(m.videos?.results),
      }));
    let skipped = movieIds.length - films.length;
    const withTrailer = films.filter((f) => {
      if (!f.trailer) skipped++;
      return !!f.trailer;
    });
    const batchDirectors = Array.from(new Set(withTrailer.map((f) => f.director).filter(Boolean))) as string[];

    const urls = withTrailer.map((f) => youtubeUrl({ id: f.trailer! }));
    const { data: existing } = await supabaseAdmin.from('questions').select('media_url').eq('pack_id', packId).in('media_url', urls);
    const known = new Set((existing ?? []).map((e: any) => e.media_url));

    const rows: any[] = [];
    for (const f of withTrailer) {
      const url = youtubeUrl({ id: f.trailer! });
      if (known.has(url)) {
        skipped++;
        continue;
      }
      const titleChoices = pickDistractors(f.title, titles ?? [], 3);
      const directorChoices = f.director ? pickDistractors(f.director, batchDirectors, 3) : [];
      const available: Kind[] = [];
      if (titleChoices.length === 3) available.push('title');
      if (f.year) available.push('year');
      if (directorChoices.length === 3) available.push('director');
      const kind = ask !== 'mix' && available.includes(ask) ? ask : shuffle(available)[0];
      if (!kind) {
        skipped++;
        continue;
      }
      const correct = kind === 'title' ? f.title : kind === 'year' ? String(f.year) : f.director!;
      const distractors = kind === 'title' ? titleChoices : kind === 'year' ? yearDistractors(f.year!) : directorChoices;
      const explanation = `« ${f.title} »${f.year ? ` (${f.year})` : ''}${f.director ? ` — réalisé par ${f.director}` : ''}`;
      rows.push({ ...buildTextQuestion(PROMPTS[kind], correct, distractors, url, explanation), category_id: categoryId, level_id: levelId, pack_id: packId, validated: true });
    }
    if (rows.length > 0) {
      const { error: insertError } = await supabaseAdmin.from('questions').insert(rows);
      if (insertError) return NextResponse.json({ error: insertErrorMessage(insertError.message) }, { status: 500 });
    }
    const { count } = await supabaseAdmin.from('questions').select('id', { count: 'exact', head: true }).eq('pack_id', packId);
    return NextResponse.json({ ok: true, created: rows.length, skipped, packName, packCount: count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur inattendue' }, { status: 500 });
  }
}
