'use client';

import { useEffect, useState } from 'react';
import { getAllDomainScores, DOMAIN_WEIGHTS, type AllDomainScores } from '../../lib/scores';
import { LANGS, LEVELS, type LangCode, type LevelCode } from '../../lib/constants';
import VerticalGauge from './VerticalGauge';

const BUCKET_COLORS = ['#c0392b', '#e67e22', '#f1c40f', '#8bc34a', '#27ae60'];
const NEVER_PRACTICED_COLOR = '#22b0c9';

function buildConicGradient(scores: AllDomainScores): { css: string; legend: { label: string; count: number; color: string }[] } {
  const v = scores.vocabulary;
  const slices = [
    { label: 'Jamais pratiqués', count: v.neverPracticedCount, color: NEVER_PRACTICED_COLOR },
    ...v.buckets.map((b, i) => ({ label: b.range, count: b.count, color: BUCKET_COLORS[i] })),
  ];
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total === 0) return { css: '', legend: slices };

  let acc = 0;
  const stops: string[] = [];
  for (const s of slices) {
    const start = (acc / total) * 360;
    acc += s.count;
    const end = (acc / total) * 360;
    if (s.count > 0) stops.push(`${s.color} ${start}deg ${end}deg`);
  }
  return { css: `conic-gradient(${stops.join(', ')})`, legend: slices };
}

export default function MyScoresPanel({
  profileId,
  lang,
  level,
  onLangChange,
  onLevelChange,
  onClose,
}: {
  profileId: string;
  lang: LangCode;
  level: LevelCode;
  onLangChange: (l: LangCode) => void;
  onLevelChange: (l: LevelCode) => void;
  onClose: () => void;
}) {
  const [scores, setScores] = useState<AllDomainScores | null>(null);

  useEffect(() => {
    setScores(null);
    getAllDomainScores(profileId, lang, level).then(setScores);
  }, [profileId, lang, level]);

  const currentLevelMeta = LEVELS.find((l) => l.code === level);
  const pie = scores ? buildConicGradient(scores) : null;

  return (
    <div className="scores-overlay" onClick={onClose}>
      <div className="scores-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scores-header">
          <h2 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif' }}>Mes scores</h2>
          <button className="conv-mini-btn" onClick={onClose}>
            Fermer ✕
          </button>
        </div>

        <div className="cascade-row">
          <select className="cascade-select" value={lang} onChange={(e) => onLangChange(e.target.value as LangCode)}>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.label}
              </option>
            ))}
          </select>
          <select className="cascade-select" value={level} onChange={(e) => onLevelChange(e.target.value as LevelCode)}>
            {LEVELS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} — {l.subtitle}
              </option>
            ))}
          </select>
        </div>

        {!scores && <p className="eyebrow-free">Calcul des scores…</p>}

        {scores && (
          <>
            <div className="scores-global-block">
              <div
                className="scores-global-ring"
                style={{ background: `conic-gradient(var(--ink) ${scores.globalPercent * 3.6}deg, var(--line) 0deg)` }}
              >
                <div className="scores-global-ring-inner">{scores.globalPercent}%</div>
              </div>
              <div>
                <p className="eyebrow-free" style={{ margin: 0 }}>
                  Estimation "où j'en suis" pour le niveau <strong style={{ color: currentLevelMeta?.color }}>{level}</strong> —
                  pondéré écoute {Math.round(DOMAIN_WEIGHTS.listening * 100)}% / phrases{' '}
                  {Math.round(DOMAIN_WEIGHTS.phrases * 100)}% / vocabulaire {Math.round(DOMAIN_WEIGHTS.vocabulary * 100)}% /
                  conjugaison {Math.round(DOMAIN_WEIGHTS.conjugation * 100)}% / grammaire{' '}
                  {Math.round(DOMAIN_WEIGHTS.grammar * 100)}%.
                </p>
                <p className="eyebrow-free" style={{ marginTop: '0.4rem' }}>
                  ⚠️ Ce n'est pas une équivalence officielle CECRL, juste une estimation interne à l'appli.
                </p>
              </div>
            </div>

            <div className="gauge-row">
              <VerticalGauge
                label="Écoute"
                percent={scores.listening.percentOfTarget}
                sublabel={`${scores.listening.articlesMastered}/${scores.listening.totalArticles} articles`}
              />
              <VerticalGauge
                label="Phrases"
                percent={scores.phrases.percentOfTarget}
                sublabel={`${scores.phrases.masteredCount}/${scores.phrases.levelTarget}`}
              />
              <VerticalGauge
                label="Vocabulaire"
                percent={scores.vocabulary.percentOfTarget}
                sublabel={`${scores.vocabulary.masteredCount}/${scores.vocabulary.levelTarget}`}
              />
              <VerticalGauge
                label="Conjugaison"
                percent={scores.conjugation.percentOfTarget}
                sublabel={`${scores.conjugation.masteredCount}/${scores.conjugation.target}`}
              />
              <VerticalGauge
                label="Grammaire"
                percent={scores.grammar.percentOfTarget}
                sublabel={`${scores.grammar.topicsMastered}/${scores.grammar.totalTopics} fiches`}
              />
            </div>

            <div className="scores-pie-block">
              <div className="sidebar-label">Vocabulaire — répartition par score de réussite</div>
              {pie && pie.css ? (
                <div className="scores-pie-row">
                  <div className="scores-pie" style={{ background: pie.css }} />
                  <div className="scores-pie-legend">
                    {pie.legend.map((s, i) => (
                      <div key={i} className="scores-pie-legend-row">
                        <span className="scores-pie-swatch" style={{ background: s.color }} />
                        {s.label} : {s.count}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="eyebrow-free">Pas encore de mots pratiqués pour ce niveau.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
