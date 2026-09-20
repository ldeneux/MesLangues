'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';
import { THEMES, LISTENING_PACK_SIZE, QUESTIONS_PER_ARTICLE, QUIZ_DRAW_SIZE } from './constants';

// ---------------------------------------------------------
// Packs d'articles (même principe que phrases/vocabulaire) : génération
// par petits pas résumables, un article + sa banque de questions à la fois.
// ---------------------------------------------------------
export type ListeningPackInfo = {
  id: string;
  pack_number: number;
  status: 'pending' | 'generating' | 'ready';
  generated_count: number;
  target_count: number;
};

export async function getListeningPacks(languageCode: string, levelCode: string): Promise<ListeningPackInfo[]> {
  const { data, error } = await supabaseAdmin
    .from('listening_packs')
    .select('id, pack_number, status, generated_count, target_count')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('pack_number');

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createListeningPack(languageCode: string, levelCode: string): Promise<ListeningPackInfo> {
  const { data: existing } = await supabaseAdmin
    .from('listening_packs')
    .select('pack_number')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('pack_number', { ascending: false })
    .limit(1);

  const nextNumber = (existing?.[0]?.pack_number ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('listening_packs')
    .insert({ language_code: languageCode, level_code: levelCode, pack_number: nextNumber, target_count: LISTENING_PACK_SIZE })
    .select('id, pack_number, status, generated_count, target_count')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

const LEVEL_LENGTH_HINT: Record<string, string> = {
  A1: '60 à 90 mots, phrases très courtes et simples, vocabulaire de base.',
  A2: '90 à 130 mots, phrases simples, quelques connecteurs.',
  B1: '130 à 180 mots, rythme normal, quelques subordonnées.',
  B2: '180 à 250 mots, style journalistique naturel, nuances.',
};

/**
 * Thème le moins représenté pour cette langue/niveau (rotation), pour
 * varier les sujets d'un article à l'autre.
 */
async function pickThemeForNextArticle(languageCode: string, levelCode: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('listening_articles')
    .select('theme_code')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode);

  const counts = new Map<string, number>(THEMES.map((t) => [t.code, 0]));
  for (const row of data ?? []) {
    if (row.theme_code && counts.has(row.theme_code)) {
      counts.set(row.theme_code, (counts.get(row.theme_code) ?? 0) + 1);
    }
  }

  let min = Infinity;
  let chosen = THEMES[0].code as string;
  for (const [code, count] of Array.from(counts)) {
    if (count < min) {
      min = count;
      chosen = code;
    }
  }
  return chosen;
}

async function insertQuestionBank(articleId: string, content: string, count: number): Promise<void> {
  const system = `Tu crées des questions de compréhension écrite/orale en FRANÇAIS à
partir d'un texte en langue étrangère, pour vérifier qu'un apprenant a compris
le sens général et des détails précis. ${count} questions à choix multiples
(QCM), 4 options chacune, une seule correcte. Les questions et les options
sont en français. Varie largement les angles (idée générale, détails,
déduction, vocabulaire en contexte) et la difficulté, pour qu'un tirage
aléatoire ultérieur dans cette banque ne ressemble jamais à un autre.

Tu réponds STRICTEMENT en JSON valide, un tableau de ${count} objets, sans
texte avant/après, sans balises markdown. Chaque objet :
{ "question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0 }`;

  const user = `Texte source :\n${content}`;

  const text = await callGemini(system, user);
  let parsed: { question: string; options: string[]; correct_index: number }[];
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour la banque de questions.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de questions inattendu reçu de Gemini');
  }

  const { error } = await supabaseAdmin.from('listening_questions').insert(
    parsed.map((q, i) => ({
      article_id: articleId,
      position: i + 1,
      question: q.question,
      options: q.options,
      correct_index: q.correct_index,
    }))
  );
  if (error) throw new Error(error.message);
}

export type ListeningStepResult = {
  done: boolean;
  themeLabel?: string;
  generatedThisStep: number;
  generatedTotal: number;
  targetTotal: number;
};

/**
 * Génère UN article complet (texte + audio + banque de 25 questions) et
 * s'arrête — le client rappelle en boucle jusqu'à `done: true`. Reprend
 * automatiquement si interrompu (recompte les articles déjà en base).
 */
export async function runListeningPackStep(packId: string): Promise<ListeningStepResult> {
  const { data: pack, error: packError } = await supabaseAdmin
    .from('listening_packs')
    .select('*')
    .eq('id', packId)
    .single();
  if (packError || !pack) throw new Error(packError?.message ?? 'Pack introuvable');

  const { count: currentCount } = await supabaseAdmin
    .from('listening_articles')
    .select('id', { count: 'exact', head: true })
    .eq('pack_id', packId);

  const generatedTotal = currentCount ?? 0;
  if (generatedTotal >= pack.target_count) {
    await supabaseAdmin
      .from('listening_packs')
      .update({ status: 'ready', completed_at: new Date().toISOString(), generated_count: generatedTotal })
      .eq('id', packId);
    return { done: true, generatedThisStep: 0, generatedTotal, targetTotal: pack.target_count };
  }

  if (pack.status !== 'generating') {
    await supabaseAdmin.from('listening_packs').update({ status: 'generating' }).eq('id', packId);
  }

  const langName = LANGUAGE_NAMES[pack.language_code] ?? pack.language_code;
  const lengthHint = LEVEL_LENGTH_HINT[pack.level_code] ?? LEVEL_LENGTH_HINT.A1;
  const themeCode = await pickThemeForNextArticle(pack.language_code, pack.level_code);
  const themeMeta = THEMES.find((t) => t.code === themeCode);

  const { data: prior } = await supabaseAdmin
    .from('listening_articles')
    .select('title')
    .eq('language_code', pack.language_code)
    .eq('level_code', pack.level_code)
    .eq('theme_code', themeCode)
    .order('created_at', { ascending: false })
    .limit(20);
  const avoidTitles = (prior ?? []).map((p) => p.title);
  const avoidInstruction =
    avoidTitles.length > 0
      ? `\n\nDéjà utilisés pour ce thème, choisis un angle différent :\n- ${avoidTitles.join('\n- ')}`
      : '';

  const system = `Tu écris de courts articles façon presse locale en ${langName}, pour un
apprenant francophone niveau CECRL ${pack.level_code}, destinés à un exercice
d'écoute. Le thème imposé est : "${themeMeta?.label ?? themeCode}". Choisis un
angle concret et varié dans ce thème (lieu, personnage, situation précise) —
générique et intemporel, PAS un événement réel daté. Longueur : ${lengthHint}${avoidInstruction}

Tu réponds STRICTEMENT en JSON valide, sans texte avant/après, sans balises
markdown, avec exactement ces clés :
{ "title": "titre court en ${langName}", "content": "le corps de l'article en ${langName}", "content_fr": "traduction française complète et fidèle" }`;

  const text = await callGemini(system, `Écris un article de niveau ${pack.level_code} sur le thème "${themeMeta?.label ?? themeCode}".`);
  let parsed: { title?: string; content?: string; content_fr?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Réponse Gemini invalide (JSON non parsable) pour l\'article.');
  }
  if (!parsed.title || !parsed.content || !parsed.content_fr) {
    throw new Error("Format d'article inattendu reçu de Gemini");
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('listening_articles')
    .insert({
      language_code: pack.language_code,
      level_code: pack.level_code,
      pack_id: packId,
      theme_code: themeCode,
      title: parsed.title,
      content: parsed.content,
      content_fr: parsed.content_fr,
    })
    .select('id, title, content, content_fr, audio_url, theme_code')
    .single();
  if (error || !inserted) throw new Error(error?.message ?? "Échec de l'enregistrement de l'article");

  const storagePath = `${pack.language_code}/${pack.level_code}/articles/${inserted.id}.mp3`;
  const { audioUrl } = await synthesizeAndStore(parsed.content, pack.language_code, storagePath);
  await supabaseAdmin.from('listening_articles').update({ audio_url: audioUrl }).eq('id', inserted.id);

  await insertQuestionBank(inserted.id, parsed.content, QUESTIONS_PER_ARTICLE);

  const newTotal = generatedTotal + 1;
  const isNowComplete = newTotal >= pack.target_count;
  await supabaseAdmin
    .from('listening_packs')
    .update(
      isNowComplete
        ? { generated_count: newTotal, status: 'ready', completed_at: new Date().toISOString() }
        : { generated_count: newTotal }
    )
    .eq('id', packId);

  return {
    done: isNowComplete,
    themeLabel: themeMeta?.label,
    generatedThisStep: 1,
    generatedTotal: newTotal,
    targetTotal: pack.target_count,
  };
}

// ---------------------------------------------------------
// Lecture / navigation (onglet Écoute)
// ---------------------------------------------------------
export type ArticleSummary = {
  id: string;
  title: string;
  theme_code: string | null;
  created_at: string;
};

export type Article = {
  id: string;
  title: string;
  content: string;
  content_fr: string;
  audio_url: string | null;
  theme_code: string | null;
};

async function getReadyListeningPackIds(languageCode: string, levelCode: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('listening_packs')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('status', 'ready');
  return (data ?? []).map((p) => p.id);
}

export async function getArticles(languageCode: string, levelCode: string): Promise<ArticleSummary[]> {
  const packIds = await getReadyListeningPackIds(languageCode, levelCode);
  if (packIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('listening_articles')
    .select('id, title, theme_code, created_at')
    .in('pack_id', packIds)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getArticle(articleId: string): Promise<Article | null> {
  const { data } = await supabaseAdmin
    .from('listening_articles')
    .select('id, title, content, content_fr, audio_url, theme_code')
    .eq('id', articleId)
    .single();
  return data ?? null;
}

export async function deleteArticle(articleId: string): Promise<void> {
  const { error } = await supabaseAdmin.from('listening_articles').delete().eq('id', articleId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------
// Quiz de compréhension : tirage aléatoire dans la banque de 25.
// ---------------------------------------------------------
export type ComprehensionQuestion = {
  id: string;
  position: number;
  question: string;
  options: string[];
  correct_index: number;
};

export type ComprehensionResult = { correct_count: number; total_count: number; created_at: string };

export async function getQuizQuestions(articleId: string): Promise<ComprehensionQuestion[]> {
  const { data } = await supabaseAdmin
    .from('listening_questions')
    .select('id, position, question, options, correct_index')
    .eq('article_id', articleId);

  const all = data ?? [];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, QUIZ_DRAW_SIZE);
}

export async function saveComprehensionResult(
  profileId: string,
  articleId: string,
  correctCount: number,
  totalCount: number
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('listening_results')
    .insert({ profile_id: profileId, article_id: articleId, correct_count: correctCount, total_count: totalCount });
  if (error) throw new Error(error.message);
}

export async function getComprehensionHistory(profileId: string, articleId: string): Promise<ComprehensionResult[]> {
  const { data } = await supabaseAdmin
    .from('listening_results')
    .select('correct_count, total_count, created_at')
    .eq('profile_id', profileId)
    .eq('article_id', articleId)
    .order('created_at', { ascending: false });
  return data ?? [];
}
