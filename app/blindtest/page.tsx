'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { AskKind, DeezerTrack } from '@/lib/deezer';

// Création de questions « blind test » : on cherche un morceau sur Deezer, on l'écoute (30 s), et la question est créée
// avec 3 mauvaises réponses plausibles. Rien n'est stocké à part le lien du morceau.
type Category = { id: string; name: string; emoji: string };
type Level = { id: string; label: string; sort_order: number; is_hidden?: boolean };

const FONT: React.CSSProperties = { fontFamily: 'Inter, sans-serif' };
const card: React.CSSProperties = { background: '#fff', borderRadius: 20, padding: 24, marginBottom: 20, maxWidth: 820, boxShadow: '0 10px 30px -16px rgba(31,36,64,0.15)', ...FONT };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #dfe3f0', background: '#fff', fontSize: 13.5, fontWeight: 600, color: '#1f2440', ...FONT };
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#1f2440', marginBottom: 6, display: 'block', ...FONT };
const actionBtn: React.CSSProperties = { background: '#6c7bf7', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', ...FONT };
const ghostBtn: React.CSSProperties = { background: '#eef0f8', color: '#1f2440', border: 'none', borderRadius: 999, padding: '10px 16px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', ...FONT };

type ListInfo = { id: number; title: string; nbTracks: number; picture: string };
type BulkSource = 'chart' | 'playlist' | 'artist';
const BATCH = 25; // questions créées par requête (reste rapide, avec une barre de progression)

export default function BlindTestPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [ask, setAsk] = useState<AskKind>('artist');
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<DeezerTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [created, setCreated] = useState<string[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ---- Import en masse ----
  const [source, setSource] = useState<BulkSource>('chart');
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [genreId, setGenreId] = useState(0);
  const [listQuery, setListQuery] = useState('');
  const [lists, setLists] = useState<ListInfo[]>([]);
  const [bulkTracks, setBulkTracks] = useState<DeezerTrack[]>([]);
  const [bulkTitle, setBulkTitle] = useState('');
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [maxCount, setMaxCount] = useState(50);
  const [byPopularity, setByPopularity] = useState(true);
  const [perArtist, setPerArtist] = useState(true);
  const [bulkAsk, setBulkAsk] = useState<AskKind | 'mix'>('mix');
  const [loadingBulk, setLoadingBulk] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    fetch('/api/deezer?genres=1')
      .then((r) => r.json())
      .then((j) => setGenres(j.genres ?? []))
      .catch(() => undefined);
  }, []);

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
      setCategoryId((cl.find((c) => /musi/i.test(c.name)) ?? cl[0])?.id ?? '');
      setLevelId(ll[0]?.id ?? '');
    })();
    return () => audioRef.current?.pause();
  }, []);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/deezer?search=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Recherche impossible');
      setTracks(json.tracks ?? []);
      if ((json.tracks ?? []).length === 0) setMessage({ kind: 'error', text: 'Aucun morceau avec extrait pour cette recherche.' });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e.message });
    } finally {
      setSearching(false);
    }
  };

  const togglePlay = (t: DeezerTrack) => {
    const a = audioRef.current;
    if (!a) return;
    if (playingId === t.id) {
      a.pause();
      setPlayingId(null);
      return;
    }
    a.src = t.preview;
    a.play().then(() => setPlayingId(t.id)).catch(() => setPlayingId(null));
  };

  const create = async (t: DeezerTrack) => {
    if (!categoryId || !levelId) {
      setMessage({ kind: 'error', text: 'Choisis une catégorie et un niveau.' });
      return;
    }
    setCreating(t.id);
    setMessage(null);
    try {
      const res = await fetch('/api/deezer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: t.id, ask, categoryId, levelId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Création impossible');
      setCreated((prev) => [`${t.titleShort} — ${t.artist.name}`, ...prev]);
      setMessage({ kind: 'ok', text: `Question ajoutée au pack « ${json.packName} » (${json.packCount} question${json.packCount > 1 ? 's' : ''}).` });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e.message });
    } finally {
      setCreating(null);
    }
  };

  const loadTracks = async (url: string, title: string) => {
    setLoadingBulk(true);
    setMessage(null);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Chargement impossible');
      setBulkTracks(json.tracks ?? []);
      setBulkTitle(title);
      setExcluded(new Set());
      if ((json.tracks ?? []).length === 0) setMessage({ kind: 'error', text: 'Aucun titre avec extrait dans cette liste.' });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e.message });
    } finally {
      setLoadingBulk(false);
    }
  };

  const searchLists = async () => {
    const q = listQuery.trim();
    if (!q) return;
    setLoadingBulk(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/deezer?${source === 'playlist' ? 'playlistSearch' : 'artistSearch'}=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Recherche impossible');
      setLists(json.lists ?? []);
      if ((json.lists ?? []).length === 0) setMessage({ kind: 'error', text: 'Aucun résultat.' });
    } catch (e: any) {
      setMessage({ kind: 'error', text: e.message });
    } finally {
      setLoadingBulk(false);
    }
  };

  // Liste proposée : triée par popularité (rang Deezer), 2 titres au plus par artiste, limitée au nombre demandé
  const candidates = useMemo(() => {
    let list = [...bulkTracks];
    if (byPopularity) list.sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
    if (perArtist) {
      const count = new Map<string, number>();
      list = list.filter((t) => {
        const n = (count.get(t.artist.name) ?? 0) + 1;
        count.set(t.artist.name, n);
        return n <= 2;
      });
    }
    return list.slice(0, Math.max(1, maxCount));
  }, [bulkTracks, byPopularity, perArtist, maxCount]);

  const toCreate = candidates.filter((t) => !excluded.has(t.id));

  const createBulk = async () => {
    if (!categoryId || !levelId) {
      setMessage({ kind: 'error', text: 'Choisis une catégorie et un niveau.' });
      return;
    }
    // Les mauvaises réponses viennent de TOUTE la liste chargée : même époque, même style
    const pool = {
      artists: Array.from(new Set(bulkTracks.map((t) => t.artist.name))),
      titles: Array.from(new Set(bulkTracks.map((t) => t.titleShort))),
    };
    stopRef.current = false;
    setMessage(null);
    let created = 0;
    let skipped = 0;
    let packName = '';
    let packCount = 0;
    setProgress({ done: 0, total: toCreate.length });
    try {
      for (let i = 0; i < toCreate.length; i += BATCH) {
        if (stopRef.current) break;
        const batch = toCreate.slice(i, i + BATCH);
        const res = await fetch('/api/deezer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'bulk',
            tracks: batch.map(({ id, title, titleShort, link, artist, album }) => ({ id, title, titleShort, link, artist, album })),
            pool,
            ask: bulkAsk,
            categoryId,
            levelId,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Création impossible');
        created += json.created;
        skipped += json.skipped;
        packName = json.packName;
        packCount = json.packCount;
        setProgress({ done: Math.min(i + BATCH, toCreate.length), total: toCreate.length });
      }
      setMessage({
        kind: 'ok',
        text: `${created} question${created > 1 ? 's' : ''} ajoutée${created > 1 ? 's' : ''} au pack « ${packName} » (${packCount} au total)${skipped ? `, ${skipped} ignorée${skipped > 1 ? 's' : ''} (déjà présentes ou pas assez de mauvaises réponses)` : ''}${stopRef.current ? ' : arrêté avant la fin' : ''}.`,
      });
    } catch (e: any) {
      setMessage({ kind: 'error', text: `${e.message} (${created} question${created > 1 ? 's' : ''} déjà ajoutée${created > 1 ? 's' : ''})` });
    } finally {
      setProgress(null);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '28px 40px', background: '#eef0f8', ...FONT }}>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
      <div style={{ maxWidth: 820, marginBottom: 14 }}>
        <a href="/parametrage" style={{ color: '#6c7bf7', fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>← Paramétrage</a>
        <a href="/medias" style={{ color: '#6c7bf7', fontWeight: 700, fontSize: 13.5, textDecoration: 'none', marginLeft: 18 }}>🎬 Bandes-annonces et vidéos</a>
      </div>

      <section style={card}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px', color: '#1f2440' }}>🎵 Blind test (Deezer)</h1>
        <p style={{ color: '#7a819c', fontSize: 13.5, margin: '0 0 18px' }}>
          Cherche un morceau, écoute l'extrait de 30 s, puis crée la question : seule l'adresse du morceau est enregistrée, jamais le son. Les questions vont dans un pack « Blind test · catégorie » à ajouter à un profil.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
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
          <div>
            <label style={labelStyle}>Question posée</label>
            <select value={ask} onChange={(e) => setAsk(e.target.value as AskKind)} style={inputStyle}>
              <option value="artist">Qui interprète ce morceau ?</option>
              <option value="title">Quel est le titre ?</option>
            </select>
          </div>
        </div>
      </section>

      <section style={card}>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="Artiste et/ou titre (ex. Aya Nakamura Djadja)"
            style={inputStyle}
          />
          <button type="button" onClick={search} disabled={searching} style={{ ...actionBtn, whiteSpace: 'nowrap' }}>
            {searching ? 'Recherche…' : 'Chercher'}
          </button>
        </div>

        {message && (
          <p style={{ margin: '14px 0 0', fontSize: 13.5, fontWeight: 700, color: message.kind === 'ok' ? '#1d8f74' : '#c0392b' }}>
            {message.kind === 'ok' ? '✓ ' : ''}{message.text}
          </p>
        )}

        <div style={{ marginTop: 16 }}>
          {tracks.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0', borderTop: '1px solid #eaedf6' }}>
              {t.album.cover ? (
                <img src={t.album.cover} alt="" width={52} height={52} style={{ borderRadius: 10, objectFit: 'cover', flex: '0 0 auto' }} />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: 10, background: '#eef0f8', flex: '0 0 auto' }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#1f2440', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.titleShort}</div>
                <div style={{ fontSize: 12.5, color: '#7a819c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.artist.name}{t.album.title ? ` · ${t.album.title}` : ''}
                </div>
              </div>
              <button type="button" onClick={() => togglePlay(t)} style={ghostBtn}>{playingId === t.id ? '⏸ Pause' : '▶ Écouter'}</button>
              <button type="button" onClick={() => create(t)} disabled={creating === t.id} style={actionBtn}>
                {creating === t.id ? 'Création…' : '＋ Créer la question'}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px', color: '#1f2440' }}>⚡ Importer en masse</h2>
        <p style={{ color: '#7a819c', fontSize: 13.5, margin: '0 0 14px' }}>
          Charge une liste (classement du moment, playlist « années 80 », titres d'un artiste…), garde les plus populaires et crée toutes les questions d'un coup. Les mauvaises réponses viennent de la même liste, donc de la même époque.
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {([['chart', 'Classement du moment'], ['playlist', 'Playlist'], ['artist', 'Artiste']] as [BulkSource, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setSource(id); setLists([]); }}
              style={{ ...ghostBtn, background: source === id ? '#6c7bf7' : '#eef0f8', color: source === id ? '#fff' : '#1f2440' }}
            >
              {label}
            </button>
          ))}
        </div>

        {source === 'chart' ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <select value={genreId} onChange={(e) => setGenreId(Number(e.target.value))} style={inputStyle}>
              {(genres.length ? genres : [{ id: 0, name: 'Tous les genres' }]).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button type="button" disabled={loadingBulk} onClick={() => loadTracks(`/api/deezer?chart=${genreId}`, `Classement du moment (${genres.find((g) => g.id === genreId)?.name ?? 'tous genres'})`)} style={{ ...actionBtn, whiteSpace: 'nowrap' }}>
              {loadingBulk ? 'Chargement…' : 'Charger'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchLists(); }}
                placeholder={source === 'playlist' ? 'ex. années 80, hits 90, rap français, top France' : "ex. Daft Punk, Aya Nakamura"}
                style={inputStyle}
              />
              <button type="button" disabled={loadingBulk} onClick={searchLists} style={{ ...actionBtn, whiteSpace: 'nowrap' }}>Chercher</button>
            </div>
            <div style={{ marginTop: 10 }}>
              {lists.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => loadTracks(source === 'playlist' ? `/api/deezer?playlist=${l.id}` : `/api/deezer?artistTop=${l.id}`, l.title)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', padding: '8px 4px', background: 'none', border: 'none', borderTop: '1px solid #eaedf6', cursor: 'pointer', ...FONT }}
                >
                  {l.picture ? <img src={l.picture} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} /> : <div style={{ width: 40, height: 40, borderRadius: 8, background: '#eef0f8' }} />}
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: '#1f2440' }}>{l.title}</span>
                  {l.nbTracks > 0 && <span style={{ color: '#7a819c', fontSize: 12.5 }}>{l.nbTracks} titres</span>}
                  <span style={{ marginLeft: 'auto', color: '#6c7bf7', fontWeight: 700, fontSize: 13 }}>Charger →</span>
                </button>
              ))}
            </div>
          </>
        )}

        {bulkTracks.length > 0 && (
          <div style={{ marginTop: 18, borderTop: '1px solid #eaedf6', paddingTop: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1f2440', marginBottom: 10 }}>
              {bulkTitle} · {bulkTracks.length} titres chargés, {toCreate.length} retenus
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 13.5, fontWeight: 600, color: '#1f2440' }}>
              <label>
                Nombre max{' '}
                <input type="number" min={1} max={300} value={maxCount} onChange={(e) => setMaxCount(Number(e.target.value))} style={{ ...inputStyle, width: 80, display: 'inline-block' }} />
              </label>
              <label><input type="checkbox" checked={byPopularity} onChange={(e) => setByPopularity(e.target.checked)} /> Les plus populaires d'abord</label>
              <label><input type="checkbox" checked={perArtist} onChange={(e) => setPerArtist(e.target.checked)} /> 2 titres max par artiste</label>
              <label>
                Questions{' '}
                <select value={bulkAsk} onChange={(e) => setBulkAsk(e.target.value as AskKind | 'mix')} style={{ ...inputStyle, width: 'auto', display: 'inline-block' }}>
                  <option value="mix">Mélange artiste / titre</option>
                  <option value="artist">Qui interprète ?</option>
                  <option value="title">Quel titre ?</option>
                </select>
              </label>
            </div>

            <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #eaedf6', borderRadius: 12 }}>
              {candidates.map((t) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid #f1f3fa', fontSize: 13.5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!excluded.has(t.id)}
                    onChange={(e) => setExcluded((prev) => { const n = new Set(prev); if (e.target.checked) n.delete(t.id); else n.add(t.id); return n; })}
                  />
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b>{t.titleShort}</b> <span style={{ color: '#7a819c' }}>— {t.artist.name}</span>
                  </span>
                  <button type="button" onClick={(e) => { e.preventDefault(); togglePlay(t); }} style={{ ...ghostBtn, padding: '4px 10px', fontSize: 12 }}>{playingId === t.id ? '⏸' : '▶'}</button>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
              <button type="button" disabled={!!progress || toCreate.length === 0} onClick={createBulk} style={actionBtn}>
                Créer {toCreate.length} question{toCreate.length > 1 ? 's' : ''}
              </button>
              {progress && (
                <>
                  <div style={{ flex: 1, height: 10, background: '#eef0f8', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${(100 * progress.done) / Math.max(1, progress.total)}%`, height: '100%', background: '#6c7bf7', transition: 'width .3s' }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2440' }}>{progress.done}/{progress.total}</span>
                  <button type="button" onClick={() => { stopRef.current = true; }} style={ghostBtn}>Arrêter</button>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {created.length > 0 && (
        <section style={card}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 8px', color: '#1f2440' }}>Ajoutées pendant cette session</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#4b5270', fontSize: 13.5, lineHeight: 1.7 }}>
            {created.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
