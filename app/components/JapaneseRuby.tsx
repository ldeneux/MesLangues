'use client';

import { parseRuby } from '../../lib/japanese';

// Affiche un texte japonais avec furigana (format "{食|た}べる").
export default function JapaneseRuby({ ruby }: { ruby: string }) {
  return (
    <span className="ja-ruby" lang="ja">
      {parseRuby(ruby).map((seg, i) =>
        seg.rt ? (
          <ruby key={i}>
            {seg.base}
            <rt>{seg.rt}</rt>
          </ruby>
        ) : (
          <span key={i}>{seg.base}</span>
        )
      )}
    </span>
  );
}
