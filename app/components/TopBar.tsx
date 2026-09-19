'use client';

import { useState } from 'react';
import { useProfile, EMOJI_CHOICES } from './ProfileContext';
import type { LangCode, LevelCode } from '../../lib/constants';
import MyScoresPanel from './MyScoresPanel';

export default function TopBar({
  lang,
  level,
  onLangChange,
  onLevelChange,
}: {
  lang: LangCode;
  level: LevelCode;
  onLangChange: (l: LangCode) => void;
  onLevelChange: (l: LevelCode) => void;
}) {
  const { profile, profiles, selectProfile, addProfile } = useProfile();
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);
  const [scoresOpen, setScoresOpen] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    await addProfile(name.trim(), emoji);
    setCreating(false);
    setSwitching(false);
    setName('');
  }

  return (
    <div className="topbar">
      <button className="topbar-icon-btn" onClick={() => setScoresOpen(true)} aria-label="Mes scores" title="Mes scores">
        📊
      </button>

      <div className="topbar-profile-wrap">
        <button className="sidebar-profile-btn" onClick={() => setSwitching((s) => !s)}>
          <span className="profile-emoji-sm">{profile?.emoji}</span>
          <span>{profile?.display_name}</span>
          <span className="sidebar-chevron">▾</span>
        </button>

        {switching && (
          <div className="sidebar-profile-menu topbar-profile-menu">
            {profiles.map((p) => (
              <button
                key={p.id}
                className={`sidebar-profile-option${p.id === profile?.id ? ' active' : ''}`}
                onClick={() => {
                  selectProfile(p.id);
                  setSwitching(false);
                }}
              >
                <span className="profile-emoji-sm">{p.emoji}</span>
                {p.display_name}
              </button>
            ))}

            {!creating ? (
              <button className="sidebar-profile-option" onClick={() => setCreating(true)}>
                + Nouveau profil
              </button>
            ) : (
              <div className="sidebar-new-profile">
                <div className="emoji-row">
                  {EMOJI_CHOICES.slice(0, 6).map((e) => (
                    <button key={e} className={`emoji-btn${emoji === e ? ' active' : ''}`} onClick={() => setEmoji(e)}>
                      {e}
                    </button>
                  ))}
                </div>
                <input
                  className="conv-theme-input"
                  type="text"
                  placeholder="Prénom"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                />
                <button className="primary" onClick={handleCreate}>
                  Créer
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {scoresOpen && profile && (
        <MyScoresPanel
          profileId={profile.id}
          lang={lang}
          level={level}
          onLangChange={onLangChange}
          onLevelChange={onLevelChange}
          onClose={() => setScoresOpen(false)}
        />
      )}
    </div>
  );
}
