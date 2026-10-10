'use client';

import { useState } from 'react';
import HighlightText from './HighlightText';
import WritingFeedback from './WritingFeedback';
import type { WritingResult } from '../../lib/writing';

// Copie dans le presse-papiers (avec solution de secours pour les navigateurs stricts)
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function WritingHistory({
  history,
  onDelete,
  languageCode,
}: {
  history: WritingResult[];
  onDelete: (id: string) => Promise<void>;
  languageCode?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState<'text' | 'correction' | null>(null);
  const [error, setError] = useState('');

  const open = history.find((h) => h.id === openId) ?? null;

  function close() {
    setOpenId(null);
    setConfirmDelete(false);
    setCopied(null);
    setError('');
  }

  async function handleCopy(kind: 'text' | 'correction') {
    if (!open) return;
    // La correction contient des **marqueurs** de surbrillance : on les retire pour la copie.
    const content = kind === 'text' ? open.submitted_text : open.corrected_text.replace(/\*\*/g, '');
    const ok = await copyToClipboard(content);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } else {
      setError('Impossible de copier automatiquement — sélectionne le texte à la main.');
    }
  }

  async function handleDelete() {
    if (!open) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete(open.id);
      close();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur pendant la suppression.');
    } finally {
      setDeleting(false);
    }
  }

  if (history.length === 0) return null;

  return (
    <div className="quiz-history">
      <div className="sidebar-label">Historique sur cette consigne</div>
      {history.map((h) => (
        <div key={h.id} className="quiz-history-row">
          <button
            type="button"
            className="history-link"
            onClick={() => {
              setOpenId(h.id);
              setConfirmDelete(false);
            }}
          >
            {h.score} / 100 {h.level_code ? `(${h.level_code})` : ''} — {new Date(h.created_at).toLocaleDateString('fr-FR')}
          </button>
        </div>
      ))}

      {open && (
        <div className="scores-overlay" onClick={close}>
          <div className="scores-modal history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scores-header">
              <div>
                <div className="sidebar-label">Rédaction du {formatDate(open.created_at)}</div>
                <div className="history-meta">
                  {open.level_code && <span className="history-badge">Niveau {open.level_code}</span>}
                  <span className="history-badge">{open.score} / 100</span>
                  {open.word_count ? <span className="history-badge">{open.word_count} mots</span> : null}
                </div>
              </div>
              <button type="button" className="secondary" onClick={close} aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="sidebar-label">Mon texte</div>
            <div className="history-text">{open.submitted_text}</div>

            <WritingFeedback result={open} languageCode={languageCode} />

            {error && <p className="conv-warning">{error}</p>}

            <div className="history-actions">
              <button type="button" className="secondary" onClick={() => handleCopy('text')}>
                {copied === 'text' ? '✓ Copié' : '📋 Copier mon texte'}
              </button>
              <button type="button" className="secondary" onClick={() => handleCopy('correction')}>
                {copied === 'correction' ? '✓ Copié' : '📋 Copier la correction'}
              </button>

              {!confirmDelete ? (
                <button type="button" className="secondary history-delete" onClick={() => setConfirmDelete(true)}>
                  🗑️ Supprimer de l'historique
                </button>
              ) : (
                <span className="history-confirm">
                  Supprimer définitivement ?
                  <button type="button" className="primary" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Suppression…' : 'Oui, supprimer'}
                  </button>
                  <button type="button" className="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Annuler
                  </button>
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
