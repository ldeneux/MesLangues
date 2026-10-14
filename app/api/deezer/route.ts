import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AskKind, DeezerTrack, buildQuestion, pickDistractors, shuffle } from '@/lib/deezer';

// Proxy Deezer (l'API publique n'autorise pas les appels directs depuis le navigateur) + création de questions « blind test ».
// Gratuit et sans compte : seuls les aperçus de 30 s sont utilisés, jamais stockés.
export const dynamic = 'force-dynamic';

const DEEZER = 'https://api.deezer.com';

async function deezer(path: string): Promise<any> {
  const res = await fetch(`${DEEZER}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Deezer a répondu ${res.status}`);
  const json = await res.json();
  if (json?.error) throw new Error(json.error.message ?? 'Erreur Deezer');
  return json;
}

function slim(t: any): DeezerTrack {
  return {
    id: t.id,
    title: t.title,
    titleShort: t.title_short || t.title,
    preview: t.preview || '',
    link: t.link || `https://www.deezer.com/track/${t.id}`,
    artist: { id: t.artist?.id, name: t.artist?.name ?? '' },
    album: { title: t.album?.title ?? '', cover: t.album?.cover_medium ?? t.album?.cover ?? '' },
    year: typeof t.release_date === 'string' && t.release_date.length >= 4 ? t.release_date.slice(0, 4) : undefined,
    rank: typeof t.rank === 'number' ? t.rank : undefined,
  };
}

const withPreview = (list: any[]) => (list ?? []).map(slim).filter((t: DeezerTrack) => t.preview);

