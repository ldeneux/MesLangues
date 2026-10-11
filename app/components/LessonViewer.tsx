'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getLesson, completeLesson, type LessonContent, type LessonWord } from '../../lib/lessons';
import type { ConjugationVerb } from '../../lib/conjugation';
import { THEMES } from '../../lib/constants';
import { splitEnding } from '../../lib/conjugationHighlight';
import { kanaToRomaji } from '../../lib/japanese';
import HighlightText from './HighlightText';
import RubyHighlight from './RubyHighlight';
import JapaneseRuby from './JapaneseRuby';
import JapaneseConjugationDetail from './JapaneseConjugationDetail';
import { usePersistentFlag } from './usePersistentFlag';
import { useJapaneseReadings } from './useJapaneseReadings';

const PRONOUNS_FR = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

type Card =
  | 'intro'
  | 'review'
  | 'nouns'
  | 'adjectives'
  | 'others'
  | 'verbs'
  | 'conjugation'
  | 'grammar'
  | 'phrases'
  | 'recap';

function themeLabel(code: string) {
  return THEMES.find((t) => t.code === code)?.label ?? code;
}

export default function LessonViewer({
  profileId,
  languageCode,
  levelCode,
  number,
  onBack,
  onChanged,
  onOpen,
}: {
  profileId: string;
  languageCode: string;
  levelCode: string;
  number: number;
  onBack: () => void;
  onChanged: () => void; // la progression a changé : la liste doit se recharger
  onOpen: (n: number) => void;
}) {
  const isJa = languageCode === 'ja';
  const [lesson, setLesson] = useState<LessonContent | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [furigana, setFurigana] = usePersistentFlag('ja-furigana', levelCode === 'A1' || levelCode === 'A2');
  const [romaji, setRomaji] = usePersistentFlag('ja-romaji');

  useEffect(() => {
    setLesson(null);
    setError('');
    setStep(0);
    setDone(false);
    getLesson(profileId, languageCode, levelCode, number)
      .then((r) => {
        if (r.ok) {
          const data = (r as { data: LessonContent }).data;
          setLesson(data);
          setDone(data.done);
        } else setError((r as { error: string }).error);
      })
      .catch((e: any) => setError(e?.message ?? 'Erreur de chargement de la leçon.'));
    return () => {
      audioRef.current?.pause();
    };
  }, [profileId, languageCode, levelCode, number]);

  // Cartes de la leçon, dans l'ordre d'apprentissage
  const cards: Card[] = useMemo(() => {
    if (!lesson) return [];
    const c: Card[] = ['intro'];
    if (lesson.review.length > 0) c.push('review');
    if (lesson.nouns.length > 0) c.push('nouns');
    if (lesson.adjectives.length > 0) c.push('adjectives');
    if (lesson.others.length > 0) c.push('others');
    if (lesson.verbs.length > 0) c.push('verbs', 'conjugation');
    if (lesson.grammar) c.push('grammar');
    if (lesson.phrases.length > 0) c.push('phrases');
    c.push('recap');
    return c;
  }, [lesson]);

  // Japonais : lectures (furigana / rōmaji) pour tous les mots de la leçon. Déjà en cache pour la plupart.
  const jaTexts = useMemo(() => {
    if (!lesson || !isJa) return [];
    const words = [
      ...lesson.nouns,
      ...lesson.adjectives,
      ...lesson.others,
      ...lesson.phrases,
      ...lesson.review.filter((r) => r.word).map((r) => r.word as LessonWord),
    ];
    return Array.from(new Set(words.map((w) => w.text)));
  }, [lesson, isJa]);
  const { readings, error: readingError, loading: readingLoading } = useJapaneseReadings(jaTexts, isJa && (furigana || romaji));

  function play(url: string | null, key: string) {
    if (!url) return;
    audioRef.current?.pause();
    const el = new Audio(url);
    audioRef.current = el;
    setPlayingKey(key);
    el.onended = () => setPlayingKey((k) => (k === key ? null : k));
    el.play().catch(() => setPlayingKey(null));
  }

  async function finish() {
    if (!lesson) return;
    setSaving(true);
    setError('');
    try {
      const r = await completeLesson(profileId, lesson.id);
      if (r.ok) {
        setDone(true);
        onChanged();
      } else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  // ---------- éléments d'affichage ----------
  function renderWordRow(w: LessonWord, keyPrefix: string) {
    const key = `${keyPrefix}-${w.id}`;
    const rd = isJa ? readings[w.text] : undefined;
    return (
      <div key={key} className="lesson-word-row">
        <button
          className={`play-btn${playingKey === key ? ' playing' : ''}`}
          onClick={() => play(w.audio_url, key)}
          disabled={!w.audio_url}
          aria-label={`Écouter ${w.text}`}
        >
          {playingKey === key ? '❚❚' : '▶'}
        </button>
        <div className="lesson-word-body">
          <div className="lesson-word-text" lang={isJa ? 'ja' : undefined}>
            {isJa && furigana && rd ? <JapaneseRuby ruby={rd.ruby} /> : w.text}
          </div>
          {isJa && romaji && rd?.romaji && <div className="phrase-notes">{rd.romaji}</div>}
          <div className="lesson-word-fr">{w.fr}</div>
        </div>
      </div>
    );
  }

  function verbLabel(v: ConjugationVerb) {
    if (isJa && v.ja_data) {
      return (
        <span lang="ja">
          {furigana ? <JapaneseRuby ruby={v.ja_data.ruby} /> : v.infinitive}
          {romaji && <span className="phrase-notes"> {kanaToRomaji(v.ja_data.reading)}</span>}
        </span>
      );
    }
    return <span>{v.infinitive}</span>;
  }

  function renderVerbRow(v: ConjugationVerb, keyPrefix = 'v') {
    return (
      <div key={`${keyPrefix}-${v.id}`} className="lesson-word-row">
        <div className="lesson-word-body">
          <div className="lesson-word-text">{verbLabel(v)}</div>
          <div className="lesson-word-fr">{v.translation_fr}</div>
        </div>
      </div>
    );
  }

  function renderJaToggles() {
    if (!isJa) return null;
    return (
      <div className="conv-bubble-actions" style={{ marginBottom: '0.75rem' }}>
        <button className={`conv-mini-btn${furigana ? ' active' : ''}`} onClick={() => setFurigana(!furigana)}>
          Furigana : {furigana ? 'oui' : 'non'}
        </button>
        <button className={`conv-mini-btn${romaji ? ' active' : ''}`} onClick={() => setRomaji(!romaji)}>
          Rōmaji : {romaji ? 'oui' : 'non'}
        </button>
        {readingLoading && <span className="eyebrow-free" style={{ marginBottom: 0 }}>Chargement des lectures…</span>}
      </div>
    );
  }

  // ---------- rendu ----------
  if (error && !lesson) {
    return (
      <div>
        <button className="conv-mini-btn" onClick={onBack}>← Toutes les leçons</button>
        <p className="conv-warning" style={{ marginTop: '1rem' }}>{error}</p>
      </div>
    );
  }
  if (!lesson) return <p className="eyebrow-free">Chargement de la leçon…</p>;

  const card = cards[Math.min(step, cards.length - 1)];
  const lastStep = cards.length - 1;
  const verbOfTheDay = lesson.verbs[0];
  const verbAllText = (v: ConjugationVerb) => v.infinitive;

  function renderCard() {
    switch (card) {
      case 'intro':
        return (
          <>
            <div className="lesson-card-title">Leçon {lesson!.number} sur {lesson!.total}</div>
            <p style={{ lineHeight: 1.6 }}>
              Thème : <strong>{themeLabel(lesson!.theme_code)}</strong>
            </p>
            <p style={{ lineHeight: 1.6 }}>Au programme de cette leçon :</p>
            <ul className="lesson-agenda">
              {lesson!.review.length > 0 && <li>{lesson!.review.length} mots de révision</li>}
              {lesson!.nouns.length > 0 && <li>{lesson!.nouns.length} noms</li>}
              {lesson!.adjectives.length > 0 && <li>{lesson!.adjectives.length} adjectifs</li>}
              {lesson!.others.length > 0 && <li>{lesson!.others.length} autres mots utiles</li>}
              {lesson!.verbs.length > 0 && <li>{lesson!.verbs.length} verbes, dont un conjugué au présent</li>}
              {lesson!.grammar && <li>Une règle de grammaire avec un exemple</li>}
              {lesson!.phrases.length > 0 && <li>{lesson!.phrases.length} mots et expressions à connaître</li>}
            </ul>
            <p className="eyebrow-free">Ici on apprend, on ne teste pas. Clique sur ▶ pour écouter un mot, quand tu veux.</p>
            {renderJaToggles()}
          </>
        );

      case 'review':
        return (
          <>
            <div className="lesson-card-title">Pour commencer : on se rappelle</div>
            <p className="eyebrow-free">Des mots des leçons précédentes.</p>
            {renderJaToggles()}
            {lesson!.review.map((r) => (r.word ? renderWordRow(r.word, 'rv') : r.verb ? renderVerbRow(r.verb, 'rv') : null))}
          </>
        );

      case 'nouns':
        return (
          <>
            <div className="lesson-card-title">Les noms ({lesson!.nouns.length})</div>
            {renderJaToggles()}
            {lesson!.nouns.map((w) => renderWordRow(w, 'n'))}
          </>
        );

      case 'adjectives':
        return (
          <>
            <div className="lesson-card-title">Les adjectifs ({lesson!.adjectives.length})</div>
            {renderJaToggles()}
            {lesson!.adjectives.map((w) => renderWordRow(w, 'a'))}
          </>
        );

      case 'others':
        return (
          <>
            <div className="lesson-card-title">Autres mots utiles ({lesson!.others.length})</div>
            {renderJaToggles()}
            {lesson!.others.map((w) => renderWordRow(w, 'o'))}
          </>
        );

      case 'verbs':
        return (
          <>
            <div className="lesson-card-title">Les verbes ({lesson!.verbs.length})</div>
            <p className="eyebrow-free">Le premier est conjugué à la carte suivante.</p>
            {renderJaToggles()}
            {lesson!.verbs.map((v) => renderVerbRow(v))}
          </>
        );

      case 'conjugation': {
        if (!verbOfTheDay) return null;
        if (isJa && verbOfTheDay.ja_data) {
          return (
            <>
              <div className="lesson-card-title">Le verbe du jour</div>
              <JapaneseConjugationDetail verb={verbOfTheDay} levelCode={levelCode} />
            </>
          );
        }
        const forms = verbOfTheDay.tenses?.present ?? [];
        const audio = verbOfTheDay.tense_audio?.present ?? null;
        return (
          <>
            <div className="lesson-card-title">Le verbe du jour</div>
            <p style={{ fontSize: '1.15rem', fontWeight: 600 }}>
              {verbAllText(verbOfTheDay)} <span className="lesson-word-fr">— {verbOfTheDay.translation_fr}</span>
            </p>
            <div className="conjugation-tense-title-row">
              <div className="conjugation-tense-title">Présent</div>
              <button
                className={`play-btn${playingKey === 'conj' ? ' playing' : ''}`}
                onClick={() => play(audio, 'conj')}
                disabled={!audio}
                aria-label="Écouter la conjugaison au présent"
              >
                {playingKey === 'conj' ? '❚❚' : '▶'}
              </button>
            </div>
            <div className="conjugation-forms">
              {forms.map((form, i) => {
                const split = splitEnding(form, languageCode, 'present');
                return (
                  <div key={i} className="conjugation-form-row">
                    <span className="conjugation-pronoun">{PRONOUNS_FR[i]}</span>
                    <span>
                      {split ? (
                        <>
                          {split.stem}
                          <mark className="highlight-mark">{split.ending}</mark>
                        </>
                      ) : (
                        form
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        );
      }

      case 'grammar': {
        const g = lesson!.grammar!;
        const topic = g.topic;
        const ex = topic && Array.isArray(topic.examples) ? topic.examples[g.exampleIndex] : null;
        return (
          <>
            <div className="lesson-card-title">La règle du jour</div>
            {!topic ? (
              <p className="eyebrow-free">
                La fiche « {g.label} » n'a pas encore été téléchargée : va dans Packs, puis « Grammaire, conjugaison et quiz ».
              </p>
            ) : (
              <>
                <p style={{ fontWeight: 600, fontSize: '1.05rem' }}>{topic.title}</p>
                <p style={{ lineHeight: 1.6 }}>{topic.explanation_fr}</p>
                {renderJaToggles()}
                {ex && (
                  <div className="grammar-example-row">
                    <div className="sidebar-label">Un exemple</div>
                    <div className="revision-target" lang={isJa ? 'ja' : undefined}>
                      {isJa && furigana && ex.ruby ? <RubyHighlight ruby={ex.ruby} /> : <HighlightText text={ex.target} />}
                    </div>
                    {isJa && romaji && ex.romaji && <div className="phrase-notes">{ex.romaji}</div>}
                    <div className="revision-fr">
                      <HighlightText text={ex.fr} />
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        );
      }

      case 'phrases':
        return (
          <>
            <div className="lesson-card-title">À connaître aussi</div>
            <p className="eyebrow-free">Des mots et expressions très courants, utiles dès maintenant.</p>
            {renderJaToggles()}
            {lesson!.phrases.map((w) => renderWordRow(w, 'p'))}
          </>
        );

      case 'recap': {
        const compact = (label: string, items: LessonWord[]) =>
          items.length > 0 && (
            <div className="lesson-recap-block">
              <div className="sidebar-label">{label}</div>
              {items.map((w) => (
                <div key={w.id} className="lesson-recap-line" lang={isJa ? 'ja' : undefined}>
                  <strong>{isJa && furigana && readings[w.text] ? <JapaneseRuby ruby={readings[w.text].ruby} /> : w.text}</strong>
                  <span> — {w.fr}</span>
                </div>
              ))}
            </div>
          );
        return (
          <>
            <div className="lesson-card-title">À retenir</div>
            {renderJaToggles()}
            <div className="lesson-recap-grid">
              {compact('Noms', lesson!.nouns)}
              {compact('Adjectifs', lesson!.adjectives)}
              {compact('Autres mots', lesson!.others)}
              {lesson!.verbs.length > 0 && (
                <div className="lesson-recap-block">
                  <div className="sidebar-label">Verbes</div>
                  {lesson!.verbs.map((v) => (
                    <div key={v.id} className="lesson-recap-line">
                      <strong>{verbLabel(v)}</strong>
                      <span> — {v.translation_fr}</span>
                    </div>
                  ))}
                </div>
              )}
              {compact('À connaître aussi', lesson!.phrases)}
            </div>

            {error && <p className="conv-warning">{error}</p>}
            {!done ? (
              <button className="primary" style={{ marginTop: '1rem' }} onClick={finish} disabled={saving}>
                {saving ? 'Enregistrement…' : "J'ai terminé la leçon"}
              </button>
            ) : (
              <div className="conv-correction exercise-success" style={{ marginTop: '1rem' }}>
                <div className="conv-correction-label">Leçon terminée</div>
                <div className="conv-correction-text">Bravo, la leçon {lesson!.number} est faite.</div>
                <div className="conv-bubble-actions" style={{ marginTop: '0.5rem' }}>
                  {lesson!.number < lesson!.total && (
                    <button className="conv-mini-btn" onClick={() => onOpen(lesson!.number + 1)}>
                      Leçon suivante →
                    </button>
                  )}
                  <button className="conv-mini-btn" onClick={onBack}>
                    Toutes les leçons
                  </button>
                </div>
              </div>
            )}
          </>
        );
      }
    }
  }

  return (
    <div className="lesson-viewer">
      <div className="lesson-viewer-head">
        <button className="conv-mini-btn" onClick={onBack}>← Toutes les leçons</button>
        <span className="deck-progress" style={{ marginBottom: 0 }}>
          Carte {step + 1} / {cards.length}
        </span>
      </div>

      <div className="lesson-step-bar" aria-hidden="true">
        <div className="lesson-step-fill" style={{ width: `${((step + 1) / cards.length) * 100}%` }} />
      </div>

      {readingError && <p className="conv-warning">{readingError}</p>}

      <div className="phrase-card phrase-card-big lesson-card">{renderCard()}</div>

      <div className="deck-nav">
        <button className="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          ← Précédent
        </button>
        {step < lastStep && (
          <button className="primary" onClick={() => setStep((s) => Math.min(lastStep, s + 1))}>
            Suivant →
          </button>
        )}
      </div>
    </div>
  );
}
