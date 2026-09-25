'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

function formatTime(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${totalSeconds < 0 ? '+' : ''}${m}:${s.toString().padStart(2, '0')}`;
}

export type WritingTimerHandle = { stop: () => void };

const WritingTimer = forwardRef<WritingTimerHandle, { budgetMinutes: number }>(function WritingTimer(
  { budgetMinutes },
  ref
) {
  const [secondsLeft, setSecondsLeft] = useState(budgetMinutes * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useImperativeHandle(ref, () => ({ stop: () => setRunning(false) }));

  useEffect(() => {
    setSecondsLeft(budgetMinutes * 60);
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetMinutes]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  function start() {
    setRunning(true);
  }
  function stop() {
    setRunning(false);
  }
  function reset() {
    setRunning(false);
    setSecondsLeft(budgetMinutes * 60);
  }

  const overtime = secondsLeft < 0;

  return (
    <div className="writing-timer">
      <span className={`writing-timer-display${overtime ? ' overtime' : ''}`}>{formatTime(secondsLeft)}</span>
      {!running ? (
        <button className="conv-mini-btn" onClick={start}>
          ▶ Démarrer
        </button>
      ) : (
        <button className="conv-mini-btn" onClick={stop}>
          ⏸ Arrêter
        </button>
      )}
      <button className="conv-mini-btn" onClick={reset}>
        ↺
      </button>
    </div>
  );
});

export default WritingTimer;
