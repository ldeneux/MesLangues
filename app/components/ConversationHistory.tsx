'use client';

import { useState } from 'react';
import ConversationFeedback, { ConversationTranscript } from './ConversationFeedback';
import type { ConversationRecord } from '../../lib/conversation';

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

export default function ConversationHistory({
  records,
  onDelete,
}: {
  records: ConversationRecord[];
  onDelete: (id: string) => Promise<void>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState<'dialogue' | 'corrections' | null>(null);
  const [error, setError] = useState('');

  const open = records.find((r) => r.id === openId) ?? null;

  function close() {
    setOpenId(null);
    setConfirmDelete(false);
    setCopied(null);
    setError('');
  }

  async function handleCopy(kind: 'dialogue' | 'corrections') {
    if (!open) return;
    const content =
      kind === 'dialogue'
        ? open.transcript.map((t) => `${t.speaker === 'ai' ? 'IA' : 'Moi'} : ${t.text}`).join('\n')
        : open.transcript
            .filter((t) => t.speaker === 'user' && t.correction?.has_error)
            .map((t) => `${t.text}\n→ ${t.correction!.corrected_text.replace(/\*\*/g, '')}\n${t.correction!.explanation_fr}`)
            .join('\n\n');
    const ok = await copyToClipboard(content || 'Aucune correction pour cette séance.');
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

  if (records.length === 0) return null;

  return (
    <div className="quiz-history">
      <div className="sidebar-label">Historique de mes conversations</div>
      {records.map((r) => (
        <div key={r.id} className="quiz-history-row">
          <button
            type="button"
            className="history-link"
            onClick={() => {
              setOpenId(r.id);
              setConfirmDelete(false);
            }}
          >
            {r.score} / 100 ({r.level_code}) — {r.theme_label} — {new Date(r.created_at).toLocaleDateString('fr-FR')}
          </button>
        </div>
      ))}

      {open && (
        <div className="scores-overlay" onClick={close}>
          <div className="scores-modal history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="scores-header">
              <div>
                <div className="sidebar-label">Conversation du {formatDate(open.created_at)}</div>
                <div className="history-meta">
                  <span className="history-badge">Niveau {open.level_code}</span>
                  <span className="history-badge">{open.theme_label}</span>
                  <span className="history-badge">{open.score} / 100</span>
                  <span className="history-badge">{open.user_turns} échanges</span>
                </div>
              </div>
              <button type="button" className="secondary" onClick={close} aria-label="Fermer">
                ✕
              </button>
            </div>

            <ConversationTranscript record={open} />
            <ConversationFeedback record={open} />

            {error && <p className="conv-warning">{error}</p>}

            <div className="history-actions">
              <button type="button" className="secondary" onClick={() => handleCopy('dialogue')}>
                {copied === 'dialogue' ? '✓ Copié' : '📋 Copier le dialogue'}
              </button>
              <button type="button" className="secondary" onClick={() => handleCopy('corrections')}>
                {copied === 'corrections' ? '✓ Copié' : '📋 Copier les corrections'}
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
