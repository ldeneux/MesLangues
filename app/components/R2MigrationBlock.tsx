'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getR2Status, testR2, copyAudioStep, retryFailedStep, rewriteAudioLinks, deleteSourceStep, type R2Status, type R2Test, type CopyState } from '../../lib/r2Migration';

const START_CONCURRENCY = 6;
const MAX_CONCURRENCY = 12;

/**
 * Migration des audios de Supabase Storage vers Cloudflare R2, en 4 étapes (tout se fait depuis le navigateur, rien à installer) :
 * 1 tester R2 · 2 copier les fichiers · 3 basculer les liens en base · 4 supprimer les copies de Supabase.
 */
export default function R2MigrationBlock() {
  const [status, setStatus] = useState<R2Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState<R2Test | null>(null);
  const [copyState, setCopyState] = useState<CopyState | null>(null); // progression enregistrée côté serveur (dans R2) : reprise possible partout
  const [copyInfo, setCopyInfo] = useState<{ concurrency: number; perMin: number; etaMin: number | null; firstError?: string } | null>(null);
  const [rewrite, setRewrite] = useState<{ total: number; applied: boolean; r2Files: number; supabaseFiles: number } | null>(null);
  const [confirm, setConfirm] = useState<'' | 'rewrite' | 'delete'>('');
  const [deleteState, setDeleteState] = useState<{ done: number; deleted: number; kept: number; finished: boolean } | null>(null);
  const stopRef = useRef(false);

  const refresh = useCallback(async () => {
    const r = await getR2Status();
    if (r.ok === true) {
      setStatus(r.data);
      setCopyState((prev) => prev ?? r.data.copy); // état enregistré côté serveur : on reprend où la copie s'était arrêtée
      setError('');
    } else setError((r as { error: string }).error);
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e?.message ?? 'Lecture de l\'état impossible.'));
  }, [refresh]);

  async function runTest() {
    setBusy('Test en cours…');
    setError('');
    setTest(null);
    try {
      const r = await testR2();
      if (r.ok === true) setTest(r.data);
      else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? 'Test impossible.');
    } finally {
      setBusy('');
    }
  }

  // Empêche l'écran de se mettre en veille pendant la copie (sinon le navigateur peut s'endormir et interrompre la copie)
  async function keepAwake(): Promise<{ release: () => void } | null> {
    try {
      const wl = await (navigator as any).wakeLock?.request('screen');
      return wl ? { release: () => wl.release().catch(() => {}) } : null;
    } catch {
      return null;
    }
  }

  // Copie (ou refait les échecs) par lots, en adaptant le nombre de lectures simultanées : on accélère tant que Supabase accepte,
  // on ralentit dès qu'il refuse (« Too many connections »). La progression est enregistrée côté serveur après chaque lot.
  async function runCopy(mode: 'resume' | 'reset' | 'failed') {
    stopRef.current = false;
    setError('');
    setBusy(mode === 'failed' ? 'Reprise des échecs…' : 'Copie en cours…');
    const wake = await keepAwake();
    let conc = START_CONCURRENCY;
    const t0 = Date.now();
    let startDone = mode === 'reset' ? 0 : copyState?.done ?? 0;
    let first = true;
    try {
      for (let guard = 0; guard < 5000 && !stopRef.current; guard++) {
        const r = mode === 'failed' ? await retryFailedStep({ concurrency: conc }) : await copyAudioStep({ reset: mode === 'reset' && first, concurrency: conc });
        first = false;
        if (r.ok !== true) {
          setError((r as { error: string }).error);
          break;
        }
        const d = r.data;
        setCopyState(d.state);
        // adaptation : refus essuyés → on réduit nettement ; lot propre → on augmente doucement
        conc = d.throttled > 0 ? Math.max(1, Math.floor(conc * 0.6)) : Math.min(MAX_CONCURRENCY, conc + 1);
        const minutes = (Date.now() - t0) / 60000;
        const perMin = minutes > 0.05 ? Math.round((d.state.done - startDone) / minutes) : 0;
        const left = Math.max(0, (status?.supabaseFiles ?? 0) - d.state.done);
        setCopyInfo({ concurrency: conc, perMin, etaMin: mode !== 'failed' && perMin > 0 ? Math.round(left / perMin) : null, firstError: d.firstError ?? undefined });
        if (mode === 'failed' ? d.state.failedNames.length === 0 || d.processed === 0 : d.state.finished) break;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Copie interrompue.');
    } finally {
      wake?.release();
      setBusy('');
      refresh().catch(() => {});
    }
  }

  async function runRewrite(apply: boolean) {
    setConfirm('');
    setBusy(apply ? 'Bascule des liens…' : 'Vérification…');
    setError('');
    try {
      const r = await rewriteAudioLinks(apply);
      if (r.ok === true) setRewrite({ total: r.data.total, applied: r.data.applied, r2Files: r.data.r2Files, supabaseFiles: r.data.supabaseFiles });
      else setError((r as { error: string }).error);
    } catch (e: any) {
      setError(e?.message ?? 'Opération impossible.');
    } finally {
      setBusy('');
      refresh().catch(() => {});
    }
  }

  async function runDelete() {
    setConfirm('');
    stopRef.current = false;
    setError('');
    let after = '';
    let acc = { done: 0, deleted: 0, kept: 0, finished: false };
    setDeleteState(acc);
    setBusy('Suppression chez Supabase…');
    try {
      for (let guard = 0; guard < 2000 && !stopRef.current; guard++) {
        const r = await deleteSourceStep(after);
        if (r.ok !== true) {
          setError((r as { error: string }).error);
          break;
        }
        const d = r.data;
        acc = { done: acc.done + d.processed, deleted: acc.deleted + d.deleted, kept: acc.kept + d.kept, finished: d.done };
        setDeleteState(acc);
        after = d.last;
        if (d.done) break;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Suppression interrompue.');
    } finally {
      setBusy('');
      refresh().catch(() => {});
    }
  }

  const total = status?.supabaseFiles ?? 0;
  const pct = (n: number, t: number) => (t > 0 ? Math.min(100, Math.round((n / t) * 100)) : 0);
  const canRun = !!status?.configured && !busy;

  return (
    <div className="pack-list" style={{ marginTop: '1.5rem' }}>
      <div className="pack-row-title" style={{ marginBottom: '0.5rem' }}>
        Migrer les audios vers Cloudflare R2
      </div>
      <div className="phrase-card lesson-setup">
        {error && <p className="conv-warning">{error}</p>}
        {!status && !error && <p className="eyebrow-free">Chargement…</p>}

        {status && (
          <>
            <p className="eyebrow-free">
              {status.configured ? (
                <>✅ R2 est configuré (adresse publique : {status.publicBase}).</>
              ) : (
                <>
                  ❌ R2 n'est pas encore configuré : il manque {status.missing.join(', ')} dans les variables d'environnement de Vercel (puis redéploiement).
                </>
              )}{' '}
              Chez Supabase : <strong>{status.supabaseFiles}</strong> fichiers ({status.supabaseMo} Mo). Liens en base qui pointent encore vers Supabase :{' '}
              <strong>{status.linksToRewrite}</strong>.
            </p>

            {/* 1. Test */}
            <p style={{ margin: '0.8rem 0 0.3rem' }}>
              <strong>1. Tester la connexion</strong>
            </p>
            <button className="conv-mini-btn" onClick={runTest} disabled={!canRun}>
              {busy === 'Test en cours…' ? busy : 'Tester R2'}
            </button>
            {test && <p className={test.publicOk ? 'search-add-done' : 'conv-warning'}>{test.message}</p>}

            {/* 2. Copie */}
            <p style={{ margin: '0.8rem 0 0.3rem' }}>
              <strong>2. Copier les fichiers vers R2</strong> <span className="eyebrow-free">(garde la page ouverte ; relançable à tout moment)</span>
            </p>
            {copyState && (
              <div className="pack-progress">
                <div className="pack-progress-label">
                  {copyState.done} fichiers traités{total ? ` sur ${total}` : ''} — copiés {copyState.copied}, déjà présents {copyState.skipped}, à refaire {copyState.failedNames.length}
                  {copyState.finished ? ' — passage terminé' : ''}
                </div>
                <div className="pack-progress-track">
                  <div className="pack-progress-fill" style={{ width: `${copyState.finished ? 100 : pct(copyState.done, total)}%` }} />
                </div>
                {copyInfo && busy && (
                  <p className="eyebrow-free" style={{ margin: '0.3rem 0 0' }}>
                    {copyInfo.perMin} fichiers/min · {copyInfo.concurrency} lecture(s) en parallèle (réglé automatiquement)
                    {copyInfo.etaMin !== null ? ` · environ ${copyInfo.etaMin >= 90 ? `${Math.round(copyInfo.etaMin / 6) / 10} h` : `${copyInfo.etaMin} min`} restantes` : ''}
                  </p>
                )}
                {copyInfo?.firstError && <p className="conv-warning">Dernier échec : {copyInfo.firstError}</p>}
                {!busy && copyState.failedNames.length > 0 && (
                  <p className="conv-warning">
                    {copyState.failedNames.length} fichier(s) n'ont pas pu être copiés (souvent une saturation passagère de Supabase). Clique sur « Refaire les échecs » : seuls ces fichiers sont retentés.
                  </p>
                )}
              </div>
            )}
            <div className="conv-bubble-actions">
              {busy === 'Copie en cours…' || busy === 'Reprise des échecs…' ? (
                <button className="conv-mini-btn" onClick={() => (stopRef.current = true)}>
                  Mettre en pause (la progression est conservée)
                </button>
              ) : (
                <>
                  {!copyState?.finished && (
                    <button className="primary" onClick={() => runCopy('resume')} disabled={!canRun}>
                      {copyState && copyState.done > 0 ? `Reprendre la copie (à partir du fichier ${copyState.done})` : 'Copier les fichiers'}
                    </button>
                  )}
                  {copyState && copyState.failedNames.length > 0 && (
                    <button className="primary" onClick={() => runCopy('failed')} disabled={!canRun}>
                      Refaire les {copyState.failedNames.length} échecs
                    </button>
                  )}
                  {copyState && copyState.done > 0 && (
                    <button className="conv-mini-btn" onClick={() => runCopy('reset')} disabled={!canRun}>
                      Recommencer depuis le début
                    </button>
                  )}
                </>
              )}
            </div>

            {/* 3. Liens */}
            <p style={{ margin: '0.8rem 0 0.3rem' }}>
              <strong>3. Vérifier la copie et basculer les liens</strong>
            </p>
            {rewrite && (
              <p className={rewrite.applied ? 'search-add-done' : 'eyebrow-free'}>
                {rewrite.applied ? '✅ Liens basculés vers R2.' : `Liens à basculer : ${rewrite.total}.`} Fichiers : {rewrite.supabaseFiles} chez Supabase, {rewrite.r2Files} dans R2.
              </p>
            )}
            {confirm === 'rewrite' ? (
              <div className="pack-confirm-modal">
                <p style={{ marginTop: 0 }}>
                  Remplacer, dans toute la base, les adresses audio de Supabase par celles de R2 ({status.linksToRewrite} liens) ? À partir de là, le son vient de R2. On vérifie d'abord que R2 contient au moins autant de fichiers que Supabase.
                </p>
                <div className="conv-bubble-actions">
                  <button className="primary" onClick={() => runRewrite(true)}>
                    Oui, basculer
                  </button>
                  <button className="conv-mini-btn" onClick={() => setConfirm('')}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="conv-bubble-actions">
                <button className="conv-mini-btn" onClick={() => runRewrite(false)} disabled={!canRun}>
                  Vérifier (sans rien modifier)
                </button>
                <button className="primary" onClick={() => setConfirm('rewrite')} disabled={!canRun || status.linksToRewrite === 0}>
                  Basculer les liens ({status.linksToRewrite})
                </button>
              </div>
            )}

            {/* 4. Nettoyage */}
            <p style={{ margin: '0.8rem 0 0.3rem' }}>
              <strong>4. Libérer la place chez Supabase</strong> <span className="eyebrow-free">(après avoir vérifié que le son passe partout)</span>
            </p>
            {deleteState && (
              <p className={deleteState.finished ? 'search-add-done' : 'eyebrow-free'}>
                {deleteState.deleted} fichiers supprimés de Supabase, {deleteState.kept} conservés (pas de copie R2 identique){deleteState.finished ? ' — terminé' : ''}.
              </p>
            )}
            {confirm === 'delete' ? (
              <div className="pack-confirm-modal">
                <p style={{ marginTop: 0 }}>
                  Supprimer définitivement chez Supabase les fichiers dont la copie R2 existe avec la même taille ? Ne le fais qu'après avoir écouté des mots, des phrases, des verbes et un article d'écoute.
                </p>
                <div className="conv-bubble-actions">
                  <button className="primary danger" onClick={runDelete}>
                    Oui, supprimer chez Supabase
                  </button>
                  <button className="conv-mini-btn" onClick={() => setConfirm('')}>
                    Annuler
                  </button>
                </div>
              </div>
            ) : busy === 'Suppression chez Supabase…' ? (
              <button className="conv-mini-btn" onClick={() => (stopRef.current = true)}>
                Mettre en pause
              </button>
            ) : (
              <button className="primary danger" onClick={() => setConfirm('delete')} disabled={!canRun || status.linksToRewrite > 0 || status.supabaseFiles === 0}>
                Supprimer les copies de Supabase
              </button>
            )}
            {status.linksToRewrite > 0 && <p className="eyebrow-free">Cette étape se débloque quand tous les liens ont été basculés (étape 3).</p>}
          </>
        )}
        {status && (
          <button className="conv-mini-btn" style={{ marginTop: '0.8rem' }} onClick={() => refresh()} disabled={!!busy}>
            Actualiser l'état
          </button>
        )}
      </div>
    </div>
  );
}
