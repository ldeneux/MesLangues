'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { fetchAllRows } from './paging';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';
import { THEMES, LEVELS, LISTENING_PACK_SIZE, LISTENING_LEVEL_TARGET, QUESTIONS_PER_ARTICLE, QUIZ_DRAW_SIZE, packThemeQuotas, type LevelCode } from './constants';

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

  const text = await callGemini(system, user, { thinkingLevel: 'minimal' });
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

  const text = await callGemini(system, `Écris un article de niveau ${pack.level_code} sur le thème "${themeMeta?.label ?? themeCode}".`, { thinkingLevel: 'minimal' });
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

  // L'audio (Google TTS) et la banque de questions (Gemini) ne dépendent que du texte : on les lance EN PARALLÈLE
  // (≈ 40 % de temps en moins par article au lieu de les enchaîner).
  const storagePath = `${pack.language_code}/${pack.level_code}/articles/${inserted.id}.mp3`;
  const articleContent = parsed.content;
  const [audioResult, questionsResult] = await Promise.allSettled([
    (async () => {
      const { audioUrl } = await synthesizeAndStore(articleContent, pack.language_code, storagePath);
      await supabaseAdmin.from('listening_articles').update({ audio_url: audioUrl }).eq('id', inserted.id);
    })(),
    insertQuestionBank(inserted.id, articleContent, QUESTIONS_PER_ARTICLE),
  ]);
  if (audioResult.status === 'rejected') throw audioResult.reason;
  if (questionsResult.status === 'rejected') throw questionsResult.reason;

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
// Import manuel d'articles (fichier JSON écrit à la main / avec Claude) + audio manquant.
// Mêmes tables que la génération automatique : listening_articles + listening_questions.
// ---------------------------------------------------------
export type ImportedQuestion = { question: string; options: string[]; correct_index: number };
export type ImportedArticle = {
  theme?: string;
  title: string;
  content: string;
  content_fr: string;
  questions: ImportedQuestion[];
};

export type ImportArticleResult = {
  status: 'inserted' | 'skipped';
  reason?: string;
  packNumber?: number;
  packCount?: number;
  packTarget?: number;
};

// Ressemblance entre deux articles : indice de Jaccard sur les mots de 5 lettres et plus (sans accents), ou sur les paires
// de caractères pour le japonais. Réglage : deux articles de sujets différents ≈ 0,02 à 0,10 ; le même sujet réécrit
// autrement ≈ 0,28 ; une simple reformulation ≈ 0,9. Seuil : 0,22 (japonais : 0,30, non calibré).
function similarityTokens(text: string, languageCode: string): Set<string> {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (languageCode === 'ja') {
    const chars = Array.from(t.replace(/[\s、。！？「」『』・,.!?]/g, ''));
    const grams = new Set<string>();
    for (let i = 0; i < chars.length - 1; i++) grams.add(chars[i] + chars[i + 1]);
    return grams;
  }
  return new Set((t.match(/\p{L}+/gu) ?? []).filter((w) => w.length >= 5));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of Array.from(a)) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function validateImportedArticle(a: ImportedArticle): string | null {
  const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  if (!a || typeof a !== 'object') return 'article invalide';
  if (!text(a.title) || !text(a.content) || !text(a.content_fr)) return 'titre, texte ou traduction manquant';
  if (!Array.isArray(a.questions) || a.questions.length !== QUESTIONS_PER_ARTICLE) {
    return `il faut exactement ${QUESTIONS_PER_ARTICLE} questions (reçu : ${Array.isArray(a.questions) ? a.questions.length : 0})`;
  }
  for (let i = 0; i < a.questions.length; i++) {
    const q = a.questions[i];
    if (!text(q?.question)) return `question ${i + 1} vide`;
    if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(text)) return `question ${i + 1} : il faut 4 options non vides`;
    if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) return `question ${i + 1} : options en double`;
    if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index > 3) return `question ${i + 1} : correct_index doit être entre 0 et 3`;
  }
  return null;
}

