// Relic Rush: Dead Run — pure simulation. No React, no rendering.
export type ObstacleType = 'gap' | 'hurdle' | 'beam';
export interface Obstacle { id: number; s: number; lane: number; type: ObstacleType }
export interface Coin { id: number; s: number; lane: number; h: number; taken: boolean }
export interface Pop { id: number; lane: number; h: number; age: number }
export type Mode = 'home' | 'run' | 'paused' | 'dying' | 'over';
export type TurnDir = -1 | 1;
export type DeathCause = ObstacleType | 'corner' | 'wrongway' | 'walker';
/** Themed stages cycle by path distance: city -> police -> hospital -> city ... */
export type StageId = 'city' | 'police' | 'hospital';
export const STAGES: StageId[] = ['city', 'police', 'hospital'];
export const STAGE_NAMES: Record<StageId, string> = { city: 'Ruined City', police: 'Precinct 9 Police Station', hospital: 'St. Agnes Hospital' };
/** metres per stage (~60s at mid speed) */
export const STAGE_LEN = 900;
/** character kinds (index into characters.ts ZOMBIES) used for incoming walkers per stage */
export const STAGE_KINDS: Record<StageId, number[]> = { city: [0, 1, 3, 4], police: [5, 6], hospital: [7, 8, 2] };
/** max simultaneously alive walkers of one kind (render pool size per kind) and in total */
export const WALKER_PER_KIND = 3;
export const WALKER_MAX = 6;
/** walkers never spawn before this distance */
export const WALKER_START = 150;
/** lateral half-width (lane units, 1 lane = 2 m) and longitudinal half-depth (m) of a walker hit */
export const WALKER_HALF_W = 0.38;
export const WALKER_HALF_D = 0.45;
/** An infected walking straight toward the runner along its fixed lane. `s` decreases at `v` m/s. */
export interface Walker { id: number; s: number; lane: number; v: number; kind: number }

export function stageAt(dist: number): StageId { return STAGES[((Math.floor(Math.max(0, dist) / STAGE_LEN) % 3) + 3) % 3]; }
export interface StageInfo { id: StageId; name: string; cycle: number; progress: number; remaining: number; next: StageId }
export function stageInfo(dist: number): StageInfo {
  const d = Math.max(0, dist); const n = Math.floor(d / STAGE_LEN); const id = STAGES[n % 3];
  return { id, name: STAGE_NAMES[id], cycle: Math.floor(n / 3), progress: (d - n * STAGE_LEN) / STAGE_LEN, remaining: (n + 1) * STAGE_LEN - d, next: STAGES[(n + 1) % 3] };
}
/** Visual theme for an obstacle, from its absolute path distance (not the runner's stage) so boundaries never flicker.
 * variant (0|1) picks between two same-rule models for hurdles. Pure; never affects collision. */
export function obstacleVisual(s: number, id: number, type: ObstacleType): { stage: StageId; variant: 0 | 1 } {
  return { stage: stageAt(s), variant: type === 'hurdle' ? ((id & 1) as 0 | 1) : 0 };
}
/** Allocation-free render pool index: city gap/hurdle/beam 0-2 | police gap,hurdleA,hurdleB,beam 3-6 | hospital 7-10. */
export function obstaclePoolIndex(s: number, id: number, type: ObstacleType): number {
  const st = stageAt(s);
  if (st === 'city') return type === 'gap' ? 0 : type === 'hurdle' ? 1 : 2;
  const b = st === 'police' ? 3 : 7;
  return type === 'gap' ? b : type === 'beam' ? b + 3 : b + 1 + (id & 1);
}
/** A 90-degree corner at path distance `s`. dir -1 = left, 1 = right. */
export interface Junction { id: number; s: number; dir: TurnDir }

export interface Sim {
  mode: Mode;
  dist: number;
  speed: number;
  lane: number;
  px: number;
  jy: number;
  vy: number;
  slideT: number;
  phase: number;
  obstacles: Obstacle[];
  coins: Coin[];
  pops: Pop[];
  nextS: number;
  coinsRun: number;
  time: number;
  shake: number;
  flash: number;
  dieT: number;
  deathCause: DeathCause | null;
  /** character kind of the walker that caught you (deathCause 'walker') */
  deathKind: number | null;
  walkers: Walker[];
  uid: number;
  /** upcoming corner (always set) */
  turn: Junction;
  /** most recently taken corner, for rendering the street behind */
  lastTurn: Junction | null;
  /** direction armed for `turn` inside its window (0 = none) */
  turnReq: -1 | 0 | 1;
  /** seconds since the last corner was taken (drives the visual swing); large = idle */
  turnFx: number;
  turnsTaken: number;
  /** directions of the last two generated corners, for left/right variety */
  turnDirs: number[];
  /** metres between the survivor and the lead infected */
  horde: number;
}

