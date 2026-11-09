export type TiltLane = number;

/** Continuous position: a tiny neutral dead zone removes sensor drift, not partial steering. */
export function tiltLane(delta: number, sensitivity = 1): TiltLane {
  if (!Number.isFinite(delta)) return 0;
  const magnitude = Math.max(0, Math.abs(delta) - 0.018);
  const gain = Number.isFinite(sensitivity) ? Math.min(1.6, Math.max(0.6, sensitivity)) : 1;
  return Math.sign(delta) * Math.min(1.2, magnitude / 0.30 * 1.2 * gain);
}