/**
 * Importe UN article (avec ses questions) dans le premier pack de ce niveau qui a encore de la place (sinon un nouveau
 * pack est créé). Un article dont le titre existe déjà pour cette langue et ce niveau est ignoré (réimport sans risque).
 * `makeVisible` : rend le pack disponible dans l'onglet Écoute même s'il n'est pas encore plein (50 articles).
 */
export async function importListeningArticle(
  languageCode: string,
  levelCode: string,
  article: ImportedArticle,
  makeVisible: boolean
): Promise<ImportArticleResult> {
  if (!LANGUAGE_NAMES[languageCode]) throw new Error(`Langue inconnue : ${languageCode}`);
  const invalid = validateImportedArticle(article);
  if (invalid) throw new Error(`Article « ${article?.title ?? '?'} » refusé : ${invalid}`);

  const title = article.title.trim();
  const { data: dup } = await supabaseAdmin
    .from('listening_articles')
    .select('id')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .eq('title', title)
    .limit(1);
  if (dup && dup.length > 0) return { status: 'skipped', reason: `« ${title} » : titre déjà présent` };

  // Anti-doublon sur TOUTE la langue (tous niveaux) : on refuse un article trop proche d'un article existant
  const existing = await fetchAllRows<{ title: string; level_code: string; content: string }>((from, to) =>
    supabaseAdmin
      .from('listening_articles')
      .select('title, level_code, content')
      .eq('language_code', languageCode)
      .order('id')
      .range(from, to)
  );
  const newTokens = similarityTokens(article.content, languageCode);
  const threshold = languageCode === 'ja' ? 0.3 : 0.22;
  let closest: { title: string; level: string; score: number } | null = null;
  for (const e of existing) {
    const score = jaccard(newTokens, similarityTokens(e.content ?? '', languageCode));
    if (score >= threshold && (!closest || score > closest.score)) closest = { title: e.title, level: e.level_code, score };
  }
  if (closest) {
    return {
      status: 'skipped',
      reason: `« ${title} » trop proche de « ${closest.title} » (${closest.level}, ressemblance ${Math.round(closest.score * 100)} %)`,
    };
  }

  // Pack cible : le premier (par numéro) qui n'est pas plein, sinon un nouveau
  const { data: packs, error: packsError } = await supabaseAdmin
    .from('listening_packs')
    .select('id, pack_number, target_count, status')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('pack_number');
  if (packsError) throw new Error(packsError.message);

  let pack: { id: string; pack_number: number; target_count: number; status: string } | null = null;
  let packCountBefore = 0;
  for (const p of packs ?? []) {
    const { count } = await supabaseAdmin.from('listening_articles').select('id', { count: 'exact', head: true }).eq('pack_id', p.id);
    if ((count ?? 0) < p.target_count) {
      pack = p;
      packCountBefore = count ?? 0;
      break;
    }
  }
  if (!pack) {
    const created = await createListeningPack(languageCode, levelCode);
    pack = { id: created.id, pack_number: created.pack_number, target_count: created.target_count, status: created.status };
  }

  const themeCode = article.theme && (THEMES as readonly { code: string }[]).some((t) => t.code === article.theme) ? article.theme : null;
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('listening_articles')
    .insert({
      language_code: languageCode,
      level_code: levelCode,
      pack_id: pack.id,
      theme_code: themeCode,
      title,
      content: article.content.trim(),
      content_fr: article.content_fr.trim(),
    })
    .select('id')
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? "Insertion de l'article impossible");

  const { error: questionsError } = await supabaseAdmin.from('listening_questions').insert(
    article.questions.map((q, i) => ({
      article_id: inserted.id,
      position: i + 1,
      question: q.question.trim(),
      options: q.options.map((o) => o.trim()),
      correct_index: q.correct_index,
    }))
  );
  if (questionsError) {
    await supabaseAdmin.from('listening_articles').delete().eq('id', inserted.id); // pas d'article sans questions
    throw new Error(questionsError.message);
  }

  const newCount = packCountBefore + 1;
  const full = newCount >= pack.target_count;
  await supabaseAdmin
    .from('listening_packs')
    .update(
      full
        ? { generated_count: newCount, status: 'ready', completed_at: new Date().toISOString() }
        : { generated_count: newCount, status: makeVisible ? 'ready' : pack.status === 'ready' ? 'ready' : 'generating' }
    )
    .eq('id', pack.id);

  return { status: 'inserted', packNumber: pack.pack_number, packCount: newCount, packTarget: pack.target_count };
}

