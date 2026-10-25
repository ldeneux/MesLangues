'use client';

import { useEffect, useState } from 'react';
import {
  getVocabularyPacks,
  createVocabularyPack,
  runVocabularyPackStep,
  closeVocabularyPack,
  setVocabularyPackActive,
  reopenVocabularyPack,
  completeVocabularyAudioStep,
  type VocabularyPackInfo,
} from '../../lib/vocabulary';
import PackWordsModal from './PackWordsModal';
import { estimateVocabularyCost, geminiCostEur } from '../../lib/pricing';
import { VOCAB_PACK_SIZE, VOCAB_THEMES, LEVEL_PACK_COUNT, type LevelCode } from '../../lib/constants';

// Un thème qui ne donne aucun mot nouveau est écarté tout de suite (le même appel redonnerait les mêmes redites).
const MAX_EMPTY_TRIES_PER_THEME = 1;
// Garde-fous de coût : arrêt après trop d'appels à vide d'affilée, ou si le coût réel de cette session dépasse ce budget.
const MAX_CONSECUTIVE_EMPTY_CALLS = 6;
const BUDGET_EUR_PER_RUN = 0.3;

export default function VocabularyDownload({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [packs, setPacks] = useState<VocabularyPackInfo[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [generatingPackId, setGeneratingPackId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ generated: number; target: number; themeLabel?: string; costEur: number } | null>(null);
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [audioPackId, setAudioPackId] = useState<string | null>(null); // pack dont on complète les audios
  const [audioProgress, setAudioProgress] = useState<{ done: number; total: number } | null>(null);
  const [busyPackId, setBusyPackId] = useState<string | null>(null); // clôture / réouverture en cours
  const [openPackId, setOpenPackId] = useState<string | null>(null); // pack ouvert (double-clic) pour voir / transférer ses mots

  async function refresh() {
    const list = await getVocabularyPacks(languageCode, levelCode);
    setPacks(list);
  }

  useEffect(() => {
    setPacks(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const cost = estimateVocabularyCost(VOCAB_PACK_SIZE);

  async function runLoop(packId: string, target: number) {
    setGeneratingPackId(packId);
    setProgress({ generated: 0, target, costEur: 0 });
    setError('');
    setLastCost(null);
    let spent = 0;
    let emptyCalls = 0;
    try {
      let done = false;
      // Thèmes écartés pour cette génération (plusieurs essais de suite sans mot nouveau) : on passe au suivant.
      // Le pack n'est déclaré incomplet qu'une fois TOUS les thèmes écartés (rien de nouveau nulle part).
      const skipped = new Set<string>();
      const emptyTries = new Map<string, number>();
      while (!done) {
        const step = await runVocabularyPackStep(packId, Array.from(skipped));
        if (step.usage) spent += geminiCostEur(step.usage.inputTokens, step.usage.outputTokens);
        setProgress({ generated: step.generatedTotal, target: step.targetTotal, themeLabel: step.themeLabel, costEur: spent });
        setLastCost(spent);
        done = step.done;
        if (done) break;

        emptyCalls = step.generatedThisStep === 0 ? emptyCalls + 1 : 0;
        if (emptyCalls >= MAX_CONSECUTIVE_EMPTY_CALLS) {
          throw new Error(
            `${emptyCalls} essais de suite sans mot nouveau : le vocabulaire de ce niveau est presque saturé (${step.generatedTotal} / ${step.targetTotal}). Arrêt pour ne pas dépenser pour rien (≈ ${spent.toFixed(2)} € dépensés). « Reprendre » relance.`
          );
        }
        if (spent >= BUDGET_EUR_PER_RUN) {
          throw new Error(
            `Budget de ${BUDGET_EUR_PER_RUN.toFixed(2)} € atteint pour cette session (≈ ${spent.toFixed(2)} €, ${step.generatedTotal} / ${step.targetTotal} mots). « Reprendre » pour continuer.`
          );
        }

        if (step.exhausted) {
          throw new Error(
            `Aucun mot nouveau trouvé après avoir testé les ${VOCAB_THEMES.length} thèmes (tout existe déjà à ce niveau ou aux niveaux inférieurs). Le pack reste incomplet (${step.generatedTotal} / ${step.targetTotal}) : réessaie plus tard avec « Reprendre ».`
          );
        }

        const code = step.themeCode;
        if (code) {
          if (step.generatedThisStep === 0) {
            const n = (emptyTries.get(code) ?? 0) + 1;
            emptyTries.set(code, n);
            if (n >= MAX_EMPTY_TRIES_PER_THEME) skipped.add(code);
          } else {
            emptyTries.set(code, 0);
          }
        }
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération du vocabulaire.');
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
      const pack = await createVocabularyPack(languageCode, levelCode);
      setPacks((prev) => [...(prev ?? []), pack]);
      await runLoop(pack.id, pack.target_count);
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la création du pack.');
    }
  }

  function handleResume(pack: VocabularyPackInfo) {
    runLoop(pack.id, pack.target_count);
  }

  // Clôturé = pack marqué « prêt » alors qu'il n'a pas atteint son objectif : ses mots sont disponibles, on peut le rouvrir.
  const isClosed = (p: VocabularyPackInfo) => p.status === 'ready' && p.generated_count < p.target_count;
  const isIncomplete = (p: VocabularyPackInfo) => p.generated_count < p.target_count && !isClosed(p);

  async function handleClose(pack: VocabularyPackInfo) {
    if (
      !window.confirm(
        `Clôturer le pack ${pack.pack_number} à ${pack.generated_count} / ${pack.target_count} mots ?\n\nSes mots seront disponibles (vocabulaire, jeux, leçons) et tu pourras télécharger le pack suivant. Tu pourras le rouvrir plus tard.`
      )
    )
      return;
    setBusyPackId(pack.id);
    setError('');
    try {
      await closeVocabularyPack(pack.id);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de clôturer le pack.');
    } finally {
      setBusyPackId(null);
    }
  }

  // Actif / inactif : un pack inactif sort des listes, jeux, leçons, scores et de l'examen
  async function handleToggleActive(pack: VocabularyPackInfo) {
    setBusyPackId(pack.id);
    setError('');
    try {
      await setVocabularyPackActive(pack.id, !pack.active);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de changer l\'état du pack.');
    } finally {
      setBusyPackId(null);
    }
  }

  async function handleReopen(pack: VocabularyPackInfo) {
    setBusyPackId(pack.id);
    setError('');
    try {
      await reopenVocabularyPack(pack.id);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de rouvrir le pack.');
    } finally {
      setBusyPackId(null);
    }
  }

  // Audios manquants (mots ajoutés à la main, synthèse échouée…) : lots de 24, résumable.
  async function handleCompleteAudio(pack: VocabularyPackInfo) {
    const total = pack.missing_audio ?? 0;
    if (total === 0) return;
    setAudioPackId(pack.id);
    setAudioProgress({ done: 0, total });
    setError('');
    const failed = new Set<string>();
    let done = 0;
    let lastError = '';
    try {
      for (;;) {
        const step = await completeVocabularyAudioStep(pack.id, Array.from(failed));
        done += step.completed;
        step.failedIds.forEach((id) => failed.add(id));
        if (step.firstError) lastError = step.firstError;
        setAudioProgress({ done, total });
        if (step.remaining <= 0) break;
        if (step.completed === 0) break; // plus de progrès (tout échoue) : on s'arrête au lieu de boucler
      }
      if (failed.size > 0) {
        setError(`${failed.size} audio(s) n'ont pas pu être créés${lastError ? ` : ${lastError}` : ''}. Relance le lien pour réessayer.`);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erreur pendant la création des audios.');
    } finally {
      setAudioPackId(null);
      setAudioProgress(null);
      refresh();
    }
  }

  if (packs === null) return <p className="eyebrow-free">Chargement du vocabulaire…</p>;

  const hasIncomplete = packs.some(isIncomplete); // un pack clôturé ne bloque plus le téléchargement du suivant
  const packObjective = LEVEL_PACK_COUNT[levelCode as LevelCode] ?? 4;
  const objectiveReached = packs.length >= packObjective;

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Vocabulaire ({VOCAB_PACK_SIZE} mots/pack, comme les packs de phrases)
      </div>

      {packs.map((p) => {
        const closed = isClosed(p);
        const incomplete = isIncomplete(p);
        const isGeneratingThis = generatingPackId === p.id;
        const missing = p.missing_audio ?? 0;
        const audioBusy = audioPackId === p.id;
        const busy = busyPackId === p.id;
        const anyJob = generatingPackId !== null || audioPackId !== null || busyPackId !== null;
        return (
          <div key={p.id} className={`pack-block${p.active ? '' : ' pack-inactive'}`}>
            <div
              className="pack-row"
              title={isGeneratingThis ? undefined : 'Double-clic : voir les mots du pack'}
              onDoubleClick={(e) => {
                if (isGeneratingThis || (e.target as HTMLElement).closest('button')) return;
                setOpenPackId(p.id);
              }}
            >
              <div>
                <div className="pack-row-title">
                  Pack {p.pack_number}{' '}
                  <span className="pack-kind">{p.pack_number <= packObjective ? 'attendu' : 'optionnel'}</span>
                </div>
                <div className="pack-row-sub">
                  {isGeneratingThis && progress
                    ? `En cours${progress.themeLabel ? ` — ${progress.themeLabel}` : ''} — ${progress.generated} / ${progress.target} — coût réel ≈ ${progress.costEur.toFixed(2)} €`
                    : closed
                    ? `Clôturé — ${p.generated_count} / ${p.target_count} mots`
                    : incomplete
                    ? `Incomplet — ${p.generated_count} / ${p.target_count} mots`
                    : `Prêt — ${p.generated_count} mots`}
                </div>
              </div>
              <label className="pack-active-toggle" title="Un pack inactif n'apparaît plus dans les listes, les jeux, les leçons, les scores ni l'examen">
                <input type="checkbox" checked={p.active} onChange={() => handleToggleActive(p)} disabled={anyJob || isGeneratingThis} />
                <span>{p.active ? 'Actif' : 'Inactif'}</span>
              </label>
              {isGeneratingThis ? (
                <span className="pack-status pack-status-generating">En cours</span>
              ) : closed ? (
                <div className="pack-actions">
                  <span className="pack-status pack-status-closed">Clôturé</span>
                  <button className="secondary" onClick={() => handleReopen(p)} disabled={anyJob}>
                    Rouvrir
                  </button>
                </div>
              ) : incomplete ? (
                <div className="pack-actions">
                  <button className="secondary" onClick={() => handleClose(p)} disabled={anyJob}>
                    Clôturer
                  </button>
                  <button className="secondary" onClick={() => handleResume(p)} disabled={anyJob}>
                    Reprendre
                  </button>
                </div>
              ) : (
                <span className="pack-status pack-status-ready">Prêt</span>
              )}
            </div>

            {(missing > 0 || audioBusy) && !isGeneratingThis && (
              <div className="pack-audio-line">
                {audioBusy && audioProgress ? (
                  <span>
                    🔊 Création des audios… {audioProgress.done} / {audioProgress.total}
                  </span>
                ) : (
                  <button className="pack-audio-link" onClick={() => handleCompleteAudio(p)} disabled={anyJob}>
                    🔊 Compléter les audios ({missing} manquant{missing > 1 ? 's' : ''})
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {packs.length === 0 && <p className="eyebrow-free">Aucun pack de vocabulaire téléchargé pour ce niveau.</p>}

      {error && <p className="conv-warning">{error}</p>}

      {!generatingPackId && lastCost !== null && (
        <p className="eyebrow-free">Dernière génération : coût réel ≈ {lastCost.toFixed(2)} €.</p>
      )}

      {!generatingPackId && !objectiveReached && (
        <button className="primary" onClick={() => setConfirming(true)} disabled={hasIncomplete}>
          Télécharger un pack de vocabulaire ({VOCAB_PACK_SIZE} mots)
        </button>
      )}
      {!generatingPackId && objectiveReached && !hasIncomplete && (
        <p className="eyebrow-free">Objectif atteint : {packObjective} packs de vocabulaire ({packObjective * VOCAB_PACK_SIZE} mots) pour ce niveau.</p>
      )}
      {hasIncomplete && !generatingPackId && (
        <p className="eyebrow-free" style={{ marginTop: '0.5rem' }}>
          Termine d'abord le pack incomplet ci-dessus.
        </p>
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer <strong>{VOCAB_PACK_SIZE} mots</strong> (avec article quand pertinent) +
              leur audio, répartis sur tous les thèmes.
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
      {openPackId && packs.find((x) => x.id === openPackId) && (
        <PackWordsModal
          pack={packs.find((x) => x.id === openPackId)!}
          allPacks={packs}
          languageCode={languageCode}
          onClose={() => setOpenPackId(null)}
          onChanged={() => refresh()}
        />
      )}
    </div>
  );
}
