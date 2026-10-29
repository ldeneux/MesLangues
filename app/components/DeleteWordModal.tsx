'use client';

import { useEffect, useState } from 'react';
import { LANGS } from '../../lib/constants';
import { lookupFrenchWordInBase, type DictionaryResult } from '../../lib/dictionary';
import { deleteVocabularyWord, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import FlagIcon from './FlagIcon';
import WordTranslations from './WordTranslations';

/**
 * Confirmation de suppression d'un mot du vocabulaire. Montre le mot en français, son image et ses traductions
 * telles qu'elles sont en base (aucune IA) ; la langue concernée est mise en évidence : seule cette ligne est supprimée.
 */
export default function DeleteWordModal({
  word,
  languageCode,
  levelCode,
  onCancel,
  onDeleted,
}: {
  word: VocabularyWordWithMastery;
  languageCode: string;
  levelCode: string;
  onCancel: () => void;
  onDeleted: (wordId: string) => void;
}) {
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  levelCode = word.level_code ?? levelCode; // le mot peut venir d'un niveau précédent
  const langLabel = LANGS.find((l) => l.code === languageCode)?.label ?? languageCode;

  useEffect(() => {
    let alive = true;
    lookupFrenchWordInBase(word.translation_fr)
      .then((r) => {
        if (!alive) return;
        // La ligne à supprimer est celle de CE mot, exactement (plusieurs mots d'une même langue peuvent partager un sens proche)
        setResult({
          ...r,
          entries: { ...r.entries, [languageCode]: { text: word.target_text, audio_url: word.audio_url, source: 'base', level: levelCode, ruby: r.entries[languageCode]?.text === word.target_text ? r.entries[languageCode]?.ruby : undefined, romaji: r.entries[languageCode]?.text === word.target_text ? r.entries[languageCode]?.romaji : undefined } },
        });
      })
      .catch(() => {
        // Repli : au moins le mot lui-même
        if (alive) setResult({ french: word.translation_fr, image: word.image ?? null, level: levelCode, entries: { [languageCode]: { text: word.target_text, audio_url: word.audio_url, source: 'base', level: levelCode } } });
      })
      .finally(() => alive && setLoading(false));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id]);

  async function confirm() {
    setDeleting(true);
    setError('');
    try {
      await deleteVocabularyWord(word.id);
      onDeleted(word.id);
    } catch (e: any) {
      setError(e?.message ?? 'Suppression impossible.');
      setDeleting(false);
    }
  }

  return (
    <div className="scores-overlay" onClick={() => !deleting && onCancel()}>
      <div className="scores-modal search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scores-header">
          <h2 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif' }}>Supprimer ce mot ?</h2>
          <button className="conv-mini-btn" onClick={onCancel} disabled={deleting}>
            Fermer ✕
          </button>
        </div>

        <div className="search-input-row">
          <span className="search-flag">
            <FlagIcon code="fr" />
          </span>
          <div className="search-cell delete-fr">
            <span className="search-cell-text">{word.translation_fr}</span>
          </div>
        </div>

        <WordTranslations
          result={result}
          loading={loading}
          waitLabel="…"
          highlightCode={languageCode}
          highlightBadge="à supprimer"
          fallbackImage={word.image}
        />

        <p className="eyebrow-free" style={{ marginTop: '1rem', marginBottom: 0 }}>
          Seule la ligne <strong>{langLabel}</strong> « {word.target_text} » (niveau {levelCode}) est supprimée définitivement de la base, avec sa progression et
          son audio. Les autres langues ne sont pas touchées. Son pack passera en « Clôturé » s'il n'est plus complet.
        </p>

        {error && <p className="conv-warning">{error}</p>}

        <div className="delete-actions">
          <button className="secondary" onClick={onCancel} disabled={deleting}>
            Annuler
          </button>
          <button className="primary danger" onClick={confirm} disabled={deleting}>
            {deleting ? 'Suppression…' : '🗑 Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  );
}
