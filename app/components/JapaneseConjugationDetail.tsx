'use client';

import { useMemo, useState } from 'react';
import type { ConjugationVerb } from '../../lib/conjugation';
import { conjugateJapaneseVerb, JA_GROUP_INFO, JA_LEVEL_ORDER, type JaLevel } from '../../lib/japaneseVerbs';
import { kanaToRomaji } from '../../lib/japanese';
import { usePersistentFlag } from './usePersistentFlag';
import JapaneseRuby from './JapaneseRuby';

// Partie commune entre la forme du dictionnaire et la forme conjuguée : le reste est mis en surbrillance
function splitCommon(base: string, form: string): { stem: string; rest: string } {
  let i = 0;
  while (i < base.length && i < form.length && base[i] === form[i]) i++;
  return { stem: form.slice(0, i), rest: form.slice(i) };
}

export default function JapaneseConjugationDetail({ verb, levelCode }: { verb: ConjugationVerb; levelCode: string }) {
  const data = verb.ja_data!;
  const [showAll, setShowAll] = useState(false);
  const [furigana, setFurigana] = usePersistentFlag('ja-furigana', levelCode === 'A1' || levelCode === 'A2');
  const [romaji, setRomaji] = usePersistentFlag('ja-romaji');
  const [playing, setPlaying] = useState(false);

  const rows = useMemo(() => conjugateJapaneseVerb(verb.infinitive, data.reading, data.group), [verb.infinitive, data.reading, data.group]);
  const levelIdx = JA_LEVEL_ORDER.indexOf(levelCode as JaLevel);
  const limit = levelIdx >= 0 ? levelIdx : 0;
  const visible = showAll ? rows : rows.filter((r) => JA_LEVEL_ORDER.indexOf(r.level) <= limit);
  const hidden = rows.length - rows.filter((r) => JA_LEVEL_ORDER.indexOf(r.level) <= limit).length;

  const info = JA_GROUP_INFO[data.group];
  const audio = verb.tense_audio?.basic;

  function play() {
    if (!audio) return;
    setPlaying(true);
    const el = new Audio(audio);
    el.onended = () => setPlaying(false);
    el.play().catch(() => setPlaying(false));
  }

  return (
    <div className="phrase-card conjugation-detail">
      <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.4rem' }} lang="ja">
        <JapaneseRuby ruby={data.ruby} /> <span className="revision-fr">— {verb.translation_fr}</span>
      </div>
      <p className="eyebrow-free">
        <strong>{info.label}.</strong> {info.tip}
      </p>

      <div className="conv-bubble-actions" style={{ marginBottom: '0.75rem' }}>
        {audio && (
          <button className={`play-btn${playing ? ' playing' : ''}`} onClick={play} aria-label="Écouter les formes de base">
            {playing ? '❚❚' : '▶'}
          </button>
        )}
        <span className="eyebrow-free" style={{ marginBottom: 0 }}>
          Audio : dictionnaire, ます, て, ない, た
        </span>
        <button className={`conv-mini-btn${furigana ? ' active' : ''}`} onClick={() => setFurigana(!furigana)}>
          Lecture en kana : {furigana ? 'oui' : 'non'}
        </button>
        <button className={`conv-mini-btn${romaji ? ' active' : ''}`} onClick={() => setRomaji(!romaji)}>
          Rōmaji : {romaji ? 'oui' : 'non'}
        </button>
      </div>

      <div className="conjugation-forms">
        {visible.map((row) => {
          const { stem, rest } = splitCommon(verb.infinitive, row.written);
          return (
            <div key={row.id} className="ja-conj-row">
              <div className="ja-conj-label">
                {row.label_fr}
                <span className="ja-conj-term" lang="ja">
                  {row.term_jp}
                </span>
              </div>
              <div className="ja-conj-form" lang="ja">
                {stem}
                {rest && <mark className="highlight-mark">{rest}</mark>}
                {furigana && row.reading !== row.written && <div className="ja-conj-reading">{row.reading}</div>}
                {romaji && <div className="ja-conj-reading">{kanaToRomaji(row.reading)}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {hidden > 0 && (
        <button className="conv-mini-btn" style={{ marginTop: '0.75rem' }} onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Masquer les formes avancées' : `Voir aussi les ${hidden} formes des niveaux supérieurs`}
        </button>
      )}
      <p className="eyebrow-free" style={{ marginTop: '0.75rem' }}>
        Les formes sont calculées par règles de grammaire (pas par IA). Au niveau B2, quelques verbes ont des formes de politesse
        spéciales (食べる → 召し上がる).
      </p>
    </div>
  );
}
