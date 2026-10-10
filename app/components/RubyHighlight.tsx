'use client';

import JapaneseRuby from './JapaneseRuby';

// Texte japonais avec furigana ET surbrillance : "{私|わたし}**は**{学生|がくせい}です"
export default function RubyHighlight({ ruby }: { ruby: string }) {
  const parts = ruby.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <mark key={i} className="highlight-mark">
            <JapaneseRuby ruby={part.slice(2, -2)} />
          </mark>
        ) : (
          <JapaneseRuby key={i} ruby={part} />
        )
      )}
    </>
  );
}
