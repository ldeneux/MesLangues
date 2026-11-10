'use client';

import { useEffect, useMemo, useState } from 'react';
import { LANGS } from '../../lib/constants';
import { lookupFrenchWordInBase, type DictionaryResult } from '../../lib/dictionary';
import { deleteVocabularyWord, deleteVocabularyWordEverywhere, findVocabularySiblings, type VocabularySibling, type VocabularyWordWithMastery } from '../../lib/vocabulary';
import FlagIcon from './FlagIcon';
import WordTranslations from './WordTranslations';

/**
 * Confirmation de suppression d'un mot du vocabulaire. Montre le mot en français, son image et ses traductions
 * telles qu'elles sont en base (aucune IA). Par défaut seule la ligne de la langue concernée est supprimée ; on peut choisir de supprimer
 * le mot dans TOUTES les langues (même forme française, même niveau) : les lignes concernées sont alors toutes mises en évidence.
 */
export default function DeleteWordModal({
  word,
  languageCode,
  levelCode,
  onCancel,
  onDeleted,
  onChanged,
}: {
  word: VocabularyWordWithMastery;
  languageCode: string;
  levelCode: string;
  onCancel: () => void;
  onDeleted: (wordIds: string[]) => void; // tout est supprimé : la fenêtre se ferme
  onChanged?: (wordIds: string[]) => void; // suppression partielle (une erreur) : on retire ces mots de la liste, la fenêtre reste ouverte
}) {
  const [result, setResult] = useState<DictionaryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [siblings, setSiblings] = useState<VocabularySibling[] | null>(null); // le même mot dans les autres langues (même forme française, même niveau)
  const [scope, setScope] = useState<'one' | 'all'>('one');
  levelCode = word.level_code ?? levelCode; // le mot peut venir d'un niveau précédent
  const langLabel = LANGS.find((l) => l.code === languageCode)?.label ?? languageCode;

  useEffect(() => {
    let alive = true;
    findVocabularySiblings(word.id)
      .then((r) => alive && setSiblings(r))
      .catch(() => alive && setSiblings([]));
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

  const others = (siblings ?? []).filter((x) => x.id !== word.id);
  const allMode = scope === 'all' && others.length > 0;
  const toDelete = allMode ? siblings! : [{ id: word.id, language_code: languageCode, level_code: levelCode, target_text: word.target_text }];
  const labelOf = (code: string) => LANGS.find((l) => l.code === code)?.label ?? code;

  // En mode « toutes les langues » les lignes affichées sont celles qui seront réellement supprimées
  const shown = useMemo(() => {
    if (!result || !allMode) return result;
    const entries = { ...result.entries };
    for (const sib of siblings!) {
      if (entries[sib.language_code]?.text !== sib.target_text) entries[sib.language_code] = { text: sib.target_text, audio_url: null, source: 'base', level: sib.level_code, id: sib.id };
    }
    return { ...result, entries };
  }, [result, allMode, siblings]);

  async function confirm() {
    setDeleting(true);
    setError('');
    try {
      if (allMode) {
        const r = await deleteVocabularyWordEverywhere(word.id);
        const ids = r.deleted.map((d) => d.id);
        if (r.failed.length > 0) {
          onChanged?.(ids);
          setError(`${r.deleted.length} mot(s) supprimé(s), mais : ${r.failed.join(' ; ')}`);
          setSiblings(await findVocabularySiblings(word.id).catch(() => []));
          setDeleting(false);
          return;
        }
        onDeleted(ids);
      } else {
        await deleteVocabularyWord(word.id);
        onDeleted([word.id]);
      }
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
          result={shown}
          loading={loading}
          waitLabel="…"
          highlightCodes={Array.from(new Set(toDelete.map((x) => x.language_code)))}
          highlightBadge="à supprimer"
          fallbackImage={word.image}
        />

        {others.length > 0 && (
          <div className="delete-scope" role="radiogroup" aria-label="Portée de la suppression">
            <label>
              <input type="radio" name="delete-scope" checked={scope === 'one'} onChange={() => setScope('one')} disabled={deleting} />
              <span>
                Seulement en <strong>{langLabel}</strong> (cette ligne)
              </span>
            </label>
            <label>
              <input type="radio" name="delete-scope" checked={scope === 'all'} onChange={() => setScope('all')} disabled={deleting} />
              <span>
                Dans <strong>toutes les langues</strong> : {siblings!.length} mot{siblings!.length > 1 ? 's' : ''} (même mot français, niveau {levelCode})
              </span>
            </label>
          </div>
        )}

        {allMode ? (
          <>
            <p className="eyebrow-free" style={{ marginTop: '0.8rem', marginBottom: 0 }}>
              Les {toDelete.length} mots ci-dessus pour « {word.translation_fr} » (niveau {levelCode}) sont supprimés définitivement de la base, avec leur progression et leurs
              audios. Leurs packs passeront en « Clôturé » s'ils ne sont plus complets.
            </p>
            <p className="delete-list">
              Seront supprimés :{' '}
              {toDelete.map((x) => `${labelOf(x.language_code)} « ${x.target_text} »`).join(' · ')}
            </p>
          </>
        ) : (
          <p className="eyebrow-free" style={{ marginTop: '1rem', marginBottom: 0 }}>
            Seule la ligne <strong>{langLabel}</strong> « {word.target_text} » (niveau {levelCode}) est supprimée définitivement de la base, avec sa progression et son audio.
            Les autres langues ne sont pas touchées. Son pack passera en « Clôturé » s'il n'est plus complet.
          </p>
        )}

        {error && <p className="conv-warning">{error}</p>}

        <div className="delete-actions">
          <button className="secondary" onClick={onCancel} disabled={deleting}>
            Annuler
          </button>
          <button className="primary danger" onClick={confirm} disabled={deleting}>
            {deleting ? 'Suppression…' : allMode ? `🗑 Supprimer les ${toDelete.length} mots définitivement` : '🗑 Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  );
}