export const GAP_LEN = 2.6;
const GRAVITY = 30;
const JUMP_V = 10.4;
const SLIDE_TIME = 0.7;
export const START_SPEED = 11;
export const MAX_SPEED = 30;
export const HORDE_REST = 3.1;
const MAX_SUBSTEP = 1 / 120;
/** rows are generated up to this far ahead and culled this far behind the runner */
export const SPAWN_AHEAD = 75;
export const DESPAWN_BEHIND = 6;

// ---- corners ----
export const FIRST_TURN_RUN = 240;
export const FIRST_TURN_HOME = 90;
export const TURN_GAP_MIN = 210;
export const TURN_GAP_MAX = 340;
/** obstacle/supply-free corridor around each corner (metres of path) */
export const CLEAR_BEFORE = 36;
export const CLEAR_AFTER = 24;
/** HUD warning starts this far before a corner */
export const TURN_WARN = 75;
/** metres past the corner centre a turn is still accepted before you hit the dead end */
export const TURN_LATE = 2.0;
/** where the dead-end wall stops you (metres past corner centre) */
export const DEAD_END = 3.0;
/** acceptance window before the corner grows with speed (~0.85s at start, ~0.57s at max) */
export function turnWindow(speed: number) { return 5 + speed * 0.4; }

// ---- difficulty: distance survival tiers ----
/** metres of forgiving opening: single-lane obstacles only, no walkers */
export const GRACE_DIST = 180;
export const TIER_LEN = 500;
export const TIER_NAMES = ['Calm', 'Stirring', 'Restless', 'Hunting', 'Swarming', 'Frenzy', 'Dead Run'];
export const MAX_TIER = TIER_NAMES.length - 1;
/** speed ceiling per tier (m/s); final tier reaches MAX_SPEED */
export const TIER_SPEED_CAP = [15.5, 18.5, 21, 23.5, 26, 28, 30];
/** minimum seconds between obstacle rows at current speed (> jump airtime 0.69s / slide 0.7s plus recovery) */
export const MIN_ROW_TIME = 1.0;
export interface Difficulty { tier: number; name: string; /** 0..1 within the tier ladder */ level: number; speedCap: number; density: number; grace: boolean; walkerChance: number; walkerVMax: number }
export function difficulty(dist: number): Difficulty {
  const d = Math.max(0, dist);
  const tier = Math.min(MAX_TIER, Math.floor(d / TIER_LEN));
  const level = Math.min(1, d / (TIER_LEN * MAX_TIER));
  const grace = d < GRACE_DIST;
  return {
    tier, name: TIER_NAMES[tier], level, speedCap: TIER_SPEED_CAP[tier], grace,
    density: grace ? 0 : level,
    walkerChance: d < WALKER_START ? 0 : Math.min(0.42, 0.18 + tier * 0.04),
    walkerVMax: Math.min(6.5, 4.0 + tier * 0.4),
  };
}
/** ramp speed toward the tier cap; never exceeds it */
export function nextSpeed(speed: number, dist: number, dt: number) {
  const cap = difficulty(dist).speedCap;
  if (speed >= cap) return Math.min(speed, MAX_SPEED);
  return Math.min(cap, speed + dt * 0.35);
}
/** distance between obstacle rows: tightens with density but never below MIN_ROW_TIME seconds of travel */
export function rowSpacing(speed: number, density: number, r = 0.5) {
  const base = 16 + speed * 0.5 + r * 8 - density * 6;
  return Math.max(base, speed * MIN_ROW_TIME + 4);
}
/** speed-scaled corner clear corridor and warning */
export function clearBefore(speed: number) { return Math.max(CLEAR_BEFORE, speed * 1.6); }
export function turnWarn(speed: number) { return Math.max(TURN_WARN, speed * 3.4); }

function makeJunction(s: Sim, at: number): Junction {
  const h = s.turnDirs;
  let dir: TurnDir = Math.random() < 0.5 ? -1 : 1;
  if (h.length === 1) dir = (-h[0]) as TurnDir; // first two corners always differ
  else if (h.length >= 2 && h[h.length - 1] === h[h.length - 2] && h[h.length - 1] === dir) dir = (-dir) as TurnDir; // never 3 in a row
  h.push(dir); if (h.length > 2) h.shift();
  return { id: s.uid++, s: at, dir };
}

