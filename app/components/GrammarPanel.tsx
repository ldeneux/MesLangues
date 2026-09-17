'use client';

import { useEffect, useState } from 'react';
import { getGrammarTopic, type GrammarTopic } from '../../lib/grammar';
import { GRAMMAR_TOPICS } from '../../lib/constants';
import HighlightText from './HighlightText';

export default function GrammarPanel({ languageCode }: { languageCode: string }) {
  const [selected, setSelected] = useState<string>(GRAMMAR_TOPICS[0].code);
  const [topic, setTopic] = useState<GrammarTopic | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, selected]);

  async function load(topicCode: string) {
    setLoading(true);
    setError('');
    setTopic(null);
    try {
      const existing = await getGrammarTopic(languageCode, topicCode);
      setTopic(existing);
    } catch (e: any) {
      setError(e.message ?? 'Erreur de chargement de la fiche de grammaire.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="cascade-row">
        <select className="cascade-select" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {GRAMMAR_TOPICS.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="eyebrow-free">Chargement…</p>}
      {error && <p className="conv-warning">{error}</p>}

      {!loading && !topic && !error && (
        <p className="eyebrow-free">
          Cette fiche n'a pas encore été téléchargée — va dans l'onglet "Packs" et clique sur "Grammaire et
          conjugaison".
        </p>
      )}

      {topic && (
        <div className="phrase-card phrase-card-big">
          <div className="phrase-fr" style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '1.05rem' }}>
            {topic.title}
          </div>
          <p style={{ lineHeight: 1.6 }}>{topic.explanation_fr}</p>

          <div className="grammar-examples">
            {topic.examples.map((ex, i) => (
              <div key={i} className="grammar-example-row">
                <div className="revision-target">
                  <HighlightText text={ex.target} />
                </div>
                <div className="revision-fr">
                  <HighlightText text={ex.fr} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
