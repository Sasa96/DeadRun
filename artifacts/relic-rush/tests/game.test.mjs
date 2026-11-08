import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim, advance, requestTurn, stageAt, stageInfo, STAGE_LEN, setLane } from '../lib/game.ts';
import { newIntro, stepIntro, skipIntro, introShot, INTRO_LEN } from '../lib/intro.ts';
import { tiltLane } from '../lib/tilt.ts';

function clearRun(dir = -1) {
  const s = newSim('run');
  s.turn = { id: 99, s: 10, dir };
  s.nextS = 100000;
  return s;
}
test('ten-second intro completes exactly once; skip is idempotent', () => {
  const intro = newIntro();
  stepIntro(intro, 0.1, false);
  assert.equal(intro.t, 0);
  let ended = 0;
  for (let i = 0; i < 101; i++) ended += Number(stepIntro(intro, 0.1));
  assert.equal(ended, 1);
  assert.equal(intro.t, INTRO_LEN);
  assert.equal(skipIntro(intro), false);
  const skip = newIntro();
  assert.equal(skipIntro(skip), true);
  assert.equal(skipIntro(skip), false);
  assert.equal(introShot(0), 'asleep');
  assert.equal(introShot(3), 'tv-on');
  assert.equal(introShot(6.5), 'eyes');
  assert.equal(introShot(9), 'escape');
  const slow = newIntro();
  stepIntro(slow, 4);
  assert.equal(slow.t, 4);
  assert.equal(stepIntro(slow, 6), true);
});
test('both corner directions work without resetting distance or proportional steering', () => {
  for (const dir of [-1, 1]) {
    const s = clearRun(dir);
    s.dist = 9.8;
    setLane(s, 0.37);
    assert.equal(requestTurn(s, dir), true);
    advance(s, 0.05);
    assert.equal(s.turnsTaken, 1);
    assert.equal(s.lastTurn.dir, dir);
    assert(s.dist > 10);
    assert.equal(s.lane, 0.37);
    assert.equal(s.mode, 'run');
  }
});
test('wrong turns and missed turns have distinct failure causes', () => {
  const wrong = clearRun(-1);
  wrong.dist = 9.8;
  requestTurn(wrong, 1);
  advance(wrong, 0.05);
  assert.equal(wrong.deathCause, 'wrongway');
  const missed = clearRun();
  missed.dist = 11.9;
  advance(missed, 0.05);
  assert.equal(missed.deathCause, 'corner');
});
test('pause freezes distance, turn transition, and approaching zombies', () => {
  const s = clearRun();
  s.mode = 'paused';
  s.turnFx = 0.2;
  s.walkers = [{ id: 1, s: 8, lane: 1, v: 4, kind: 5 }];
  advance(s, 0.1);
  assert.equal(s.dist, 0);
  assert.equal(s.turnFx, 0.2);
  assert.equal(s.walkers[0].s, 8);
});
test('police and hospital stages last the whole segment and cycle', () => {
  assert.equal(stageAt(0), 'city');
  assert.equal(stageAt(STAGE_LEN), 'police');
  assert.equal(stageAt(STAGE_LEN * 2 - 1), 'police');
  assert.equal(stageAt(STAGE_LEN * 2), 'hospital');
  assert.equal(stageAt(STAGE_LEN * 3 - 1), 'hospital');
  assert.equal(stageAt(STAGE_LEN * 3), 'city');
  assert.equal(stageInfo(STAGE_LEN).remaining, STAGE_LEN);
});
test('incoming zombies move straight and collision uses real lateral position', () => {
  const s = clearRun();
  s.walkers = [{ id: 1, s: 5, lane: 0.8, v: 4, kind: 7 }];
  advance(s, 0.1);
  assert(s.walkers[0].s < 5);
  assert.equal(s.walkers[0].lane, 0.8);
  assert.equal(s.mode, 'run');
  const hit = clearRun();
  hit.walkers = [{ id: 1, s: 0.5, lane: 0, v: 4, kind: 6 }];
  advance(hit, 0.1);
  assert.equal(hit.deathCause, 'walker');
  assert.equal(hit.deathKind, 6);
});
test('tilt remains continuous and retry resets every new mechanic', () => {
  assert(tiltLane(.07) > 0 && tiltLane(.07) < tiltLane(.12));
  assert.equal(tiltLane(0), 0);
  const s = newSim('run');
  assert.equal(s.dist, 0);
  assert.equal(s.turnsTaken, 0);
  assert.equal(s.turnReq, 0);
  assert.equal(s.walkers.length, 0);
  assert.equal(s.deathKind, null);
});

