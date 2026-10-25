'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getVocabularyPackWords,
  moveVocabularyWords,
  deleteVocabularyPack,
  type PackWord,
  type VocabularyPackInfo,
} from '../../lib/vocabulary';
import { imageBareKey } from '../../lib/imageName';
import JapaneseRuby from './JapaneseRuby';
import { useJapaneseReadings } from './useJapaneseReadings';

const NATURES = [
  { code: 'nom', label: 'Noms' },
  { code: 'adjectif', label: 'Adjectifs' },
  { code: 'adverbe', label: 'Adverbes' },
  { code: 'expression', label: 'Expressions' },
];

function packState(p: VocabularyPackInfo): string {
  if (p.status === 'ready' && p.generated_count < p.target_count) return 'clôturé';
  if (p.generated_count < p.target_count) return 'incomplet';
  return 'prêt';
}

/**
 * Contenu d'un pack (double-clic sur le pack) : mots groupés par nature puis par ordre alphabétique du français,
 * sélection par cases à cocher, transfert vers un autre pack du même niveau, suppression du pack.
 */
export default function PackWordsModal({
  pack,
  allPacks,
  languageCode,
  onClose,
  onChanged,
}: {
  pack: VocabularyPackInfo;
  allPacks: VocabularyPackInfo[];
  languageCode: string;
  onClose: () => void;
  onChanged: () => void; // le parent recharge la liste des packs
}) {
  const [words, setWords] = useState<PackWord[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const isJa = languageCode === 'ja';

  async function load() {
    try {
      setWords(await getVocabularyPackWords(pack.id));
    } catch (e: any) {
      setError(e?.message ?? 'Chargement impossible.');
      setWords([]);
    }
  }

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.id]);

  // Groupes par nature, mots triés alphabétiquement (règles de la langue étudiée)
  const groups = useMemo(() => {
    // Tri alphabétique en français (article ignoré : « la cuillère » et « une cuillère » côte à côte)
    const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
    const frKey = (w: PackWord) => imageBareKey(w.translation_fr) || w.translation_fr;
    const byType = new Map<string, PackWord[]>();
    for (const w of words ?? []) {
      const key = NATURES.some((n) => n.code === w.word_type) ? w.word_type : 'autre';
      byType.set(key, [...(byType.get(key) ?? []), w]);
    }
    const order = [...NATURES, { code: 'autre', label: 'Autres' }];
    return order
      .filter((n) => byType.has(n.code))
      .map((n) => ({ ...n, words: byType.get(n.code)!.sort((a, b) => collator.compare(frKey(a), frKey(b)) || collator.compare(a.target_text, b.target_text)) }));
  }, [words, languageCode]);

  const { readings } = useJapaneseReadings(isJa && words ? words.map((w) => w.target_text) : [], isJa && !!words);

  const destinations = allPacks.filter((p) => p.id !== pack.id);
  const total = words?.length ?? 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleGroup(ids: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = ids.every((id) => next.has(id));
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function handleMove() {
    if (!targetId || selected.size === 0) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const target = allPacks.find((p) => p.id === targetId);
      const r = await moveVocabularyWords(Array.from(selected), targetId);
      setInfo(`✅ ${r.moved} mot${r.moved > 1 ? 's' : ''} transféré${r.moved > 1 ? 's' : ''} vers le pack ${target?.pack_number ?? ''}.`);
      setSelected(new Set());
      await load();
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Transfert impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePack() {
    setBusy(true);
    setError('');
    try {
      await deleteVocabularyPack(pack.id);
      onChanged();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Suppression impossible.');
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="scores-overlay" onClick={() => !busy && onClose()}>
      <div className="scores-modal pack-words-modal" onClick={(e) => e.stopPropagation()}>
        <div className="scores-header">
          <h2 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif' }}>
            Pack {pack.pack_number} <span className="pack-words-sub">— {total} mot{total > 1 ? 's' : ''}, {packState(pack)}</span>
          </h2>
          <button className="conv-mini-btn" onClick={onClose} disabled={busy}>
            Fermer ✕
          </button>
        </div>

        <div className="pack-words-toolbar">
          <button className="secondary" onClick={() => setSelected(new Set((words ?? []).map((w) => w.id)))} disabled={busy || total === 0}>
            Tout sélectionner
          </button>
          <button className="secondary" onClick={() => setSelected(new Set())} disabled={busy || selected.size === 0}>
            Tout désélectionner
          </button>
          <span className="eyebrow-free" style={{ margin: 0 }}>
            {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
        </div>

        <div className="pack-words-list">
          {words === null ? (
            <p className="eyebrow-free">Chargement…</p>
          ) : total === 0 ? (
            <p className="eyebrow-free">Ce pack ne contient aucun mot.</p>
          ) : (
            groups.map((g) => {
              const ids = g.words.map((w) => w.id);
              const allChecked = ids.every((id) => selected.has(id));
              return (
                <div key={g.code} className="pack-words-group">
                  <label className="pack-words-group-head">
                    <input type="checkbox" checked={allChecked} onChange={() => toggleGroup(ids)} disabled={busy} />
                    <span>
                      {g.label} <span className="pack-words-sub">({g.words.length})</span>
                    </span>
                  </label>
                  {g.words.map((w) => (
                    <label key={w.id} className={`pack-word-row${selected.has(w.id) ? ' selected' : ''}`}>
                      <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} disabled={busy} />
                      <span className="pack-word-foreign">
                        {isJa && readings[w.target_text] ? <JapaneseRuby ruby={readings[w.target_text].ruby} /> : <span lang={languageCode}>{w.target_text}</span>}
                      </span>
                      <span className="pack-word-fr">{w.translation_fr}</span>
                    </label>
                  ))}
                </div>
              );
            })
          )}
        </div>

        {error && <p className="conv-warning">{error}</p>}
        {info && <p className="search-add-done">{info}</p>}

        <div className="pack-words-footer">
          <div className="pack-words-move">
            <select className="cascade-select" value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy || destinations.length === 0}>
              <option value="">{destinations.length === 0 ? 'Aucun autre pack' : 'Transférer vers le pack…'}</option>
              {destinations.map((p) => {
                const full = p.generated_count >= p.target_count;
                return (
                  <option key={p.id} value={p.id} disabled={full}>
                    Pack {p.pack_number} — {packState(p)}, {p.generated_count} / {p.target_count}
                    {full ? ' (plein)' : ''}
                  </option>
                );
              })}
            </select>
            <button className="primary" onClick={handleMove} disabled={busy || !targetId || selected.size === 0}>
              Transférer {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>

          {confirmDelete ? (
            <div className="pack-words-confirm">
              <span>
                Supprimer le pack {pack.pack_number} et ses {total} mot{total > 1 ? 's' : ''} (progression et audios compris) ? Irréversible.
              </span>
              <button className="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Annuler
              </button>
              <button className="primary danger" onClick={handleDeletePack} disabled={busy}>
                {busy ? 'Suppression…' : '🗑 Oui, supprimer'}
              </button>
            </div>
          ) : (
            <button className="secondary pack-delete-btn" onClick={() => setConfirmDelete(true)} disabled={busy}>
              🗑 Supprimer le pack
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
