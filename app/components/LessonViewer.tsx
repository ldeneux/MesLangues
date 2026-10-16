'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getLesson, completeLesson, type LessonContent, type LessonWord } from '../../lib/lessons';
import type { ConjugationVerb } from '../../lib/conjugation';
import type { KanjiItem } from '../../lib/kanji';
import { THEMES, LANGS } from '../../lib/constants';
import { splitEnding } from '../../lib/conjugationHighlight';
import { kanaToRomaji } from '../../lib/japanese';
import { conjugateJapaneseVerb } from '../../lib/japaneseVerbs';
import { speak } from '../../lib/speech';
import { imageUrl } from '../../lib/imageName';
import HighlightText from './HighlightText';
import RubyHighlight from './RubyHighlight';
import JapaneseRuby from './JapaneseRuby';
import JapaneseConjugationDetail from './JapaneseConjugationDetail';
import JapaneseConjugationGuide from './JapaneseConjugationGuide';
import { JA_GUIDE_TITLE } from '../../lib/japaneseConjugationGuide';
import KanjiStrokes from './KanjiStrokes';
import KanjiDraw from './KanjiDraw';
import { markSpans } from '../../lib/lessonMatch';
import { usePersistentFlag } from './usePersistentFlag';
import { useJapaneseReadings } from './useJapaneseReadings';

const PRONOUNS_FR = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

// Fiche de conjugaison récapitulative : présent, passé composé, futur (japonais : formes polies équivalentes).
const RECAP_TENSES: { key: 'present' | 'passe_compose' | 'futur'; label: string }[] = [
  { key: 'present', label: 'Présent' },
  { key: 'passe_compose', label: 'Passé composé' },
  { key: 'futur', label: 'Futur' },
];
const JA_RECAP: { id: string; label: string }[] = [
  { id: 'dict', label: 'Dictionnaire' },
  { id: 'masu', label: 'Présent / futur poli' },
  { id: 'masen', label: 'Négatif poli' },
  { id: 'mashita', label: 'Passé poli' },
];

type CardType = 'intro' | 'review' | 'nouns' | 'adjectives' | 'others' | 'jaguide' | 'verb' | 'conjrecap' | 'kanji' | 'grammar' | 'sentences' | 'phrases' | 'recap';
type CardDef = { type: CardType; index?: number };

function themeLabel(code: string) {
  return THEMES.find((t) => t.code === code)?.label ?? code;
}

