'use client';

import { useState } from 'react';
import { LANGS, LEVELS } from '../../lib/constants';
import { previewAudioPurge, purgeAudioStep, type PurgeCounts, type PurgeScope } from '../../lib/audioPurge';

/**
 * Libérer du stockage Supabase : supprime les fichiers audio d'un périmètre (langues × niveaux × vocabulaire / verbes).
 * Les mots et les verbes restent ; leur audio pourra être régénéré ensuite. Préréglé sur allemand + japonais, B1 + B2.
 */
export default function AudioPurgeBlock() {
  const [languages, setLanguages] = useState<string[]>(['de', 'ja']);
  const [levels, setLevels] = useState<string[]>(['B1', 'B2']);
  const [vocabulary, setVocabulary] = useState(true);
  const [verbs, setVerbs] = useState(true);
  const [counts, setCounts] = useState<PurgeCounts | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState<{ removed: number; left: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const scope: PurgeScope = { languages, levels, vocabulary, verbs };
  const toggle = (list: string[], set: (v: string[]) => void, code: string) => {
    set(list.includes(code) ? list.filter((c) => c !== code) : [...list, code]);
    setCounts(null);
    setConfirm(false);
    setDone('');
  };

  async function count() {
    setBusy('Comptage…');
    setError('');
    setDone('');
    setConfirm(false);
    try {
      const r = await previewAudioPurge(scope);
      if (r.ok === true) setCounts(r.data);
      else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? 'Comptage impossible.');
    } finally {
      setBusy('');
    }
  }

  async function run() {
    if (!counts) return;
    setConfirm(false);
    setError('');
    setDone('');
    const total = counts.vocabularyWords + counts.verbRows;
    let removed = 0;
    setBusy('Suppression…');
    setProgress({ removed: 0, left: total, total });
    try {
      for (let guard = 0; guard < 400; guard++) {
        const r = await purgeAudioStep(scope);
        if (r.ok !== true) {
          setError((r as { error: string }).error);
          break;
        }
        removed += r.data.removedFiles;
        const left = r.data.vocabularyWordsLeft + r.data.verbRowsLeft;
        setProgress({ removed, left, total });
        if (left === 0) {
          setDone(`✅ Terminé : ${removed} fichier(s) audio supprimé(s) du stockage.`);
          break;
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Suppression interrompue.');
    } finally {
      setBusy('');
      setProgress(null);
      setCounts(null);
    }
  }

  const nothing = counts && counts.vocabularyWords === 0 && counts.verbRows === 0;

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Stockage : supprimer des audios
      </div>
      <div className="phrase-card lesson-setup">
        <p className="eyebrow-free">
          Libère de la place dans Supabase (le plan gratuit est limité à 1 Go). Les mots et les verbes restent, seuls leurs fichiers audio sont supprimés ;
          on peut les régénérer ensuite (Google TTS, payant au-delà du quota gratuit).
        </p>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="eyebrow-free">Langues</legend>
            {LANGS.map((l) => (
              <label key={l.code} style={{ marginRight: '0.8rem', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={languages.includes(l.code)} onChange={() => toggle(languages, setLanguages, l.code)} disabled={!!busy} /> {l.label}
              </label>
            ))}
          </fieldset>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="eyebrow-free">Niveaux</legend>
            {LEVELS.map((l) => (
              <label key={l.code} style={{ marginRight: '0.8rem' }}>
                <input type="checkbox" checked={levels.includes(l.code)} onChange={() => toggle(levels, setLevels, l.code)} disabled={!!busy} /> {l.code}
              </label>
            ))}
          </fieldset>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend className="eyebrow-free">Types</legend>
            <label style={{ marginRight: '0.8rem' }}>
              <input type="checkbox" checked={vocabulary} onChange={(e) => { setVocabulary(e.target.checked); setCounts(null); setConfirm(false); }} disabled={!!busy} /> Vocabulaire
            </label>
            <label>
              <input type="checkbox" checked={verbs} onChange={(e) => { setVerbs(e.target.checked); setCounts(null); setConfirm(false); }} disabled={!!busy} /> Verbes
            </label>
          </fieldset>
        </div>

        {error && <p className="conv-warning">{error}</p>}
        {done && <p className="search-add-done">{done}</p>}

        {progress ? (
          <div className="pack-progress">
            <div className="pack-progress-label">
              {progress.removed} fichiers supprimés · reste {progress.left} élément(s) à traiter
            </div>
            <div className="pack-progress-track">
              <div className="pack-progress-fill" style={{ width: `${progress.total ? Math.round(((progress.total - progress.left) / progress.total) * 100) : 0}%` }} />
            </div>
          </div>
        ) : !counts ? (
          <button className="primary" onClick={count} disabled={!!busy || languages.length === 0 || levels.length === 0 || (!vocabulary && !verbs)}>
            {busy || 'Compter les audios concernés'}
          </button>
        ) : nothing ? (
          <p className="eyebrow-free" style={{ marginBottom: 0 }}>Aucun audio à supprimer pour cette sélection.</p>
        ) : confirm ? (
          <div className="pack-confirm-modal">
            <p style={{ marginTop: 0 }}>
              Supprimer définitivement <strong>{counts.vocabularyWords} audios de vocabulaire</strong> et <strong>{counts.verbFiles} audios de verbes</strong> ({counts.verbRows} verbes) pour{' '}
              {languages.map((c) => LANGS.find((l) => l.code === c)?.label ?? c).join(', ')}, niveau{levels.length > 1 ? 'x' : ''} {levels.join(', ')} ? Les fichiers ne peuvent pas être récupérés.
            </p>
            <div className="conv-bubble-actions">
              <button className="primary danger" onClick={run}>Oui, supprimer</button>
              <button className="conv-mini-btn" onClick={() => setConfirm(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <>
            <p className="eyebrow-free">
              {counts.vocabularyWords} audios de vocabulaire · {counts.verbFiles} audios de verbes ({counts.verbRows} verbes) seraient supprimés.
            </p>
            <div className="conv-bubble-actions">
              <button className="primary danger" onClick={() => setConfirm(true)}>Supprimer ces audios…</button>
              <button className="conv-mini-btn" onClick={() => setCounts(null)}>Changer la sélection</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
