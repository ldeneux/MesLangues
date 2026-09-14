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

  // --- Upsert du lot du jour : s'il existe déjà (même partiellement à
  // cause d'un essai précédent qui a timeout), on récupère sa ligne au lieu
  // de planter sur la contrainte unique.
  const { data: phraseSet, error: setError } = await supabaseAdmin
    .from('phrase_sets')
    .upsert(
      {
        language_code: language,
        level_code: level,
        set_date: today,
        theme: theme ?? null,
        generation_model: 'gemini-3.6-flash',
      },
      { onConflict: 'language_code,level_code,set_date', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (setError) return NextResponse.json({ error: setError.message }, { status: 500 });

  // --- Si ce lot a déjà ses phrases complètes, on ne régénère rien.
  const { count: existingCount } = await supabaseAdmin
    .from('phrases')
    .select('id', { count: 'exact', head: true })
    .eq('phrase_set_id', phraseSet.id);

  if ((existingCount ?? 0) >= count) {
    return NextResponse.json({
      message: 'Lot déjà complet pour aujourd\'hui',
      phrase_set_id: phraseSet.id,
      phrases: existingCount,
    });
  }

  // --- Lot partiel (essai précédent interrompu) : on nettoie avant de
  // régénérer proprement du début plutôt que d'essayer de "compléter".
  if ((existingCount ?? 0) > 0) {
    await supabaseAdmin.from('phrases').delete().eq('phrase_set_id', phraseSet.id);
  }

  // --- Étape 1 : générer et insérer les textes immédiatement (rapide,
  // ~2-5s). Comme ça, si l'étape audio timeout, les phrases restent quand
  // même consultables (juste sans son pour l'instant, régénérable ensuite
  // en rappelant cette même route).
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
  // NULL et sera régénéré au prochain appel de cette route (grâce au
  // nettoyage automatique du lot partiel ci-dessus).
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
