import { putAudio } from './audioStorage';

const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

// Une voix neurale "Standard" (gratuite dans le quota le plus large) par langue.
// Voir la liste complète : https://cloud.google.com/text-to-speech/docs/voices
const DEFAULT_VOICE: Record<string, { languageCode: string; name: string }> = {
  it: { languageCode: 'it-IT', name: 'it-IT-Standard-A' },
  es: { languageCode: 'es-ES', name: 'es-ES-Standard-A' },
  en: { languageCode: 'en-US', name: 'en-US-Standard-C' },
  ja: { languageCode: 'ja-JP', name: 'ja-JP-Standard-A' },
  de: { languageCode: 'de-DE', name: 'de-DE-Standard-A' },
};

/**
 * Synthétise `text` dans la langue donnée via Google Cloud TTS (simple appel
 * HTTPS, pas de WebSocket — fiable en environnement serverless), enregistre le
 * MP3 résultant (Cloudflare R2 ou Supabase Storage, voir audioStorage.ts), et retourne
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

  // Cloudflare R2 si configuré (variables R2_*), sinon Supabase Storage
  const audioUrl = await putAudio(storagePath, audioBuffer);

  return { audioUrl, voice: voice.name };
}
