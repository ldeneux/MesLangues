import { EdgeTTS } from '@andresaya/edge-tts';
import { supabaseAdmin } from './supabaseAdmin';

// Voix Microsoft Edge (neuronales) par langue.
// Liste complète des voix disponibles : `npx edge-tts voice-list`
const DEFAULT_VOICE: Record<string, string> = {
  it: 'it-IT-IsabellaNeural',
  es: 'es-ES-ElviraNeural',
  en: 'en-GB-SoniaNeural',
};

/**
 * Synthétise `text` dans la langue donnée via edge-tts (gratuit, aucune clé
 * API), upload le MP3 résultant dans le bucket Supabase Storage
 * "phrase-audio", et retourne l'URL publique + le nom de la voix utilisée.
 */
export async function synthesizeAndStore(
  text: string,
  languageCode: string,
  storagePath: string
): Promise<{ audioUrl: string; voice: string }> {
  const voice = DEFAULT_VOICE[languageCode];
  if (!voice) throw new Error(`Pas de voix configurée pour la langue ${languageCode}`);

  const tts = new EdgeTTS();
  await tts.synthesize(text, voice, { rate: '-5%' }); // légèrement ralenti, pour un apprenant
  const audioBuffer = tts.toBuffer();

  const { error: uploadError } = await supabaseAdmin.storage
    .from('phrase-audio')
    .upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

  if (uploadError) throw uploadError;

  const { data: publicUrl } = supabaseAdmin.storage.from('phrase-audio').getPublicUrl(storagePath);

  return { audioUrl: publicUrl.publicUrl, voice };
}