// Tous les titres d'une playlist (par pages de 100, 300 au plus)
async function playlistTracks(id: string, max = 300): Promise<any[]> {
  const out: any[] = [];
  for (let index = 0; index < max; index += 100) {
    const data = (await deezer(`/playlist/${id}/tracks?limit=100&index=${index}`)).data ?? [];
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

// GET /api/deezer?...
//   search=...          recherche de morceaux           track=ID            un morceau (aperçu frais)
//   genres=1            genres Deezer                   chart=GENREID       classement du moment (0 = tous genres)
//   playlistSearch=...  playlists                       playlist=ID         titres d'une playlist
//   artistSearch=...    artistes                        artistTop=ID        titres les plus écoutés d'un artiste
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const numeric = (v: string | null) => (v !== null && /^\d+$/.test(v) ? v : null);
  try {
    const q = params.get('search');
    if (q) {
      const json = await deezer(`/search?q=${encodeURIComponent(q)}&limit=15`);
      return NextResponse.json({ tracks: withPreview(json.data) });
    }
    if (numeric(params.get('track'))) {
      return NextResponse.json({ track: slim(await deezer(`/track/${params.get('track')}`)) });
    }
    if (params.get('genres')) {
      const json = await deezer('/genre');
      return NextResponse.json({ genres: (json.data ?? []).map((g: any) => ({ id: g.id, name: g.name })) });
    }
    if (numeric(params.get('chart'))) {
      const json = await deezer(`/chart/${params.get('chart')}/tracks?limit=100`);
      return NextResponse.json({ tracks: withPreview(json.data) });
    }
    const pq = params.get('playlistSearch');
    if (pq) {
      const json = await deezer(`/search/playlist?q=${encodeURIComponent(pq)}&limit=20`);
      const lists = (json.data ?? []).map((p: any) => ({ id: p.id, title: p.title, nbTracks: p.nb_tracks ?? 0, picture: p.picture_medium ?? '' }));
      return NextResponse.json({ lists });
    }
    if (numeric(params.get('playlist'))) {
      return NextResponse.json({ tracks: withPreview(await playlistTracks(params.get('playlist')!)) });
    }
    const aq = params.get('artistSearch');
    if (aq) {
      const json = await deezer(`/search/artist?q=${encodeURIComponent(aq)}&limit=12`);
      const lists = (json.data ?? []).map((a: any) => ({ id: a.id, title: a.name, nbTracks: 0, picture: a.picture_medium ?? '' }));
      return NextResponse.json({ lists });
    }
    if (numeric(params.get('artistTop'))) {
      const json = await deezer(`/artist/${params.get('artistTop')}/top?limit=50`);
      return NextResponse.json({ tracks: withPreview(json.data) });
    }
    return NextResponse.json({ error: 'Paramètre manquant.' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Deezer injoignable' }, { status: 502 });
  }
}

// Pack « Blind test · <catégorie> » (créé au besoin) : à ajouter à un profil dans Paramétrage
async function ensurePack(supabaseAdmin: any, categoryId: string, levelId: string): Promise<{ packId?: string; packName: string; error?: string }> {
  const { data: cat } = await supabaseAdmin.from('categories').select('name').eq('id', categoryId).single();
  const packName = `Blind test · ${cat?.name ?? 'Musique'}`;
  const { data: existing } = await supabaseAdmin
    .from('question_packs')
    .select('id')
    .eq('name', packName)
    .eq('level_id', levelId)
    .eq('category_id', categoryId)
    .limit(1);
  if (existing?.[0]?.id) return { packId: existing[0].id, packName };
  const { data: created, error } = await supabaseAdmin
    .from('question_packs')
    .insert({ name: packName, level_id: levelId, category_id: categoryId })
    .select('id')
    .single();
  if (error || !created) return { packName, error: `Pack non créé : ${error?.message}` };
  return { packId: created.id, packName };
}

const insertErrorMessage = (message: string) =>
  `${message}.${/media_url/.test(message) ? " Exécute supabase/migration-015-media.sql dans l'éditeur SQL de Supabase." : ''}`;

// POST /api/deezer
//   { trackId, ask: 'artist' | 'title', categoryId, levelId }                      -> une question
//   { action: 'bulk', tracks, pool: {artists, titles}, ask: 'artist'|'title'|'mix', categoryId, levelId } -> jusqu'à 30 questions
export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const body = await req.json();

    // ---------- Import en masse : les mauvaises réponses viennent de la même liste (même époque, même style) ----------
    if (body.action === 'bulk') {
      const { tracks, pool, ask, categoryId, levelId } = body as {
        tracks: DeezerTrack[];
        pool: { artists: string[]; titles: string[] };
        ask: AskKind | 'mix';
        categoryId: string;
        levelId: string;
      };
      if (!Array.isArray(tracks) || tracks.length === 0 || tracks.length > 30 || !categoryId || !levelId || !['artist', 'title', 'mix'].includes(ask)) {
        return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
      }
      const valid = tracks.filter((t) => t && Number.isFinite(Number(t.id)) && t.titleShort && t.artist?.name);
      const { packId, packName, error: packError } = await ensurePack(supabaseAdmin, categoryId, levelId);
      if (!packId) return NextResponse.json({ error: packError }, { status: 500 });

      const urls = valid.map((t) => `https://www.deezer.com/track/${t.id}`);
      // Un morceau déjà présent dans le pack est ignoré (quel que soit le type de question) : pas deux fois le même extrait
      const { data: existing } = await supabaseAdmin.from('questions').select('media_url').eq('pack_id', packId).in('media_url', urls);
      const known = new Set((existing ?? []).map((e: any) => e.media_url));

      const rows: any[] = [];
      let skipped = tracks.length - valid.length;
      for (const t of valid) {
        const kind: AskKind = ask === 'mix' ? (Math.random() < 0.5 ? 'artist' : 'title') : ask;
        const correct = kind === 'artist' ? t.artist.name : t.titleShort;
        const distractors = pickDistractors(correct, kind === 'artist' ? pool?.artists ?? [] : pool?.titles ?? [], 3);
        if (distractors.length < 3) {
          skipped++;
          continue;
        }
        const q = buildQuestion({ ...t, album: t.album ?? { title: '', cover: '' } }, kind, distractors);
        if (known.has(q.media_url)) {
          skipped++;
          continue;
        }
        rows.push({ ...q, category_id: categoryId, level_id: levelId, pack_id: packId, validated: true });
      }
      if (rows.length > 0) {
        const { error: insertError } = await supabaseAdmin.from('questions').insert(rows);
        if (insertError) return NextResponse.json({ error: insertErrorMessage(insertError.message) }, { status: 500 });
      }
      const { count } = await supabaseAdmin.from('questions').select('id', { count: 'exact', head: true }).eq('pack_id', packId);
      return NextResponse.json({ ok: true, created: rows.length, skipped, packName, packCount: count ?? 0 });
    }

    // ---------- Une seule question ----------
    const { trackId, ask, categoryId, levelId } = body as { trackId: number | string; ask: AskKind; categoryId: string; levelId: string };
    if (!trackId || !categoryId || !levelId || (ask !== 'artist' && ask !== 'title')) {
      return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
    }

    const track = slim(await deezer(`/track/${trackId}`));
    if (!track.preview) return NextResponse.json({ error: "Ce morceau n'a pas d'extrait disponible." }, { status: 422 });

    // Mauvaises réponses plausibles : artistes proches (ou autres titres du même artiste), sinon les classements du moment
    let candidates: string[] = [];
    try {
      candidates =
        ask === 'artist'
          ? ((await deezer(`/artist/${track.artist.id}/related?limit=25`)).data ?? []).map((a: any) => a.name)
          : ((await deezer(`/artist/${track.artist.id}/top?limit=40`)).data ?? []).map((t: any) => t.title_short || t.title);
    } catch {
      /* repli ci-dessous */
    }
    const correct = ask === 'artist' ? track.artist.name : track.titleShort;
    let distractors = pickDistractors(correct, candidates, 3);
    if (distractors.length < 3) {
      const chart = await deezer(ask === 'artist' ? '/chart/0/artists?limit=50' : '/chart/0/tracks?limit=50');
      const names = (chart.data ?? []).map((x: any) => (ask === 'artist' ? x.name : x.title_short || x.title));
      distractors = [...distractors, ...pickDistractors(correct, shuffle(names), 3 - distractors.length)].slice(0, 3);
    }
    if (distractors.length < 3) return NextResponse.json({ error: 'Impossible de trouver 3 mauvaises réponses.' }, { status: 422 });

    const q = buildQuestion(track, ask, distractors);
    const { packId, packName, error: packError } = await ensurePack(supabaseAdmin, categoryId, levelId);
    if (!packId) return NextResponse.json({ error: packError }, { status: 500 });

    // Anti-doublon : même morceau, même type de question, même pack
    const { data: dup } = await supabaseAdmin
      .from('questions')
      .select('id')
      .eq('pack_id', packId)
      .eq('media_url', q.media_url)
      .eq('prompt', q.prompt)
      .limit(1);
    if (dup && dup.length > 0) return NextResponse.json({ error: 'Cette question existe déjà dans le pack.' }, { status: 409 });

    const { error: insertError } = await supabaseAdmin
      .from('questions')
      .insert({ ...q, category_id: categoryId, level_id: levelId, pack_id: packId, validated: true });
    if (insertError) return NextResponse.json({ error: insertErrorMessage(insertError.message) }, { status: 500 });

    const { count } = await supabaseAdmin.from('questions').select('id', { count: 'exact', head: true }).eq('pack_id', packId);
    return NextResponse.json({ ok: true, packName, packCount: count ?? 0, question: q });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erreur inattendue' }, { status: 500 });
  }
}
