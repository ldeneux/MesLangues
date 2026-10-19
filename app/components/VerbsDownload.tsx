'use client';

import { useEffect, useState } from 'react';
import { getConjugationVerbs, runConjugationStep, backfillConjugationAudio, resetChangedConjugationAudio } from '../../lib/conjugation';
import { addVerbAudioStep } from '../../lib/lessons';
import { estimateVerbsCost } from '../../lib/pricing';
import { CONJUGATION_TARGET } from '../../lib/constants';

// Nombre d'essais consécutifs sans aucun verbe nouveau avant d'arrêter (le pack reste incomplet, « Reprendre » relance).
const MAX_EMPTY_STEPS = 5;

/** Pack VERBES d'un niveau : 120 verbes conjugués (+ audio) par langue et par niveau. Séparé de la grammaire (commune à tous les niveaux). */
export default function VerbsDownload({ languageCode, levelCode }: { languageCode: string; levelCode: string }) {
  const [done, setDone] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioNote, setAudioNote] = useState('');

  // Régénère les audios dont le texte a changé (« she » seul, « to have »). Coût : seulement les fichiers concernés.
  async function updateAudio() {
    setError('');
    setAudioNote('');
    setAudioBusy(true);
    try {
      const { cleared } = await resetChangedConjugationAudio(languageCode);
      let tensesDone = false;
      while (!tensesDone) tensesDone = (await backfillConjugationAudio(languageCode)).done;
      let remaining = 1;
      while (remaining > 0) {
        const r = await addVerbAudioStep(languageCode);
        if (!r.ok) throw new Error((r as { error: string }).error);
        remaining = r.data.remaining;
      }
      setAudioNote(cleared > 0 ? `Audio mis à jour (${cleared} fichier(s) régénéré(s)).` : 'Audio déjà à jour.');
    } catch (e: any) {
      setError(e?.message ?? "Erreur pendant la mise à jour de l'audio.");
    } finally {
      setAudioBusy(false);
    }
  }

  async function refresh() {
    try {
      const verbs = await getConjugationVerbs(languageCode, levelCode);
      setDone(verbs.length);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement des verbes.');
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    setLoaded(false);
    setDone(0);
    setError('');
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, levelCode]);

  const cost = estimateVerbsCost(CONJUGATION_TARGET - done > 0 ? CONJUGATION_TARGET - done : 0);
  const complete = done >= CONJUGATION_TARGET;

  async function handleConfirm() {
    setConfirming(false);
    setError('');
    setRunning(true);
    try {
      let finished = false;
      let empty = 0;
      while (!finished) {
        const step = await runConjugationStep(languageCode, levelCode);
        setDone(step.generatedTotal);
        finished = step.done;
        empty = !finished && step.generatedThisStep === 0 ? empty + 1 : 0;
        if (empty >= MAX_EMPTY_STEPS) {
          throw new Error(
            "La génération ne trouve plus de verbes nouveaux pour ce niveau (les verbes proposés existent déjà dans la langue). Le pack reste incomplet : réessaie plus tard avec « Reprendre »."
          );
        }
      }
      // Audio manquant (verbes déjà présents dont un temps n'a pas d'audio)
      let audioDone = false;
      while (!audioDone) {
        const step = await backfillConjugationAudio(languageCode);
        audioDone = step.done;
      }
    } catch (e: any) {
      setError(e.message ?? 'Erreur pendant la génération des verbes.');
    } finally {
      setRunning(false);
      refresh();
    }
  }

  if (!loaded) return <p className="eyebrow-free" style={{ marginTop: '2rem' }}>Chargement des verbes…</p>;

  return (
    <div className="pack-list" style={{ marginTop: '2rem' }}>
      <div className="pack-row">
        <div>
          <div className="pack-row-title">Verbes ({levelCode}) — {CONJUGATION_TARGET} par niveau</div>
          <div className="pack-row-sub">
            {complete ? `Prêt — ${done} verbes conjugués` : done === 0 ? `Aucun verbe — 0 / ${CONJUGATION_TARGET}` : `Incomplet — ${done} / ${CONJUGATION_TARGET} verbes`}
          </div>
        </div>
        {complete && <span className="pack-status pack-status-ready">Prêt</span>}
      </div>

      {error && <p className="conv-warning">{error}</p>}

      {running ? (
        <div className="pack-progress">
          <div className="pack-progress-label">
            Verbes : {done} / {CONJUGATION_TARGET}
          </div>
          <div className="pack-progress-track">
            <div className="pack-progress-fill" style={{ width: `${Math.min(100, (done / CONJUGATION_TARGET) * 100)}%` }} />
          </div>
          <p className="eyebrow-free">Laisse cet onglet ouvert le temps de la génération.</p>
        </div>
      ) : (
        !complete && (
          <button className="primary" onClick={() => setConfirming(true)}>
            {done === 0 ? `Télécharger les verbes ${levelCode}` : 'Reprendre'}
          </button>
        )
      )}

      {languageCode !== 'ja' && !running && done > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <button className="conv-mini-btn" onClick={updateAudio} disabled={audioBusy}>
            {audioBusy ? 'Mise à jour de l\'audio…' : "Mettre à jour l'audio des verbes"}
          </button>
          <p className="eyebrow-free" style={{ margin: '0.3rem 0 0' }}>
            Régénère seulement les anciens audios : « she » à la place de « he, she, it », infinitif anglais « to … ». N'a aucun effet s'ils sont déjà à jour.
          </p>
          {audioNote && <p className="eyebrow-free">{audioNote}</p>}
        </div>
      )}

      {confirming && (
        <div className="conv-live" style={{ minHeight: 0 }}>
          <div className="pack-confirm-modal">
            <p>
              Cette opération va générer {CONJUGATION_TARGET - done} verbe(s) {languageCode === 'ja' ? '(formes calculées par code)' : 'conjugués'} pour le niveau {levelCode}, avec leur audio. Les verbes
              déjà présents dans la langue (autres niveaux compris) ne sont pas repris.
            </p>
            <p>
              Coût estimé : <strong>≈ {cost.eur.toFixed(2)}€</strong> (≈ {cost.usd.toFixed(2)}$).
            </p>
            <div className="profile-create-actions">
              <button className="secondary" onClick={() => setConfirming(false)}>
                Annuler
              </button>
              <button className="primary" onClick={handleConfirm}>
                Confirmer et générer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
