'use client';

import { useState } from 'react';
import { useProfile, EMOJI_CHOICES } from './ProfileContext';
import { LANGS, LEVELS, type LangCode, type LevelCode } from '../../lib/constants';
import FlagIcon from './FlagIcon';
import MyScoresPanel from './MyScoresPanel';
import SettingsPanel from './SettingsPanel';
import SearchModal from './SearchModal';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    await addProfile(name.trim(), emoji);
    setCreating(false);
    setSwitching(false);
    setName('');
  }

  return (
    <div className="topbar topbar-full">
      <div className="topbar-left">
        <img src="/logo.png" alt="Mes langues" className="topbar-logo" width={96} height={96} />
      </div>

      <div className="topbar-main">
        <div className="topbar-block">
          <div className="sidebar-label">Langue</div>
          <div className="flag-icon-row topbar-flag-row">
            {LANGS.map((l) => (
              <button
                key={l.code}
                className={`flag-icon-btn${lang === l.code ? ' active' : ''}`}
                onClick={() => onLangChange(l.code)}
                aria-label={l.label}
              >
                <FlagIcon code={l.code} />
              </button>
            ))}
          </div>
        </div>

        {/* Niveaux : en escalier (comme le schéma du CECRL), avec leur description, centrés dans l'en-tête */}
        <div className="topbar-levels">
          <div className="topbar-block topbar-block-center">
            <div className="sidebar-label">Niveau</div>
            <div className="level-stairs">
              {LEVELS.map((lv) => (
                <button
                  key={lv.code}
                  className={`level-step level-step-${lv.code}${level === lv.code ? ' active' : ''}`}
                  style={{ background: lv.color }}
                  onClick={() => onLevelChange(lv.code)}
                  aria-label={`${lv.label} : ${lv.subtitle}`}
                >
                  <span className="level-step-code">{lv.label}</span>
                  <span className="level-step-sub">{lv.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="topbar-right">
          <div className="topbar-actions">
            <button className="topbar-icon-btn" onClick={() => setSearchOpen(true)} aria-label="Chercher un mot" title="Chercher un mot">
              🔍
            </button>
            <button className="topbar-icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Réglages" title="Réglages">
              ⚙️
            </button>
            <button className="topbar-icon-btn" onClick={() => setScoresOpen(true)} aria-label="Mes scores" title="Mes scores">
              📊
            </button>
          </div>

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

        </div>
      </div>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      {scoresOpen && profile && (
        <MyScoresPanel profileId={profile.id} lang={lang} level={level} onClose={() => setScoresOpen(false)} />
      )}
    </div>
  );
}
