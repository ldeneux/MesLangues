import Link from 'next/link';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const LANGS = [
  { code: 'it', label: 'Italien', flag: '🇮🇹' },
  { code: 'es', label: 'Espagnol', flag: '🇪🇸' },
  { code: 'en', label: 'Anglais', flag: '🇬🇧' },
];

export const revalidate = 0;

export default async function Home() {
  const today = new Date().toISOString().slice(0, 10);

  const counts = await Promise.all(
    LANGS.map(async (l) => {
      const { count } = await supabaseAdmin
        .from('phrase_sets')
        .select('id', { count: 'exact', head: true })
        .eq('language_code', l.code)
        .eq('set_date', today);
      return { code: l.code, hasToday: (count ?? 0) > 0 };
    })
  );

  return (
    <main className="page">
      <h1>Frasi</h1>
      <p className="eyebrow-free">
        30 phrases de tous les jours, générées et prononcées, en italien, espagnol et anglais.
        Niveau A1 pour commencer.
      </p>

      <div className="lang-grid">
        {LANGS.map((l) => {
          const status = counts.find((c) => c.code === l.code);
          return (
            <Link key={l.code} href={`/practice/${l.code}`} className="lang-card">
              <span>
                <span className="flag">{l.flag}</span> {l.label}
              </span>
              <span className="meta">
                {status?.hasToday ? "Phrases du jour prêtes" : 'Pas encore générées'}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
