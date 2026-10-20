'use client';

import { useEffect, useState } from 'react';
import {
  getListeningPacks,
  createListeningPack,
  runListeningPackStep,
  importListeningArticle,
  getMissingArticleAudio,
  generateMissingArticleAudioStep,
  getListeningInventory,
  type ImportedArticle,
  type ListeningInventory,
  type ListeningPackInfo,
} from '../../lib/articles';
import { estimateListeningPackCost, estimateTtsCost } from '../../lib/pricing';
import { LISTENING_PACK_SIZE, LISTENING_LEVEL_TARGET, QUESTIONS_PER_ARTICLE, type LevelCode } from '../../lib/constants';

export default function ListeningDownload({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [packs, setPacks] = useState<ListeningPackInfo[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generatingPackId, setGeneratingPackId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ generated: number; target: number; themeLabel?: string } | null>(null);
  const [error, setError] = useState('');

  // Import manuel (fichier JSON) + audio manquant
  const [makeVisible, setMakeVisible] = useState(true);
  const [importBusy, setImportBusy] = useState(false);
  const [importNote, setImportNote] = useState('');
  const [skippedDetails, setSkippedDetails] = useState<string[]>([]);
  const [inventory, setInventory] = useState<ListeningInventory | null>(null);
  const [missingAudio, setMissingAudio] = useState<{ count: number; chars: number } | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioProgress, setAudioProgress] = useState('');

  async function refresh() {
    const list = await getListeningPacks(languageCode, levelCode);
    setPacks(list);
    getMissingArticleAudio(languageCode, levelCode).then(setMissingAudio).catch(() => {});
    getListeningInventory(languageCode).then(setInventory).catch(() => {});
  }

  // Fichier à me transmettre avant chaque lot : sujets déjà traités + thèmes qui manquent (évite doublons et sujets trop proches)
  function downloadInventory() {
    if (!inventory) return;
    const blob = new Blob([JSON.stringify(inventory, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventaire_ecoute_${languageCode}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    setError('');
    setImportNote('');
    setSkippedDetails([]);
    setImportBusy(true);
    try {
      let data: { language?: string; level?: string; articles?: ImportedArticle[] };
      try {
        data = JSON.parse(await file.text());
      } catch {
        throw new Error("Ce fichier n'est pas un JSON valide.");
      }
      if (data.language !== languageCode || data.level !== levelCode) {
        throw new Error(
          `Ce fichier est prévu pour ${data.language ?? '?'} ${data.level ?? '?'} : ouvre d'abord la langue « ${languageCode} » au niveau ${levelCode}.`
        );
      }
      const articles = data.articles ?? [];
      if (!Array.isArray(articles) || articles.length === 0) throw new Error('Aucun article dans ce fichier.');

      let inserted = 0;
      const skippedList: string[] = [];
      let skipped = 0;
      for (let i = 0; i < articles.length; i++) {
        setImportNote(`Import en cours : article ${i + 1} / ${articles.length}…`);
        const r = await importListeningArticle(languageCode, levelCode, articles[i], makeVisible);
        if (r.status === 'inserted') inserted++;
        else {
          skipped++;
          skippedList.push(r.reason ?? 'ignoré');
        }
      }
      setSkippedDetails(skippedList);
      setImportNote(
        `Import terminé : ${inserted} article(s) ajouté(s)${skipped > 0 ? `, ${skipped} ignoré(s) (voir le détail ci-dessous)` : ''}. Pense à générer l'audio ci-dessous.`
      );
    } catch (e: any) {
      setError(e.message ?? "Erreur pendant l'import.");
    } finally {
      setImportBusy(false);
      refresh();
    }
  }

  async function handleGenerateAudio() {
    setError('');
    setAudioBusy(true);
    try {
      let remaining = missingAudio?.count ?? 1;
      const total = remaining;
      while (remaining > 0) {
        setAudioProgress(`Audio : ${total - remaining} / ${total}`);
        const r = await generateMissingArticleAudioStep(languageCode, levelCode);
        remaining = r.remaining;
      }
      setImportNote('Audio généré pour tous les articles.');
    } catch (e: any) {
      setError(e.message ?? "Erreur pendant la génération de l'audio.");
    } finally {
      setAudioBusy(false);
      setAudioProgress('');
      refresh();
    }
  }

  useEffect(() => {
    setPacks(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const cost = estimateListeningPackCost(LISTENING_PACK_SIZE);

  async function runLoop(packId: string, target: number) {
    setGeneratingPackId(packId);
    setProgress({ generated: 0, target });
    setError('');
    try {
      let done = false;
      while (!done) {
        const step = await runListeningPackStep(packId);
        setProgress({ generated: step.generatedTotal, target: step.targetTotal, themeLabel: step.themeLabel });
        done = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération du pack Écoute.');
    } finally {
      setGeneratingPackId(null);
      setProgress(null);
      refresh();
    }
  }

  async function handleConfirmDownload() {
    setConfirming(false);
    setError('');
    try {
      const pack = await createListeningPack(languageCode, levelCode);
      setPacks((prev) => [...(prev ?? []), pack]);
      await runLoop(pack.id, pack.target_count);
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la création du pack.');
    }
  }

  function handleResume(pack: ListeningPackInfo) {
    runLoop(pack.id, pack.target_count);
  }

  if (packs === null) return <p className="eyebrow-free">Chargement des packs Écoute…</p>;

  // Un pack « prêt » (par exemple importé à la main et rendu visible) n'est jamais à reprendre, même s'il n'a pas ses 50 articles.
  const isIncomplete = (p: ListeningPackInfo) => p.status !== 'ready' && p.generated_count < p.target_count;
  const hasIncomplete = packs.some(isIncomplete);
  const objective = LISTENING_LEVEL_TARGET[levelCode as LevelCode] ?? LISTENING_PACK_SIZE;
  const levelInventory = inventory?.levels[levelCode];
  const totalArticles = levelInventory?.count ?? packs.reduce((n, p) => n + p.generated_count, 0);
  const objectiveReached = totalArticles >= objective;

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Écoute ({LISTENING_PACK_SIZE} articles/pack, {`${QUESTIONS_PER_ARTICLE} questions chacun`})
      </div>

      {packs.map((p) => {
        const incomplete = isIncomplete(p);
        const isGeneratingThis = generatingPackId === p.id;
        return (
          <div key={p.id} className="pack-row">
            <div>
              <div className="pack-row-title">Pack {p.pack_number}</div>
              <div className="pack-row-sub">
                {isGeneratingThis && progress
                  ? `En cours${progress.themeLabel ? ` — ${progress.themeLabel}` : ''} — ${progress.generated} / ${progress.target}`
                  : incomplete
                  ? `Incomplet — ${p.generated_count} / ${p.target_count} articles`
                  : p.generated_count < p.target_count
                  ? `Prêt (partiel) — ${p.generated_count} / ${p.target_count} articles`
                  : `Prêt — ${p.generated_count} articles`}
              </div>
            </div>
            {isGeneratingThis ? (
              <span className="pack-status pack-status-generating">En cours</span>
            ) : incomplete ? (
              <button className="secondary" onClick={() => handleResume(p)} disabled={generatingPackId !== null}>
                Reprendre
              </button>
            ) : (
              <span className="pack-status pack-status-ready">Prêt</span>
            )}
          </div>
        );
      })}

      {packs.length === 0 && <p className="eyebrow-free">Aucun pack Écoute téléchargé pour ce niveau.</p>}

      {error && <p className="conv-warning">{error}</p>}

      <p className="eyebrow-free">
        Objectif du niveau : {totalArticles} / {objective} articles ({objective / LISTENING_PACK_SIZE} packs de {LISTENING_PACK_SIZE}).
      </p>

      {!generatingPackId && !objectiveReached && (
        <button className="primary" onClick={() => setConfirming(true)} disabled={hasIncomplete}>
          Télécharger un pack Écoute ({LISTENING_PACK_SIZE} articles)
        </button>
      )}
      {hasIncomplete && !generatingPackId && (
        <p className="eyebrow-free" style={{ marginTop: '0.5rem' }}>
          Termine d'abord le pack incomplet ci-dessus.
        </p>
      )}

      <div className="phrase-card" style={{ marginTop: '1rem' }}>
        <div className="pack-row-title">Importer des articles (fichier JSON)</div>
        <p className="eyebrow-free" style={{ margin: '0.3rem 0 0.6rem' }}>
          Articles écrits à la main : aucun appel à Gemini. Ils sont ajoutés au premier pack de ce niveau qui a de la place ({LISTENING_PACK_SIZE} articles par pack,{' '}
          {QUESTIONS_PER_ARTICLE} questions chacun). Un article dont le titre existe déjà est ignoré.
        </p>
        <label className="conv-mini-btn" style={{ cursor: importBusy ? 'default' : 'pointer', display: 'inline-block' }}>
          {importBusy ? 'Import en cours…' : 'Choisir un fichier JSON'}
          <input
            type="file"
            accept="application/json,.json"
            disabled={importBusy || audioBusy || generatingPackId !== null}
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) handleImportFile(f);
            }}
          />
        </label>
        <label className="eyebrow-free" style={{ display: 'block', marginTop: '0.5rem' }}>
          <input type="checkbox" checked={makeVisible} onChange={(e) => setMakeVisible(e.target.checked)} /> Rendre les articles disponibles tout de suite, même si le
          pack n'est pas complet
        </label>
        {importNote && <p className="eyebrow-free">{importNote}</p>}
        {skippedDetails.length > 0 && (
          <ul className="eyebrow-free" style={{ margin: '0.3rem 0 0 1rem' }}>
            {skippedDetails.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}

        {levelInventory && (
          <details style={{ marginTop: '0.75rem' }}>
            <summary className="eyebrow-free" style={{ cursor: 'pointer' }}>
              Couverture par thème ({levelCode}) — répartition cible selon le poids des thèmes
            </summary>
            <table className="conj-table" style={{ marginTop: '0.4rem' }}>
              <tbody>
                {levelInventory.themes.map((t) => (
                  <tr key={t.code}>
                    <th scope="row" style={{ width: 'auto', color: 'inherit', fontWeight: 400 }}>{t.label}</th>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {t.count} / {t.quota} {t.count >= t.quota ? '✅' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        <button className="conv-mini-btn" style={{ marginTop: '0.6rem' }} onClick={downloadInventory} disabled={!inventory}>
          Télécharger l'inventaire des articles ({languageCode})
        </button>
        <p className="eyebrow-free" style={{ margin: '0.3rem 0 0' }}>
          À me transmettre avant chaque lot : liste des sujets déjà traités et des thèmes qui manquent. L'import refuse de toute façon un article trop proche d'un article existant de la langue.
        </p>

        {missingAudio && missingAudio.count > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <button className="primary" onClick={handleGenerateAudio} disabled={audioBusy || importBusy || generatingPackId !== null}>
              {audioBusy ? audioProgress || "Génération de l'audio…" : `Générer l'audio manquant (${missingAudio.count} article${missingAudio.count > 1 ? 's' : ''})`}
            </button>
            <p className="eyebrow-free" style={{ margin: '0.3rem 0 0' }}>
              ≈ {missingAudio.chars.toLocaleString('fr-FR')} caractères à lire — coût estimé ≈ {estimateTtsCost(missingAudio.chars).eur.toFixed(2)} € (voix Standard).
            </p>
          </div>
        )}
      </div>

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer <strong>{LISTENING_PACK_SIZE} articles</strong> (texte + audio) avec leur
              banque de <strong>{QUESTIONS_PER_ARTICLE} questions</strong> chacun (tirage aléatoire de 5 à chaque quiz, pour ne jamais
              rejouer le même).
            </p>
            <p>
              Coût estimé : <strong>≈ {cost.eur.toFixed(2)}€</strong> (≈ {cost.usd.toFixed(2)}$).
            </p>
            <div className="profile-create-actions">
              <button className="secondary" onClick={() => setConfirming(false)}>
                Annuler
              </button>
              <button className="primary" onClick={handleConfirmDownload}>
                Confirmer et générer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
