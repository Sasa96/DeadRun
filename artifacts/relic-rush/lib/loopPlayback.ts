/** Small, testable playback supervisor. Never restarts audio in menus/background. */
export interface LoopPlayer {
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  loop: boolean;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
}

export function superviseLoop(player: LoopPlayer, onError: () => void, now = Date.now) {
  let wanted = false;
  let disposed = false;
  let generation = 0;
  let seeking = false;
  let lastAttempt = -Infinity;
  let attempts = 0;

  const tick = () => {
    if (disposed || !wanted || seeking || !player.isLoaded || player.isBuffering) return;
    if (player.playing) { attempts = 0; return; }
    if (now() - lastAttempt < 1500) return;
    if (attempts >= 3) {
      if (attempts === 3) { attempts++; onError(); }
      return;
    }
    lastAttempt = now();
    attempts++;
    try {
      player.loop = true;
      // Expo players do not necessarily rewind after an interrupted end-of-track.
      if (player.duration > 0 && player.currentTime >= player.duration - 0.05) {
        const token = generation;
        seeking = true;
        player.seekTo(0).then(() => {
          if (!disposed && token === generation && wanted) player.play();
        }).catch(onError).finally(() => {
          seeking = false;
        });
      } else player.play();
    } catch { onError(); }
  };

  return {
    tick,
    setWanted(next: boolean) {
      if (disposed) return;
      if (wanted !== next) { generation++; attempts = 0; lastAttempt = -Infinity; }
      wanted = next;
      if (next) tick();
      else { try { player.pause(); } catch { onError(); } }
    },
    restart() {
      const token = ++generation;
      attempts = 0;
      lastAttempt = -Infinity;
      seeking = true;
      return player.seekTo(0).then(() => {
        if (!disposed && token === generation && wanted) player.play();
      }).catch(onError).finally(() => {
        seeking = false;
        if (!disposed) tick();
      });
    },
    dispose() {
      disposed = true; wanted = false; generation++;
    },
  };
}
