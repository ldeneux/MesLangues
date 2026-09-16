'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';
import { THEMES } from './constants';

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

export type ComprehensionQuestion = {
  id: string;
  position: number;
  question: string;
  options: string[];
  correct_index: number;
};

export type ComprehensionResult = {
  correct_count: number;
  total_count: number;
  created_at: string;
};

export async function getArticles(languageCode: string, levelCode: string): Promise<ArticleSummary[]> {
  const { data, error } = await supabaseAdmin
    .from('listening_articles')
    .select('id, title, theme_code, created_at')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
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

const LEVEL_LENGTH_HINT: Record<string, string> = {
  A1: '60 à 90 mots, phrases très courtes et simples, vocabulaire de base.',
  A2: '90 à 130 mots, phrases simples, quelques connecteurs.',
  B1: '130 à 180 mots, rythme normal, quelques subordonnées.',
  B2: '180 à 250 mots, style journalistique naturel, nuances.',
};

/**
 * Choisit un thème pour le prochain article : celui qui a le moins
 * d'articles existants pour cette langue/niveau (rotation), pour éviter de
 * retomber toujours sur le même sujet.
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

/**
 * Génère un court article façon presse locale (culture, vie quotidienne,
 * petit événement communautaire...) — volontairement générique/intemporel,
 * pas un fait d'actualité réel. `themeCode` optionnel : si omis, on choisit
 * automatiquement le thème le moins utilisé pour varier les sujets.
 */
export async function generateArticle(languageCode: string, levelCode: string, themeCode?: string): Promise<Article> {
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const lengthHint = LEVEL_LENGTH_HINT[levelCode] ?? LEVEL_LENGTH_HINT.A1;
  const chosenThemeCode = themeCode ?? (await pickThemeForNextArticle(languageCode, levelCode));
  const themeMeta = THEMES.find((t) => t.code === chosenThemeCode);

  // Anti-doublon : titres déjà utilisés pour ce thème/langue/niveau, à éviter.
  const { data: prior } = await supabaseAdmin
    .from('listening_articles')
    .select('title')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('theme_code', chosenThemeCode)
    .order('created_at', { ascending: false })
    .limit(30);

  const avoidTitles = (prior ?? []).map((p) => p.title);
  const avoidInstruction =
    avoidTitles.length > 0
      ? `\n\nCes sujets/titres ont déjà été utilisés pour ce thème, choisis un angle
clairement différent (autre lieu, autre situation, autre personnage) :\n- ${avoidTitles.join('\n- ')}`
      : '';

  const system = `Tu écris de courts articles façon presse locale en ${langName}, pour un
apprenant francophone niveau CECRL ${levelCode}, destinés à un exercice
d'écoute. Le thème imposé est : "${themeMeta?.label ?? chosenThemeCode}". Choisis un
angle concret et varié dans ce thème (lieu, personnage, situation précise) —
générique et intemporel, PAS un événement réel daté, pour ne jamais donner
une fausse information d'actualité. Longueur : ${lengthHint}${avoidInstruction}

Tu réponds STRICTEMENT en JSON valide, sans texte avant/après, sans balises
markdown, avec exactement ces clés :
{
  "title": "titre court en ${langName}",
  "content": "le corps de l'article en ${langName}",
  "content_fr": "traduction française complète et fidèle de l'article"
}`;

  const user = `Écris un article de niveau ${levelCode} sur le thème "${themeMeta?.label ?? chosenThemeCode}".`;

  const text = await callGemini(system, user);
  const parsed = JSON.parse(text) as { title?: string; content?: string; content_fr?: string };

  if (!parsed.title || !parsed.content || !parsed.content_fr) {
    throw new Error("Format d'article inattendu reçu de Gemini");
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('listening_articles')
    .insert({
      language_code: languageCode,
      level_code: levelCode,
      theme_code: chosenThemeCode,
      title: parsed.title,
      content: parsed.content,
      content_fr: parsed.content_fr,
    })
    .select('id, title, content, content_fr, audio_url, theme_code')
    .single();

  if (error || !inserted) throw new Error(error?.message ?? "Échec de l'enregistrement de l'article");

  const storagePath = `${languageCode}/${levelCode}/articles/${inserted.id}.mp3`;
  const { audioUrl } = await synthesizeAndStore(parsed.content, languageCode, storagePath);

  await supabaseAdmin.from('listening_articles').update({ audio_url: audioUrl }).eq('id', inserted.id);

  return { ...inserted, audio_url: audioUrl };
}

/**
 * Questions de compréhension (QCM, notables automatiquement) pour un
 * article — générées à la demande la première fois, puis réutilisées.
 */
export async function getOrCreateComprehensionQuestions(articleId: string): Promise<ComprehensionQuestion[]> {
  const { data: existing } = await supabaseAdmin
    .from('listening_questions')
    .select('id, position, question, options, correct_index')
    .eq('article_id', articleId)
    .order('position');

  if (existing && existing.length > 0) return existing;

  const { data: article } = await supabaseAdmin
    .from('listening_articles')
    .select('content')
    .eq('id', articleId)
    .single();

  if (!article) throw new Error('Article introuvable');

  const system = `Tu crées des questions de compréhension écrite/orale en FRANÇAIS à
partir d'un texte en langue étrangère, pour vérifier qu'un apprenant a compris
le sens général et quelques détails. 3 questions à choix multiples (QCM), 4
options chacune, une seule correcte. Les questions et les options sont en
français (l'apprenant répond en français même si le texte source est dans
une autre langue). Varie la difficulté : une question de compréhension
générale, une ou deux sur des détails précis.

Tu réponds STRICTEMENT en JSON valide, un tableau de 3 objets, sans texte
avant/après, sans balises markdown. Chaque objet :
{ "question": "...", "options": ["...", "...", "...", "..."], "correct_index": 0 }
(correct_index est l'index 0-3 de la bonne réponse dans "options")`;

  const user = `Texte source :\n${article.content}`;

  const text = await callGemini(system, user);
  const parsed = JSON.parse(text) as { question: string; options: string[]; correct_index: number }[];

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Format de questions inattendu reçu de Gemini');
  }

  const { data: insertedQuestions, error } = await supabaseAdmin
    .from('listening_questions')
    .insert(
      parsed.map((q, i) => ({
        article_id: articleId,
        position: i + 1,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
      }))
    )
    .select('id, position, question, options, correct_index');

  if (error) throw new Error(error.message);
  return insertedQuestions ?? [];
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
