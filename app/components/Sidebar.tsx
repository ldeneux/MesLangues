'use client';

export type Tab = 'kana' | 'kanji' | 'lessons' | 'today' | 'revision' | 'packs' | 'vocabulary' | 'grammar' | 'conjugation' | 'writing' | 'conversation' | 'games';

export default function Sidebar({
  tab,
  onTabChange,
  showKana = false,
  showKanji = false,
}: {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  showKana?: boolean;
  showKanji?: boolean;
}) {
  return (
    <aside className="sidebar">
      <nav className="sidebar-section sidebar-nav">
        {showKana && (
          <button className={`sidebar-item${tab === 'kana' ? ' active' : ''}`} onClick={() => onTabChange('kana')}>
            あ Kana
          </button>
        )}
        {showKanji && (
          <button className={`sidebar-item${tab === 'kanji' ? ' active' : ''}`} onClick={() => onTabChange('kanji')}>
            漢 Kanji
          </button>
        )}
        <button className={`sidebar-item${tab === 'lessons' ? ' active' : ''}`} onClick={() => onTabChange('lessons')}>
          🎓 Leçons
        </button>
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
        <button className={`sidebar-item${tab === 'conversation' ? ' active' : ''}`} onClick={() => onTabChange('conversation')}>
          💬 Conversation
        </button>
      </nav>
    </aside>
  );
}