function executeTurn(s: Sim) {
  const j = s.turn;
  s.lastTurn = j;
  s.turnsTaken += 1;
  s.turnFx = 0;
  s.turnReq = 0;
  s.turn = makeJunction(s, j.s + rand(TURN_GAP_MIN, TURN_GAP_MAX));
}

export interface TurnInfo { dir: TurnDir; dist: number; window: number; warn: boolean; open: boolean; armed: -1 | 0 | 1 }
/** Pure read of the upcoming corner state relative to the runner. */
export function turnInfo(s: Sim): TurnInfo {
  const dist = s.turn.s - s.dist; const window = turnWindow(s.speed);
  return { dir: s.turn.dir, dist, window, warn: dist <= turnWarn(s.speed) && dist > -TURN_LATE, open: dist <= window && dist >= -TURN_LATE, armed: s.turnReq };
}

/** Request a corner turn. Returns true only when the window is open and the request was armed. Never changes lane. */
export function requestTurn(s: Sim, dir: TurnDir) {
  if (s.mode !== 'run') return false;
  if (!turnInfo(s).open) return false;
  s.turnReq = dir;
  return true;
}

/** Horizontal input: turns inside a corner window; lateral nudge elsewhere except in the warned approach (to keep turns from moving you). */
export function steer(s: Sim, dir: TurnDir, allowLateral: boolean): 'turn' | 'lane' | 'none' {
  if (s.mode !== 'run') return 'none';
  if (requestTurn(s, dir)) return 'turn';
  if (!allowLateral) return 'none';
  if (turnInfo(s).dist < 14 && turnInfo(s).dist > -TURN_LATE) return 'none';
  return (dir < 0 ? actions.left(s) : actions.right(s)) ? 'lane' : 'none';
}

export function newSim(mode: Mode = 'home'): Sim {
  const s = baseSim(mode);
  s.turn = makeJunction(s, mode === 'home' ? FIRST_TURN_HOME : FIRST_TURN_RUN);
  return s;
}

function baseSim(mode: Mode): Sim {
  return {
    mode, dist: 0, speed: START_SPEED, lane: 0, px: 0, jy: 0, vy: 0, slideT: 0, phase: 0,
    obstacles: [], coins: [], pops: [], nextS: 34, coinsRun: 0, time: 0, shake: 0, flash: 0,
    dieT: 0, deathCause: null, deathKind: null, walkers: [], uid: 2, horde: HORDE_REST,
    turn: { id: 1, s: 0, dir: 1 }, lastTurn: null, turnReq: 0, turnFx: 99, turnsTaken: 0, turnDirs: [],
  } as Sim;
}

export function setLane(s: Sim, lane: number) {
  if (!Number.isFinite(lane)) return false;
  lane = Math.max(-1.2, Math.min(1.2, lane));
  if (s.mode !== 'run' || s.lane === lane) return false;
  s.lane = lane;
  return true;
}

export const actions = {
  left(s: Sim) { if (s.lane > -1.2) { s.lane = Math.max(-1.2, s.lane - 0.35); return true; } return false; },
  right(s: Sim) { if (s.lane < 1.2) { s.lane = Math.min(1.2, s.lane + 0.35); return true; } return false; },
  jump(s: Sim) { if (s.jy <= 0.001) { s.vy = JUMP_V; s.jy = 0.01; s.slideT = 0; return true; } return false; },
  slide(s: Sim) {
    if (s.jy > 0.01) s.vy = -22;
    s.slideT = SLIDE_TIME;
    return true;
  },
};

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

/** Walker row: walkers start ahead so they meet the runner near `at`; at least one lane stays free and no obstacle shares the row. */
function spawnWalkers(s: Sim, at: number) {
  const kinds = STAGE_KINDS[stageAt(at)];
  if (s.walkers.length >= WALKER_MAX) return false;
  const count = Math.random() < 0.7 ? 1 : 2;
  const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5).slice(0, Math.min(count, WALKER_MAX - s.walkers.length));
  const J = s.turn.s;
  const made: Walker[] = [];
  for (const lane of lanes) {
    const avail = kinds.filter((k) => s.walkers.filter((w) => w.kind === k).length + made.filter((w) => w.kind === k).length < WALKER_PER_KIND);
    if (!avail.length) break;
    const v = rand(2.5, difficulty(at).walkerVMax);
    const s0 = at + v * Math.max(0, at - s.dist) / Math.max(1, s.speed);
    // the whole walk (spawn -> meet) must stay out of the corner corridor
    if (at < J && s0 + 2 > J - clearBefore(s.speed)) return false;
    // never spawn already overlapping/behind the runner's reach: needs at least 1.2s to react at closing speed
    if ((s0 - s.dist) / (s.speed + v) < 1.2) return false;
    made.push({ id: s.uid++, s: s0, lane, v, kind: avail[Math.floor(Math.random() * avail.length)] });
  }
  if (!made.length) return false;
  s.walkers.push(...made);
  return true;
}

