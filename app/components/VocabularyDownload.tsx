'use client';

import { useEffect, useState } from 'react';
import {
  getVocabularyPacks,
  createVocabularyPack,
  runVocabularyPackStep,
  type VocabularyPackInfo,
} from '../../lib/vocabulary';
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

  if (packs === null) return <p className="eyebrow-free">Chargement du vocabulaire…</p>;

  const hasIncomplete = packs.some((p) => p.generated_count < p.target_count);
  const packObjective = LEVEL_PACK_COUNT[levelCode as LevelCode] ?? 2;
  const objectiveReached = packs.length >= packObjective;

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Vocabulaire ({VOCAB_PACK_SIZE} mots/pack, comme les packs de phrases)
      </div>

      {packs.map((p) => {
        const incomplete = p.generated_count < p.target_count;
        const isGeneratingThis = generatingPackId === p.id;
        return (
          <div key={p.id} className="pack-row">
            <div>
              <div className="pack-row-title">Pack {p.pack_number}</div>
              <div className="pack-row-sub">
                {isGeneratingThis && progress
                  ? `En cours${progress.themeLabel ? ` — ${progress.themeLabel}` : ''} — ${progress.generated} / ${progress.target} — coût réel ≈ ${progress.costEur.toFixed(2)} €`
                  : incomplete
                  ? `Incomplet — ${p.generated_count} / ${p.target_count} mots`
                  : `Prêt — ${p.generated_count} mots`}
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
    </div>
  );
}
