'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getLessonsOverview,
  rankVocabularyStep,
  buildLessonPlan,
  deleteLessonPlan,
  addVerbAudioStep,
  fillImageNamesStep,
  listMissingImages,
  type LessonsOverview,
  type RankStepResult,
} from '../../lib/lessons';
import { LEVELS, LANGS, THEMES } from '../../lib/constants';
import { estimateRankingCost, estimateVerbAudioCost } from '../../lib/pricing';
import LessonViewer from './LessonViewer';
import PronunciationLesson from './PronunciationLesson';
import { usePersistentFlag } from './usePersistentFlag';

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
  const [pdfFrom, setPdfFrom] = useState(1);
  const [pdfTo, setPdfTo] = useState(10);
  const [pdfBusy, setPdfBusy] = useState('');
  const [furigana] = usePersistentFlag('ja-furigana', levelCode === 'A1' || levelCode === 'A2');
  const [romaji] = usePersistentFlag('ja-romaji');
  const [namesRun, setNamesRun] = useState<{ remaining: number; total: number } | null>(null);

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

  // Noms d'images : calcul par code (gratuit), enregistré en base par lots
  async function runFillNames() {
    if (!overview) return;
    setError('');
    const total = overview.images.namesPending;
    setNamesRun({ remaining: total, total });
    try {
      for (let guard = 0; guard < 60; guard++) {
        const r = await fillImageNamesStep(languageCode, levelCode);
        if (!r.ok) {
          setError((r as { error: string }).error);
          break;
        }
        const remaining = (r as { data: { remaining: number } }).data.remaining;
        setNamesRun({ remaining, total });
        if (remaining === 0) break;
      }
    } catch (e: any) {
      setError(e?.message ?? "Le calcul des noms d'images a été interrompu.");
    } finally {
      setNamesRun(null);
      await refresh();
    }
  }

  // Liste des images à fournir : un fichier texte « nom-du-fichier [tabulation] mot français »
  async function downloadMissing(all: boolean) {
    setError('');
    try {
      const r = await listMissingImages(all ? null : languageCode, all ? null : levelCode);
      if (!r.ok) {
        setError((r as { error: string }).error);
        return;
      }
      const list = (r as { data: { name: string; fr: string }[] }).data;
      const head = `# Images à fournir (${list.length}) : un fichier .webp par ligne, à déposer dans public/image_webp\n# nom du fichier (sans .webp)\tmot français\n`;
      const blob = new Blob([head + list.map((m) => `${m.name}\t${m.fr}`).join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = all ? 'images_manquantes_toutes_langues.txt' : `images_manquantes_${languageCode}_${levelCode}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message ?? 'Impossible de préparer la liste.');
    }
  }

  // Bloc « images des mots » : compteur d'images disponibles / manquantes
  function renderImageBlock() {
    const im = overview?.images;
    if (!overview || !im) return null;
    if (!im.ready) {
      return (
        <div className="phrase-card lesson-setup">
          <div className="lesson-setup-title">Images des mots</div>
          <p className="conv-warning" style={{ marginBottom: 0 }}>
            La colonne des images n'existe pas encore : exécute la migration 024 dans le SQL Editor de Supabase.
          </p>
        </div>
      );
    }
    if (im.words === 0) return null;
    const pct = namesRun && namesRun.total > 0 ? Math.round(((namesRun.total - namesRun.remaining) / namesRun.total) * 100) : 0;
    return (
      <div className="phrase-card lesson-setup">
        <div className="lesson-setup-title">Images des mots</div>
        {namesRun ? (
          <div className="pack-progress">
            <div className="pack-progress-label">
              {namesRun.total - namesRun.remaining} / {namesRun.total} mots
            </div>
            <div className="pack-progress-track">
              <div className="pack-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow-free">
              <strong>{im.available}</strong> images disponibles sur {im.distinct} nécessaires pour ce niveau, <strong>{im.missing}</strong> manquantes. Une image
              correspond à un mot français : elle sert dans toutes les langues.
            </p>
            <div className="conv-bubble-actions">
              {im.namesPending > 0 && (
                <button className="primary" onClick={runFillNames}>
                  Enregistrer les noms d'images ({im.namesPending} mots, gratuit)
                </button>
              )}
              {im.missing > 0 && (
                <>
                  <button className="conv-mini-btn" onClick={() => downloadMissing(false)}>Liste des manquantes (ce niveau)</button>
                  <button className="conv-mini-btn" onClick={() => downloadMissing(true)}>Liste de toutes les langues</button>
                </>
              )}
            </div>
            <p className="eyebrow-free" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
              Pour ajouter des images : dépose les .webp dans public/image_webp avec le nom indiqué dans la liste (sans espace ni accent), puis pousse sur GitHub :
              le compteur se met à jour au déploiement.
            </p>
          </>
        )}
      </div>
    );
  }

  // PDF du cours : plusieurs leçons dans un seul fichier (fabriqué dans le navigateur)
  async function makeCoursePdf(total: number) {
    const from = Math.max(1, Math.min(pdfFrom, total));
    const to = Math.max(from, Math.min(pdfTo, total));
    setError('');
    setPdfBusy('Préparation…');
    try {
      const { downloadLessonsPdf } = await import('./pdf/generate');
      const numbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
      await downloadLessonsPdf({ profileId, languageCode, levelCode, numbers, furigana, romaji, onProgress: (m) => setPdfBusy(m || 'Préparation…') });
    } catch (e: any) {
      setError(e?.message ?? "Le PDF n'a pas pu être créé.");
    } finally {
      setPdfBusy('');
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

  // ---------- leçon 0 : prononciation ----------
  if (openNumber === 0) {
    return (
      <PronunciationLesson
        languageCode={languageCode}
        levelCode={levelCode}
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
        {renderImageBlock()}

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
      {renderImageBlock()}

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

      <div className="phrase-card lesson-setup">
        <div className="lesson-setup-title">📄 PDF du cours</div>
        <p className="eyebrow-free">
          Un vrai PDF à imprimer ou à garder (mots avec leurs images, verbes, règles, fiches de conjugaison{languageCode === 'ja' ? ', kanji avec cases de recopie' : ''}).
          Plus il y a de leçons, plus la préparation est longue.
        </p>
        <div className="conv-bubble-actions">
          <label className="eyebrow-free" style={{ margin: 0 }}>
            Leçons de{' '}
            <input type="number" min={1} max={lessons.length} value={pdfFrom} onChange={(e) => setPdfFrom(Number(e.target.value) || 1)} style={{ width: '4rem' }} />{' '}
            à{' '}
            <input type="number" min={1} max={lessons.length} value={pdfTo} onChange={(e) => setPdfTo(Number(e.target.value) || 1)} style={{ width: '4rem' }} />
          </label>
          <button className="primary" onClick={() => makeCoursePdf(lessons.length)} disabled={!!pdfBusy}>
            {pdfBusy ? pdfBusy : 'Télécharger le PDF'}
          </button>
        </div>
      </div>

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
