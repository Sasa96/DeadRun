import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { tiltLane, type TiltLane } from '@/lib/tilt';

type Status = 'idle' | 'ready' | 'calibrating' | 'unavailable' | 'denied' | 'error';
interface Options { enabled: boolean; onLane: (lane: TiltLane) => void }

export function useTiltControls({ enabled, onLane }: Options) {
  const [status, setStatus] = useState<Status>(Platform.OS === 'web' ? 'unavailable' : 'idle');
  const [message, setMessage] = useState(
    Platform.OS === 'web' ? 'Tilt is available in the iPhone app. Use arrows or touch controls here.' : 'Hold your phone comfortably to calibrate steering.',
  );
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [attempt, setAttempt] = useState(0);
  const onLaneRef = useRef(onLane);
  onLaneRef.current = onLane;
  const requestPermission = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', (next) => setActive(next === 'active'));
    return () => { mounted.current = false; sub.remove(); };
  }, []);

  const calibrate = useCallback(async () => {
    if (Platform.OS === 'web') return;
    requestPermission.current = true;
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!enabled || !active) {
      setStatus('idle');
      setMessage('Tilt steering is paused.');
      return;
    }
    let cancelled = false;
    let subscription: ReturnType<typeof Accelerometer.addListener> | undefined;
    let watchdog: ReturnType<typeof setInterval> | undefined;
    let lastSampleAt = Date.now();
    let firstSampleAt = 0;
    let sum = 0;
    let count = 0;
    let baseline = 0;
    let filtered = 0;
    let calibrated = false;
    const update = (next: Status, text: string) => {
      if (!cancelled && mounted.current) { setStatus(next); setMessage(text); }
    };
    const start = async () => {
      try {
        if (!(await Accelerometer.isAvailableAsync())) {
          update('unavailable', 'No motion sensor is available. Use touch controls instead.');
          return;
        }
        if (cancelled) return;
        let permission = await Accelerometer.getPermissionsAsync();
        if (cancelled) return;
        if (!permission.granted && requestPermission.current) {
          requestPermission.current = false;
          if (!permission.canAskAgain) {
            update('denied', 'Motion access is off. Enable it in Settings, or use touch controls.');
            await Linking.openSettings();
            return;
          }
          permission = await Accelerometer.requestPermissionsAsync();
        }
        requestPermission.current = false;
        if (cancelled) return;
        if (!permission.granted) {
          update('denied', 'Allow motion access with Calibrate, or use touch controls.');
          return;
        }
        update('calibrating', 'Hold still in your comfortable playing position…');
        onLaneRef.current(0);
        Accelerometer.setUpdateInterval(32);
        lastSampleAt = Date.now();
        subscription = Accelerometer.addListener(({ x, y, z }) => {
          if (cancelled || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
          const now = Date.now();
          lastSampleAt = now;
          // Reject strong acceleration while finding the gravity baseline.
          if (!calibrated) {
            const magnitude = Math.sqrt(x * x + y * y + z * z);
            if (magnitude < 0.75 || magnitude > 1.25) {
              sum = 0; count = 0; firstSampleAt = 0;
              return;
            }
            if (!firstSampleAt) firstSampleAt = now;
            sum += x;
            count++;
            if (now - firstSampleAt >= 500 && count >= 10) {
              baseline = sum / count;
              filtered = baseline;
              calibrated = true;
              update('ready', 'Tilt gently to steer partway; tilt further to move further. Hold neutral to center.');
            }
            return;
          }
          filtered += (x - filtered) * 0.22;
          const nextLane = tiltLane(filtered - baseline);
          // Reapply to fresh runs even when the phone has not moved.
          onLaneRef.current(nextLane);
        });
        watchdog = setInterval(() => {
          if (Date.now() - lastSampleAt > 2200) {
            subscription?.remove();
            if (watchdog) clearInterval(watchdog);
            onLaneRef.current(0);
            update('error', 'Motion readings stopped. Recalibrate or use touch controls.');
          } else if (!calibrated && firstSampleAt && Date.now() - firstSampleAt > 8000) {
            update('calibrating', 'Keep your phone still briefly, or choose touch controls.');
          }
        }, 1000);
      } catch {
        subscription?.remove();
        if (watchdog) clearInterval(watchdog);
        update('error', 'Could not start tilt steering. Recalibrate or use touch controls.');
      }
    };
    void start();
    return () => {
      cancelled = true;
      subscription?.remove();
      if (watchdog) clearInterval(watchdog);
    };
  }, [enabled, active, attempt]);

  return { status, calibrate, message };
}
