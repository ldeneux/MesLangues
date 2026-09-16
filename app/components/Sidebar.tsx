'use client';

import { LANGS, LEVELS, type LangCode, type LevelCode } from '../../lib/constants';
import FlagIcon from './FlagIcon';

export type Tab = 'today' | 'revision' | 'packs' | 'vocabulary' | 'grammar' | 'conjugation';

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
  const currentLang = LANGS.find((l) => l.code === lang);
  const currentLevel = LEVELS.find((l) => l.code === level);

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Langue</div>
        <div className="flag-icon-row">
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
        <div className="level-swatch-caption">{currentLang?.label}</div>
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
        <div className="level-swatch-caption" style={{ color: currentLevel?.color }}>
          {currentLevel?.label} — {currentLevel?.subtitle}
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
        <button
          className={`sidebar-item${tab === 'grammar' ? ' active' : ''}`}
          onClick={() => onTabChange('grammar')}
        >
          Grammaire
        </button>
        <button
          className={`sidebar-item${tab === 'conjugation' ? ' active' : ''}`}
          onClick={() => onTabChange('conjugation')}
        >
          Conjugaison
        </button>
        <button className="sidebar-item sidebar-item-disabled" disabled title="Temporairement désactivé">
          Conversation <span className="tab-badge">bientôt</span>
        </button>
      </nav>
    </aside>
  );
}
