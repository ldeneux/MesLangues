'use client';

export type Tab = 'today' | 'revision' | 'packs' | 'vocabulary' | 'grammar' | 'conjugation' | 'writing' | 'games';

export default function Sidebar({
  tab,
  onTabChange,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
}) {
  return (
    <aside className="sidebar">
      <nav className="sidebar-section sidebar-nav">
        <button className={`sidebar-item${tab === 'today' ? ' active' : ''}`} onClick={() => onTabChange('today')}>
          🗣️ Phrases du jour
        </button>
        <button className={`sidebar-item${tab === 'revision' ? ' active' : ''}`} onClick={() => onTabChange('revision')}>
          🔁 Révision
        </button>
        <button className={`sidebar-item${tab === 'packs' ? ' active' : ''}`} onClick={() => onTabChange('packs')}>
          📦 Packs
        </button>
        <button className={`sidebar-item${tab === 'vocabulary' ? ' active' : ''}`} onClick={() => onTabChange('vocabulary')}>
          📚 Vocabulaire
        </button>
        <button className={`sidebar-item${tab === 'grammar' ? ' active' : ''}`} onClick={() => onTabChange('grammar')}>
          ✏️ Grammaire
        </button>
        <button className={`sidebar-item${tab === 'conjugation' ? ' active' : ''}`} onClick={() => onTabChange('conjugation')}>
          🔤 Conjugaison
        </button>
        <button className={`sidebar-item${tab === 'writing' ? ' active' : ''}`} onClick={() => onTabChange('writing')}>
          ✍️ Écriture
        </button>
        <button className={`sidebar-item${tab === 'games' ? ' active' : ''}`} onClick={() => onTabChange('games')}>
          🎮 Jeux
        </button>
        <button className="sidebar-item sidebar-item-disabled" disabled title="Temporairement désactivé">
          💬 Conversation <span className="tab-badge">bientôt</span>
        </button>
      </nav>
    </aside>
  );
}
