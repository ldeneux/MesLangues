'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getLessonsOverview,
  rankVocabularyStep,
  buildLessonPlan,
  deleteLessonPlan,
  type LessonsOverview,
  type RankStepResult,
} from '../../lib/lessons';
import { LEVELS, LANGS, THEMES } from '../../lib/constants';
import { estimateRankingCost } from '../../lib/pricing';
import LessonViewer from './LessonViewer';

function themeLabel(code: string) {
  return THEMES.find((t) => t.code === code)?.label ?? code;
}

export default function LessonsPanel({
  profileId,
  languageCode,
  levelCode,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
}) {
  const [overview, setOverview] = useState<LessonsOverview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openNumber, setOpenNumber] = useState<number | null>(null);

  const [confirmRank, setConfirmRank] = useState(false);
  const [ranking, setRanking] = useState<{ remaining: number; total: number } | null>(null);
  const [building, setBuilding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const level = LEVELS.find((l) => l.code === levelCode);
  const lang = LANGS.find((l) => l.code === languageCode);
  const color = level?.color ?? '#8b7fd6';

  const refresh = useCallback(async () => {
    try {
      const r = await getLessonsOverview(profileId, languageCode, levelCode);
      if (r.ok) {
        setOverview((r as { data: LessonsOverview }).data);
        setError('');
      } else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de chargement des leçons.');
    }
  }, [profileId, languageCode, levelCode]);

  useEffect(() => {
    setOverview(null);
    setOpenNumber(null);
    setNotice('');
    setConfirmRank(false);
    setConfirmReset(false);
    refresh();
  }, [refresh]);

  async function runRanking() {
    if (!overview) return;
    setConfirmRank(false);
    setError('');
    const total = overview.setup.unranked;
    setRanking({ remaining: total, total });
    try {
      for (let guard = 0; guard < 80; guard++) {
        const r = await rankVocabularyStep(languageCode, levelCode);
        if (!r.ok) {
          setError((r as { error: string }).error);
          break;
        }
        const remaining = (r as { data: RankStepResult }).data.remaining;
        setRanking({ remaining, total });
        if (remaining === 0) break;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Le classement a été interrompu.');
    } finally {
      setRanking(null);
      await refresh();
    }
  }

  async function createPlan(replace: boolean) {
    setBuilding(true);
    setError('');
    setNotice('');
    setConfirmReset(false);
    try {
      const r = await buildLessonPlan(languageCode, levelCode, replace);
      if (r.ok) {
        const data = (r as { data: { count: number; warnings: string[] } }).data;
        setNotice(`${data.count} leçons créées.${data.warnings.length ? ' ' + data.warnings.join(' ') : ''}`);
      } else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? 'Création du plan impossible.');
    } finally {
      setBuilding(false);
      await refresh();
    }
  }

  async function resetPlan() {
    setConfirmReset(false);
    const r = await deleteLessonPlan(languageCode, levelCode);
    if (!r.ok) setError((r as { error: string }).error);
    setNotice('');
    await refresh();
  }

  // ---------- leçon ouverte ----------
  if (openNumber !== null) {
    return (
      <LessonViewer
        profileId={profileId}
        languageCode={languageCode}
        levelCode={levelCode}
        number={openNumber}
        onBack={() => {
          setOpenNumber(null);
          refresh();
        }}
        onChanged={refresh}
        onOpen={(n) => setOpenNumber(n)}
      />
    );
  }

  if (!overview && !error) return <p className="eyebrow-free">Chargement des leçons…</p>;

  const setup = overview?.setup;
  const lessons = overview?.lessons ?? [];

  // ---------- pas encore de plan : préparation ----------
  if (overview && lessons.length === 0) {
    const est = estimateRankingCost(setup!.unranked);
    const rankedOk = setup!.total > 0 && setup!.unranked <= setup!.total * 0.1;
    const progressPct = ranking && ranking.total > 0 ? Math.round(((ranking.total - ranking.remaining) / ranking.total) * 100) : 0;

    return (
      <div>
        <h2 style={{ marginTop: 0 }}>
          Leçons {lang?.flag} {lang?.label} {levelCode}
        </h2>
        <p className="eyebrow-free">
          Chaque leçon présente 20 mots (noms, adjectifs, verbes), une règle de grammaire et un verbe conjugué, avec un petit rappel des
          leçons précédentes. Les mots les plus utiles viennent en premier. Tout est préparé à partir de ce que tu as déjà téléchargé.
        </p>

        {error && <p className="conv-warning">{error}</p>}
        {notice && <p className="eyebrow-free">{notice}</p>}

        <div className="phrase-card lesson-setup">
          <div className="sidebar-label">Contenu disponible pour {levelCode}</div>
          <p style={{ margin: '0.4rem 0 0' }}>
            {setup!.nouns} noms · {setup!.adjectives} adjectifs · {setup!.fillers} adverbes et expressions · {setup!.verbs} verbes
          </p>
        </div>

        {setup!.total === 0 ? (
          <p className="conv-warning" style={{ marginTop: '1rem' }}>
            Aucun vocabulaire téléchargé pour ce niveau : va dans l'onglet « Packs » pour en télécharger.
          </p>
        ) : (
          <>
            <div className="phrase-card lesson-setup">
              <div className="lesson-setup-title">1. Classer les mots par utilité</div>
              {setup!.unranked === 0 ? (
                <p className="eyebrow-free" style={{ marginBottom: 0 }}>✅ Tous les mots sont classés.</p>
              ) : ranking ? (
                <div className="pack-progress">
                  <div className="pack-progress-label">
                    {ranking.total - ranking.remaining} / {ranking.total} mots classés
                  </div>
                  <div className="pack-progress-track">
                    <div className="pack-progress-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              ) : confirmRank ? (
                <div className="pack-confirm-modal">
                  <p style={{ marginTop: 0 }}>
                    Gemini va donner une note d'utilité à {setup!.unranked} mots, pour apprendre les plus courants d'abord.
                    <br />
                    Coût estimé : environ <strong>{est.eur.toFixed(2)} €</strong> ({est.usd.toFixed(2)} $), une seule fois.
                  </p>
                  <div className="conv-bubble-actions">
                    <button className="primary" onClick={runRanking}>Lancer le classement</button>
                    <button className="conv-mini-btn" onClick={() => setConfirmRank(false)}>Annuler</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="eyebrow-free">
                    {setup!.unranked} mots à classer (≈ {est.eur.toFixed(2)} €). Cette étape ne se fait qu'une fois par langue et niveau.
                  </p>
                  <button className="primary" onClick={() => setConfirmRank(true)}>Classer les mots</button>
                </>
              )}
            </div>

            <div className="phrase-card lesson-setup">
              <div className="lesson-setup-title">2. Créer le plan de leçons</div>
              <p className="eyebrow-free">Gratuit : on organise les mots déjà téléchargés en leçons (40 au maximum).</p>
              <button className="primary" onClick={() => createPlan(false)} disabled={!rankedOk || building || !!ranking}>
                {building ? 'Création…' : 'Créer les leçons'}
              </button>
              {!rankedOk && setup!.unranked > 0 && <p className="eyebrow-free" style={{ marginTop: '0.5rem' }}>Termine d'abord l'étape 1.</p>}
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------- plan existant : liste des leçons ----------
  const doneCount = lessons.filter((l) => l.done).length;
  const next = lessons.find((l) => !l.done);

  return (
    <div>
      <div className="lesson-head">
        <h2 style={{ margin: 0 }}>
          Leçons {lang?.flag} {lang?.label} {levelCode}
        </h2>
        <span className="deck-progress" style={{ marginBottom: 0 }}>
          {doneCount} / {lessons.length} terminées
        </span>
      </div>

      <div className="pack-progress-track" style={{ margin: '0.6rem 0 1rem' }}>
        <div className="pack-progress-fill" style={{ width: `${(doneCount / lessons.length) * 100}%`, background: color }} />
      </div>

      {error && <p className="conv-warning">{error}</p>}
      {notice && <p className="eyebrow-free">{notice}</p>}

      {next ? (
        <button className="primary" onClick={() => setOpenNumber(next.number)} style={{ marginBottom: '1rem' }}>
          {doneCount === 0 ? 'Commencer la leçon 1' : `Continuer : leçon ${next.number}`}
        </button>
      ) : (
        <p className="eyebrow-free">🎉 Toutes les leçons de ce niveau sont terminées.</p>
      )}

      <div className="lesson-tiles">
        {lessons.map((l) => {
          const isNext = next?.number === l.number;
          return (
            <button
              key={l.id}
              className={`lesson-tile${l.done ? ' done' : ''}${isNext ? ' next' : ''}`}
              style={{ ['--lesson-color' as any]: color }}
              onClick={() => setOpenNumber(l.number)}
              title={l.completed_at ? `Terminée le ${new Date(l.completed_at).toLocaleDateString('fr-FR')}` : undefined}
            >
              <span className="lesson-tile-num">{l.done ? '✓' : l.number}</span>
              <span className="lesson-tile-label">Leçon {l.number}</span>
              <span className="lesson-tile-theme">{themeLabel(l.theme_code)}</span>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        {confirmReset ? (
          <div className="pack-confirm-modal">
            <p style={{ marginTop: 0 }}>
              Recréer le plan efface les leçons actuelles <strong>et la progression de tous les profils</strong> sur ce niveau. Continuer ?
            </p>
            <div className="conv-bubble-actions">
              <button className="primary" onClick={() => createPlan(true)} disabled={building}>
                {building ? 'Création…' : 'Oui, recréer le plan'}
              </button>
              <button className="conv-mini-btn" onClick={resetPlan}>Seulement supprimer</button>
              <button className="conv-mini-btn" onClick={() => setConfirmReset(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <button className="conv-mini-btn" onClick={() => setConfirmReset(true)}>Recréer le plan…</button>
        )}
      </div>
    </div>
  );
}
