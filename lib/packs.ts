'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { generatePhrases } from './generatePhrases';
import { synthesizeAndStore } from './tts';
import { THEMES, packThemeQuotas, PACK_SIZE } from './constants';

export type PackStatus = 'pending' | 'generating' | 'ready';

export type PackInfo = {
  id: string;
  pack_number: number;
  status: PackStatus;
  generated_count: number;
  target_count: number;
};

export type PackStepResult = {
  done: boolean;
  themeLabel?: string;
  generatedThisStep: number;
  generatedTotal: number;
  targetTotal: number;
};

const TTS_CONCURRENCY = 6;
const CHUNK_SIZE = 20;

import { normalizeForCompare } from './textUtils';

export async function getPacks(languageCode: string, levelCode: string): Promise<PackInfo[]> {
  const { data, error } = await supabaseAdmin
    .from('packs')
    .select('id, pack_number, status, generated_count, target_count')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('pack_number');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createPack(languageCode: string, levelCode: string): Promise<PackInfo> {
  const { data: existing } = await supabaseAdmin
    .from('packs')
    .select('pack_number')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('pack_number', { ascending: false })
    .limit(1);

  const nextNumber = (existing?.[0]?.pack_number ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('packs')
    .insert({
      language_code: languageCode,
      level_code: levelCode,
      pack_number: nextNumber,
      target_count: PACK_SIZE,
    })
    .select('id, pack_number, status, generated_count, target_count')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Fait avancer la génération d'un pack d'un "cran" (un thème, jusqu'à
 * CHUNK_SIZE phrases + leur audio) et s'arrête — pensé pour tenir dans la
 * limite de durée d'une fonction serverless. Le client rappelle cette
 * action en boucle jusqu'à `done: true`, en affichant la progression.
 * Reprend automatiquement là où elle s'était arrêtée si interrompue.
 */
export async function runPackStep(packId: string): Promise<PackStepResult> {
  const { data: pack, error: packError } = await supabaseAdmin
    .from('packs')
    .select('*')
    .eq('id', packId)
    .single();

  if (packError || !pack) throw new Error(packError?.message ?? 'Pack introuvable');

  const quotas = packThemeQuotas(pack.target_count);

  let targetTheme: { code: string; label: string; count: number; existing: number } | null = null;
  for (const q of quotas) {
    const { count } = await supabaseAdmin
      .from('phrases')
      .select('id', { count: 'exact', head: true })
      .eq('pack_id', packId)
      .eq('theme_code', q.code);

    if ((count ?? 0) < q.count) {
      targetTheme = { ...q, existing: count ?? 0 };
      break;
    }
  }

  if (!targetTheme) {
    const { count: actualTotal } = await supabaseAdmin
      .from('phrases')
      .select('id', { count: 'exact', head: true })
      .eq('pack_id', packId);
    await supabaseAdmin
      .from('packs')
      .update({ status: 'ready', completed_at: new Date().toISOString(), generated_count: actualTotal ?? pack.target_count })
      .eq('id', packId);
    return {
      done: true,
      generatedThisStep: 0,
      generatedTotal: actualTotal ?? pack.target_count,
      targetTotal: pack.target_count,
    };
  }

  if (pack.status !== 'generating') {
    await supabaseAdmin.from('packs').update({ status: 'generating' }).eq('id', packId);
  }

  const chunkCount = Math.min(CHUNK_SIZE, targetTheme.count - targetTheme.existing);
  const themeMeta = THEMES.find((t) => t.code === targetTheme!.code);
  if (!themeMeta) throw new Error(`Thème inconnu : ${targetTheme.code}`);

  // Anti-doublon : phrases déjà générées pour ce thème, cette langue, ce
  // niveau (tous packs confondus), passées à Gemini comme liste à éviter.
  const { data: siblingPackIds } = await supabaseAdmin
    .from('packs')
    .select('id')
    .eq('language_code', pack.language_code)
    .eq('level_code', pack.level_code);

  const { data: prior } = await supabaseAdmin
    .from('phrases')
    .select('target_text')
    .eq('theme_code', targetTheme.code)
    .in('pack_id', (siblingPackIds ?? []).map((p) => p.id))
    .order('created_at', { ascending: false })
    .limit(150);

  const avoidList = (prior ?? []).map((p) => p.target_text);

  const generated = await generatePhrases(
    pack.language_code,
    pack.level_code,
    chunkCount,
    themeMeta.label,
    avoidList
  );

  // Filet de sécurité anti-doublon côté code (en plus de l'instruction à
  // Gemini) : normalisation simple, on écarte les répétitions exactes ou
  // quasi identiques.
  const seenNormalized = new Set(avoidList.map(normalizeForCompare));
  const unique = generated.filter((p) => {
    const n = normalizeForCompare(p.target_text);
    if (seenNormalized.has(n)) return false;
    seenNormalized.add(n);
    return true;
  });

  const { data: insertedRows, error: insertError } = await supabaseAdmin
    .from('phrases')
    .insert(
      unique.map((p, i) => ({
        pack_id: packId,
        theme_code: targetTheme!.code,
        pack_position: targetTheme!.existing + i + 1,
        position: targetTheme!.existing + i + 1,
        target_text: p.target_text,
        translation_fr: p.translation_fr,
        notes: p.notes ?? null,
      }))
    )
    .select();

  if (insertError) throw new Error(insertError.message);

  // Audio, par petits lots parallèles.
  for (let i = 0; i < (insertedRows?.length ?? 0); i += TTS_CONCURRENCY) {
    const batch = insertedRows!.slice(i, i + TTS_CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (row) => {
        const storagePath = `${pack.language_code}/${pack.level_code}/packs/${packId}/${row.id}.mp3`;
        const { audioUrl, voice } = await synthesizeAndStore(row.target_text, pack.language_code, storagePath);
        await supabaseAdmin.from('phrases').update({ audio_url: audioUrl, audio_voice: voice }).eq('id', row.id);
      })
    );
  }

  const { count: totalGenerated } = await supabaseAdmin
    .from('phrases')
    .select('id', { count: 'exact', head: true })
    .eq('pack_id', packId);

  await supabaseAdmin.from('packs').update({ generated_count: totalGenerated ?? 0 }).eq('id', packId);

  return {
    done: false,
    themeLabel: themeMeta.label,
    generatedThisStep: insertedRows?.length ?? 0,
    generatedTotal: totalGenerated ?? 0,
    targetTotal: pack.target_count,
  };
}
