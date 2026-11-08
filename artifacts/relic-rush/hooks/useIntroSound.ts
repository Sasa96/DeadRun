import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAudioPlayer } from 'expo-audio';

export function useIntroSound(enabled: boolean, time: number) {
  const player = useAudioPlayer(require('@/assets/audio/intro-night.mp3'));
  const [muted, setMuted] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [error, setError] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    let live = true;
    const sync = async () => {
      try {
        player.volume = muted ? 0 : 0.65;
        if (!enabled || !active) { player.pause(); return; }
        if (!player.isLoaded) return;
        if (Math.abs(player.currentTime - time) > 0.45) await player.seekTo(time);
        if (live && !player.playing) player.play();
      } catch { if (live) setError(true); }
    };
    void sync();
    return () => { live = false; };
  }, [player, enabled, active, muted, time]);
  return { muted, error, toggle: () => setMuted((v) => !v) };
}
