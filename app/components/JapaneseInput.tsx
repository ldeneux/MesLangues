'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { romajiToKana, KANA_SECTIONS, toKatakana } from '../../lib/japanese';

const EXTRA_KEYS = ['っ', 'ゃ', 'ゅ', 'ょ', 'ー', '、', '。', '？', '！', '「', '」'];

/**
 * Zone de saisie japonaise : tu tapes en rōmaji (konnichiwa) et ça devient des
 * kana (こんにちは) ; une palette de kana est aussi disponible (mobile, ou si
 * tu n'as pas de clavier japonais). Pour les kanji, utilise le clavier
 * japonais de ton appareil (le champ ne gêne pas son fonctionnement).
 */
export default function JapaneseInput({
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);
  const [romajiMode, setRomajiMode] = useState(true);
  const [katakana, setKatakana] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteKata, setPaletteKata] = useState(false);

  useLayoutEffect(() => {
    if (caretRef.current !== null && ref.current) {
      ref.current.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const raw = e.target.value;
    // Si un vrai clavier japonais est en cours de composition, on ne touche à rien.
    if (!romajiMode || (e.nativeEvent as any).isComposing) {
      onChange(raw);
      return;
    }
    const caret = e.target.selectionStart ?? raw.length;
    caretRef.current = romajiToKana(raw.slice(0, caret), { katakana }).length;
    onChange(romajiToKana(raw, { katakana }));
  }

  function handleBlur() {
    if (!romajiMode) return;
    const finalValue = romajiToKana(value, { katakana, final: true }); // "n" en attente → ん
    if (finalValue !== value) onChange(finalValue);
  }

  function insert(ch: string) {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    caretRef.current = start + ch.length;
    onChange(value.slice(0, start) + ch + value.slice(end));
    el?.focus();
  }

  function backspace() {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    if (start !== end) {
      caretRef.current = start;
      onChange(value.slice(0, start) + value.slice(end));
    } else if (start > 0) {
      caretRef.current = start - 1;
      onChange(value.slice(0, start - 1) + value.slice(end));
    }
    el?.focus();
  }

  const show = (c: string) => (paletteKata ? toKatakana(c) : c);
  const paletteSections = KANA_SECTIONS.filter((s) => s.key !== 'yoon');

  return (
    <div className="ja-input">
      <textarea
        ref={ref}
        className="writing-textarea"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        rows={rows}
        lang="ja"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      <div className="ja-input-bar">
        <button type="button" className="conv-mini-btn" onClick={() => setRomajiMode((m) => !m)}>
          {romajiMode ? 'あ Rōmaji → kana : activé' : 'A Saisie directe : rōmaji désactivé'}
        </button>
        {romajiMode && (
          <button type="button" className="conv-mini-btn" onClick={() => setKatakana((k) => !k)}>
            {katakana ? 'Écrire en katakana (カ)' : 'Écrire en hiragana (か)'}
          </button>
        )}
        <button type="button" className="conv-mini-btn" onClick={() => setPaletteOpen((o) => !o)}>
          {paletteOpen ? 'Masquer la palette' : '⌨️ Palette de kana'}
        </button>
      </div>
      {romajiMode && (
        <p className="eyebrow-free" style={{ marginBottom: '0.5rem' }}>
          Tape par exemple <em>konnichiha</em> → こんにちは (は se tape « ha », を « wo »). « nn » donne ん, « - » donne ー en
          katakana.
        </p>
      )}

      {paletteOpen && (
        <div className="ja-palette">
          <div className="ja-palette-tabs">
            <button type="button" className={`conv-mini-btn${!paletteKata ? ' active' : ''}`} onClick={() => setPaletteKata(false)}>
              ひらがな
            </button>
            <button type="button" className={`conv-mini-btn${paletteKata ? ' active' : ''}`} onClick={() => setPaletteKata(true)}>
              カタカナ
            </button>
          </div>
          <div className="ja-palette-grid">
            {paletteSections.flatMap((section) =>
              section.rows.map((r, ri) => (
                <div key={`${section.key}-${ri}`} className="ja-palette-col">
                  {r.map((e, ci) =>
                    e && !e.rare ? (
                      <button key={ci} type="button" className="ja-key" onClick={() => insert(show(e.hira))} title={e.romaji}>
                        {show(e.hira)}
                      </button>
                    ) : (
                      <span key={ci} className="ja-key ja-key-empty" />
                    )
                  )}
                </div>
              ))
            )}
          </div>
          <div className="ja-palette-extra">
            {EXTRA_KEYS.map((k) => (
              <button key={k} type="button" className="ja-key" onClick={() => insert(show(k))}>
                {show(k)}
              </button>
            ))}
            <button type="button" className="ja-key ja-key-wide" onClick={() => insert('　')}>
              espace
            </button>
            <button type="button" className="ja-key ja-key-wide" onClick={backspace}>
              ⌫
            </button>
          </div>
          <p className="eyebrow-free">Pour les sons combinés (きゃ, しゅ…), tape le kana puis ゃ ゅ ょ.</p>
        </div>
      )}
    </div>
  );
}
