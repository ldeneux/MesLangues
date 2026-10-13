'use client';

import { Fragment, useMemo, useState } from 'react';
import type { ConjugationVerb } from '../../lib/conjugation';
import { conjugateJapaneseVerb, JA_GROUP_INFO, JA_LEVEL_ORDER, type JaFormRow, type JaLevel } from '../../lib/japaneseVerbs';
import { splitCommon } from '../../lib/japaneseDiff';
import { kanaToRomaji } from '../../lib/japanese';
import { usePersistentFlag } from './usePersistentFlag';
import JapaneseRuby from './JapaneseRuby';
import JapaneseConjugationGuide from './JapaneseConjugationGuide';
import { JA_FORM_USAGE as USAGE, JA_FORM_CATEGORIES as CATEGORIES } from '../../lib/japaneseFormInfo';

export default function JapaneseConjugationDetail({ verb, levelCode }: { verb: ConjugationVerb; levelCode: string }) {
  const data = verb.ja_data!;
  const [showAll, setShowAll] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [furigana, setFurigana] = usePersistentFlag('ja-furigana', levelCode === 'A1' || levelCode === 'A2');
  const [romaji, setRomaji] = usePersistentFlag('ja-romaji');
  const [playing, setPlaying] = useState(false);

  const rows = useMemo(() => conjugateJapaneseVerb(verb.infinitive, data.reading, data.group), [verb.infinitive, data.reading, data.group]);
  const levelIdx = JA_LEVEL_ORDER.indexOf(levelCode as JaLevel);
  const limit = levelIdx >= 0 ? levelIdx : 0;
  const inLevel = (r: JaFormRow) => JA_LEVEL_ORDER.indexOf(r.level) <= limit;
  const visible = showAll ? rows : rows.filter(inLevel);
  const hidden = rows.length - rows.filter(inLevel).length;

  const sections = useMemo(() => {
    const byId = new Map(visible.map((r) => [r.id, r]));
    const listed = new Set(CATEGORIES.flatMap((c) => c.ids ?? []));
    return CATEGORIES.map((c) => ({
      ...c,
      rows: (c.ids ?? visible.filter((r) => !listed.has(r.id)).map((r) => r.id))
        .map((id) => byId.get(id))
        .filter((r): r is JaFormRow => !!r),
    })).filter((c) => c.rows.length > 0);
  }, [visible]);

  const info = JA_GROUP_INFO[data.group];
  const audio = verb.tense_audio?.basic;

  function play() {
    if (!audio) return;
    setPlaying(true);
    const el = new Audio(audio);
    el.onended = () => setPlaying(false);
    el.play().catch(() => setPlaying(false));
  }

  function colored(base: string, form: string) {
    const { stem, rest } = splitCommon(base, form);
    return (
      <>
        {stem}
        {rest && <mark className="highlight-mark">{rest}</mark>}
      </>
    );
  }

  return (
    <div className="phrase-card conjugation-detail">
      <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.4rem' }} lang="ja">
        <JapaneseRuby ruby={data.ruby} /> <span className="revision-fr">— {verb.translation_fr}</span>
      </div>
      <p className="eyebrow-free">
        <span className="ja-group-badge">{info.label}</span> {info.tip}
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

      <button className="ja-guide-link" onClick={() => setShowGuide((s) => !s)} aria-expanded={showGuide}>
        📖 Comprendre la conjugaison {showGuide ? '▴' : '▾'}
      </button>
      {showGuide && (
        <div className="ja-guide-box">
          <JapaneseConjugationGuide onClose={() => setShowGuide(false)} />
        </div>
      )}

      <p className="eyebrow-free" style={{ margin: '0.75rem 0 0.4rem' }}>
        Le verbe garde son sens : seule la terminaison change. <mark className="highlight-mark">En couleur</mark> : la partie qui change par rapport à la forme
        du dictionnaire.
      </p>

      <div className="ja-table-wrap">
        <table className="ja-conj-table">
          <thead>
            <tr>
              <th>Forme</th>
              <th lang="ja">{verb.infinitive}</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.key}>
                <tr className="ja-conj-cat">
                  <td colSpan={2}>{sec.label}</td>
                </tr>
                {sec.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="ja-conj-formcell">
                      <div className="ja-conj-label">{row.label_fr}</div>
                      <div className="ja-conj-term" lang="ja">
                        {row.term_jp}
                      </div>
                      {USAGE[row.id] && <div className="ja-conj-usage">{USAGE[row.id]}</div>}
                    </td>
                    <td className="ja-conj-valuecell" lang="ja">
                      <div className="ja-conj-written">{colored(verb.infinitive, row.written)}</div>
                      {furigana && row.reading !== row.written && <div className="ja-conj-reading">{colored(data.reading, row.reading)}</div>}
                      {romaji && <div className="ja-conj-reading">{kanaToRomaji(row.reading)}</div>}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
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
