'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getR2Status, testR2, copyAudioStep, rewriteAudioLinks, deleteSourceStep, type R2Status, type R2Test } from '../../lib/r2Migration';

const CURSOR_KEY = 'r2-copy-cursor';

/**
 * Migration des audios de Supabase Storage vers Cloudflare R2, en 4 étapes (tout se fait depuis le navigateur, rien à installer) :
 * 1 tester R2 · 2 copier les fichiers · 3 basculer les liens en base · 4 supprimer les copies de Supabase.
 */
export default function R2MigrationBlock() {
  const [status, setStatus] = useState<R2Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [test, setTest] = useState<R2Test | null>(null);
  const [copyState, setCopyState] = useState<{ done: number; copied: number; skipped: number; failed: number; firstError?: string; finished: boolean } | null>(null);
  const [rewrite, setRewrite] = useState<{ total: number; applied: boolean; r2Files: number; supabaseFiles: number } | null>(null);
  const [confirm, setConfirm] = useState<'' | 'rewrite' | 'delete'>('');
  const [deleteState, setDeleteState] = useState<{ done: number; deleted: number; kept: number; finished: boolean } | null>(null);
  const stopRef = useRef(false);

  const refresh = useCallback(async () => {
    const r = await getR2Status();
    if (r.ok === true) {
      setStatus(r.data);
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

  async function runCopy(fromStart = false) {
    stopRef.current = false;
    setError('');
    let after = fromStart ? '' : (typeof window !== 'undefined' && window.localStorage.getItem(CURSOR_KEY)) || '';
    let acc = { done: 0, copied: 0, skipped: 0, failed: 0, firstError: undefined as string | undefined, finished: false };
    setCopyState(acc);
    setBusy('Copie en cours…');
    try {
      for (let guard = 0; guard < 2000 && !stopRef.current; guard++) {
        const r = await copyAudioStep(after);
        if (r.ok !== true) {
          setError((r as { error: string }).error);
          break;
        }
        const d = r.data;
        acc = { done: acc.done + d.processed, copied: acc.copied + d.copied, skipped: acc.skipped + d.skipped, failed: acc.failed + d.failed, firstError: acc.firstError ?? d.firstError, finished: d.done };
        setCopyState(acc);
        after = d.last;
        try {
          window.localStorage.setItem(CURSOR_KEY, after);
        } catch {
          /* stockage du navigateur indisponible : on ne pourra pas reprendre au même endroit */
        }
        if (d.done) {
          try {
            window.localStorage.removeItem(CURSOR_KEY);
          } catch {}
          break;
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Copie interrompue.');
    } finally {
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
  const resumeAvailable = typeof window !== 'undefined' && !!window.localStorage.getItem(CURSOR_KEY);

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
                  {copyState.done} fichiers traités{total ? ` sur ${total}` : ''} — copiés {copyState.copied}, déjà présents {copyState.skipped}, échecs {copyState.failed}
                  {copyState.finished ? ' — terminé' : ''}
                </div>
                <div className="pack-progress-track">
                  <div className="pack-progress-fill" style={{ width: `${copyState.finished ? 100 : pct(copyState.done, total)}%` }} />
                </div>
                {copyState.firstError && <p className="conv-warning">Premier échec : {copyState.firstError}</p>}
              </div>
            )}
            <div className="conv-bubble-actions">
              {busy === 'Copie en cours…' ? (
                <button className="conv-mini-btn" onClick={() => (stopRef.current = true)}>
                  Mettre en pause
                </button>
              ) : (
                <>
                  <button className="primary" onClick={() => runCopy(false)} disabled={!canRun}>
                    {resumeAvailable ? 'Reprendre la copie' : 'Copier les fichiers'}
                  </button>
                  {resumeAvailable && (
                    <button className="conv-mini-btn" onClick={() => runCopy(true)} disabled={!canRun}>
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