// Lecture d'un kanji ou d'un mot japonais par la voix du navigateur : on retire les marques « . » et « - » des lectures.
const cleanKana = (s: string) => s.replace(/[.\-～~]/g, '');
const showKun = (s: string) => s.replace(/\./g, '・');

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
  const bcp47 = LANGS.find((l) => l.code === languageCode)?.bcp47 ?? 'en-US';
  const [lesson, setLesson] = useState<LessonContent | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState('');
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
  const cards: CardDef[] = useMemo(() => {
    if (!lesson) return [];
    const c: CardDef[] = [{ type: 'intro' }];
    if (lesson.review.length > 0) c.push({ type: 'review' });
    if (lesson.nouns.length > 0) c.push({ type: 'nouns' });
    if (lesson.adjectives.length > 0) c.push({ type: 'adjectives' });
    if (lesson.others.length > 0) c.push({ type: 'others' });
    // Japonais, leçon 1 : on explique d'abord comment fonctionne la conjugaison, avant le premier verbe
    if (isJa && lesson.number === 1 && lesson.verbs.length > 0) c.push({ type: 'jaguide' });
    lesson.verbs.forEach((_, i) => c.push({ type: 'verb', index: i }));
    if (lesson.conjugationRecap.length > 0) c.push({ type: 'conjrecap' });
    lesson.kanji.forEach((_, i) => c.push({ type: 'kanji', index: i }));
    if (lesson.grammar) c.push({ type: 'grammar' });
    if (lesson.sentences.length > 0) c.push({ type: 'sentences' });
    if (lesson.phrases.length > 0) c.push({ type: 'phrases' });
    c.push({ type: 'recap' });
    return c;
  }, [lesson, isJa]);

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
    return Array.from(new Set([...words.map((w) => w.text), ...lesson.sentences.map((s) => s.text)]));
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

  // Infinitif d'un verbe : audio enregistré s'il existe, sinon voix du navigateur.
  function playInfinitive(v: ConjugationVerb, key: string) {
    const url = v.tense_audio?.infinitive ?? null;
    if (url) {
      play(url, key);
      return;
    }
    const spoken = isJa ? v.ja_data?.reading || v.infinitive : v.infinitive;
    audioRef.current?.pause();
    if (speak(cleanKana(spoken), bcp47)) {
      setPlayingKey(key);
      window.setTimeout(() => setPlayingKey((k) => (k === key ? null : k)), 1500);
    }
  }

  // PDF de la leçon : fabriqué dans le navigateur (le module n'est chargé qu'au clic)
  async function makePdf() {
    setError('');
    setPdfBusy('Préparation…');
    try {
      const { downloadLessonsPdf } = await import('./pdf/generate');
      await downloadLessonsPdf({ profileId, languageCode, levelCode, numbers: [number], furigana, romaji, onProgress: (m) => setPdfBusy(m || 'Préparation…') });
    } catch (e: any) {
      setError(e?.message ?? 'Le PDF n\'a pas pu être créé.');
    } finally {
      setPdfBusy('');
    }
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
  // Carte d'un mot : image (si elle existe), mot, rōmaji, traduction, bouton d'écoute
  function renderWordRow(w: LessonWord, keyPrefix: string) {
    const key = `${keyPrefix}-${w.id}`;
    const rd = isJa ? readings[w.text] : undefined;
    return (
      <div key={key} className="lesson-word-card">
        {w.image && (
          <div className="lesson-word-img">
            <img src={imageUrl(w.image)} alt="" loading="lazy" />
          </div>
        )}
        <div className="lesson-word-card-body">
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
      </div>
    );
  }

  const renderWordGrid = (items: (JSX.Element | null)[]) => <div className="lesson-word-grid">{items}</div>;

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
      <div key={`${keyPrefix}-${v.id}`} className="lesson-word-card">
        <div className="lesson-word-card-body">
          <div className="lesson-word-body">
            <div className="lesson-word-text">{verbLabel(v)}</div>
            <div className="lesson-word-fr">{v.translation_fr}</div>
          </div>
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

  // Mots de la leçon contenant un kanji donné (pour la carte kanji)
  function wordsWithKanji(char: string): { text: string; fr: string }[] {
    const all = [
      ...lesson!.nouns.map((w) => ({ text: w.text, fr: w.fr })),
      ...lesson!.adjectives.map((w) => ({ text: w.text, fr: w.fr })),
      ...lesson!.others.map((w) => ({ text: w.text, fr: w.fr })),
      ...lesson!.phrases.map((w) => ({ text: w.text, fr: w.fr })),
      ...lesson!.verbs.map((v) => ({ text: v.infinitive, fr: v.translation_fr })),
    ];
    return all.filter((w) => w.text.includes(char));
  }

  function renderVerbCard(index: number) {
    const v = lesson!.verbs[index];
    if (!v) return null;
    const infKey = `inf-${v.id}`;
    const head = (
      <div className="lesson-verb-head">
        <button
          className={`play-btn${playingKey === infKey ? ' playing' : ''}`}
          onClick={() => playInfinitive(v, infKey)}
          aria-label={`Écouter ${v.infinitive}`}
        >
          {playingKey === infKey ? '❚❚' : '▶'}
        </button>
        <div className="lesson-word-body">
          <div className="lesson-verb-name">{verbLabel(v)}</div>
          <div className="lesson-word-fr">{v.translation_fr}</div>
        </div>
      </div>
    );

    if (isJa && v.ja_data) {
      return (
        <>
          <div className="lesson-card-title">
            Verbe {index + 1} sur {lesson!.verbs.length}
          </div>
          {renderJaToggles()}
          {head}
          <JapaneseConjugationDetail verb={v} levelCode={levelCode} />
        </>
      );
    }

    const forms = v.tenses?.present ?? [];
    const presentAudio = v.tense_audio?.present ?? null;
    return (
      <>
        <div className="lesson-card-title">
          Verbe {index + 1} sur {lesson!.verbs.length}
        </div>
        {head}
        <div className="conjugation-tense-title-row" style={{ marginTop: '0.9rem' }}>
          <div className="conjugation-tense-title">Présent</div>
          <button
            className={`play-btn${playingKey === `pres-${v.id}` ? ' playing' : ''}`}
            onClick={() => play(presentAudio, `pres-${v.id}`)}
            disabled={!presentAudio}
            aria-label="Écouter la conjugaison au présent"
          >
            {playingKey === `pres-${v.id}` ? '❚❚' : '▶'}
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

  function renderConjugationRecap() {
    const verbs = lesson!.conjugationRecap;
    return (
      <>
        <div className="lesson-card-title">Fiche de conjugaison</div>
        <p className="eyebrow-free">
          Les {verbs.length} verbes des 5 dernières leçons, pour tout reprendre au même endroit.
        </p>
        {renderJaToggles()}
        {verbs.map((v) => {
          if (isJa && v.ja_data) {
            const rows = conjugateJapaneseVerb(v.infinitive, v.ja_data.reading, v.ja_data.group).filter((r) =>
              JA_RECAP.some((x) => x.id === r.id)
            );
            return (
              <div key={v.id} className="lesson-conj-verb">
                <div className="lesson-conj-verb-title">
                  {verbLabel(v)} <span className="lesson-word-fr">— {v.translation_fr}</span>
                </div>
                <div className="lesson-conj-cols">
                  {JA_RECAP.map((spec) => {
                    const row = rows.find((r) => r.id === spec.id);
                    if (!row) return null;
                    return (
                      <div key={spec.id} className="lesson-conj-col">
                        <div className="conjugation-tense-title">{spec.label}</div>
                        <div className="lesson-conj-line" lang="ja">
                          {row.written}
                          {furigana && row.reading !== row.written && <span className="phrase-notes"> {row.reading}</span>}
                          {romaji && <span className="phrase-notes"> {kanaToRomaji(row.reading)}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }
          return (
            <div key={v.id} className="lesson-conj-verb">
              <div className="lesson-conj-verb-title">
                {v.infinitive} <span className="lesson-word-fr">— {v.translation_fr}</span>
              </div>
              <div className="lesson-conj-cols">
                {RECAP_TENSES.map((t) => (
                  <div key={t.key} className="lesson-conj-col">
                    <div className="conjugation-tense-title">{t.label}</div>
                    {(v.tenses?.[t.key] ?? []).map((form, i) => {
                      const split = splitEnding(form, languageCode, t.key);
                      return (
                        <div key={i} className="lesson-conj-line">
                          <span className="conjugation-pronoun">{PRONOUNS_FR[i]}</span>{' '}
                          {split ? (
                            <>
                              {split.stem}
                              <mark className="highlight-mark">{split.ending}</mark>
                            </>
                          ) : (
                            form
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  function renderKanjiCard(index: number) {
    const k: KanjiItem | undefined = lesson!.kanji[index];
    if (!k) return null;
    const inLesson = wordsWithKanji(k.char);
    return (
      <>
        <div className="lesson-card-title">
          Kanji {index + 1} sur {lesson!.kanji.length}
        </div>
        <div className="kanji-detail-head">
          <div className="kanji-big" lang="ja">
            {k.char}
          </div>
          <div>
            <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.2rem' }}>
              {k.meaning_fr}
            </div>
          </div>
        </div>

        <KanjiStrokes char={k.char} />
        <KanjiDraw char={k.char} />

        <div className="sidebar-label" style={{ marginTop: '1rem' }}>Lectures</div>
        <div className="kanji-readings">
          {k.onyomi.length > 0 && (
            <div>
              <span className="revision-fr">On'yomi (dans les mots composés) : </span>
              {k.onyomi.map((r) => (
                <button key={r} className="conv-mini-btn" onClick={() => speak(cleanKana(r), 'ja-JP')}>
                  🔊 {r}
                </button>
              ))}
            </div>
          )}
          {k.kunyomi.length > 0 && (
            <div>
              <span className="revision-fr">Kun'yomi (lecture japonaise) : </span>
              {k.kunyomi.map((r) => (
                <button key={r} className="conv-mini-btn" onClick={() => speak(cleanKana(r), 'ja-JP')}>
                  🔊 {showKun(r)}
                </button>
              ))}
            </div>
          )}
        </div>

        {inLesson.length > 0 && (
          <>
            <div className="sidebar-label" style={{ marginTop: '1rem' }}>Dans les mots de cette leçon</div>
            {inLesson.map((w, i) => {
              const rd = readings[w.text];
              return (
                <div key={i} className="kanji-example">
                  <span className="kanji-example-word" lang="ja">
                    {furigana && rd ? <JapaneseRuby ruby={rd.ruby} /> : w.text}
                  </span>
                  <span className="revision-fr">{w.fr}</span>
                </div>
              );
            })}
          </>
        )}

        {k.examples.length > 0 && (
          <>
            <div className="sidebar-label" style={{ marginTop: '1rem' }}>Autres mots d'exemple</div>
            {k.examples.map((e, i) => (
              <div key={i} className="kanji-example">
                <ruby lang="ja" className="kanji-example-word">
                  {e.word}
                  <rt>{e.reading}</rt>
                </ruby>
                <span className="revision-fr">{e.meaning_fr}</span>
                <button className="conv-mini-btn" onClick={() => speak(cleanKana(e.reading), 'ja-JP')}>🔊</button>
              </div>
            ))}
          </>
        )}
        <p className="eyebrow-free" style={{ marginTop: '1rem' }}>Tracés : KanjiVG (CC BY-SA 3.0).</p>
      </>
    );
  }

  function renderCard() {
    switch (card.type) {
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
              {isJa && lesson!.number === 1 && lesson!.verbs.length > 0 && <li>Comprendre la conjugaison japonaise (à lire une fois)</li>}
              {lesson!.verbs.length > 0 && <li>{lesson!.verbs.length} verbes, chacun avec son tableau de formes</li>}
              {lesson!.conjugationRecap.length > 0 && <li>Une fiche de conjugaison qui reprend les verbes des 5 dernières leçons</li>}
              {lesson!.kanji.length > 0 && <li>{lesson!.kanji.length} kanji à écrire</li>}
              {lesson!.grammar && <li>Une règle de grammaire avec un exemple</li>}
              {lesson!.sentences.length > 0 && <li>{lesson!.sentences.length} phrases qui reprennent les mots de la leçon</li>}
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
            {renderWordGrid(lesson!.review.map((r) => (r.word ? renderWordRow(r.word, 'rv') : r.verb ? renderVerbRow(r.verb, 'rv') : null)))}
          </>
        );

      case 'nouns':
        return (
          <>
            <div className="lesson-card-title">Les noms ({lesson!.nouns.length})</div>
            {renderJaToggles()}
            {renderWordGrid(lesson!.nouns.map((w) => renderWordRow(w, 'n')))}
          </>
        );

      case 'adjectives':
        return (
          <>
            <div className="lesson-card-title">Les adjectifs ({lesson!.adjectives.length})</div>
            {renderJaToggles()}
            {renderWordGrid(lesson!.adjectives.map((w) => renderWordRow(w, 'a')))}
          </>
        );

      case 'others':
        return (
          <>
            <div className="lesson-card-title">Autres mots utiles ({lesson!.others.length})</div>
            {renderJaToggles()}
            {renderWordGrid(lesson!.others.map((w) => renderWordRow(w, 'o')))}
          </>
        );

      case 'jaguide':
        return (
          <>
            <div className="lesson-card-title">{JA_GUIDE_TITLE}</div>
            <p className="eyebrow-free">À lire une fois : ça t'aidera pour tous les verbes. Tu pourras la retrouver dans l'onglet Conjugaison, au-dessus du tableau de chaque verbe.</p>
            <JapaneseConjugationGuide />
          </>
        );

      case 'verb':
        return renderVerbCard(card.index ?? 0);

      case 'conjrecap':
        return renderConjugationRecap();

      case 'kanji':
        return renderKanjiCard(card.index ?? 0);

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

      case 'sentences':
        return (
          <>
            <div className="lesson-card-title">Les mots en phrases</div>
            <p className="eyebrow-free">Les mots de la leçon sont en couleur.</p>
            {renderJaToggles()}
            {lesson!.sentences.map((s) => {
              const key = `sent-${s.id}`;
              const rd = isJa ? readings[s.text] : undefined;
              return (
                <div key={key} className="lesson-word-row">
                  <button
                    className={`play-btn${playingKey === key ? ' playing' : ''}`}
                    onClick={() => play(s.audio_url, key)}
                    disabled={!s.audio_url}
                    aria-label="Écouter la phrase"
                  >
                    {playingKey === key ? '❚❚' : '▶'}
                  </button>
                  <div className="lesson-word-body">
                    <div className="lesson-sentence-text" lang={isJa ? 'ja' : undefined}>
                      {isJa && furigana && rd ? <JapaneseRuby ruby={rd.ruby} /> : <HighlightText text={markSpans(s.text, s.spans)} />}
                    </div>
                    {isJa && romaji && rd?.romaji && <div className="phrase-notes">{rd.romaji}</div>}
                    <div className="lesson-word-fr">{s.fr}</div>
                  </div>
                </div>
              );
            })}
          </>
        );

      case 'phrases':
        return (
          <>
            <div className="lesson-card-title">À connaître aussi</div>
            <p className="eyebrow-free">Des mots et expressions très courants, utiles dès maintenant.</p>
            {renderJaToggles()}
            {renderWordGrid(lesson!.phrases.map((w) => renderWordRow(w, 'p')))}
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
              {lesson!.kanji.length > 0 && (
                <div className="lesson-recap-block">
                  <div className="sidebar-label">Kanji</div>
                  {lesson!.kanji.map((k) => (
                    <div key={k.id} className="lesson-recap-line">
                      <strong lang="ja">{k.char}</strong>
                      <span> — {k.meaning_fr}</span>
                    </div>
                  ))}
                </div>
              )}
              {compact('À connaître aussi', lesson!.phrases)}
            </div>

            {error && <p className="conv-warning">{error}</p>}
            <div className="conv-bubble-actions" style={{ marginTop: '1rem' }}>
              <button className="conv-mini-btn" onClick={makePdf} disabled={!!pdfBusy}>
                {pdfBusy ? pdfBusy : '📄 Télécharger cette leçon en PDF'}
              </button>
            </div>
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
