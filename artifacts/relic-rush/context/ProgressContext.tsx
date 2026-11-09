import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addRun, trophiesOf, normalizeProgress, type Progress, type RunStats } from '@/lib/progression';
import { finishCampaignMission, missionUnlocked } from '@/lib/campaign';

const KEY = 'relic-rush/progress/v1';

interface Ctx extends Progress {
  loaded: boolean;
  error: string | null;
  retry: () => void;
  /** returns true for a new Last Stand best (always false for campaign runs) */
  recordRun: (distance: number, coins: number, stats?: RunStats, lastStand?: boolean) => boolean;
  trophies: ReturnType<typeof trophiesOf>;
  completeMission: (id: number, seconds: number, distance: number, coins: number, stats: RunStats) => Promise<boolean>;
  updateSettings: (patch: Partial<Progress['settings']>) => void;
  dismissError: () => void;
}

const ProgressContext = createContext<Ctx | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [p, setP] = useState<Progress>(() => normalizeProgress());
  const progressRef = useRef<Progress>(p);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState<number>(0);
  const loadedRef = useRef(false);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const unsavedRef = useRef(false);
  const pendingCompletion = useRef<{ key: string; next: Progress } | null>(null);
  const completing = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!alive) return;
        if (raw) {
          let j: unknown = null;
          try { j = JSON.parse(raw); } catch {}
          if (j && typeof j === 'object') {
            const saved = normalizeProgress(j as Partial<Progress>);
            progressRef.current = saved;
            setP(saved);
          } else {
            // Unreadable save: keep a copy for recovery and start fresh rather than locking the game.
            AsyncStorage.setItem(`${KEY}/corrupt`, raw).catch(() => {});
          }
        }
        setError(null);
        loadedRef.current = true;
        setLoaded(true);
      })
      .catch(() => alive && setError('Could not read your saved records. Tap to retry.'))
    return () => { alive = false; };
  }, [nonce]);

  const save = useCallback((next: Progress) => {
    if (!loadedRef.current) { setError('Records are still loading. Retry loading before changing saved progress.'); return false; }
    progressRef.current = next;
    setP(next);
    unsavedRef.current = true;
    // Serialize writes so a slow previous save cannot replace a more recent reward or purchase.
    writeQueue.current = writeQueue.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)))
      .then(() => { if (progressRef.current === next) unsavedRef.current = false; setError(null); })
      .catch(() => setError('Progress could not be saved to this device.'));
    return true;
  }, []);

  const recordRun = useCallback((distance: number, coins: number, stats?: RunStats, lastStand = false) => {
    const prev = progressRef.current;
    const isBest = lastStand && distance > prev.lastStandBest;
    save(addRun(prev, distance, coins, stats, lastStand));
    return isBest;
  }, [save]);
  const completeMission = useCallback((id: number, seconds: number, distance: number, coins: number, stats: RunStats): Promise<boolean> => {
    if (completing.current) return completing.current;
    const prev = progressRef.current;
    if (!loadedRef.current || !missionUnlocked(prev.campaign, id) || !Number.isFinite(seconds) || seconds <= 0) {
      setError('This mission is locked or saved progress has not loaded.');
      return Promise.resolve(false);
    }
    const key = `${id}:${seconds}:${distance}`;
    const next = pendingCompletion.current?.key === key ? pendingCompletion.current.next : {
      ...addRun(prev, distance, coins, stats),
      campaign: finishCampaignMission(prev.campaign, id, seconds),
    };
    pendingCompletion.current = { key, next };
    const operation = writeQueue.current.catch(() => {}).then(async () => {
      try {
        await AsyncStorage.setItem(KEY, JSON.stringify(next));
        progressRef.current = next; setP(next);
        unsavedRef.current = false; pendingCompletion.current = null; setError(null);
        return true;
      } catch {
        setError('Mission complete, but progress could not be saved. Retry saving before continuing.');
        return false;
      }
    }).finally(() => { completing.current = null; });
    completing.current = operation;
    writeQueue.current = operation;
    return operation;
  }, []);
  const updateSettings = useCallback((patch: Partial<Progress['settings']>) => {
    const prev = progressRef.current;
    save(normalizeProgress({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, [save]);

  const value = useMemo<Ctx>(() => ({
    ...p, loaded, error,
    retry: () => {
      if (loadedRef.current && unsavedRef.current) save(progressRef.current);
      else setNonce((n) => n + 1);
    },
    dismissError: () => setError(null),
    recordRun, completeMission,
    trophies: trophiesOf(p),
    updateSettings,
  }), [p, loaded, error, recordRun, completeMission, updateSettings, save]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const c = useContext(ProgressContext);
  if (!c) throw new Error('useProgress outside provider');
  return c;
}
