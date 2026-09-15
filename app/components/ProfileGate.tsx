'use client';

import { useState } from 'react';
import { useProfile, EMOJI_CHOICES } from './ProfileContext';

export default function ProfileGate() {
  const { profiles, loading, selectProfile, addProfile } = useProfile();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading) return <p className="eyebrow-free">Chargement…</p>;

  async function handleCreate() {
    if (!name.trim()) {
      setError('Donne un prénom à ce profil.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addProfile(name.trim(), emoji);
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de la création du profil.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-gate">
      <h1>Frasi</h1>
      <p className="eyebrow-free">Qui apprend en ce moment ?</p>

      {profiles.length > 0 && (
        <div className="profile-grid">
          {profiles.map((p) => (
            <button key={p.id} className="profile-card" onClick={() => selectProfile(p.id)}>
              <span className="profile-emoji">{p.emoji}</span>
              <span>{p.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {!creating ? (
        <button className="secondary" onClick={() => setCreating(true)}>
          + Nouveau profil
        </button>
      ) : (
        <div className="profile-create-form">
          <div className="emoji-row">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                className={`emoji-btn${emoji === e ? ' active' : ''}`}
                onClick={() => setEmoji(e)}
                aria-label={`Choisir ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            className="conv-theme-input"
            type="text"
            placeholder="Prénom (ex. Candice)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          {error && <p className="conv-warning">{error}</p>}
          <div className="profile-create-actions">
            <button className="secondary" onClick={() => setCreating(false)}>
              Annuler
            </button>
            <button className="primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Création…' : 'Créer le profil'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
