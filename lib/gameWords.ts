'use server';

// Mots des jeux = vocabulaire du niveau + VERBES du niveau (infinitif, et formes conjuguées si demandé).
// Les verbes sont présentés comme des mots (identifiant « verb:… » / « verbform:… »), leur progression est enregistrée
// dans la progression des verbes (voir recordGameResult).
import { supabaseAdmin } from './supabaseAdmin';
import { getVocabularyWords, type VocabularyWordWithMastery } from './vocabulary';
import { getConjugationVerbs } from './conjugation';
import { displayInfinitive, TENSE_LABELS, PRONOUNS_FR, type TenseKey } from './conjugationDisplay';

const CHUNK = 40; // jamais .in() sur des centaines d'identifiants

function mastered(success: number, fail: number): boolean {
  const total = success + fail;
  return total >= 1 && success / total >= 0.9;
}

/** Dernier mot d'une forme conjuguée (« io parlo » → « parlo », « ho parlato » → « parlato »), lettres seulement. */
function formToken(form: string): string {
  const parts = (form ?? '').trim().split(/[\s/]+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return last.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
}

/**
 * Vocabulaire du niveau (packs prêts et actifs) + verbes du niveau. `includeForms` ajoute aussi les formes conjuguées
 * (présent, futur, passé composé, imparfait), sauf en japonais où les formes sont calculées par code.
 */
export async function getGameWords(
  profileId: string,
  languageCode: string,
  levelCode: string,
  includeForms = false
): Promise<VocabularyWordWithMastery[]> {
  const words = await getVocabularyWords(profileId, languageCode, levelCode);

  let verbs: Awaited<ReturnType<typeof getConjugationVerbs>> = [];
  try {
    verbs = await getConjugationVerbs(languageCode, levelCode);
  } catch {
    return words; // table ou colonne des verbes absente : on garde au moins le vocabulaire
  }
  if (verbs.length === 0) return words;

  // Progression de l'élève sur ces verbes
  const progress = new Map<string, { s: number; f: number }>();
  for (let i = 0; i < verbs.length; i += CHUNK) {
    const { data } = await supabaseAdmin
      .from('conjugation_progress')
      .select('verb_id, success_count, fail_count')
      .eq('profile_id', profileId)
      .in('verb_id', verbs.slice(i, i + CHUNK).map((v) => v.id));
    for (const r of data ?? []) progress.set(r.verb_id, { s: r.success_count ?? 0, f: r.fail_count ?? 0 });
  }

  const extra: VocabularyWordWithMastery[] = [];
  for (const v of verbs) {
    const p = progress.get(v.id) ?? { s: 0, f: 0 };
    const base = { theme_code: 'verbes', word_type: 'verbe', image: null, success_count: p.s, fail_count: p.f, mastered: mastered(p.s, p.f) };
    extra.push({
      ...base,
      id: `verb:${v.id}`,
      target_text: displayInfinitive(v.infinitive, languageCode),
      translation_fr: v.translation_fr,
      audio_url: (v.tense_audio as { infinitive?: string })?.infinitive ?? null,
    });
    if (includeForms && languageCode !== 'ja') {
      for (const tense of Object.keys(TENSE_LABELS) as TenseKey[]) {
        (v.tenses?.[tense] ?? []).forEach((form, i) => {
          const token = formToken(form);
          if (token.length < 2) return;
          extra.push({
            ...base,
            id: `verbform:${v.id}:${tense}:${i}`,
            target_text: token,
            translation_fr: `${v.translation_fr} — ${TENSE_LABELS[tense]} (${PRONOUNS_FR[i] ?? ''})`,
            audio_url: null,
          });
        });
      }
    }
  }
  return [...words, ...extra];
}
