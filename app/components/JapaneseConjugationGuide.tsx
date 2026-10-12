'use client';

import { useState } from 'react';
import { JA_GUIDE, JA_GUIDE_TITLE } from '../../lib/japaneseConjugationGuide';
import { splitCommon } from '../../lib/japaneseDiff';
import { speak } from '../../lib/speech';
import HighlightText from './HighlightText';

// Texte « Comprendre la conjugaison japonaise » : lien dans l'onglet Conjugaison, carte dans la leçon 1 de japonais.
// Les phrases sont lues par la voix du navigateur, au clic seulement.
export default function JapaneseConjugationGuide({ onClose }: { onClose?: () => void }) {
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  function play(text: string, key: string) {
    if (speak(text.replace(/\*\*/g, ''))) {
      setPlayingKey(key);
      window.setTimeout(() => setPlayingKey((k) => (k === key ? null : k)), 1800);
    }
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
    <div className="ja-guide">
      {onClose && (
        <div className="ja-guide-head">
          <strong>{JA_GUIDE_TITLE}</strong>
          <button className="conv-mini-btn" onClick={onClose}>
            Fermer ✕
          </button>
        </div>
      )}

      {JA_GUIDE.map((sec, si) => (
        <section key={si} className="ja-guide-section">
          <h3 className="ja-guide-title">
            {si + 1}. {sec.title}
          </h3>
          {sec.paragraphs.map((p, pi) => (
            <p key={pi} className="ja-guide-p">
              {p}
            </p>
          ))}

          {sec.table && (
            <div className="ja-table-wrap">
              <table className="ja-conj-table">
                <thead>
                  <tr>
                    {sec.table.head.map((h, hi) => (
                      <th key={hi}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.table.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} lang={ci > 0 ? 'ja' : undefined} className={ci === 0 ? 'ja-guide-firstcol' : undefined}>
                          <HighlightText text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {sec.verbTables?.map((t, ti) => (
            <div key={ti}>
              {t.caption && <div className="ja-guide-caption">{t.caption}</div>}
              <div className="ja-table-wrap">
                <table className="ja-conj-table">
                  <thead>
                    <tr>
                      <th>Verbe</th>
                      <th>ない (négatif familier)</th>
                      <th>ます (poli)</th>
                      <th>て</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, ri) => (
                      <tr key={ri}>
                        <td>
                          <span lang="ja" className="ja-guide-verb">
                            {r.dict}
                          </span>
                          {r.reading !== r.dict && (
                            <span lang="ja" className="phrase-notes">
                              {' '}
                              {r.reading}
                            </span>
                          )}
                          <div className="ja-conj-usage">{r.fr}</div>
                        </td>
                        <td lang="ja">{colored(r.dict, r.nai)}</td>
                        <td lang="ja">{colored(r.dict, r.masu)}</td>
                        <td lang="ja">{colored(r.dict, r.te)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {sec.examples?.map((ex, ei) => {
            const key = `${si}-${ei}`;
            return (
              <div key={key} className="grammar-example-row">
                <div className="lesson-word-row" style={{ borderBottom: 'none', padding: 0 }}>
                  <button
                    className={`play-btn${playingKey === key ? ' playing' : ''}`}
                    onClick={() => play(ex.ja, key)}
                    aria-label="Écouter la phrase"
                  >
                    {playingKey === key ? '❚❚' : '▶'}
                  </button>
                  <div className="lesson-word-body">
                    <div className="revision-target" lang="ja">
                      <HighlightText text={ex.ja} />
                    </div>
                    <div className="phrase-notes">{ex.romaji}</div>
                    <div className="revision-fr">{ex.fr}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
