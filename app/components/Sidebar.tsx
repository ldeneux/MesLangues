'use client';

import { useState } from 'react';
import { LANGS, LEVELS, type LangCode, type LevelCode } from '../../lib/constants';
import { useProfile, EMOJI_CHOICES } from './ProfileContext';

export type Tab = 'today' | 'revision' | 'packs' | 'vocabulary';

export default function Sidebar({
  lang,
  level,
  tab,
  onLangChange,
  onLevelChange,
  onTabChange,
}: {
  lang: LangCode;
  level: LevelCode;
  tab: Tab;
  onLangChange: (l: LangCode) => void;
  onLevelChange: (l: LevelCode) => void;
  onTabChange: (t: Tab) => void;
}) {
  const { profile, profiles, selectProfile, addProfile } = useProfile();
  const [switching, setSwitching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_CHOICES[0]);

  async function handleCreate() {
    if (!name.trim()) return;
    await addProfile(name.trim(), emoji);
    setCreating(false);
    setSwitching(false);
    setName('');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title">Frasi</div>

      <div className="sidebar-section">
        <div className="sidebar-label">Apprenant</div>
        <button className="sidebar-profile-btn" onClick={() => setSwitching((s) => !s)}>
          <span className="profile-emoji-sm">{profile?.emoji}</span>
          <span>{profile?.display_name}</span>
          <span className="sidebar-chevron">▾</span>
        </button>

        {switching && (
          <div className="sidebar-profile-menu">
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
                    <button
                      key={e}
                      className={`emoji-btn${emoji === e ? ' active' : ''}`}
                      onClick={() => setEmoji(e)}
                    >
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

      <div className="sidebar-section">
        <div className="sidebar-label">Langue</div>
        <div className="sidebar-flag-list">
          {LANGS.map((l) => (
            <button
              key={l.code}
              className={`lang-chip${lang === l.code ? ' active' : ''}`}
              onClick={() => onLangChange(l.code)}
            >
              <span className="lang-chip-flag">{l.flag}</span>
              <span className="lang-chip-label">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Niveau</div>
        <div className="level-swatch-row">
          {LEVELS.map((lv) => (
            <button
              key={lv.code}
              className={`level-swatch${level === lv.code ? ' active' : ''}`}
              style={{ background: lv.color }}
              onClick={() => onLevelChange(lv.code)}
              aria-label={lv.label}
            >
              {lv.label}
            </button>
          ))}
        </div>
        <div className="level-swatch-caption" style={{ color: LEVELS.find((l) => l.code === level)?.color }}>
          {LEVELS.find((l) => l.code === level)?.label} — {LEVELS.find((l) => l.code === level)?.subtitle}
        </div>
      </div>

      <nav className="sidebar-section sidebar-nav">
        <button
          className={`sidebar-item${tab === 'today' ? ' active' : ''}`}
          onClick={() => onTabChange('today')}
        >
          Phrases du jour
        </button>
        <button
          className={`sidebar-item${tab === 'revision' ? ' active' : ''}`}
          onClick={() => onTabChange('revision')}
        >
          Révision
        </button>
        <button
          className={`sidebar-item${tab === 'packs' ? ' active' : ''}`}
          onClick={() => onTabChange('packs')}
        >
          Packs
        </button>
        <button
          className={`sidebar-item${tab === 'vocabulary' ? ' active' : ''}`}
          onClick={() => onTabChange('vocabulary')}
        >
          Vocabulaire
        </button>
        <button className="sidebar-item sidebar-item-disabled" disabled title="Temporairement désactivé">
          Conversation <span className="tab-badge">bientôt</span>
        </button>
      </nav>
    </aside>
  );
}
