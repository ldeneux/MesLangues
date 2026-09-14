import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { generatePhrases } from '../../../lib/generatePhrases';
import { synthesizeAndStore } from '../../../lib/tts';

// 60 = maximum autorisé sur le plan Vercel Hobby sans Fluid Compute.
// Si ça retimeout encore malgré la parallélisation ci-dessous, active
// "Fluid Compute" dans Project Settings > Functions sur Vercel (gratuit
// sur Hobby, monte le plafond à 300s) — aucun changement de code requis.
export const maxDuration = 60;

const TTS_CONCURRENCY = 6; // nb de synthèses audio lancées en parallèle

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const secretParam = req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET;
  const isVercelCron = authHeader === `Bearer ${expected}`;
  const isManual = expected && secretParam === expected;
  if (expected && !isVercelCron && !isManual) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const language = req.nextUrl.searchParams.get('language');
  const level = req.nextUrl.searchParams.get('level') ?? 'A1';
  const count = Number(req.nextUrl.searchParams.get('count') ?? 30);
  const theme = req.nextUrl.searchParams.get('theme') ?? undefined;

  if (!language) {
    return NextResponse.json({ error: 'Paramètre "language" requis' }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: existingSet } = await supabaseAdmin
    .from('phrase_sets')
    .select('id')
    .eq('language_code', language)
    .eq('level_code', level)
    .eq('set_date', today)
    .maybeSingle();

  if (existingSet) {
    return NextResponse.json({ message: 'Lot déjà généré aujourd\'hui', phrase_set_id: existingSet.id });
  }

  const { data: phraseSet, error: setError } = await supabaseAdmin
    .from('phrase_sets')
    .insert({
      language_code: language,
      level_code: level,
      set_date: today,
      theme: theme ?? null,
      generation_model: 'gemini-3.6-flash',
    })
    .select()
    .single();

  if (setError) return NextResponse.json({ error: setError.message }, { status: 500 });

  // --- Étape 1 : générer et insérer les 30 textes immédiatement (rapide,
  // ~2-5s). Comme ça, si l'étape audio timeout, les phrases restent quand
  // même consultables (juste sans son pour l'instant).
  let generated;
  try {
    generated = await generatePhrases(language, level, count, theme);
  } catch (e: any) {
    return NextResponse.json({ error: `Génération des phrases échouée: ${e.message}` }, { status: 500 });
  }

  const { data: insertedRows, error: insertError } = await supabaseAdmin
    .from('phrases')
    .insert(
      generated.map((phrase, i) => ({
        phrase_set_id: phraseSet.id,
        target_text: phrase.target_text,
        translation_fr: phrase.translation_fr,
        notes: phrase.notes ?? null,
        position: i + 1,
      }))
    )
    .select();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // --- Étape 2 : générer l'audio en parallèle par lots de TTS_CONCURRENCY,
  // et mettre à jour chaque ligne au fur et à mesure. Une phrase dont le TTS
  // échoue (ou timeout) reste utilisable en texte ; son audio_url restera
  // NULL et pourra être régénéré plus tard.
  let audioOk = 0;
  let audioFailed = 0;

  for (let i = 0; i < insertedRows.length; i += TTS_CONCURRENCY) {
    const batch = insertedRows.slice(i, i + TTS_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const storagePath = `${language}/${level}/${phraseSet.id}/${row.position}.mp3`;
        const { audioUrl, voice } = await synthesizeAndStore(row.target_text, language, storagePath);
        const { error } = await supabaseAdmin
          .from('phrases')
          .update({ audio_url: audioUrl, audio_voice: voice })
          .eq('id', row.id);
        if (error) throw error;
      })
    );
    audioOk += results.filter((r) => r.status === 'fulfilled').length;
    audioFailed += results.filter((r) => r.status === 'rejected').length;
  }

  return NextResponse.json({
    phrase_set_id: phraseSet.id,
    language,
    level,
    phrases_generated: insertedRows.length,
    audio_ok: audioOk,
    audio_failed: audioFailed,
  });
}
