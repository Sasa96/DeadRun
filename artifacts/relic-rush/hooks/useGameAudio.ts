import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type Sfx = 'jump' | 'slide' | 'pickup' | 'turn' | 'hit' | 'stage';
const SFX_SRC: Record<Sfx, number> = {
  jump: require('@/assets/audio/sfx-jump.wav'),
  slide: require('@/assets/audio/sfx-slide.wav'),
  pickup: require('@/assets/audio/sfx-pickup.wav'),
  turn: require('@/assets/audio/sfx-turn.wav'),
  hit: require('@/assets/audio/sfx-hit.wav'),
  stage: require('@/assets/audio/sfx-stage.wav'),
};
const SFX_VOL: Record<Sfx, number> = { jump: 0.45, slide: 0.4, pickup: 0.35, turn: 0.5, hit: 0.7, stage: 0.55 };
/** min ms between retriggers of the same effect (one reusable player each, so voices never stack) */
const SFX_GAP: Record<Sfx, number> = { jump: 90, slide: 90, pickup: 70, turn: 150, hit: 400, stage: 800 };
const MUSIC_VOL = 0.42;
const KEY = 'relicrush.audio.v1';

export interface AudioPrefs { music: boolean; sfx: boolean }

/** Gameplay music + SFX. `musicActive` should be true only during an actual (unpaused) run while the app is foregrounded. */
export function useGameAudio(musicActive: boolean) {
  const [prefs, setPrefs] = useState<AudioPrefs>({ music: true, sfx: true });
  const [error, setError] = useState<string | null>(null);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const musicRef = useRef<AudioPlayer | null>(null);
  const sfxRef = useRef<Partial<Record<Sfx, AudioPlayer>>>({});
  const lastRef = useRef<Partial<Record<Sfx, number>>>({});
  const [fg, setFg] = useState(AppState.currentState === 'active');
  const activeRef = useRef(musicActive && fg);
  activeRef.current = musicActive && fg;

  // create players once; release on unmount
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', allowsRecording: false, shouldPlayInBackground: false }).catch(() => {});
    try {
      const m = createAudioPlayer(require('@/assets/audio/game-music.mp3'));
      m.loop = true; m.volume = MUSIC_VOL;
      musicRef.current = m;
      for (const k of Object.keys(SFX_SRC) as Sfx[]) {
        const p = createAudioPlayer(SFX_SRC[k]);
        p.volume = SFX_VOL[k];
        sfxRef.current[k] = p;
      }
    } catch {
      setError('Audio could not load. The run works silently.');
    }
    AsyncStorage.getItem(KEY).then((v) => {
      if (!v) return;
      const p = JSON.parse(v);
      setPrefs({ music: p.music !== false, sfx: p.sfx !== false });
    }).catch(() => setError('Sound settings could not be read; using defaults.'));
    const sub = AppState.addEventListener('change', (st) => setFg(st === 'active'));
    return () => {
      sub.remove();
      try { musicRef.current?.pause(); musicRef.current?.remove(); } catch {}
      for (const p of Object.values(sfxRef.current)) { try { p?.pause(); p?.remove(); } catch {} }
      musicRef.current = null; sfxRef.current = {};
    };
  }, []);

  // music follows run state; resumes from where it paused
  const shouldPlay = musicActive && fg && prefs.music;
  useEffect(() => {
    const m = musicRef.current; if (!m) return;
    try {
      if (shouldPlay) { m.volume = MUSIC_VOL; if (!m.playing) m.play(); }
      else if (m.playing) m.pause();
    } catch { setError('Music playback failed. The run works silently.'); }
  }, [shouldPlay]);

  useEffect(() => {
    if (!musicActive || !fg || !prefs.sfx) {
      for (const p of Object.values(sfxRef.current)) {
        try { p?.pause(); } catch { setError('An audio effect could not be paused.'); }
      }
    }
  }, [musicActive, fg, prefs.sfx]);

  /** new run: restart the loop from the top (call from the button press so web treats it as a user gesture) */
  const restartMusic = useCallback(() => {
    const m = musicRef.current; if (!m) return;
    m.seekTo(0).catch(() => {});
    if (Platform.OS === 'web' && prefsRef.current.music && !m.playing) {
      // unlock autoplay inside the gesture; the state effect keeps it in sync afterwards
      try { m.play(); } catch { setError('Browser blocked audio. Tap RUN again to enable sound.'); }
    }
  }, []);

  /** web gesture unlock without audible playback (e.g. before the intro) */
  const pauseNow = useCallback(() => { try { musicRef.current?.pause(); } catch {} }, []);

  const play = useCallback((k: Sfx) => {
    if (!prefsRef.current.sfx || !activeRef.current) return;
    const p = sfxRef.current[k]; if (!p) return;
    const now = Date.now();
    if (now - (lastRef.current[k] ?? 0) < SFX_GAP[k]) return;
    lastRef.current[k] = now;
    p.seekTo(0).then(() => {
      if (prefsRef.current.sfx && activeRef.current) p.play();
    }).catch(() => setError('A sound effect could not play. Gameplay is unaffected.'));
  }, []);

  const update = useCallback((patch: Partial<AudioPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    setPrefs(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => setError('Sound settings could not be saved.'));
  }, []);

  return {
    prefs, error, play, restartMusic, pauseNow,
    toggleMusic: () => update({ music: !prefsRef.current.music }),
    toggleSfx: () => update({ sfx: !prefsRef.current.sfx }),
    dismissError: () => setError(null),
  };
}
