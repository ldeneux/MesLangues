'use client';

import { useMemo, useRef, useState } from 'react';
import { speak } from '../../lib/speech';
import WritePad, { type PadResult } from './WritePad';
import KanjiStrokes from './KanjiStrokes';
import { usePersistentFlag } from './usePersistentFlag';

export type WriteItem = {
  id: string;
  chars: string[]; // 1 caractère (kana, kanji) ou 2 (combinaison de kana, ex. き + ゃ)
  display: string; // le signe complet
  romaji: string; // lecture en rōmaji (aide facultative)
  speakText: string; // texte lu par la voix du navigateur
  hint?: string; // kanji : sens en français (aide facultative)
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Mode « Écrire » : on entend le signe, on le dessine sans aucune aide (juste la croix de repère), on valide ou on passe.
// L'audio n'est jamais lancé automatiquement. Le score n'est pas enregistré.
export default function WriteMode({
  items,
  flagPrefix,
  hintLabel,
  hintDefault = false,
  length = 10,
}: {
  items: WriteItem[];
  flagPrefix: string; // préfixe des réglages mémorisés (« kana » ou « kanji »)
  hintLabel?: string; // ex. « Sens » (kanji) : active l'aide « hint » des signes
  hintDefault?: boolean;
  length?: number;
}) {
  const [showRomaji, setShowRomaji] = usePersistentFlag(`write-romaji-${flagPrefix}`, false);
  const [showHint, setShowHint] = usePersistentFlag(`write-hint-${flagPrefix}`, hintDefault);

  const [phase, setPhase] = useState<'setup' | 'play' | 'done'>('setup');
  const [queue, setQueue] = useState<WriteItem[]>([]);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0); // change à chaque « Réessayer » pour repartir d'une page blanche
  const [result, setResult] = useState<PadResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<WriteItem[]>([]);
  const [speechOk, setSpeechOk] = useState(true);
  const scoredRef = useRef<Set<string>>(new Set()); // chaque signe n'est compté qu'une fois par série

  const seriesSize = Math.min(length, items.length);
  const item = phase === 'play' ? queue[index] : null;
  const hasHints = useMemo(() => items.some((i) => !!i.hint), [items]);

  function start(list: WriteItem[]) {
    scoredRef.current = new Set();
    setQueue(list);
    setIndex(0);
    setAttempt(0);
    setResult(null);
    setRevealed(false);
    setScore(0);
    setMissed([]);
    setPhase('play');
  }

  function record(ok: boolean) {
    if (!item || scoredRef.current.has(item.id)) return;
    scoredRef.current.add(item.id);
    if (ok) setScore((s) => s + 1);
    else setMissed((m) => [...m, item]);
  }

  function onValidate(r: PadResult) {
    setResult(r);
    record(r.ok);
    if (!r.ok) setRevealed(true); // une erreur : on montre le modèle pour apprendre
  }

  function onSkip() {
    setResult({ ok: false, okCount: 0, modelCount: 0, strokeCount: 0, skipped: true });
    record(false);
    setRevealed(true);
  }

  function retry() {
    setResult(null);
    setRevealed(false);
    setAttempt((a) => a + 1);
  }

  function next() {
    if (index + 1 < queue.length) {
      setIndex((i) => i + 1);
      setAttempt(0);
      setResult(null);
      setRevealed(false);
    } else {
      setPhase('done');
    }
  }

  function play(text: string) {
    setSpeechOk(speak(text));
  }

  if (items.length === 0) {
    return <p className="eyebrow-free">Aucun signe à écrire avec ces réglages.</p>;
  }

  // ---------- réglages ----------
  if (phase === 'setup') {
    return (
      <div className="phrase-card phrase-card-big">
        <p style={{ lineHeight: 1.6, marginTop: 0 }}>
          Tu entends un signe, tu le dessines <strong>sans aide</strong> : seule la croix de repère est affichée. Tu valides, ou tu passes si tu ne sais pas :
          le modèle s'affiche alors pour que tu l'apprennes. Le score de cette série n'est pas enregistré.
        </p>
        <div className="conv-bubble-actions" style={{ marginBottom: '0.75rem' }}>
          <button className={`conv-mini-btn${showRomaji ? ' active' : ''}`} onClick={() => setShowRomaji(!showRomaji)}>
            Rōmaji : {showRomaji ? 'oui' : 'non'}
          </button>
          {hasHints && hintLabel && (
            <button className={`conv-mini-btn${showHint ? ' active' : ''}`} onClick={() => setShowHint(!showHint)}>
              {hintLabel} : {showHint ? 'oui' : 'non'}
            </button>
          )}
        </div>
        <p className="eyebrow-free">{seriesSize} signes tirés parmi {items.length}.</p>
        <button className="primary" onClick={() => start(shuffle(items).slice(0, seriesSize))}>
          Commencer
        </button>
      </div>
    );
  }

  // ---------- fin de série ----------
  if (phase === 'done') {
    return (
      <div className="conv-correction exercise-success">
        <div className="conv-correction-label">Score</div>
        <div className="conv-correction-text">
          {score} / {queue.length} bien écrits du premier coup
        </div>
        {missed.length > 0 && (
          <p style={{ margin: '0.5rem 0' }}>
            À revoir :{' '}
            {missed.map((m) => (
              <span key={m.id} lang="ja" style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>
                {m.display}
              </span>
            ))}
          </p>
        )}
        <div className="conv-bubble-actions" style={{ marginTop: '0.5rem' }}>
          <button className="conv-mini-btn" onClick={() => start(shuffle(items).slice(0, seriesSize))}>
            Rejouer
          </button>
          {missed.length > 0 && (
            <button className="conv-mini-btn" onClick={() => start(shuffle(missed))}>
              Rejouer les signes à revoir
            </button>
          )}
          <button className="conv-mini-btn" onClick={() => setPhase('setup')}>
            Changer de réglages
          </button>
        </div>
      </div>
    );
  }

  // ---------- en cours ----------
  const locked = result !== null;
  return (
    <div className="phrase-card phrase-card-big">
      <div className="deck-progress">
        Signe {index + 1} / {queue.length} · {score} réussi{score > 1 ? 's' : ''}
      </div>

      {!speechOk && <p className="conv-warning">Ton navigateur ne propose pas de voix japonaise (essaie Chrome ou Edge).</p>}

      <div className="write-prompt">
        <button className="secondary" onClick={() => play(item!.speakText)}>
          🔊 Écouter
        </button>
        {showRomaji && item!.romaji && <span className="write-romaji">{item!.romaji}</span>}
        {showHint && item!.hint && <span className="write-hint">{item!.hint}</span>}
      </div>

      <div className="conv-bubble-actions" style={{ margin: '0.5rem 0' }}>
        <button className={`conv-mini-btn${showRomaji ? ' active' : ''}`} onClick={() => setShowRomaji(!showRomaji)}>
          Rōmaji : {showRomaji ? 'oui' : 'non'}
        </button>
        {hasHints && hintLabel && (
          <button className={`conv-mini-btn${showHint ? ' active' : ''}`} onClick={() => setShowHint(!showHint)}>
            {hintLabel} : {showHint ? 'oui' : 'non'}
          </button>
        )}
      </div>

      <WritePad
        key={`${item!.id}-${attempt}`}
        chars={item!.chars}
        locked={locked}
        revealModel={revealed}
        onValidate={onValidate}
        onSkip={onSkip}
      />

      {result && (
        <div className={result.ok ? 'conv-correction exercise-success' : 'conv-correction'} style={{ marginTop: '0.75rem' }}>
          {result.skipped ? (
            <div className="conv-correction-text">
              Passé : c'était <span lang="ja" style={{ fontSize: '1.4rem' }}>{item!.display}</span>
            </div>
          ) : result.ok ? (
            <div className="conv-correction-text">
              ✅ Bien écrit : <span lang="ja" style={{ fontSize: '1.4rem' }}>{item!.display}</span>
            </div>
          ) : (
            <>
              <div className="conv-correction-text">
                {result.okCount} trait{result.okCount > 1 ? 's' : ''} bien placé{result.okCount > 1 ? 's' : ''} sur {result.modelCount} : c'était{' '}
                <span lang="ja" style={{ fontSize: '1.4rem' }}>{item!.display}</span>
              </div>
              {result.strokeCount !== result.modelCount && (
                <p className="eyebrow-free">
                  Tu as tracé {result.strokeCount} trait{result.strokeCount > 1 ? 's' : ''}, le modèle en compte {result.modelCount}.
                </p>
              )}
              <p className="eyebrow-free">Vert : bon endroit, bon ordre, bon sens. Rouge : à revoir. Le modèle est affiché en gris.</p>
            </>
          )}

          {!result.ok && (
            <div style={{ marginTop: '0.5rem' }}>
              {item!.chars.map((c) => (
                <KanjiStrokes key={c} char={c} />
              ))}
            </div>
          )}

          <div className="conv-bubble-actions" style={{ marginTop: '0.5rem' }}>
            {!result.ok && !result.skipped && (
              <button className="conv-mini-btn" onClick={retry}>
                Réessayer
              </button>
            )}
            <button className="primary" onClick={next}>
              {index + 1 < queue.length ? 'Suivant →' : 'Voir mon score'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