function spawnRow(s: Sim) {
  const at = s.nextS;
  const J = s.turn.s;
  if (at + 6 > J - clearBefore(s.speed) && at - 8 < J + CLEAR_AFTER) { s.nextS = J + CLEAR_AFTER + 8; return; }
  const df = difficulty(at); const diff = df.density;
  if (at > WALKER_START && Math.random() < df.walkerChance && spawnWalkers(s, at)) {
    s.nextS = at + rowSpacing(s.speed, diff, Math.random());
    return;
  }
  const r = Math.random();
  // grace: one lane only; later 2-3 lanes (3 always share one jump/slide answer)
  const blockedCount = df.grace ? 1 : r < 0.5 - diff * 0.3 ? 1 : r < 0.93 - diff * 0.13 ? 2 : 3;
  const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
  const blocked = lanes.slice(0, blockedCount);
  const types: ObstacleType[] = ['gap', 'hurdle', 'beam'];
  const shared = types[Math.floor(Math.random() * 3)];
  for (const lane of blocked) {
    const type = blockedCount === 3 || Math.random() < 0.5 ? shared : types[Math.floor(Math.random() * 3)];
    s.obstacles.push({ id: s.uid++, s: at, lane, type });
  }
  const free = lanes.slice(blockedCount);
  if (free.length && Math.random() < 0.75) {
    const lane = free[0];
    for (let i = 0; i < 5; i++) s.coins.push({ id: s.uid++, s: at - 7 + i * 2.2, lane, h: 0.7, taken: false });
  } else if (Math.random() < 0.6) {
    const ob = s.obstacles[s.obstacles.length - 1];
    if (ob.type !== 'beam') {
      for (let i = 0; i < 5; i++) {
        const k = (i - 2) / 2;
        s.coins.push({ id: s.uid++, s: at - 2.8 + i * 1.6 + (ob.type === 'gap' ? 1.2 : 0), lane: ob.lane, h: 0.8 + (1 - k * k) * 1.6, taken: false });
      }
    }
  }
  s.nextS = at + rowSpacing(s.speed, diff, Math.random());
}

/** Advance the sim by an arbitrary frame dt; internally clamped and sub-stepped to avoid tunnelling. */
export function advance(s: Sim, frameDt: number): { coin: boolean; died: boolean; turned: boolean } {
  const out = { coin: false, died: false, turned: false };
  if (s.mode === 'paused' || s.mode === 'over') return out;
  let left = Math.min(0.1, Math.max(0, frameDt));
  while (left > 1e-6) {
    const dt = Math.min(MAX_SUBSTEP, left);
    left -= dt;
    const ev = step(s, dt);
    if (ev.coin) out.coin = true;
    if (ev.died) out.died = true;
    if (ev.turned) out.turned = true;
    // step mutates mode; widen the entry-state narrowing after that call.
    if ((s.mode as Mode) === 'over' || (s.mode as Mode) === 'paused') break;
  }
  return out;
}

