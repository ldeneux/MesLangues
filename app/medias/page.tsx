'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { probeYouTube, youtubeErrorLabel, youtubeInfo } from '@/lib/media';

// Questions « vidéo » : bandes-annonces de films (TMDB) et liens YouTube collés (pubs, extraits…).
// Rien n'est stocké à part le lien de la vidéo.
type Category = { id: string; name: string; emoji: string };
type Level = { id: string; label: string; sort_order: number; is_hidden?: boolean };
type Movie = { id: number; title: string; year: string; poster: string; votes: number };
type Source = 'top_rated' | 'popular' | 'now_playing' | 'trending' | 'decade';
type Ask = 'mix' | 'title' | 'director' | 'year';
type LinkItem = { raw: string; url: string; answer: string; others: string[]; valid: boolean; check?: 'ok' | 'ko' | 'warn' | 'pending'; title?: string; reason?: string };

const FONT: React.CSSProperties = { fontFamily: 'Inter, sans-serif' };
const card: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 24, marginBottom: 20, maxWidth: 860, boxShadow: '0 10px 30px -16px rgba(31,36,64,0.15)', ...FONT };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #dfe3f0', background: '#fff', fontSize: 13.5, fontWeight: 600, color: '#1f2440', ...FONT };
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#1f2440', marginBottom: 6, display: 'block', ...FONT };
const actionBtn: React.CSSProperties = { background: '#6c7bf7', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', ...FONT };
const ghostBtn: React.CSSProperties = { background: '#eef0f8', color: '#1f2440', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', ...FONT };

const PROMPTS = [
  '📺 De quelle marque est cette publicité ?',
  '🎬 De quel film est cet extrait ?',
  '📺 De quelle série est cet extrait ?',
  '🎮 De quel jeu vidéo est cette bande-annonce ?',
  '🎤 Quel artiste chante dans ce clip ?',
];
const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const SOURCES: [Source, string][] = [
  ['top_rated', 'Films cultes (les mieux notés)'],
  ['popular', 'Populaires du moment'],
  ['now_playing', "À l'affiche (France)"],
  ['trending', 'Tendances de la semaine'],
  ['decade', 'Par décennie'],
];

// « lien ; bonne réponse ; autre1 | autre2 | autre3 » (les deux dernières parties sont facultatives)
function parseLines(text: string): LinkItem[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((raw) => {
      const [url = '', answer = '', others = ''] = raw.split(';').map((p) => p.trim());
      return { raw, url, answer, others: others ? others.split('|').map((o) => o.trim()).filter(Boolean) : [], valid: !!youtubeInfo(url) && !!answer };
    });
}

export default function MediasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [progress, setProgress] = useState<{ label: string; done: number; total: number } | null>(null);
  const stopRef = useRef(false);

  // ---- Films (TMDB) ----
  const [tmdbOk, setTmdbOk] = useState<boolean | null>(null);
  const [source, setSource] = useState<Source>('top_rated');
  const [decade, setDecade] = useState(1980);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [maxCount, setMaxCount] = useState(40);
  const [ask, setAsk] = useState<Ask>('mix');
  const [loading, setLoading] = useState(false);

  // ---- Liens YouTube ----
  const [text, setText] = useState('');
  const [prompt, setPrompt] = useState(PROMPTS[0]);
  const [items, setItems] = useState<LinkItem[]>([]);
  const probeRef = useRef<HTMLDivElement>(null); // petits lecteurs de test (retirés dès le verdict)

  useEffect(() => {
    (async () => {
      const [{ data: cats }, { data: lvls }] = await Promise.all([
        supabase.from('categories').select('*').order('name'),
        supabase.from('difficulty_levels').select('*').order('sort_order'),
      ]);
      const cl = (cats ?? []) as Category[];
      const ll = ((lvls ?? []) as Level[]).filter((l) => !l.is_hidden);
      setCategories(cl);
      setLevels(ll);
      setCategoryId((cl.find((c) => /cin|film|vid/i.test(c.name)) ?? cl[0])?.id ?? '');
      setLevelId(ll[0]?.id ?? '');
    })();
    fetch('/api/tmdb?status=1')
      .then((r) => r.json())
      .then((j) => setTmdbOk(!!j.configured))
      .catch(() => setTmdbOk(false));
  }, []);

  useEffect(() => setItems(parseLines(text)), [text]);

  const loadMovies = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tmdb?list=${source}${source === 'decade' ? `&decade=${decade}` : ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Chargement impossible');
      setMovies(json.movies ?? []);
      setExcluded(new Set());
    } catch (e: any) {
      setMessage({ kind: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  const retained = useMemo(() => movies.slice(0, Math.max(1, maxCount)), [movies, maxCount]);
  const toCreate = retained.filter((m) => !excluded.has(m.id));

  const createFilms = async () => {
    if (!categoryId || !levelId) return setMessage({ kind: 'error', text: 'Choisis une catégorie et un niveau.' });
    stopRef.current = false;
    setMessage(null);
    const titles = Array.from(new Set(movies.map((m) => m.title)));
    let created = 0;
    let skipped = 0;
    let packName = '';
    let packCount = 0;
    setProgress({ label: 'Films', done: 0, total: toCreate.length });
    try {
      for (let i = 0; i < toCreate.length; i += 10) {
        if (stopRef.current) break;
        const batch = toCreate.slice(i, i + 10);
        const res = await fetch('/api/tmdb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk', movieIds: batch.map((m) => m.id), titles, ask, categoryId, levelId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Création impossible');
        created += json.created;
        skipped += json.skipped;
        packName = json.packName;
        packCount = json.packCount;
        setProgress({ label: 'Films', done: Math.min(i + 10, toCreate.length), total: toCreate.length });
      }
      setMessage({
        kind: 'ok',
        text: `${created} question${created > 1 ? 's' : ''} ajoutée${created > 1 ? 's' : ''} au pack « ${packName} » (${packCount} au total)${skipped ? `, ${skipped} film${skipped > 1 ? 's' : ''} ignoré${skipped > 1 ? 's' : ''} (sans bande-annonce, déjà présent ou pas assez de choix)` : ''}${stopRef.current ? ' : arrêté avant la fin' : ''}.`,
      });
    } catch (e: any) {
      setMessage({ kind: 'error', text: `${e.message} (${created} déjà ajoutée${created > 1 ? 's' : ''})` });
    } finally {
      setProgress(null);
    }
  };

  // Vérification en deux temps : la vidéo existe et peut être intégrée (oEmbed), puis elle SE LIT vraiment depuis ce navigateur
  // (mini-lecteur YouTube : vidéo privée, supprimée, bloquée dans ton pays, intégration interdite…).
  const checkLinks = async () => {
    setMessage(null);
    const todo = items.map((it, i) => ({ it, i })).filter(({ it }) => it.valid);
    setItems((prev) => prev.map((it) => (it.valid ? { ...it, check: 'pending', reason: undefined } : it)));
    setProgress({ label: 'Test de lecture', done: 0, total: todo.length });
    let done = 0;
    for (let k = 0; k < todo.length; k += 3) {
      await Promise.all(
        todo.slice(k, k + 3).map(async ({ it, i }) => {
          let check: LinkItem['check'] = 'ok';
          let title: string | undefined;
          let reason: string | undefined;
          try {
            const res = await fetch(`/api/media?oembed=${encodeURIComponent(it.url)}`);
            const json = await res.json();
            title = json.title;
            if (!res.ok) {
              check = 'ko';
              reason = 'introuvable ou intégration interdite';
            }
          } catch {
            /* oEmbed injoignable : le test de lecture tranchera */
          }
          const info = youtubeInfo(it.url);
          if (check === 'ok' && info && probeRef.current) {
            const r = await probeYouTube(info.id, probeRef.current);
            if (!r.ok && !r.unknown) {
              check = 'ko';
              reason = youtubeErrorLabel(r.code);
            } else if (r.unknown) {
              check = 'warn';
              reason = 'lecture non vérifiée (lecteur YouTube injoignable)';
            }
          }
          setItems((prev) => prev.map((x, j) => (j === i ? { ...x, check, title, reason } : x)));
          done++;
          setProgress({ label: 'Test de lecture', done, total: todo.length });
        })
      );
    }
    setProgress(null);
  };

  const usable = items.filter((it) => it.valid && it.check !== 'ko');

  const createLinks = async () => {
    if (!categoryId || !levelId) return setMessage({ kind: 'error', text: 'Choisis une catégorie et un niveau.' });
    setMessage(null);
    const pool = Array.from(new Set(items.filter((it) => it.valid).map((it) => it.answer)));
    let created = 0;
    let skipped = 0;
    let packName = '';
    let packCount = 0;
    setProgress({ label: 'Questions', done: 0, total: usable.length });
    try {
      for (let i = 0; i < usable.length; i += 30) {
        const batch = usable.slice(i, i + 30);
        const res = await fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'links', items: batch.map(({ url, answer, others }) => ({ url, answer, others })), pool, prompt, categoryId, levelId }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Création impossible');
        created += json.created;
        skipped += json.skipped;
        packName = json.packName;
        packCount = json.packCount;
        setProgress({ label: 'Questions', done: Math.min(i + 30, usable.length), total: usable.length });
      }
      setMessage({
        kind: 'ok',
        text: `${created} question${created > 1 ? 's' : ''} ajoutée${created > 1 ? 's' : ''} au pack « ${packName} » (${packCount} au total)${skipped ? `, ${skipped} ignorée${skipped > 1 ? 's' : ''} (déjà présente ou pas assez de mauvaises réponses : colle au moins 4 lignes ou ajoute des « autres réponses »)` : ''}.`,
      });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e.message });
    } finally {
      setProgress(null);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '28px 40px', background: '#eef0f8', ...FONT }}>
      <div style={{ maxWidth: 860, marginBottom: 14, display: 'flex', gap: 18 }}>
        <a href="/parametrage" style={{ color: '#6c7bf7', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>← Paramétrage</a>
        <a href="/blindtest" style={{ color: '#6c7bf7', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>🎵 Blind test (Deezer)</a>
      </div>

      <section style={card}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: '#1f2440' }}>🎬 Bandes-annonces et vidéos</h1>
        <p style={{ color: '#7a819c', fontSize: 13.5, margin: '0 0 18px' }}>
          Les vidéos se jouent sur l'écran de l'hôte ; seule l'adresse YouTube est enregistrée. Les questions vont dans un pack « Cinéma · catégorie » (films) ou « Vidéos · catégorie » (liens collés), à ajouter à un profil.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>Catégorie</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={inputStyle}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Niveau</label>
            <select value={levelId} onChange={(e) => setLevelId(e.target.value)} style={inputStyle}>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
        {message && (
          <p style={{ margin: '14px 0 0', fontSize: 13.5, fontWeight: 700, color: message.kind === 'ok' ? '#1d8f74' : '#c0392b' }}>
            {message.kind === 'ok' ? '✓ ' : ''}{message.text}
          </p>
        )}
        {progress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2440' }}>{progress.label}</span>
            <div style={{ flex: 1, height: 10, background: '#eef0f8', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%`, height: '100%', background: '#6c7bf7', transition: 'width .3s' }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2440' }}>{progress.done}/{progress.total}</span>
            <button type="button" onClick={() => { stopRef.current = true; }} style={ghostBtn}>Arrêter</button>
          </div>
        )}
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: '#1f2440' }}>🎞️ Films (TMDB)</h2>
        {tmdbOk === false ? (
          <p style={{ color: '#c0392b', fontSize: 13.5, fontWeight: 600, lineHeight: 1.6 }}>
            Clé TMDB absente. Crée un compte gratuit sur themoviedb.org, demande une clé d'API (Paramètres → API), puis ajoute <code>TMDB_API_KEY=…</code> dans <code>.env.local</code> et dans les variables d'environnement Vercel.
          </p>
        ) : (
          <>
            <p style={{ color: '#7a819c', fontSize: 13.5, margin: '0 0 14px' }}>
              Charge une liste de films : la bande-annonce YouTube, le réalisateur et l'année sont récupérés automatiquement. Les films sans bande-annonce sont ignorés.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {SOURCES.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSource(id)}
                  style={{ ...ghostBtn, background: source === id ? '#6c7bf7' : '#eef0f8', color: source === id ? '#fff' : '#1f2440' }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {source === 'decade' && (
                <select value={decade} onChange={(e) => setDecade(Number(e.target.value))} style={{ ...inputStyle, width: 160 }}>
                  {DECADES.map((d) => (
                    <option key={d} value={d}>Années {d}</option>
                  ))}
                </select>
              )}
              <button type="button" disabled={loading} onClick={loadMovies} style={actionBtn}>{loading ? 'Chargement…' : 'Charger la liste'}</button>
            </div>

            {movies.length > 0 && (
              <div style={{ marginTop: 18, borderTop: '1px solid #eaedf6', paddingTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#1f2440', marginBottom: 10 }}>{movies.length} films chargés, {toCreate.length} retenus</div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 13.5, fontWeight: 600, color: '#1f2440' }}>
                  <label>
                    Nombre max{' '}
                    <input type="number" min={1} max={100} value={maxCount} onChange={(e) => setMaxCount(Number(e.target.value))} style={{ ...inputStyle, width: 80, display: 'inline-block' }} />
                  </label>
                  <label>
                    Questions{' '}
                    <select value={ask} onChange={(e) => setAsk(e.target.value as Ask)} style={{ ...inputStyle, width: 'auto', display: 'inline-block' }}>
                      <option value="mix">Mélange</option>
                      <option value="director">Qui a réalisé ?</option>
                      <option value="year">Quelle année ?</option>
                      <option value="title">Quel film ? (le titre peut s'afficher dans le lecteur)</option>
                    </select>
                  </label>
                </div>
                <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid #eaedf6', borderRadius: 12 }}>
                  {retained.map((m) => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderBottom: '1px solid #f1f3fa', fontSize: 13.5, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!excluded.has(m.id)}
                        onChange={(e) => setExcluded((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(m.id); else n.add(m.id); return n; })}
                      />
                      {m.poster ? <img src={m.poster} alt="" width={30} height={45} style={{ borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 30, height: 45, background: '#eef0f8', borderRadius: 4 }} />}
                      <span style={{ flex: 1 }}><b>{m.title}</b> <span style={{ color: '#7a819c' }}>{m.year && `(${m.year})`}</span></span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <button type="button" disabled={!!progress || toCreate.length === 0} onClick={createFilms} style={actionBtn}>
                    Créer {toCreate.length} question{toCreate.length > 1 ? 's' : ''}
                  </button>
                </div>
              </div>
            )}
            <p style={{ color: '#7a819c', fontSize: 12, marginTop: 16 }}>Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. Données : themoviedb.org.</p>
          </>
        )}
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: '#1f2440' }}>📺 Liens YouTube (pubs, extraits, clips…)</h2>
        <p style={{ color: '#7a819c', fontSize: 13.5, margin: '0 0 14px' }}>
          Une ligne par vidéo : <code>lien ; bonne réponse</code>. Début et fin dans le lien (<code>&amp;start=12&amp;end=40</code> ou <code>?t=12</code>). Pour choisir les mauvaises réponses : <code>lien ; bonne réponse ; autre1 | autre2 | autre3</code>. Sinon elles sont prises parmi les autres réponses de la liste (4 lignes au moins).
        </p>
        <label style={labelStyle}>Question posée</label>
        <input list="prompts" value={prompt} onChange={(e) => setPrompt(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
        <datalist id="prompts">
          {PROMPTS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder={'https://youtu.be/XXXXXXXXXXX ; Orangina\nhttps://www.youtube.com/watch?v=YYYYYYYYYYY&start=5&end=25 ; Renault'}
          style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontWeight: 500, resize: 'vertical' }}
        />
        {items.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '4px 0', fontSize: 13, borderTop: '1px solid #f1f3fa' }}>
                <span style={{ width: 22 }}>{!it.valid ? '⚠️' : it.check === 'ok' ? '✅' : it.check === 'ko' ? '❌' : it.check === 'warn' ? '❔' : it.check === 'pending' ? '⏳' : '•'}</span>
                <span style={{ fontWeight: 700, color: '#1f2440' }}>{it.answer || '(réponse manquante)'}</span>
                <span style={{ color: '#7a819c', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {!it.valid ? (youtubeInfo(it.url) ? 'réponse manquante' : 'lien YouTube non reconnu') : it.reason ?? it.title ?? it.url}
                </span>
              </div>
            ))}
          </div>
        )}
        <div ref={probeRef} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }} />
        <p style={{ color: '#7a819c', fontSize: 12.5, margin: '10px 0 0' }}>
          « Vérifier les liens » joue un instant chaque vidéo dans un mini-lecteur pour s'assurer qu'elle est lisible chez toi ; les vidéos en ❌ ne sont pas importées.
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" disabled={!!progress || items.filter((it) => it.valid).length === 0} onClick={checkLinks} style={ghostBtn}>Vérifier les liens</button>
          <button type="button" disabled={!!progress || usable.length === 0} onClick={createLinks} style={actionBtn}>
            Créer {usable.length} question{usable.length > 1 ? 's' : ''}
          </button>
        </div>
      </section>
    </main>
  );
}
