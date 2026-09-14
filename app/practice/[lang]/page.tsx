import Link from 'next/link';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

const LABELS: Record<string, { label: string; flag: string }> = {
  it: { label: 'Italien', flag: '🇮🇹' },
  es: { label: 'Espagnol', flag: '🇪🇸' },
  en: { label: 'Anglais', flag: '🇬🇧' },
};

export const revalidate = 0;

export default async function PracticePage({ params }: { params: { lang: string } }) {
  const lang = params.lang;
  const meta = LABELS[lang] ?? { label: lang, flag: '' };
  const today = new Date().toISOString().slice(0, 10);

  const { data: phraseSet } = await supabaseAdmin
    .from('phrase_sets')
    .select('id, theme')
    .eq('language_code', lang)
    .eq('level_code', 'A1')
    .eq('set_date', today)
    .maybeSingle();

  const phrases = phraseSet
    ? (
        await supabaseAdmin
          .from('phrases')
          .select('id, target_text, translation_fr, notes, audio_url, position')
          .eq('phrase_set_id', phraseSet.id)
          .order('position')
      ).data
    : [];

  return (
    <main className="page">
      <p><Link href="/">← retour</Link></p>
      <h1>{meta.flag} {meta.label} — aujourd'hui</h1>

      {!phraseSet && (
        <p className="eyebrow-free">
          Aucun lot généré pour aujourd'hui. Le cron quotidien s'en charge automatiquement,
          ou déclenche-le manuellement via <code>/api/generate-daily?language={lang}&level=A1&secret=...</code>.
        </p>
      )}

      {phraseSet?.theme && <p className="eyebrow-free">Thème du jour : {phraseSet.theme}</p>}

      <div className="phrase-list">
        {phrases?.map((p) => (
          <div className="phrase-card" key={p.id}>
            <div className="phrase-target">{p.target_text}</div>
            <div className="phrase-fr">{p.translation_fr}</div>
            {p.notes && <div className="phrase-notes">{p.notes}</div>}
            {p.audio_url && (
              <audio className="phrase-audio" controls preload="none" src={p.audio_url} />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
