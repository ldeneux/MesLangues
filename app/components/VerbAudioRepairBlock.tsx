'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LANGS } from '../../lib/constants';
import { getVerbAudioStatus, generateMissingVerbAudioStep, type VerbAudioStatus } from '../../lib/verbAudioRepair';

/**
 * Audios de verbes manquants : montre exactement ce qui manque pour la langue choisie (par niveau, y compris l'allemand et le japonais),
 * puis génère les fichiers manquants. Les audios existants ne sont jamais refaits.
 */
export default function VerbAudioRepairBlock({ languageCode }: { languageCode: string }) {
  const [status, setStatus] = useState<VerbAudioStatus | null>(null);
  const [levels, setLevels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [progress, setProgress] = useState<{ generated: number; left: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const stopRef = useRef(false);
  const langLabel = LANGS.find((l) => l.code === languageCode)?.label ?? languageCode;

  const refresh = useCallback(async () => {
    const r = await getVerbAudioStatus(languageCode);
    if (r.ok === true) {
      setStatus(r.data);
      setLevels((prev) => (prev.length ? prev : r.data.perLevel.filter((l) => l.files > 0).map((l) => l.level)));
      setError('');
    } else setError((r as { error: string }).error);
  }, [languageCode]);

  useEffect(() => {
    setStatus(null);
    setLevels([]);
    setDone('');
    setConfirm(false);
    refresh().catch((e) => setError(e?.message ?? 'Lecture impossible.'));
  }, [refresh]);

  const selected = status?.perLevel.filter((l) => levels.includes(l.level)) ?? [];
  const selVerbs = selected.reduce((s, l) => s + l.verbsMissing, 0);
  const selFiles = selected.reduce((s, l) => s + l.files, 0);

  async function run() {
    setConfirm(false);
    setBusy(true);
    setError('');
    setDone('');
    stopRef.current = false;
    let generated = 0;
    const totalVerbs = selVerbs;
    setProgress({ generated: 0, left: totalVerbs, total: totalVerbs });
    try {
      for (let guard = 0; guard < 500 && !stopRef.current; guard++) {
        const r = await generateMissingVerbAudioStep(languageCode, levels);
        if (r.ok !== true) {
          setError((r as { error: string }).error);
          break;
        }
        generated += r.data.generated;
        setProgress({ generated, left: r.data.remainingVerbs, total: totalVerbs });
        if (r.data.remainingVerbs === 0) {
          setDone(`✅ ${generated} fichier(s) audio généré(s).`);
          break;
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Génération interrompue.');
    } finally {
      setBusy(false);
      setProgress(null);
      refresh().catch(() => {});
    }
  }

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Audios des verbes manquants ({langLabel})
      </div>
      <div className="phrase-card lesson-setup">
        {error && <p className="conv-warning">{error}</p>}
        {done && <p className="search-add-done">{done}</p>}
        {!status && !error && <p className="eyebrow-free">Chargement…</p>}

        {status && status.totalFiles === 0 && <p className="eyebrow-free" style={{ marginBottom: 0 }}>✅ Tous les audios des verbes {langLabel} sont présents ({status.perLevel.reduce((s, l) => s + l.verbs, 0)} verbes).</p>}

        {status && status.totalFiles > 0 && (
          <>
            <p className="eyebrow-free">
              Il manque <strong>{status.totalFiles}</strong> fichiers audio pour <strong>{status.totalVerbsMissing}</strong> verbes {langLabel}. Choisis les niveaux à compléter :
            </p>
            <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              {status.perLevel.map((l) => (
                <label key={l.level} style={{ opacity: l.files === 0 ? 0.5 : 1 }}>
                  <input
                    type="checkbox"
                    disabled={busy || l.files === 0}
                    checked={levels.includes(l.level)}
                    onChange={() => setLevels((p) => (p.includes(l.level) ? p.filter((x) => x !== l.level) : [...p, l.level]))}
                  />{' '}
                  {l.level} : {l.files === 0 ? 'complet' : `${l.files} fichiers (${l.verbsMissing} / ${l.verbs} verbes)`}
                </label>
              ))}
            </div>

            {progress ? (
              <div className="pack-progress">
                <div className="pack-progress-label">
                  {progress.generated} fichiers générés — {progress.left} verbe(s) restant(s)
                </div>
                <div className="pack-progress-track">
                  <div className="pack-progress-fill" style={{ width: `${progress.total ? Math.round(((progress.total - progress.left) / progress.total) * 100) : 0}%` }} />
                </div>
                <button className="conv-mini-btn" style={{ marginTop: '0.4rem' }} onClick={() => (stopRef.current = true)}>
                  Mettre en pause
                </button>
              </div>
            ) : confirm ? (
              <div className="pack-confirm-modal">
                <p style={{ marginTop: 0 }}>
                  Générer <strong>{selFiles} fichiers audio</strong> pour {selVerbs} verbes ({levels.join(', ')}) avec Google TTS ? Coût indicatif pour la sélection : de l'ordre de{' '}
                  <strong>{((status.estimateEur * selFiles) / Math.max(1, status.totalFiles)).toFixed(2)} €</strong> (souvent gratuit sous le quota gratuit de Google). Les audios déjà présents ne sont pas refaits. Les fichiers
                  vont dans R2 si c'est configuré.
                </p>
                <div className="conv-bubble-actions">
                  <button className="primary" onClick={run}>
                    Générer
                  </button>
                  <button className="conv-mini-btn" onClick={() => setConfirm(false)}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button className="primary" onClick={() => setConfirm(true)} disabled={busy || selFiles === 0}>
                Générer les {selFiles} audios manquants
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
