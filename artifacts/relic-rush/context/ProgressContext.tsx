import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'relic-rush/progress/v1';

interface Progress { best: number; totalCoins: number; runs: number }
interface Ctx extends Progress {
  loaded: boolean;
  error: string | null;
  retry: () => void;
  recordRun: (distance: number, coins: number) => boolean;
  dismissError: () => void;
}

const ProgressContext = createContext<Ctx | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [p, setP] = useState<Progress>({ best: 0, totalCoins: 0, runs: 0 });
  const progressRef = useRef<Progress>(p);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          const j = JSON.parse(raw) as Partial<Progress>;
          const saved = { best: Number(j.best) || 0, totalCoins: Number(j.totalCoins) || 0, runs: Number(j.runs) || 0 };
          progressRef.current = saved;
          setP(saved);
        }
        setError(null);
      })
      .catch(() => alive && setError('Could not read your saved records. Tap to retry.'))
      .finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [nonce]);

  const recordRun = useCallback((distance: number, coins: number) => {
    const prev = progressRef.current;
    const isBest = distance > prev.best;
    const next = { best: Math.max(prev.best, distance), totalCoins: prev.totalCoins + coins, runs: prev.runs + 1 };
    progressRef.current = next;
    setP(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next))
      .then(() => setError(null))
      .catch(() => setError('This run could not be saved to the device.'));
    return isBest;
  }, []);

  const value = useMemo<Ctx>(() => ({
    ...p, loaded, error,
    retry: () => setNonce((n) => n + 1),
    dismissError: () => setError(null),
    recordRun,
  }), [p, loaded, error, recordRun]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const c = useContext(ProgressContext);
  if (!c) throw new Error('useProgress outside provider');
  return c;
}
