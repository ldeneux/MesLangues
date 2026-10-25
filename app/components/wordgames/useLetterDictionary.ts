'use client';

import { useEffect, useMemo, useState } from 'react';
import { getLetterDictionary } from '../../../lib/letterGamesServer';
import type { LetterEntry } from '../../../lib/letterGamesLogic';

const memo = new Map<string, { entries: LetterEntry[]; total: number }>();

/** Charge le dictionnaire de la langue (une seule fois par langue et par session). */
export function useLetterDictionary(lang: string) {
  const [data, setData] = useState<{ entries: LetterEntry[]; total: number } | null>(memo.get(lang) ?? null);
  const [error, setError] = useState('');

  useEffect(() => {
    const cached = memo.get(lang);
    if (cached) {
      setData(cached);
      return;
    }
    let alive = true;
    setData(null);
    setError('');
    getLetterDictionary(lang)
      .then((r) => {
        if (!alive) return;
        if (r.ok === true) {
          const d = { entries: r.entries, total: r.total };
          memo.set(lang, d);
          setData(d);
        } else setError((r as { error: string }).error);
      })
      .catch((e) => alive && setError(e?.message ?? 'Chargement impossible.'));
    return () => {
      alive = false;
    };
  }, [lang]);

  // answer → mot (pour valider une saisie et retrouver l'affichage + la traduction)
  const byAnswer = useMemo(() => new Map((data?.entries ?? []).map((e) => [e.answer, e])), [data]);
  const keys = useMemo(() => new Set(byAnswer.keys()), [byAnswer]);

  return { entries: data?.entries ?? null, total: data?.total ?? 0, byAnswer, keys, error };
}
