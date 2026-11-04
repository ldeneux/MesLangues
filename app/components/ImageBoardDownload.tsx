'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getMissingImageWords, type BoardWord, type MissingImageSummary } from '../../lib/imageBoardServer';
import { generateBoardImage } from '../../lib/imageGenServer';
import { AUTO_BOARD_CHOICES, BOARD_COST_USD, BOARD_SIZE, buildBoardPrompt, cropToWebp, loadBoard, makeZip } from '../../lib/imageBoard';
import { LANGS } from '../../lib/constants';
import { USD_TO_EUR } from '../../lib/pricing';

type Card = { name: string; url: string; blob: Blob; include: boolean; approx?: boolean };
type GridMethod = 'lines' | 'fit' | 'grid';
type BoardWordLite = Pick<BoardWord, 'fr' | 'name'>;
type AutoState = { done: number; total: number; failed: number; running: boolean; lastError: string };

const AUTO_CONCURRENCY = 2; // planches générées en même temps (au-delà, OpenAI refuse souvent : limite de débit)
const AUTO_RETRIES = 3; // tentatives par planche en cas de limite de débit ou de panne passagère
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const worstMethod = (a: GridMethod | null, b: GridMethod): GridMethod => (a === 'grid' || b === 'grid' ? 'grid' : a === 'fit' || b === 'fit' ? 'fit' : 'lines');

// Image PNG en base64 (reçue du serveur) → fichier lisible par loadBoard
function b64ToFile(b64: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], 'planche.png', { type: 'image/png' });
}

const hiddenKey = (lang: string) => `imgboard-hidden-${lang}`;

function readHidden(lang: string): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(hiddenKey(lang)) ?? '[]'));
  } catch {
    return new Set<string>();
  }
}

