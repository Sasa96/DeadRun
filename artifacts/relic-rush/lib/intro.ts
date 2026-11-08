// Opening cinematic timeline — pure, no rendering. Drives captions, camera cuts and the hand-off to the run.
export const INTRO_LEN = 10;
export type CaptionTone = 'time' | 'sfx' | 'alert' | 'action';
export interface IntroCaption { from: number; to: number; text: string; tone: CaptionTone }
export const INTRO_CAPTIONS: IntroCaption[] = [
  { from: 0.2, to: 1.5, text: '02:47 AM  ·  APARTMENT 4C', tone: 'time' },
  { from: 1.2, to: 2.2, text: 'CRASH', tone: 'sfx' },
  { from: 2.6, to: 5.0, text: 'EMERGENCY ALERT — STAY INSIDE', tone: 'alert' },
  { from: 5.1, to: 6.2, text: 'scrape… scrape…', tone: 'sfx' },
  { from: 6.2, to: 7.1, text: 'GLASS CRACKS', tone: 'sfx' },
  { from: 7.2, to: 8.4, text: 'GRAB THE BAG. GO.', tone: 'action' },
  { from: 8.5, to: 9.7, text: 'DOOR BURSTS OPEN', tone: 'sfx' },
];
export type ShotName = 'asleep' | 'tv-on' | 'shock' | 'window' | 'eyes' | 'grab' | 'escape';
export const INTRO_SHOTS: { name: ShotName; from: number; to: number }[] = [
  { name: 'asleep', from: 0, to: 2.0 },
  { name: 'tv-on', from: 2.0, to: 3.6 },
  { name: 'shock', from: 3.6, to: 5.0 },
  { name: 'window', from: 5.0, to: 6.2 },
  { name: 'eyes', from: 6.2, to: 7.1 },
  { name: 'grab', from: 7.1, to: 8.5 },
  { name: 'escape', from: 8.5, to: INTRO_LEN },
];
/** TV powers on at this time */
export const TV_ON_AT = 2.5;
export const ZOMBIE_AT = 4.9;
export const DOOR_OPEN_AT = 8.45;

export function introCaption(t: number): IntroCaption | null {
  let c: IntroCaption | null = null;
  for (const k of INTRO_CAPTIONS) if (t >= k.from && t < k.to) c = k; // later entry wins on overlap
  return c;
}
export function introShot(t: number): ShotName {
  for (const s of INTRO_SHOTS) if (t < s.to) return s.name;
  return 'escape';
}

/** Elapsed-time state. `ended` flips exactly once (finish or skip); callers start the run only on a true return. */
export interface IntroState { t: number; ended: boolean }
export function newIntro(): IntroState { return { t: 0, ended: false }; }
/** Cinematics use real elapsed time, unlike physics. Slow rendering must not stretch the story. */
export function stepIntro(st: IntroState, dt: number, active = true): boolean {
  if (st.ended || !active) return false;
  st.t = Math.min(INTRO_LEN, st.t + (Number.isFinite(dt) ? Math.max(0, dt) : 0));
  if (st.t >= INTRO_LEN) { st.ended = true; return true; }
  return false;
}
/** Skip: returns true exactly once (false if already ended). */
export function skipIntro(st: IntroState): boolean {
  if (st.ended) return false;
  st.ended = true;
  return true;
}
