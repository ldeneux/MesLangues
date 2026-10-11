'use client';

import { useState } from 'react';
import { LANGS } from '../../lib/constants';
import { PRONUNCIATION } from '../../lib/pronunciation';
import { speak } from '../../lib/speech';

// Leçon 0 : sons et règles de prononciation de la langue. La voix est celle du navigateur (gratuite) ; rien ne se lance seul.
export default function PronunciationLesson({ languageCode, onBack }: { languageCode: string; onBack: () => void }) {
  const lesson = PRONUNCIATION[languageCode];
  const lang = LANGS.find((l) => l.code === languageCode);
  const isJa = languageCode === 'ja';
  const [step, setStep] = useState(0);
  const [speechOk, setSpeechOk] = useState(true);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  if (!lesson) {
    return (
      <div>
        <button className="conv-mini-btn" onClick={onBack}>← Toutes les leçons</button>
        <p className="eyebrow-free" style={{ marginTop: '1rem' }}>La leçon de prononciation n'existe pas encore pour cette langue.</p>
      </div>
    );
  }

  const total = lesson.sections.length + 1; // introduction + une carte par point
  const last = total - 1;

  function play(text: string, key: string) {
    const ok = speak(text, lang?.bcp47 ?? 'en-US');
    setSpeechOk(ok);
    if (ok) {
      setPlayingKey(key);
      window.setTimeout(() => setPlayingKey((k) => (k === key ? null : k)), 1500);
    }
  }

  const section = step > 0 ? lesson.sections[step - 1] : null;

  return (
    <div className="lesson-viewer">
      <div className="lesson-viewer-head">
        <button className="conv-mini-btn" onClick={onBack}>← Toutes les leçons</button>
        <span className="deck-progress" style={{ marginBottom: 0 }}>
          Carte {step + 1} / {total}
        </span>
      </div>

      <div className="lesson-step-bar" aria-hidden="true">
        <div className="lesson-step-fill" style={{ width: `${((step + 1) / total) * 100}%` }} />
      </div>

      <div className="phrase-card phrase-card-big lesson-card">
        {!section ? (
          <>
            <div className="lesson-card-title">Leçon 0 : la prononciation</div>
            <p style={{ lineHeight: 1.6 }}>{lesson.intro}</p>
            <p className="eyebrow-free">
              {lesson.sections.length} points à parcourir. Clique sur ▶ pour écouter un mot, quand tu veux. Tu peux revenir ici à tout moment.
            </p>
          </>
        ) : (
          <>
            <div className="lesson-card-title">{section.title}</div>
            <p style={{ lineHeight: 1.6 }}>{section.explain}</p>
            {!speechOk && (
              <p className="conv-warning">La synthèse vocale n'est pas disponible dans ce navigateur : tu peux lire les indications écrites.</p>
            )}
            {section.examples.map((ex, i) => {
              const key = `${step}-${i}`;
              return (
                <div key={key} className="lesson-word-row">
                  <button
                    className={`play-btn${playingKey === key ? ' playing' : ''}`}
                    onClick={() => play(ex.text, key)}
                    aria-label={`Écouter ${ex.text}`}
                  >
                    ▶
                  </button>
                  <div className="lesson-word-body">
                    <div className="lesson-word-text" lang={isJa ? 'ja' : undefined}>
                      {ex.text}
                    </div>
                    <div className="lesson-word-fr">{ex.note}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="deck-nav">
        <button className="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          ← Précédent
        </button>
        {step < last ? (
          <button className="primary" onClick={() => setStep((s) => Math.min(last, s + 1))}>
            Suivant →
          </button>
        ) : (
          <button className="primary" onClick={onBack}>
            Terminer
          </button>
        )}
      </div>
    </div>
  );
}