export function step(s: Sim, dt: number): { coin: boolean; died: boolean; turned?: boolean } {
  const out: { coin: boolean; died: boolean; turned?: boolean } = { coin: false, died: false };
  s.time += dt;
  for (const p of s.pops) p.age += dt;
  if (s.pops.length && s.pops[0].age >= 0.6) s.pops = s.pops.filter((p) => p.age < 0.6);
  s.shake = Math.max(0, s.shake - dt);
  s.flash = Math.max(0, s.flash - dt * 2.5);
  s.turnFx += dt;

  if (s.mode === 'home') {
    s.dist += 7 * dt;
    if (s.dist >= s.turn.s) executeTurn(s);
    s.phase += dt * 9;
    s.px += (Math.sin(s.time * 0.5) * 0.4 - s.px) * Math.min(1, dt * 2);
    s.horde = HORDE_REST + Math.sin(s.time * 0.7) * 0.4;
    return out;
  }
  if (s.mode === 'dying') {
    s.dieT += dt;
    s.speed = Math.max(0, s.speed - dt * 60);
    s.dist += s.speed * dt;
    if (s.deathCause === 'corner' || s.deathCause === 'wrongway') s.dist = Math.min(s.dist, s.turn.s + DEAD_END);
    if (s.deathCause === 'gap') s.jy -= dt * 8;
    s.horde = Math.max(0.55, s.horde - dt * 6);
    if (s.dieT > 1.15) s.mode = 'over';
    return out;
  }
  if (s.mode !== 'run') return out;

  s.speed = nextSpeed(s.speed, s.dist, dt);
  s.dist += s.speed * dt;
  s.phase += dt * (6 + s.speed * 0.45);
  s.px += (s.lane - s.px) * Math.min(1, dt * 14);
  // horde breathes: closes in slightly when you slow down via slides, drifts back otherwise
  const target = HORDE_REST - (s.slideT > 0 ? 0.5 : 0) + Math.sin(s.time * 1.3) * 0.25;
  s.horde += (target - s.horde) * Math.min(1, dt * 1.5);
  if (s.jy > 0 || s.vy > 0) {
    s.vy -= GRAVITY * dt;
    s.jy += s.vy * dt;
    if (s.jy <= 0) { s.jy = 0; s.vy = 0; }
  }
  s.slideT = Math.max(0, s.slideT - dt);

  // corner resolution
  if (s.dist >= s.turn.s) {
    const j = s.turn;
    let cause: DeathCause | null = null;
    if (s.turnReq === j.dir) { executeTurn(s); out.turned = true; }
    else if (s.turnReq === -j.dir) cause = 'wrongway';
    else if (s.dist >= j.s + TURN_LATE) cause = 'corner';
    if (cause) {
      s.dist = Math.min(s.dist, j.s + DEAD_END);
      s.mode = 'dying'; s.deathCause = cause; s.shake = 0.5; s.flash = 1; s.dieT = 0;
      out.died = true;
      return out;
    }
  }

  while (s.nextS < s.dist + SPAWN_AHEAD) spawnRow(s);

  for (const w of s.walkers) {
    w.s -= w.v * dt;
    if (Math.abs(w.lane - s.px) > WALKER_HALF_W || Math.abs(w.s - s.dist) > WALKER_HALF_D) continue;
    s.mode = 'dying'; s.deathCause = 'walker'; s.deathKind = w.kind; s.shake = 0.6; s.flash = 1; s.dieT = 0;
    out.died = true;
    return out;
  }
  if (s.walkers.length && s.walkers.some((w) => w.s - s.dist < -8)) s.walkers = s.walkers.filter((w) => w.s - s.dist >= -8);

  for (const o of s.obstacles) {
    // Actual lateral overlap, not a rounded lane index. Player half-width is ~0.12.
    if (Math.abs(o.lane - s.px) > (o.type === 'gap' ? 0.42 : 0.58)) continue;
    const z = o.s - s.dist;
    let hit = false;
    if (o.type === 'gap') hit = z <= 0.25 && z + GAP_LEN >= 0.35 && s.jy < 0.25;
    else if (Math.abs(z) < 0.45) hit = o.type === 'hurdle' ? s.jy < 0.75 : s.slideT <= 0;
    if (hit) {
      s.mode = 'dying'; s.deathCause = o.type; s.shake = 0.5; s.flash = 1; s.dieT = 0;
      out.died = true;
      return out;
    }
  }
  for (const c of s.coins) {
    if (c.taken || Math.abs(c.lane - s.px) > 0.30) continue;
    const z = c.s - s.dist;
    if (Math.abs(z) < 0.7 && Math.abs(s.jy + 0.6 - c.h) < 1.1) {
      c.taken = true; s.coinsRun += 1; out.coin = true;
      s.pops.push({ id: s.uid++, lane: c.lane, h: c.h, age: 0 });
    }
  }
  if (s.obstacles.length && s.obstacles[0].s - s.dist <= -DESPAWN_BEHIND) s.obstacles = s.obstacles.filter((o) => o.s - s.dist > -DESPAWN_BEHIND);
  if (s.coins.length && (s.coins[0].s - s.dist <= -3 || s.coins.some((c) => c.taken))) s.coins = s.coins.filter((c) => c.s - s.dist > -3 && !c.taken);
  return out;
}

/** Render pool capacity per obstacle model: every live obstacle must have a mesh.
 * live rows <= ceil((ahead + behind) / min row spacing) + 1; min spacing = START_SPEED*MIN_ROW_TIME + 4; <= 3 per row. */
export const OB_POOL_CAP = Math.max(24, 3 * (Math.ceil((SPAWN_AHEAD + DESPAWN_BEHIND) / (START_SPEED * MIN_ROW_TIME + 4)) + 1));
