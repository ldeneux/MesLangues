'use server';

import { supabaseAdmin } from './supabaseAdmin';
import { callGemini, LANGUAGE_NAMES } from './gemini';
import { synthesizeAndStore } from './tts';

export type ArticleSummary = {
  id: string;
  title: string;
  created_at: string;
};

export type Article = {
  id: string;
  title: string;
  content: string;
  content_fr: string;
  audio_url: string | null;
};

export async function getArticles(languageCode: string, levelCode: string): Promise<ArticleSummary[]> {
  const { data } = await supabaseAdmin
    .from('listening_articles')
    .select('id, title, created_at')
    .eq('language_code', languageCode)
    .eq('level_code', levelCode)
    .order('created_at', { ascending: false });

  return data ?? [];
}

export async function getArticle(articleId: string): Promise<Article | null> {
  const { data } = await supabaseAdmin
    .from('listening_articles')
    .select('id, title, content, content_fr, audio_url')
    .eq('id', articleId)
    .single();

  return data ?? null;
}

const LEVEL_LENGTH_HINT: Record<string, string> = {
  A1: '60 à 90 mots, phrases très courtes et simples, vocabulaire de base.',
  A2: '90 à 130 mots, phrases simples, quelques connecteurs.',
  B1: '130 à 180 mots, rythme normal, quelques subordonnées.',
  B2: '180 à 250 mots, style journalistique naturel, nuances.',
};

/**
 * Génère un court article façon presse locale (culture, vie quotidienne,
 * petit événement communautaire...) — volontairement générique/intemporel,
 * pas un fait d'actualité réel, pour rester fiable dans la durée.
 */
export async function generateArticle(languageCode: string, levelCode: string): Promise<Article> {
  const langName = LANGUAGE_NAMES[languageCode] ?? languageCode;
  const lengthHint = LEVEL_LENGTH_HINT[levelCode] ?? LEVEL_LENGTH_HINT.A1;

  const system = `Tu écris de courts articles façon presse locale en ${langName}, pour un
apprenant francophone niveau CECRL ${levelCode}, destinés à un exercice
d'écoute. Choisis un sujet plausible de presse locale (vie de quartier,
petit événement culturel, ouverture d'un commerce, météo, initiative
associative, fait divers léger...) — générique et intemporel, PAS un
événement réel daté, pour ne jamais donner une fausse information
d'actualité. Longueur : ${lengthHint}

Tu réponds STRICTEMENT en JSON valide, sans texte avant/après, sans balises
markdown, avec exactement ces clés :
{
  "title": "titre court en ${langName}",
  "content": "le corps de l'article en ${langName}",
  "content_fr": "traduction française complète et fidèle de l'article"
}`;

  const user = `Écris un article de niveau ${levelCode}.`;

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
      title: parsed.title,
      content: parsed.content,
      content_fr: parsed.content_fr,
    })
    .select('id, title, content, content_fr, audio_url')
    .single();

  if (error || !inserted) throw new Error(error?.message ?? "Échec de l'enregistrement de l'article");

  const storagePath = `${languageCode}/${levelCode}/articles/${inserted.id}.mp3`;
  const { audioUrl } = await synthesizeAndStore(parsed.content, languageCode, storagePath);

  await supabaseAdmin.from('listening_articles').update({ audio_url: audioUrl }).eq('id', inserted.id);

  return { ...inserted, audio_url: audioUrl };
}
