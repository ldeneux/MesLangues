import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { pickDistractors } from '@/lib/deezer';
import { buildTextQuestion, youtubeInfo, youtubeUrl } from '@/lib/media';
import { ensurePack, insertErrorMessage } from '@/lib/packs';

// Liens YouTube collés à la main (pubs, extraits de films, clips…) : vérification du lien (oEmbed, sans clé) et création des questions.
export const dynamic = 'force-dynamic';

// GET /api/media?oembed=<lien YouTube> -> titre de la vidéo si elle existe et peut être intégrée
export async function GET(req: NextRequest) {
  const info = youtubeInfo(req.nextUrl.searchParams.get('oembed'));
  if (!info) return NextResponse.json({ error: 'Lien YouTube non reconnu.' }, { status: 400 });
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${info.id}`)}&format=json`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return NextResponse.json({ error: 'Vidéo introuvable ou intégration interdite.' }, { status: 404 });
    const json = await res.json();
    return NextResponse.json({ title: json.title, author: json.author_name, thumbnail: json.thumbnail_url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'YouTube injoignable' }, { status: 502 });
  }
}

// POST /api/media { action: 'links', items: [{ url, answer, others? }], pool: string[], prompt, categoryId, levelId } (30 liens au plus)
export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try {
    const { items, pool, prompt, categoryId, levelId } = (await req.json()) as {
      items: { url: string; answer: string; others?: string[] }[];
      pool: string[];
      prompt: string;
      categoryId: string;
      levelId: string;
    };
    if (!Array.isArray(items) || items.length === 0 || items.length > 30 || !prompt?.trim() || !categoryId || !levelId) {
      return NextResponse.json({ error: 'Paramètres invalides.' }, { status: 400 });
    }
    const { packId, packName, error: packError } = await ensurePack(supabaseAdmin, 'Vidéos', categoryId, levelId);
    if (!packId) return NextResponse.json({ error: packError }, { status: 500 });

    const prepared = items
      .map((it) => ({ info: youtubeInfo(it.url), answer: (it.answer ?? '').trim(), others: (it.others ?? []).map((o) => o.trim()).filter(Boolean) }))
      .filter((it) => it.info && it.answer) as { info: NonNullable<ReturnType<typeof youtubeInfo>>; answer: string; others: string[] }[];
    let skipped = items.length - prepared.length;

    const urls = prepared.map((it) => youtubeUrl(it.info));
    const { data: existing } = await supabaseAdmin.from('questions').select('media_url').eq('pack_id', packId).in('media_url', urls);
    const known = new Set((existing ?? []).map((e: any) => e.media_url));

    const rows: any[] = [];
    for (const it of prepared) {
      const url = youtubeUrl(it.info);
      if (known.has(url)) {
        skipped++;
        continue;
      }
      // Mauvaises réponses : celles écrites à la main d'abord, puis les autres réponses de la liste
      const manual = pickDistractors(it.answer, it.others, 3);
      const distractors = [...manual, ...pickDistractors(it.answer, [...manual, ...(pool ?? [])], 3 - manual.length)].slice(0, 3);
      if (distractors.length < 3) {
        skipped++;
        continue;
      }
      const q = buildTextQuestion(prompt.trim(), it.answer, distractors, url, `Réponse : ${it.answer}`);
      rows.push({ ...q, category_id: categoryId, level_id: levelId, pack_id: packId, validated: true });
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
