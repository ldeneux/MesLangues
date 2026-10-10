'use client';

import { useEffect, useState } from 'react';

// Petit réglage (oui/non) mémorisé dans le navigateur. Sans valeur mémorisée : defaultValue.
export function usePersistentFlag(key: string, defaultValue = false): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(stored === '1');
    } catch {
      /* stockage indisponible : on garde la valeur par défaut */
    }
  }, [key]);
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* ignoré */
    }
  };
  return [value, set];
}
