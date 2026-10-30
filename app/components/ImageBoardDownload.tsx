'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getMissingImageWords, type MissingImageSummary } from '../../lib/imageBoardServer';
import { BOARD_SIZE, buildBoardPrompt, cropToWebp, loadBoard, makeZip } from '../../lib/imageBoard';
import { LANGS } from '../../lib/constants';

type Card = { name: string; url: string; blob: Blob; include: boolean };

const hiddenKey = (lang: string) => `imgboard-hidden-${lang}`;

function readHidden(lang: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(hiddenKey(lang)) ?? '[]'));
  } catch {
    return new Set<string>();
  }
}

/**
 * Images manquantes d'une langue (tous niveaux, A1 → B2) : prépare un prompt pour ChatGPT (60 mots), puis découpe la planche
 * reçue en 60 images .webp nommées d'après le mot français. Les fichiers sont à déposer dans public/image_webp (voir README).
 */
export default function ImageBoardDownload({ languageCode }: { languageCode: string }) {
  const langLabel = LANGS.find((l) => l.code === languageCode)?.label ?? languageCode;

  const [summary, setSummary] = useState<MissingImageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [method, setMethod] = useState<'lines' | 'fit' | 'grid' | null>(null);
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;
  const promptRef = useRef<HTMLTextAreaElement>(null);

  function clearCards() {
    cardsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
    setCards([]);
    setMethod(null);
  }

  useEffect(() => {
    setSummary(null);
    setError('');
    setHidden(readHidden(languageCode));
    clearCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode]);

  useEffect(() => () => cardsRef.current.forEach((c) => URL.revokeObjectURL(c.url)), []);

  const remaining = useMemo(() => (summary ? summary.words.filter((w) => !hidden.has(w.name)) : []), [summary, hidden]);
  const batch = useMemo(() => remaining.slice(0, BOARD_SIZE), [remaining]);
  const prompt = useMemo(() => buildBoardPrompt(batch.map((w) => w.fr)), [batch]);

  async function handleLoad() {
    setLoading(true);
    setError('');
    try {
      setSummary(await getMissingImageWords(languageCode));
    } catch (e: any) {
      setError(e?.message ?? 'Erreur pendant la recherche des images manquantes.');
    } finally {
      setLoading(false);
    }
  }

  function persistHidden(next: Set<string>) {
    setHidden(next);
    try {
      localStorage.setItem(hiddenKey(languageCode), JSON.stringify(Array.from(next)));
    } catch {
      /* stockage indisponible : l'écart ne sera valable que pour cette session */
    }
  }

  // Écarter un mot (difficile à illustrer) : il n'est plus proposé, le suivant le remplace. Le prompt change, la planche en cours est abandonnée.
  function skipWord(name: string) {
    clearCards();
    persistHidden(new Set(hidden).add(name));
  }

  // Lot terminé : ces mots ne sont plus proposés (ils disparaissent de toute façon de la liste au prochain déploiement).
  function finishBatch() {
    clearCards();
    persistHidden(new Set([...Array.from(hidden), ...batch.map((w) => w.name)]));
  }

  function resetHidden() {
    clearCards();
    persistHidden(new Set());
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      promptRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    clearCards();
    try {
      const { canvas, grid } = await loadBoard(file);
      const out: Card[] = [];
      for (let i = 0; i < batch.length; i++) {
        const blob = await cropToWebp(canvas, grid.rects[i]);
        out.push({ name: batch[i].name, url: URL.createObjectURL(blob), blob, include: true });
      }
      setCards(out);
      setMethod(grid.method);
    } catch (err: any) {
      setError(err?.message ?? "Impossible de lire cette image.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    const chosen = cards.filter((c) => c.include);
    if (chosen.length === 0) return;
    const files = await Promise.all(
      chosen.map(async (c) => ({ name: `${c.name}.webp`, data: new Uint8Array(await c.blob.arrayBuffer()) }))
    );
    const zip = makeZip(files);
    const url = URL.createObjectURL(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }));
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `images_${languageCode}_${stamp}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const includedCount = cards.filter((c) => c.include).length;

  return (
    <div className="pack-list" style={{ marginTop: '2rem' }}>
      <div className="pack-row">
        <div>
          <div className="pack-row-title">Images manquantes — {langLabel}, tous niveaux</div>
          <div className="pack-row-sub">
            {summary
              ? `${remaining.length} mot(s) sans image${
                  summary.words.length !== remaining.length ? ` (${summary.words.length - remaining.length} écarté(s))` : ''
                } — ${['A1', 'A2', 'B1', 'B2'].map((l) => `${l} : ${summary.byLevel[l] ?? 0}`).join(' · ')}`
              : `Prépare une planche de ${BOARD_SIZE} illustrations pour ChatGPT, puis découpe-la ici.`}
          </div>
        </div>
        {!summary && (
          <button className="secondary" onClick={handleLoad} disabled={loading}>
            {loading ? 'Recherche…' : 'Préparer un lot'}
          </button>
        )}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {summary && remaining.length === 0 && <p className="eyebrow-free">Plus aucune image manquante pour cette langue. 🎉</p>}

      {summary && batch.length > 0 && (
        <div>
          <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>
            <strong>1.</strong> Les {batch.length} prochains mots (A1 → B2). Écarte (✕) ceux qu'on ne peut pas illustrer : le suivant le remplace
            (pense alors à copier de nouveau le prompt).
          </p>
          <ol style={{ margin: '0.25rem 0 0.75rem', paddingLeft: '1.4rem', columns: '3 200px', fontSize: '0.85rem', maxHeight: '22rem', overflowY: 'auto' }}>
            {batch.map((w) => (
              <li key={w.name} style={{ breakInside: 'avoid' }}>
                {w.fr} <span style={{ opacity: 0.55, fontSize: '0.75rem' }}>{w.level}</span>{' '}
                <button
                  className="conv-mini-btn"
                  onClick={() => skipWord(w.name)}
                  title="Écarter ce mot"
                  aria-label={`Écarter « ${w.fr} »`}
                  style={{ padding: '0 0.4rem' }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ol>

          <p className="eyebrow-free">
            <strong>2.</strong> Copie le prompt, colle-le dans ChatGPT, puis enregistre l'image générée (en pleine résolution).
          </p>
          <textarea
            ref={promptRef}
            readOnly
            value={prompt}
            rows={8}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.75rem', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.5rem 0' }}>
            <button className="primary" onClick={copyPrompt}>
              {copied ? 'Copié ✓' : 'Copier le prompt'}
            </button>
          </div>

          <p className="eyebrow-free">
            <strong>3.</strong> Dépose la planche reçue : elle est découpée en {batch.length} image(s) .webp.
          </p>
          <input type="file" accept="image/*" onChange={handleFile} disabled={busy} />
          {busy && <p className="eyebrow-free">Découpe en cours…</p>}

          {cards.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              {method === 'fit' && (
                <p className="eyebrow-free">
                  Quelques traits magenta n'ont pas été retrouvés : la grille a été recalculée d'après les autres traits. Jette un œil aux vignettes.
                </p>
              )}
              {method === 'grid' && (
                <p className="conv-warning">
                  Les traits magenta n'ont pas été retrouvés : la découpe est approximative. Vérifie chaque vignette et décoche celles à refaire.
                </p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
                {cards.map((c, i) => (
                  <label
                    key={c.name}
                    style={{
                      border: '1px solid rgba(128,128,128,.4)',
                      borderRadius: 6,
                      padding: '0.3rem',
                      opacity: c.include ? 1 : 0.4,
                      fontSize: '0.8rem',
                      display: 'block',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.url} alt={c.name} style={{ width: '100%', height: 'auto', display: 'block', background: '#fff' }} />
                    <input
                      type="checkbox"
                      checked={c.include}
                      onChange={(e) => setCards((prev) => prev.map((x, k) => (k === i ? { ...x, include: e.target.checked } : x)))}
                    />{' '}
                    {c.name}
                  </label>
                ))}
              </div>

              <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>
                <strong>4.</strong> Télécharge le ZIP, dépose les fichiers dans <code>public/image_webp</code> et pousse sur GitHub : la liste des
                images se met à jour au déploiement.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="primary" onClick={downloadZip} disabled={includedCount === 0}>
                  Télécharger le ZIP ({includedCount} image{includedCount > 1 ? 's' : ''})
                </button>
                <button className="secondary" onClick={finishBatch}>
                  Lot terminé → {BOARD_SIZE} suivants
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {summary && hidden.size > 0 && (
        <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>
          {hidden.size} mot(s) écarté(s) ou déjà traité(s) sur cet appareil.{' '}
          <button className="conv-mini-btn" onClick={resetHidden}>
            Tout réafficher
          </button>
        </p>
      )}
    </div>
  );
}