export type ListeningInventory = {
  language: string;
  total: number;
  // Par niveau : objectif, nombre d'articles et répartition par thème (quota = répartition selon le poids des thèmes)
  levels: Record<string, { target: number; count: number; themes: { code: string; label: string; count: number; quota: number; remaining: number }[] }>;
  // Tous les articles existants de la langue (pour éviter doublons et sujets trop proches)
  articles: { level: string; theme: string | null; title: string; summary: string }[];
};

/** Inventaire des articles d'écoute d'une langue (tous niveaux) : couverture par thème et liste des sujets déjà traités. */
export async function getListeningInventory(languageCode: string): Promise<ListeningInventory> {
  const rows = await fetchAllRows<{ level_code: string; theme_code: string | null; title: string; content: string }>((from, to) =>
    supabaseAdmin
      .from('listening_articles')
      .select('level_code, theme_code, title, content')
      .eq('language_code', languageCode)
      .order('level_code')
      .order('id')
      .range(from, to)
  );

  const levels: ListeningInventory['levels'] = {};
  for (const l of LEVELS) {
    const code = l.code as LevelCode;
    const target = LISTENING_LEVEL_TARGET[code];
    const inLevel = rows.filter((r) => r.level_code === code);
    levels[code] = {
      target,
      count: inLevel.length,
      themes: packThemeQuotas(target).map((q) => {
        const count = inLevel.filter((r) => r.theme_code === q.code).length;
        return { code: q.code, label: q.label, count, quota: q.count, remaining: Math.max(0, q.count - count) };
      }),
    };
  }
  return {
    language: languageCode,
    total: rows.length,
    levels,
    articles: rows.map((r) => ({ level: r.level_code, theme: r.theme_code, title: r.title, summary: (r.content ?? '').slice(0, 160) })),
  };
}

/** Articles d'un niveau sans audio : nombre et total de caractères à lire (pour l'estimation du coût). */
export async function getMissingArticleAudio(languageCode: string, levelCode: string): Promise<{ count: number; chars: number }> {
  const rows = await fetchAllRows<{ content: string }>((from, to) =>
    supabaseAdmin
      .from('listening_articles')
      .select('content')
      .eq('language_code', languageCode)
      .eq('level_code', levelCode)
      .is('audio_url', null)
      .order('id')
      .range(from, to)
  );
  return { count: rows.length, chars: rows.reduce((n, r) => n + (r.content?.length ?? 0), 0) };
}

/** Génère l'audio de quelques articles sans audio (3 à la fois). Le client rappelle jusqu'à `remaining: 0`. */
export async function generateMissingArticleAudioStep(
  languageCode: string,
  levelCode: string
): Promise<{ remaining: number; generated: number }> {
  const { data: batch, error } = await supabaseAdmin
    .from('listening_articles')
    .select('id, content')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .is('audio_url', null)
    .order('created_at')
    .limit(3);
  if (error) throw new Error(error.message);
  if (!batch || batch.length === 0) return { remaining: 0, generated: 0 };

  const results = await Promise.allSettled(
    batch.map(async (a) => {
      const { audioUrl } = await synthesizeAndStore(a.content, languageCode, `${languageCode}/${levelCode}/articles/${a.id}.mp3`);
      const { error: upError } = await supabaseAdmin.from('listening_articles').update({ audio_url: audioUrl }).eq('id', a.id);
      if (upError) throw new Error(upError.message);
    })
  );
  const generated = results.filter((r) => r.status === 'fulfilled').length;
  if (generated === 0) {
    const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw first?.reason instanceof Error ? first.reason : new Error("Échec de la synthèse vocale");
  }

  const { count } = await supabaseAdmin
    .from('listening_articles')
    .select('id', { count: 'exact', head: true })
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .is('audio_url', null);
  return { remaining: count ?? 0, generated };
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