/**
 * Images manquantes d'une langue (tous niveaux, A1 → B2), par planches de 20 mots.
 *  - Automatique : génère n planches avec gpt-image-1-mini (qualité medium), les découpe en .webp nommés d'après le mot français.
 *  - Manuel : prépare le prompt d'une planche pour ChatGPT, puis découpe l'image reçue.
 * Les fichiers sont à déposer dans public/image_webp (voir README).
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
  const [method, setMethod] = useState<GridMethod | null>(null);
  const [autoCount, setAutoCount] = useState(10); // nombre de planches à générer au lancement
  const [auto, setAuto] = useState<AutoState | null>(null);
  const cancelRef = useRef(false);
  const cardsRef = useRef<Card[]>([]);
  cardsRef.current = cards;
  const promptRef = useRef<HTMLTextAreaElement>(null);

  function clearCards() {
    cardsRef.current.forEach((c) => URL.revokeObjectURL(c.url));
    setCards([]);
    setMethod(null);
  }

  useEffect(() => {
    cancelRef.current = true; // changement de langue : on arrête une génération en cours
    setAuto(null);
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

  // Lot terminé : les images cochées ne sont plus proposées (elles disparaissent de toute façon de la liste au prochain déploiement).
  // Les vignettes décochées (« à refaire ») restent dans la liste pour le lot suivant.
  function finishBatch() {
    const done = cards.length > 0 ? cards.filter((c) => c.include).map((c) => c.name) : batch.map((w) => w.name);
    clearCards();
    setAuto(null);
    persistHidden(new Set([...Array.from(hidden), ...done]));
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

  // Une planche : génération (avec nouvelles tentatives) puis découpe en vignettes
  async function makeBoard(words: BoardWordLite[]): Promise<{ cards: Card[]; method: GridMethod }> {
    let lastError = '';
    for (let attempt = 1; attempt <= AUTO_RETRIES; attempt++) {
      if (cancelRef.current) throw new Error('Annulé');
      const res = await generateBoardImage(words.map((w) => w.fr));
      if (res.ok) {
        const { canvas, grid } = await loadBoard(b64ToFile(res.b64));
        if (grid.rects.length < words.length) throw new Error('Grille non reconnue sur cette planche.');
        const out: Card[] = [];
        for (let i = 0; i < words.length; i++) {
          const blob = await cropToWebp(canvas, grid.rects[i]);
          out.push({ name: words[i].name, url: URL.createObjectURL(blob), blob, include: true, approx: grid.method === 'grid' });
        }
        return { cards: out, method: grid.method };
      }
      lastError = res.error;
      if (!res.retryable) break;
      await sleep(8000 * attempt);
    }
    throw new Error(lastError || 'Échec de la génération.');
  }

  // Génère n planches de 20 mots à la suite (2 en parallèle), les découpe, et affiche les vignettes au fur et à mesure.
  async function runAuto() {
    const n = Math.max(1, Math.floor(autoCount));
    const words = remaining.slice(0, n * BOARD_SIZE);
    if (words.length === 0) return;
    const chunks: BoardWordLite[][] = [];
    for (let i = 0; i < words.length; i += BOARD_SIZE) chunks.push(words.slice(i, i + BOARD_SIZE));
    const usd = chunks.length * BOARD_COST_USD;
    if (
      !window.confirm(
        `Générer ${chunks.length} planche(s) de ${BOARD_SIZE} mots (${words.length} images) avec gpt-image-1-mini, qualité medium ?\n\nCoût estimé : ≈ ${usd.toFixed(2)} $ (≈ ${(usd * USD_TO_EUR).toFixed(2)} €).\nGarde cet onglet ouvert pendant la génération.`
      )
    ) {
      return;
    }

    clearCards();
    setError('');
    cancelRef.current = false;
    let next = 0;
    let done = 0;
    let failed = 0;
    let lastError = '';
    let worst: GridMethod | null = null;
    setAuto({ done: 0, total: chunks.length, failed: 0, running: true, lastError: '' });

    async function worker() {
      while (!cancelRef.current) {
        const idx = next++;
        if (idx >= chunks.length) return;
        try {
          const r = await makeBoard(chunks[idx]);
          worst = worstMethod(worst, r.method);
          setMethod(worst);
          setCards((prev) => [...prev, ...r.cards]);
        } catch (e: any) {
          if (e?.message !== 'Annulé') {
            failed++;
            lastError = e?.message ?? 'Erreur';
          }
        }
        done++;
        setAuto({ done, total: chunks.length, failed, running: true, lastError });
      }
    }
    await Promise.all(Array.from({ length: AUTO_CONCURRENCY }, worker));
    setAuto({ done, total: chunks.length, failed, running: false, lastError });
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
  const autoRunning = auto?.running ?? false;
  const autoBoards = Math.min(autoCount, Math.ceil(remaining.length / BOARD_SIZE));
  const autoUsd = autoBoards * BOARD_COST_USD;

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
              : `Génère des planches de ${BOARD_SIZE} illustrations (automatiquement ou via ChatGPT), puis découpe-les ici.`}
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
          <div style={{ border: '1px solid rgba(128,128,128,.4)', borderRadius: 6, padding: '0.6rem 0.75rem', marginTop: '0.75rem' }}>
            <p className="eyebrow-free" style={{ marginTop: 0 }}>
              <strong>Génération automatique</strong> — gpt-image-1-mini, qualité medium, {BOARD_SIZE} mots par planche (A1 → B2). Les planches sont
              générées, découpées et rassemblées dans un seul ZIP.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <label>
                Planches à générer{' '}
                <select value={autoCount} onChange={(e) => setAutoCount(Number(e.target.value))} disabled={autoRunning}>
                  {AUTO_BOARD_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <span style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                ≈ {Math.min(autoCount * BOARD_SIZE, remaining.length)} images · ≈ {autoUsd.toFixed(2)} $ (≈ {(autoUsd * USD_TO_EUR).toFixed(2)} €)
              </span>
              {!autoRunning ? (
                <button className="primary" onClick={runAuto}>
                  Générer {autoBoards} planche{autoBoards > 1 ? 's' : ''}
                </button>
              ) : (
                <button
                  className="secondary"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  Arrêter (les planches en cours se terminent)
                </button>
              )}
            </div>
            {auto && (
              <p className="eyebrow-free" style={{ marginBottom: 0 }}>
                {auto.running ? 'Génération…' : 'Terminé.'} Planche {auto.done}/{auto.total}
                {auto.failed > 0 ? ` — ${auto.failed} en échec (${auto.lastError}) : leurs mots restent dans la liste` : ''}
              </p>
            )}
          </div>

          <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>
            <strong>Manuel (ChatGPT) — 1.</strong> Les {batch.length} prochains mots (A1 → B2). Écarte (✕) ceux qu'on ne peut pas illustrer : le suivant le remplace
            (pense alors à copier de nouveau le prompt).
          </p>
          <ol style={{ margin: '0.25rem 0 0.75rem', paddingLeft: '1.4rem', columns: '3 200px', fontSize: '0.85rem', maxHeight: '22rem', overflowY: 'auto' }}>
            {batch.map((w) => (
              <li key={w.name} style={{ breakInside: 'avoid' }}>
                {w.fr} <span style={{ opacity: 0.55, fontSize: '0.75rem' }}>{w.level}</span>{' '}
                <button
                  className="conv-mini-btn"
                  onClick={() => skipWord(w.name)}
                  disabled={autoRunning}
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
          <input type="file" accept="image/*" onChange={handleFile} disabled={busy || autoRunning} />
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
                    title={c.approx ? 'Découpe approximative : vérifie cette vignette' : undefined}
                    style={{
                      border: c.approx ? '2px solid #e08a00' : '1px solid rgba(128,128,128,.4)',
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
                <button className="primary" onClick={downloadZip} disabled={includedCount === 0 || autoRunning}>
                  Télécharger le ZIP ({includedCount} image{includedCount > 1 ? 's' : ''})
                </button>
                <button className="secondary" onClick={finishBatch} disabled={autoRunning}>
                  Lot terminé → mots suivants
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
