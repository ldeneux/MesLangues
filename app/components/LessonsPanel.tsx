'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getLessonsOverview,
  rankVocabularyStep,
  buildLessonPlan,
  deleteLessonPlan,
  addVerbAudioStep,
  mapEmojiStep,
  type LessonsOverview,
  type RankStepResult,
} from '../../lib/lessons';
import { LEVELS, LANGS, THEMES } from '../../lib/constants';
import { estimateRankingCost, estimateVerbAudioCost, estimateEmojiCost } from '../../lib/pricing';
import LessonViewer from './LessonViewer';
import PronunciationLesson from './PronunciationLesson';

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
  const [confirmAudio, setConfirmAudio] = useState(false);
  const [audioRun, setAudioRun] = useState<{ remaining: number; total: number } | null>(null);
  const [confirmEmoji, setConfirmEmoji] = useState(false);
  const [emojiRun, setEmojiRun] = useState<{ remaining: number; total: number } | null>(null);

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
    setConfirmAudio(false);
    setConfirmEmoji(false);
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

  async function runVerbAudio() {
    if (!overview) return;
    setConfirmAudio(false);
    setError('');
    const total = overview.verbAudioMissing;
    setAudioRun({ remaining: total, total });
    try {
      for (let guard = 0; guard < 40; guard++) {
        const r = await addVerbAudioStep(languageCode);
        if (!r.ok) {
          setError((r as { error: string }).error);
          break;
        }
        const remaining = (r as { data: { remaining: number } }).data.remaining;
        setAudioRun({ remaining, total });
        if (remaining === 0) break;
      }
    } catch (e: any) {
      setError(e?.message ?? "La génération de l'audio a été interrompue.");
    } finally {
      setAudioRun(null);
      await refresh();
    }
  }

  // Bloc « audio de l'infinitif des verbes » (affiché tant qu'il en manque)
  function renderVerbAudioBlock() {
    const missing = overview?.verbAudioMissing ?? 0;
    if (!overview || (missing === 0 && !audioRun)) return null;
    const est = estimateVerbAudioCost(missing);
    const pct = audioRun && audioRun.total > 0 ? Math.round(((audioRun.total - audioRun.remaining) / audioRun.total) * 100) : 0;
    return (
      <div className="phrase-card lesson-setup">
        <div className="lesson-setup-title">Audio des verbes</div>
        {audioRun ? (
          <div className="pack-progress">
            <div className="pack-progress-label">
              {audioRun.total - audioRun.remaining} / {audioRun.total} verbes
            </div>
            <div className="pack-progress-track">
              <div className="pack-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : confirmAudio ? (
          <div className="pack-confirm-modal">
            <p style={{ marginTop: 0 }}>
              Générer la prononciation de l'infinitif pour {missing} verbes. Coût estimé : environ <strong>{est.eur.toFixed(3)} €</strong>, une seule fois.
            </p>
            <div className="conv-bubble-actions">
              <button className="primary" onClick={runVerbAudio}>Générer l'audio</button>
              <button className="conv-mini-btn" onClick={() => setConfirmAudio(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow-free">
              {missing} verbes n'ont pas encore l'audio de leur infinitif (≈ {est.eur.toFixed(3)} €). En attendant, la voix du navigateur prend le relais.
            </p>
            <button className="primary" onClick={() => setConfirmAudio(true)}>Ajouter l'audio des verbes</button>
          </>
        )}
      </div>
    );
  }

  async function runEmoji() {
    if (!overview) return;
    setConfirmEmoji(false);
    setError('');
    const total = overview.emoji.pending;
    setEmojiRun({ remaining: total, total });
    try {
      for (let guard = 0; guard < 60; guard++) {
        const r = await mapEmojiStep(languageCode, levelCode);
        if (!r.ok) {
          setError((r as { error: string }).error);
          break;
        }
        const remaining = (r as { data: { remaining: number } }).data.remaining;
        setEmojiRun({ remaining, total });
        if (remaining === 0) break;
      }
    } catch (e: any) {
      setError(e?.message ?? 'La recherche des images a été interrompue.');
    } finally {
      setEmojiRun(null);
      await refresh();
    }
  }

  // Bloc « images des noms » : affiché tant qu'il reste des noms à illustrer (ou si la migration manque)
  function renderEmojiBlock() {
    const em = overview?.emoji;
    if (!overview || !em) return null;
    if (!em.ready) {
      return (
        <div className="phrase-card lesson-setup">
          <div className="lesson-setup-title">Images des noms</div>
          <p className="conv-warning" style={{ marginBottom: 0 }}>
            La colonne des images n'existe pas encore : exécute la migration 022 dans le SQL Editor de Supabase.
          </p>
        </div>
      );
    }
    if (em.nouns === 0 || (em.pending === 0 && !emojiRun)) return null;
    const est = estimateEmojiCost(em.pending);
    const pct = emojiRun && emojiRun.total > 0 ? Math.round(((emojiRun.total - emojiRun.remaining) / emojiRun.total) * 100) : 0;
    return (
      <div className="phrase-card lesson-setup">
        <div className="lesson-setup-title">Images des noms</div>
        {emojiRun ? (
          <div className="pack-progress">
            <div className="pack-progress-label">
              {emojiRun.total - emojiRun.remaining} / {emojiRun.total} noms traités
            </div>
            <div className="pack-progress-track">
              <div className="pack-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : confirmEmoji ? (
          <div className="pack-confirm-modal">
            <p style={{ marginTop: 0 }}>
              Gemini va choisir un emoji pour {em.pending} noms. Coût estimé : <strong>au plus {est.eur.toFixed(2)} €</strong> ({est.usd.toFixed(2)} $), et moins si
              des mots sont déjà illustrés dans une autre langue. Les noms sans emoji convenable resteront sans image.
            </p>
            <div className="conv-bubble-actions">
              <button className="primary" onClick={runEmoji}>Chercher les images</button>
              <button className="conv-mini-btn" onClick={() => setConfirmEmoji(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow-free">
              {em.withImage} / {em.nouns} noms ont une image. {em.pending} restent à traiter (≈ {est.eur.toFixed(2)} € au plus).
            </p>
            <button className="primary" onClick={() => setConfirmEmoji(true)}>Ajouter les images des noms</button>
          </>
        )}
      </div>
    );
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

  // ---------- leçon 0 : prononciation ----------
  if (openNumber === 0) {
    return (
      <PronunciationLesson
        languageCode={languageCode}
        onBack={() => {
          setOpenNumber(null);
          refresh();
        }}
      />
    );
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
          {setup!.duplicates > 0 && (
            <p className="eyebrow-free" style={{ margin: '0.4rem 0 0' }}>
              {setup!.duplicates} doublons présents dans la base seront ignorés par les leçons.
            </p>
          )}
        </div>

        <div className="phrase-card lesson-setup">
          <div className="lesson-setup-title">Leçon 0 : la prononciation</div>
          <p className="eyebrow-free">Les sons et les pièges de la langue, avec de quoi écouter. Disponible tout de suite.</p>
          <button className="primary" onClick={() => setOpenNumber(0)}>Ouvrir la leçon 0</button>
        </div>

        {setup!.verbs > 0 && renderVerbAudioBlock()}
        {renderEmojiBlock()}

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

      {renderVerbAudioBlock()}
      {renderEmojiBlock()}

      <div className="lesson-tiles">
        <button className="lesson-tile" style={{ ['--lesson-color' as any]: color }} onClick={() => setOpenNumber(0)}>
          <span className="lesson-tile-num">0</span>
          <span className="lesson-tile-label">Leçon 0</span>
          <span className="lesson-tile-theme">Prononciation</span>
        </button>
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

      {overview && overview.emoji.withImage > 0 && (
        <p className="eyebrow-free" style={{ marginTop: '1.5rem', marginBottom: 0 }}>
          Images des noms : Microsoft Fluent Emoji (licence MIT).
        </p>
      )}

      <div style={{ marginTop: '1rem' }}>
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
