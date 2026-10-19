'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini } from './gemini';
import { synthesizeAndStore } from './tts';
import { THEMES } from './constants';
import { fetchAllRows } from './paging';
import { kanaToRomaji } from './japanese';
import { validateJapaneseVerb, conjugateJapaneseVerb } from './japaneseVerbs';
import type { ConjugationStepResult } from './conjugation';

const CHUNK_SIZE = 10;

function tableHint(msg: string) {
  return msg.includes('ja_data') ? 'La colonne "ja_data" n\'existe pas encore — exécute la migration 016 dans Supabase.' : msg;
}

/**
 * Japonais : Gemini ne donne que la LISTE des verbes (écriture moderne + furigana + groupe) ;
 * toutes les formes (ます, て, ない, た, potentiel, passif…) sont calculées par code, donc fiables.
 */
export async function runJapaneseVerbStep(target: number, levelCode: string): Promise<ConjugationStepResult> {
  // 120 verbes PAR NIVEAU : on compte ceux de ce niveau ; les verbes déjà présents à n'importe quel niveau sont évités.
  const { count, error: countErr } = await supabaseAdmin
    .from('conjugation_verbs')
    .select('id', { count: 'exact', head: true })
    .eq('language_code', 'ja')
    .eq('level_code', levelCode)
    .not('ja_data', 'is', null);
  if (countErr) throw new Error(tableHint(countErr.message));

  const generatedTotal = count ?? 0;
  if (generatedTotal >= target) return { done: true, generatedThisStep: 0, generatedTotal, targetTotal: target };

  const existingVerbs = await fetchAllRows<{ infinitive: string; frequency_rank: number }>((from, to) =>
    supabaseAdmin
      .from('conjugation_verbs')
      .select('infinitive, frequency_rank')
      .eq('language_code', 'ja')
      .not('ja_data', 'is', null)
      .order('frequency_rank')
      .range(from, to)
  );
  const avoidList = existingVerbs.map((v) => v.infinitive);
  const rankBase = existingVerbs.reduce((m, v) => Math.max(m, v.frequency_rank), 0);
  const chunkCount = Math.min(CHUNK_SIZE, target - generatedTotal);
  const themeCodes = THEMES.map((t) => t.code).join(', ');

  const system = `Tu es un professeur de japonais pour francophones. Tu listes les verbes les plus utilisés
dans le japonais courant et adaptés au niveau CECRL ${levelCode}, par ordre décroissant de fréquence réelle.
Tu réponds STRICTEMENT en JSON valide, un tableau d'objets, sans texte avant/après, sans balises markdown :
{
  "written": "forme du dictionnaire en écriture japonaise moderne (kanji + kana ; en kana seul si on l'écrit d'habitude ainsi : ある, いる, できる)",
  "ruby": "le MÊME verbe avec chaque groupe de kanji écrit {kanji|lecture en hiragana}, ex. {食|た}べる ; ne change aucun caractère",
  "group": "godan | ichidan | suru | kuru",
  "translation_fr": "traduction française de l'infinitif",
  "theme_code": "un de : ${themeCodes}"
}
Groupes : "godan" = verbes du groupe 1 (書く, 買う, 話す, 帰る, 入る, 走る, 知る, 切る… — attention : beaucoup de verbes en -iru/-eru sont godan) ;
"ichidan" = groupe 2 (食べる, 見る, 起きる, 寝る…) ; "suru" = する et les verbes « nom + する » (勉強する, 散歩する) ;
"kuru" = 来る uniquement. Un verbe « nom + する » compte comme UN verbe. Ne donne que des verbes dont tu es certain du groupe.`;

  const avoidInstruction = avoidList.length > 0 ? `\n\nDéjà traités, ne pas répéter :\n- ${avoidList.join('\n- ')}` : '';
  const user = `Donne les ${chunkCount} prochains verbes les plus fréquents et utiles au niveau ${levelCode} (parmi ceux qui ne sont pas déjà traités).${avoidInstruction}`;

  const text = await callGemini(system, user, { temperature: 0.1 });
  let parsed: any[];
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour les verbes japonais.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Format de verbes japonais inattendu reçu de Gemini');

  const validThemes = new Set(THEMES.map((t) => t.code as string));
  const avoid = new Set(avoidList);
  const rows: any[] = [];
  const dropped: string[] = [];
  for (const v of parsed) {
    const written = typeof v?.written === 'string' ? v.written.trim() : '';
    if (!written || avoid.has(written) || rows.some((r) => r.infinitive === written)) continue;
    const check = validateJapaneseVerb(written, v?.ruby, v?.group);
    if (!check.ok) {
      dropped.push(`${written} (${(check as { reason: string }).reason})`);
      continue;
    }
    if (typeof v.translation_fr !== 'string' || !v.translation_fr.trim()) continue;
    rows.push({
      language_code: 'ja',
      level_code: levelCode,
      infinitive: written,
      translation_fr: v.translation_fr.trim(),
      frequency_rank: rankBase + rows.length + 1,
      theme_code: v.theme_code && validThemes.has(v.theme_code) ? v.theme_code : null,
      tenses: {},
      ja_data: { group: v.group, ruby: v.ruby, reading: (check as { reading: string }).reading },
    });
  }

  if (rows.length === 0) {
    throw new Error(
      `Aucun verbe valide dans cette réponse de Gemini${dropped.length ? ' — écartés : ' + dropped.join(', ') : ''}. Clique sur "Reprendre" pour réessayer.`
    );
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('conjugation_verbs')
    .upsert(rows, { onConflict: 'language_code,infinitive', ignoreDuplicates: true }) // jamais d'écrasement d'un verbe d'un autre niveau
    .select('id, infinitive, ja_data');
  if (error) throw new Error(tableHint(error.message));

  // Lectures (furigana + rōmaji) mises en cache pour le vocabulaire et le test oral
  const readingRows = rows.map((r) => ({ text: r.infinitive, ruby: r.ja_data.ruby, romaji: kanaToRomaji(r.ja_data.reading) }));
  const { error: readingErr } = await supabaseAdmin.from('ja_readings').upsert(readingRows, { onConflict: 'text' });
  if (readingErr) console.error('ja_readings (migration 014 exécutée ?) :', readingErr.message); // non bloquant

  // Audio : un fichier par verbe, formes de base enchaînées (dictionnaire, ます, て, ない, た)
  const TTS_CONCURRENCY = 4;
  const list = inserted ?? [];
  for (let i = 0; i < list.length; i += TTS_CONCURRENCY) {
    await Promise.allSettled(
      list.slice(i, i + TTS_CONCURRENCY).map(async (row: any) => {
        const forms = conjugateJapaneseVerb(row.infinitive, row.ja_data.reading, row.ja_data.group);
        const pick = (id: string) => forms.find((f) => f.id === id)?.reading;
        const spoken = ['dict', 'masu', 'te', 'nai', 'ta'].map(pick).filter(Boolean).join('、') + '。';
        const { audioUrl } = await synthesizeAndStore(spoken, 'ja', `ja/conjugation/${row.id}/basic.mp3`);
        await supabaseAdmin.from('conjugation_verbs').update({ tense_audio: { basic: audioUrl } }).eq('id', row.id);
      })
    );
  }

  const added = list.length;
  const total = generatedTotal + added;
  return { done: total >= target, generatedThisStep: added, generatedTotal: total, targetTotal: target };
}
