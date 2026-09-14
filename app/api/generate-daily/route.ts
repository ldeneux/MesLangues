import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { generatePhrases } from '../../../lib/generatePhrases';
import { synthesizeAndStore } from '../../../lib/tts';

export const maxDuration = 60; // secondes (génération + synthèse de 30 phrases)

export async function GET(req: NextRequest) {
  // Sécurise l'appel : soit le header envoyé par Vercel Cron, soit un appel
  // manuel authentifié avec CRON_SECRET en query param (utile pour un
  // bouton "générer maintenant" côté admin).
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

  // Évite de régénérer si le lot du jour existe déjà pour cette langue/niveau.
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

  let generated;
  try {
    generated = await generatePhrases(language, level, count, theme);
  } catch (e: any) {
    return NextResponse.json({ error: `Génération des phrases échouée: ${e.message}` }, { status: 500 });
  }

  const results = [];
  for (let i = 0; i < generated.length; i++) {
    const phrase = generated[i];
    let audioUrl: string | null = null;
    let voice: string | null = null;

    try {
      const storagePath = `${language}/${level}/${phraseSet.id}/${i + 1}.mp3`;
      const synth = await synthesizeAndStore(phrase.target_text, language, storagePath);
      audioUrl = synth.audioUrl;
      voice = synth.voice;
    } catch (e: any) {
      // On garde la phrase même si la synthèse échoue pour une phrase donnée ;
      // le texte reste utilisable, l'audio pourra être régénéré plus tard.
      console.error(`TTS échoué pour la phrase ${i + 1}:`, e.message);
    }

    const { data: row, error: insertError } = await supabaseAdmin
      .from('phrases')
      .insert({
        phrase_set_id: phraseSet.id,
        target_text: phrase.target_text,
        translation_fr: phrase.translation_fr,
        notes: phrase.notes ?? null,
        audio_url: audioUrl,
        audio_voice: voice,
        position: i + 1,
      })
      .select()
      .single();

    if (!insertError) results.push(row);
  }

  return NextResponse.json({
    phrase_set_id: phraseSet.id,
    language,
    level,
    generated: results.length,
  });
}