// ---- difficulty progression ----
import { difficulty, nextSpeed, rowSpacing, clearBefore, turnWarn, GRACE_DIST, MIN_ROW_TIME, MAX_SPEED, START_SPEED, MAX_TIER, TURN_WARN, CLEAR_BEFORE, CLEAR_AFTER, WALKER_START } from '../lib/game.ts';

function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function withSeed(seed, fn) { const r = Math.random; Math.random = seeded(seed); try { return fn(); } finally { Math.random = r; } }

test('difficulty tiers rise monotonically with distance and cap', () => {
  let prev = -1; let prevCap = 0;
  for (let d = 0; d <= 10000; d += 50) {
    const df = difficulty(d);
    assert.ok(df.tier >= prev); assert.ok(df.speedCap >= prevCap);
    assert.ok(df.speedCap <= MAX_SPEED); assert.ok(df.density >= 0 && df.density <= 1);
    prev = df.tier; prevCap = df.speedCap;
  }
  assert.equal(difficulty(10000).tier, MAX_TIER);
  assert.equal(difficulty(1e6).speedCap, MAX_SPEED);
  assert.ok(difficulty(3000).walkerChance > difficulty(200).walkerChance);
});
test('speed ramps gradually toward the tier cap and never exceeds MAX_SPEED', () => {
  let v = START_SPEED;
  for (let i = 0; i < 600; i++) v = nextSpeed(v, 0, 1 / 60);
  assert.ok(v <= difficulty(0).speedCap + 1e-9 && v > START_SPEED);
  for (let i = 0; i < 100000; i++) v = nextSpeed(v, 99999, 1 / 60);
  assert.equal(v, MAX_SPEED);
  const s = newSim('run'); s.nextS = 1e9; s.turn = { id: 9, s: 1e9, dir: 1 };
  advance(s, 0.1);
  assert.ok(s.speed - START_SPEED < 0.05, 'acceleration per frame is gentle');
});
test('opening grace: single-lane obstacles only, no walkers', () => {
  for (let seed = 1; seed < 40; seed++) withSeed(seed, () => {
    const s = newSim('run'); s.turn = { id: 9, s: 1e6, dir: 1 };
    for (let i = 0; i < 2000 && s.dist < GRACE_DIST - 80; i++) { advance(s, 1 / 30); s.mode = 'run'; s.obstacles = s.obstacles; }
    const rows = new Map();
    for (const o of s.obstacles) if (o.s < GRACE_DIST) rows.set(o.s, (rows.get(o.s) ?? 0) + 1);
    for (const n of rows.values()) assert.equal(n, 1);
    assert.equal(difficulty(WALKER_START - 1).walkerChance, 0);
  });
});
test('rows keep minimum temporal spacing at every speed and density', () => {
  for (let v = START_SPEED; v <= MAX_SPEED; v += 0.5) for (const dens of [0, 0.5, 1]) for (const r of [0, 1])
    assert.ok(rowSpacing(v, dens, r) / v >= MIN_ROW_TIME, `v=${v}`);
  for (let seed = 1; seed < 15; seed++) withSeed(seed, () => {
    const s = newSim('run'); s.dist = 4000; s.speed = MAX_SPEED; s.nextS = 4020; s.turn = { id: 9, s: 1e6, dir: 1 };
    const rowsAt = [];
    for (let i = 0; i < 40; i++) { const before = s.nextS; s.walkers = []; s.obstacles = []; s.dist = before - 80; advance(s, 0.0001); rowsAt.push(before); }
    for (let i = 1; i < rowsAt.length; i++) if (rowsAt[i] > rowsAt[i - 1]) assert.ok((rowsAt[i] - rowsAt[i - 1]) / s.speed >= MIN_ROW_TIME - 1e-6);
  });
});
test('walker rows always leave a free lane and enough reaction time; corners stay clear at speed', () => {
  for (let seed = 1; seed < 30; seed++) withSeed(seed, () => {
    const s = newSim('run'); s.dist = 3000; s.speed = 26; s.nextS = 3030;
    s.turn = { id: 9, s: 3200, dir: 1 };
    for (let k = 0; k < 6; k++) { s.dist += 40; s.walkers = s.walkers.filter((w) => w.s > s.dist); advance(s, 0.0001); }
    const rows = new Map();
    for (const w of s.walkers) {
      const meet = s.dist + (w.s - s.dist) * s.speed / (s.speed + w.v);
      assert.ok(!(meet < s.turn.s && w.s + 2 > s.turn.s - clearBefore(s.speed)) || meet >= s.turn.s, 'walker in corner corridor');
      const key = Math.round(meet / 3); rows.set(key, (rows.get(key) ?? 0) + 1);
    }
    for (const n of rows.values()) assert.ok(n <= 2);
    for (const o of s.obstacles) assert.ok(o.s < s.turn.s - clearBefore(s.speed) || o.s > s.turn.s + CLEAR_AFTER, 'obstacle in corner corridor');
  });
  assert.ok(clearBefore(30) > CLEAR_BEFORE && clearBefore(11) === CLEAR_BEFORE);
  assert.ok(turnWarn(30) > TURN_WARN && turnWarn(11) === TURN_WARN);
  assert.ok(turnWarn(30) / 30 >= 3.3, 'warning gives >3s at top speed');
});

