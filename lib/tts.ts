import { supabaseAdmin } from './supabaseAdmin';

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

// Une voix neurale "Standard" (gratuite dans le quota le plus large) par langue.
// Voir la liste complète : https://cloud.google.com/text-to-speech/docs/voices
const DEFAULT_VOICE: Record<string, { languageCode: string; name: string }> = {
  it: { languageCode: 'it-IT', name: 'it-IT-Standard-A' },
  es: { languageCode: 'es-ES', name: 'es-ES-Standard-A' },
  en: { languageCode: 'en-GB', name: 'en-GB-Standard-A' },
};

/**
 * Synthétise `text` dans la langue donnée via Google Cloud TTS (simple appel
 * HTTPS, pas de WebSocket — fiable en environnement serverless), upload le
 * MP3 résultant dans le bucket Supabase Storage "phrase-audio", et retourne
 * l'URL publique + le nom de la voix utilisée.
 */
export async function synthesizeAndStore(
  text: string,
  languageCode: string,
  storagePath: string
): Promise<{ audioUrl: string; voice: string }> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_TTS_API_KEY manquant');

  const voice = DEFAULT_VOICE[languageCode];
  if (!voice) throw new Error(`Pas de voix configurée pour la langue ${languageCode}`);

  const res = await fetch(`${TTS_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice,
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google TTS a échoué (${res.status}): ${errText}`);
  }

  const { audioContent } = (await res.json()) as { audioContent: string };
  const audioBuffer = Buffer.from(audioContent, 'base64');

  const { error: uploadError } = await supabaseAdmin.storage
    .from('phrase-audio')
    .upload(storagePath, audioBuffer, { contentType: 'audio/mpeg', upsert: true });

  if (uploadError) throw uploadError;

  const { data: publicUrl } = supabaseAdmin.storage.from('phrase-audio').getPublicUrl(storagePath);

  return { audioUrl: publicUrl.publicUrl, voice: voice.name };
}
