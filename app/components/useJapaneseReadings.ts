'use client';

import { useEffect, useRef, useState } from 'react';
import { getJapaneseReadings, type JaReading } from '../../lib/japaneseReadings';

/**
 * Charge (furigana + rōmaji) pour une liste de textes japonais, par lots de 8.
 * Les lectures déjà en cache en base sont gratuites ; seules les manquantes passent par Gemini.
 */
export function useJapaneseReadings(texts: string[], enabled: boolean) {
  const [readings, setReadings] = useState<Record<string, JaReading>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const readingsRef = useRef(readings);
  readingsRef.current = readings;
  const key = texts.join('\u0000');

  useEffect(() => {
    if (!enabled) return;
    const missing = texts.filter((t) => t && !readingsRef.current[t]);
    if (missing.length === 0) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        for (let i = 0; i < missing.length; i += 8) {
          const r = await getJapaneseReadings(missing.slice(i, i + 8));
          if (cancelled) return;
          setReadings((prev) => ({ ...prev, ...r }));
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Lectures indisponibles.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { readings, error, loading };
}