// ---- themed obstacle selection ----
import { obstaclePoolIndex, obstacleVisual } from '../lib/game.ts';
test('obstacle theme follows absolute obstacle distance, not runner stage; collision unchanged', () => {
  const at = (s, type, id = 2) => obstaclePoolIndex(s, id, type);
  assert.deepEqual([at(10, 'gap'), at(10, 'hurdle'), at(10, 'beam')], [0, 1, 2]);
  assert.deepEqual([at(899.9, 'hurdle'), at(900, 'hurdle'), at(900, 'hurdle', 3), at(901, 'beam'), at(901, 'gap')], [1, 4, 5, 6, 3]);
  assert.deepEqual([at(1800, 'gap'), at(1800, 'hurdle'), at(1800, 'hurdle', 1), at(1800, 'beam')], [7, 8, 9, 10]);
  assert.equal(at(2700, 'beam'), 2);
  assert.equal(obstacleVisual(1799, 4, 'hurdle').stage, 'police');
  // same obstacle hit in the same way regardless of where the runner/stage is
  for (const base of [100, 1000, 1900]) for (const type of ['hurdle', 'beam']) {
    const s = newSim('run'); s.turn = { id: 9, s: 1e6, dir: 1 }; s.nextS = 1e9; s.dist = base; s.speed = 12;
    s.obstacles = [{ id: 50, s: base + 3, lane: 0, type }];
    for (let i = 0; i < 30; i++) advance(s, 0.02);
    assert.equal(s.deathCause, type, `${type}@${base}`);
  }
});

import { OB_POOL_CAP, SPAWN_AHEAD, DESPAWN_BEHIND } from '../lib/game.ts';
test('render pool capacity covers every live obstacle (all one type, max density, slowest speed)', () => {
  const minSpacing = Math.min(...[0, 0.5, 1].flatMap((d) => [0, 1].map((r) => rowSpacing(START_SPEED, d, r))));
  const maxRows = Math.ceil((SPAWN_AHEAD + DESPAWN_BEHIND) / minSpacing) + 1;
  assert.ok(OB_POOL_CAP >= 3 * maxRows && OB_POOL_CAP >= 18);
  for (const startD of [4000, 4900, 5800]) {
    const orig = Math.random; Math.random = () => 0.995; // no walkers, 3-lane rows, all same type
    try {
      const s = newSim('run'); s.dist = startD; s.nextS = startD + 20; s.speed = START_SPEED; s.turn = { id: 9, s: 1e7, dir: 1 };
      let peak = 0;
      for (let i = 0; i < 3000; i++) {
        s.speed = START_SPEED; s.jy = 5; s.vy = 0; s.slideT = 1; // stay alive: hover over everything
        advance(s, 1 / 60); if (s.mode !== 'run') break;
        const per = new Map();
        for (const o of s.obstacles) { const k = obstaclePoolIndex(o.s, o.id, o.type); per.set(k, (per.get(k) ?? 0) + 1); }
        for (const n of per.values()) peak = Math.max(peak, n);
      }
      assert.ok(peak >= 9, `stress reached ${peak}`);
      assert.ok(peak <= OB_POOL_CAP, `peak ${peak} > cap ${OB_POOL_CAP}`);
    } finally { Math.random = orig; }
  }
});
