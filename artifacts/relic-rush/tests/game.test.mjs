import test from 'node:test';
import assert from 'node:assert/strict';
import { newSim, advance, requestTurn, stageAt, stageInfo, stageLoop, sewerAt, STAGE_LEN, setLane, canRevive, revive, REVIVE_CLEAR, newMissionSim, specialTypes, specialChance, lastStandTypes, lastStandChance } from '../lib/game.ts';
import { lastStandUnlocked, LAST_STAND_UNLOCK } from '../lib/campaign.ts';
import { simDifficulty as simDifficultyOf } from '../lib/game.ts';
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
test('Last Stand runs seven 1 km themes in order, then loops into night', () => {
  assert.equal(STAGE_LEN, 1000);
  const order = ['city', 'police', 'hospital', 'subway', 'bridge', 'docks', 'military'];
  order.forEach((st, i) => { assert.equal(stageAt(i * STAGE_LEN), st); assert.equal(stageAt((i + 1) * STAGE_LEN - 1), st); });
  assert.equal(stageAt(STAGE_LEN * 7), 'city');
  assert.equal(stageInfo(STAGE_LEN).remaining, STAGE_LEN);
  assert.equal(stageInfo(6500).next, 'city');
  assert.equal(stageLoop(6999), 0); assert.equal(stageLoop(7000), 1); assert.equal(stageLoop(14000), 2);
  // the sewers are the second half of each subway kilometre
  assert.equal(sewerAt(3499), false); assert.equal(sewerAt(3500), true); assert.equal(sewerAt(3999), true); assert.equal(sewerAt(4000), false);
  assert.equal(sewerAt(10600), true);
});
test('incoming zombies move straight and collision uses real lateral position', () => {
  const s = clearRun();
  s.walkers = [{ id: 1, s: 5, lane: 0.8, v: 4, kind: 7 }];
  advance(s, 0.1);
  assert(s.walkers[0].s < 5);
  assert.equal(s.walkers[0].lane, 0.8);
  assert.equal(s.mode, 'run');
  const hit = clearRun();
  hit.horde = 1;
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
import { difficulty, nextSpeed, rowSpacing, clearBefore, turnWarn, GRACE_DIST, MIN_ROW_TIME, MAX_SPEED, START_SPEED, MAX_TIER, TURN_WARN, CLEAR_BEFORE, CLEAR_AFTER, WALKER_START, CAMPAIGN_MAX_SPEED, MAX_DENSITY, OVERDRIVE_FROM, HORDE_REGEN, STUMBLE_PUSH, MISSION_MAX_SPEED } from '../lib/game.ts';

function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function withSeed(seed, fn) { const r = Math.random; Math.random = seeded(seed); try { return fn(); } finally { Math.random = r; } }

test('difficulty tiers rise monotonically with distance and cap', () => {
  let prev = -1; let prevCap = 0;
  for (let d = 0; d <= 10000; d += 50) {
    const df = difficulty(d);
    assert.ok(df.tier >= prev); assert.ok(df.speedCap >= prevCap);
    assert.ok(df.speedCap <= MAX_SPEED); assert.ok(df.density >= 0 && df.density <= MAX_DENSITY);
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
  for (let v = START_SPEED; v <= MAX_SPEED; v += 0.5) for (const dens of [0, 0.5, 1, MAX_DENSITY]) for (const r of [0, 1])
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
  assert.deepEqual([at(999.9, 'hurdle'), at(1000, 'hurdle'), at(1000, 'hurdle', 3), at(1001, 'beam'), at(1001, 'gap')], [1, 4, 5, 6, 3]);
  assert.deepEqual([at(2000, 'gap'), at(2000, 'hurdle'), at(2000, 'hurdle', 1), at(2000, 'beam')], [7, 8, 9, 10]);
  // new Last Stand themes: subway 11-14, bridge 15-18, docks 19-22, military 23-26, then back to the city
  assert.deepEqual([at(3000, 'gap'), at(4000, 'gap'), at(5000, 'gap'), at(6000, 'gap'), at(6999, 'beam')], [11, 15, 19, 23, 26]);
  assert.equal(at(7000, 'beam'), 2);
  assert.equal(obstacleVisual(1999, 4, 'hurdle').stage, 'police');
  // same obstacle hit in the same way regardless of where the runner/stage is
  for (const base of [100, 1100, 2100, 3100, 4100, 5100, 6100]) for (const type of ['hurdle', 'beam']) {
    const s = newSim('run'); s.turn = { id: 9, s: 1e6, dir: 1 }; s.nextS = 1e9; s.dist = base; s.speed = 12;
    s.horde = 1;
    s.obstacles = [{ id: 50, s: base + 3, lane: 0, type }];
    for (let i = 0; i < 30; i++) advance(s, 0.02);
    assert.equal(s.deathCause, type, `${type}@${base}`);
  }
});

import { actions, routeInfo } from '../lib/game.ts';
import { normalizeProgress, addRun, trophiesOf } from '../lib/progression.ts';

function openRun() {
  const s = newSim('run');
  s.turn.s = 1e8; s.nextS = 1e9;
  return s;
}
test('first impact stumbles, grace prevents repeat impact, second close impact is fatal', () => {
  const s = openRun();
  s.obstacles = [{ id: 20, s: 0.4, lane: 0, type: 'hurdle' }];
  const ev = advance(s, 0.05);
  assert(ev.stumbled);
  assert.equal(s.mode, 'run');
  assert(s.stumbleT > 0 && s.horde < 3.5);
  advance(s, 0.1);
  assert.equal(s.mode, 'run');
  s.invulnerableT = 0;
  s.obstacles = [{ id: 21, s: s.dist + 0.4, lane: 0, type: 'beam' }];
  advance(s, 0.05);
  assert.equal(s.deathCause, 'beam');
});
test('clean running recovers horde separation and pausing freezes pickups and stumble timers', () => {
  const s = openRun(); s.horde = 2; s.shieldT = 10; s.flashlightT = 10;
  for (let i = 0; i < 100; i++) advance(s, 0.1);
  assert(s.horde > 3);
  s.mode = 'paused';
  const before = [s.horde, s.shieldT, s.flashlightT, s.cleanTime, s.dist];
  advance(s, 0.1);
  assert.deepEqual([s.horde, s.shieldT, s.flashlightT, s.cleanTime, s.dist], before);
});
test('all pickups collect automatically with distinct benefits; shield cannot save a fall', () => {
  for (const type of ['shield', 'flashlight', 'distraction']) {
    const s = openRun(); s.horde = 2;
    s.pickups = [{ id: 30, s: 0.5, lane: 0, type, taken: false }];
    assert(advance(s, 0.05).pickup);
    assert.equal(s.pickupsRun, 1); assert.equal(s.pickups.length, 0);
    if (type === 'shield') {
      s.obstacles = [{ id: 31, s: s.dist + 0.4, lane: 0, type: 'hurdle' }];
      advance(s, 0.05);
      assert.equal(s.shieldT, 0); assert.equal(s.mode, 'run');
    } else if (type === 'flashlight') assert(s.flashlightT > 11);
    else assert(s.distractionT > 7 && s.horde > 4);
  }
  const s = openRun(); s.shieldT = 12;
  s.obstacles = [{ id: 32, s: 0.5, lane: 0, type: 'gap' }];
  advance(s, 0.1); assert.equal(s.deathCause, 'gap');
});
test('branch corners accept either direction and preserve selected street direction', () => {
  for (const dir of [-1, 1]) {
    const s = clearRun(1); s.turn.branch = true; s.dist = 9.8;
    requestTurn(s, dir); advance(s, 0.05);
    assert.equal(s.mode, 'run'); assert.equal(s.lastTurn.dir, dir);
    assert.equal(s.turnsTaken, 1);
  }
  assert.equal(routeInfo(0).id, 'boulevard');
  assert.equal(routeInfo(300).id, 'alley');
  assert.equal(routeInfo(600).id, 'collapsed');
});
test('sensitivity is continuous bounded and invalid input safe', () => {
  assert(tiltLane(.1, 1.6) > tiltLane(.1, .6));
  assert.equal(tiltLane(100, 1.6), 1.2);
  assert.equal(tiltLane(NaN), 0);
});
test('legacy records migrate without easy trophies or active wardrobe selection', () => {
  const p = normalizeProgress({ best: 650, totalCoins: 12, runs: 4 });
  assert.equal(p.best, 650); assert.equal(p.settings.sensitivity, 1);
  const withRun = addRun(p, 200, 3, { turns: 2, jumps: 10, slides: 5, pickups: 1 });
  assert.equal(withRun.jumps, 10);
  assert(trophiesOf(withRun).every((t) => !t.unlocked));
  assert.equal(withRun.totalCoins, 15); // no claim reward or trophy currency
  assert.equal(normalizeProgress({ outfit: 'medic', owned: ['scout', 'medic'] }).outfit, 'scout');
  assert.equal(normalizeProgress({ settings: { sensitivity: NaN } }).settings.sensitivity, 1);
});
test('hard trophies unlock automatically at exact thresholds and remain unlocked across reloads', () => {
  let p = normalizeProgress({ best: 1499, distance: 24000, turns: 99, pickups: 99 });
  assert(trophiesOf(p).every((t) => !t.unlocked));
  p = addRun(p, 1500, 8, { turns: 1, jumps: 0, slides: 0, pickups: 1 });
  assert.deepEqual(new Set(p.unlockedTrophies), new Set(['survivor', 'navigator', 'resourceful', 'road-veteran']));
  const restored = normalizeProgress(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(trophiesOf(restored), trophiesOf(p));
  const later = addRun(restored, 6000, 0);
  assert(trophiesOf(later).every((t) => t.unlocked));
  assert.equal(new Set(later.unlockedTrophies).size, 7);
  assert.equal(addRun(later, 10, 0).unlockedTrophies.length, 7);
});
test('earned trophies survive migration independently of counters, without duplicate awards or currency rewards', () => {
  const legacy = normalizeProgress({
    best: 0, totalCoins: 22,
    unlockedTrophies: ['survivor', 'survivor', 'not-a-trophy'],
  });
  assert.deepEqual(legacy.unlockedTrophies, ['survivor']);
  assert.equal(trophiesOf(legacy).find((t) => t.id === 'survivor').unlocked, true);
  const earned = addRun(legacy, 6000, 0, { turns: 100, jumps: 0, slides: 0, pickups: 100 });
  assert.equal(earned.totalCoins, 22);
  assert.equal(new Set(earned.unlockedTrophies).size, earned.unlockedTrophies.length);
  const restored = normalizeProgress(JSON.parse(JSON.stringify(earned)));
  assert.deepEqual(restored.unlockedTrophies, earned.unlockedTrophies);
});
test('action counters count accepted inputs only; fresh runs clear powerups and stats', () => {
  const s = openRun();
  assert(actions.jump(s)); assert(!actions.jump(s)); assert.equal(s.jumps, 1);
  s.jy = 0; s.vy = 0;
  assert(actions.slide(s)); assert(!actions.slide(s)); assert.equal(s.slides, 1);
  const fresh = newSim('run');
  for (const key of ['shieldT', 'flashlightT', 'distractionT', 'stumbleT', 'pickupsRun', 'jumps', 'slides']) assert.equal(fresh[key], 0);
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
test('revive resumes once: clears the threat ahead, takes a missed corner, keeps distance and stats', () => {
  // obstacle death
  const s = clearRun(1);
  s.turn = { id: 99, s: 500, dir: 1 };
  s.dist = 50; s.speed = 20; s.horde = 1;
  s.obstacles.push({ id: 7, s: 50.2, lane: 0, type: 'hurdle' }, { id: 8, s: 50 + REVIVE_CLEAR + 5, lane: 0, type: 'beam' });
  s.walkers.push({ id: 9, s: 70, lane: 1, v: 3, kind: 0 });
  s.coinsRun = 4;
  for (let i = 0; i < 200 && s.mode !== 'over'; i++) advance(s, 0.05);
  assert.equal(s.mode, 'over');
  assert.equal(s.deathCause, 'hurdle');
  assert.equal(canRevive(s), true);
  const dist = s.dist;
  assert.equal(revive(s), true);
  assert.equal(s.mode, 'run');
  assert.equal(s.dist, dist);
  assert.equal(s.coinsRun, 4);
  assert.deepEqual(s.obstacles.map((o) => o.id), [8]);
  assert.equal(s.walkers.length, 0);
  assert.ok(s.invulnerableT > 0);
  assert.ok(s.speed >= START_SPEED && s.speed < 20);
  assert.equal(canRevive(s), false);
  // only one revive per run
  s.mode = 'over';
  assert.equal(revive(s), false);

  // missed corner: revive takes it and does not immediately die again
  const c = clearRun(-1);
  c.dist = 9.8;
  for (let i = 0; i < 200 && c.mode !== 'over'; i++) advance(c, 0.05);
  assert.equal(c.deathCause, 'corner');
  const taken = c.turnsTaken;
  assert.equal(revive(c), true);
  assert.equal(c.turnsTaken, taken + 1);
  assert.ok(c.turn.s > c.dist + REVIVE_CLEAR);
  for (let i = 0; i < 20; i++) advance(c, 0.05);
  assert.equal(c.mode, 'run');

  // home/run modes cannot revive
  assert.equal(revive(newSim('run')), false);
});

test('special infected unlock one per mission; Last Stand adds them by distance', () => {
  assert.deepEqual(specialTypes(null), []);
  assert.deepEqual(specialTypes(1), []);
  assert.deepEqual(specialTypes(2), ['crawler']);
  assert.deepEqual(specialTypes(3), ['crawler', 'sprinter']);
  assert.deepEqual(specialTypes(4), ['crawler', 'sprinter', 'brute']);
  assert.deepEqual(specialTypes(10), ['crawler', 'sprinter', 'brute']);
  assert.equal(specialChance(1), 0);
  assert(specialChance(3) > specialChance(2) && specialChance(10) <= 0.7);
  assert.deepEqual(lastStandTypes(0), []);
  assert.deepEqual(lastStandTypes(799), []);
  assert.deepEqual(lastStandTypes(800), ['crawler']);
  assert.deepEqual(lastStandTypes(1600), ['crawler', 'sprinter']);
  assert.deepEqual(lastStandTypes(5000), ['crawler', 'sprinter', 'brute']);
  assert.equal(lastStandChance(500), 0);
  assert(lastStandChance(800) > 0 && lastStandChance(20000) <= 0.5);
  // the opening stretch of Last Stand stays plain
  const endless = newSim('run');
  for (let i = 0; i < 4000 && endless.mode === 'run' && endless.dist < 700; i++) { endless.horde = 99; endless.invulnerableT = 1; endless.obstacles = endless.obstacles.filter((o) => o.type !== 'gap'); requestTurn(endless, endless.turn.dir); advance(endless, 1 / 30); }
  assert(endless.walkers.every((w) => w.type === 'walker'));
  // later missions actually spawn them, and every row still leaves a lane open
  const seen = new Set();
  for (let n = 0; n < 12 && seen.size < 3; n++) {
    const m = newMissionSim(6);
    for (let i = 0; i < 3000 && m.mode === 'run'; i++) {
      // sinkholes are always fatal; remove them so the run reaches the end
      m.horde = 99; m.invulnerableT = 1; m.obstacles = m.obstacles.filter((o) => o.type !== 'gap');
      requestTurn(m, m.turn.dir); advance(m, 1 / 30);
      for (const w of m.walkers) {
        if (w.type !== 'walker') seen.add(w.type);
        if (w.type === 'brute') assert(Math.abs(w.lane) === 0.5);
      }
    }
  }
  assert(seen.has('crawler') && seen.has('sprinter') && seen.has('brute'));
});
test('crawlers are jumped, brutes block two lanes and cannot be jumped', () => {
  const crawl = () => { const s = clearRun(); s.horde = 1; s.walkers = [{ id: 1, s: 0.5, lane: 0, v: 1.5, kind: 0, type: 'crawler' }]; return s; };
  const ground = crawl(); advance(ground, 0.05);
  assert.equal(ground.deathCause, 'walker'); assert.equal(ground.deathWalker, 'crawler');
  const air = crawl(); air.jy = 0.9; air.vy = 4; advance(air, 0.05);
  assert.equal(air.mode, 'run');
  const brute = (px) => { const s = clearRun(); s.horde = 1; s.lane = px; s.px = px; s.walkers = [{ id: 1, s: 0.3, lane: 0.5, v: 2, kind: 0, type: 'brute' }]; advance(s, 0.05); return s; };
  assert.equal(brute(0).deathWalker, 'brute');
  assert.equal(brute(1).deathWalker, 'brute');
  assert.equal(brute(-1).mode, 'run');
  const jumpBrute = clearRun(); jumpBrute.horde = 1; jumpBrute.jy = 1.2; jumpBrute.vy = 4;
  jumpBrute.walkers = [{ id: 1, s: 0.3, lane: 0.5, v: 2, kind: 0, type: 'brute' }];
  advance(jumpBrute, 0.05);
  assert.equal(jumpBrute.deathWalker, 'brute');
});

test('Last Stand unlocks only after mission 5 is reached', () => {
  assert.equal(LAST_STAND_UNLOCK, 5);
  assert.equal(lastStandUnlocked({ completed: [1, 2, 3, 4], bestTimes: {} }), false);
  assert.equal(lastStandUnlocked({ completed: [1, 2, 3, 4, 5], bestTimes: {} }), true);
});

test('Last Stand keeps getting harder past 3 km until capped, top speed 40 m/s', () => {
  assert.equal(OVERDRIVE_FROM, 3000);
  assert.equal(difficulty(3000).speedCap, CAMPAIGN_MAX_SPEED);
  assert.equal(difficulty(3000).overdrive, 0);
  assert.equal(difficulty(5000).speedCap, 34);
  assert.equal(difficulty(5000).overdrive, 2);
  assert.equal(difficulty(8000).speedCap, MAX_SPEED);
  assert.equal(MAX_SPEED, 40);
  let prev = difficulty(OVERDRIVE_FROM);
  for (let d = OVERDRIVE_FROM + 500; d <= 7000; d += 500) {
    const df = difficulty(d);
    assert(df.speedCap > prev.speedCap && df.density > prev.density && df.walkerChance > prev.walkerChance && df.walkerVMax > prev.walkerVMax);
    assert(df.hordeRegen < prev.hordeRegen && df.stumblePush > prev.stumblePush);
    prev = df;
  }
  // everything levels off: still beatable, never unbounded
  const far = difficulty(1e6);
  assert.equal(far.density, MAX_DENSITY);
  assert(far.walkerChance <= 0.6 && far.walkerVMax <= 9 && far.hordeRegen >= HORDE_REGEN / 2 && far.stumblePush <= STUMBLE_PUSH + 1.5);
  assert(rowSpacing(MAX_SPEED, far.density, 0) / MAX_SPEED >= MIN_ROW_TIME);
  // campaign never exceeds its own cap and has no overdrive
  for (let id = 1; id <= 10; id++) {
    const m = newMissionSim(id);
    assert(simDifficultyOf(m, 5000).speedCap <= MISSION_MAX_SPEED);
    assert.equal(simDifficultyOf(m, 5000).overdrive, 0);
  }
});
test('a stumble deep in Last Stand lets the horde closer than early on', () => {
  const early = newSim('run'); early.dist = 1000; early.horde = 5.5; early.turn = { id: 9, s: 1e6, dir: 1 }; early.nextS = 1e9;
  early.walkers = [{ id: 1, s: early.dist + 0.3, lane: 0, v: 3, kind: 0, type: 'walker' }];
  advance(early, 0.02);
  const late = newSim('run'); late.dist = 8000; late.speed = 30; late.horde = 5.5; late.turn = { id: 9, s: 1e6, dir: 1 }; late.nextS = 1e9;
  late.walkers = [{ id: 1, s: late.dist + 0.3, lane: 0, v: 3, kind: 0, type: 'walker' }];
  advance(late, 0.02);
  assert.equal(early.mode, 'run'); assert.equal(late.mode, 'run');
  assert(late.horde < early.horde);
});

test('Last Stand best is tracked separately; campaign runs only count toward trophies', () => {
  let p = normalizeProgress({});
  assert.equal(p.lastStandBest, 0);
  p = addRun(p, 2400, 10, undefined, false);
  assert.equal(p.best, 2400); assert.equal(p.lastStandBest, 0);
  p = addRun(p, 900, 5, undefined, true);
  assert.equal(p.lastStandBest, 900); assert.equal(p.best, 2400);
  p = addRun(p, 600, 5, undefined, true);
  assert.equal(p.lastStandBest, 900);
  // old saves without the field load with a clean Last Stand record
  assert.equal(normalizeProgress({ best: 3000 }).lastStandBest, 0);
  assert.equal(normalizeProgress({ lastStandBest: 1234 }).lastStandBest, 1234);
});

test('rat swarms run only in Last Stand sewers, in one lane, and are cleared by a jump', () => {
  const seen = { sewer: 0, elsewhere: 0 };
  for (let n = 0; n < 6; n++) {
    const s = newSim('run'); s.dist = 3300; s.speed = 26; s.nextS = 3320; s.turn = { id: 9, s: 1e6, dir: 1 };
    for (let i = 0; i < 1500 && s.mode === 'run' && s.dist < 4100; i++) {
      s.horde = 99; s.invulnerableT = 1; s.obstacles = s.obstacles.filter((o) => o.type !== 'gap'); advance(s, 1 / 30);
      const rats = s.walkers.filter((w) => w.type === 'rat');
      for (const r of rats) { if (sewerAt(r.s)) seen.sewer++; else if (r.s < 3450) seen.elsewhere++; }
      // a pack never spans lanes: every rat sits within a quarter lane of its pack
      if (rats.length) assert(Math.max(...rats.map((r) => r.lane)) - Math.min(...rats.map((r) => r.lane)) < 2.3);
    }
  }
  assert(seen.sewer > 0, 'rats appear in the sewers');
  assert.equal(seen.elsewhere, 0, 'no rats before the sewers');
  // missions never spawn rats
  const m = newMissionSim(10);
  for (let i = 0; i < 2500 && m.mode === 'run'; i++) { m.horde = 99; m.invulnerableT = 1; m.obstacles = m.obstacles.filter((o) => o.type !== 'gap'); requestTurn(m, m.turn.dir); advance(m, 1 / 30); assert(m.walkers.every((w) => w.type !== 'rat')); }
  const rat = () => { const s = clearRun(); s.horde = 1; s.walkers = [{ id: 1, s: 0.2, lane: 0, v: 7, kind: 0, type: 'rat' }]; return s; };
  const hit = rat(); advance(hit, 0.02); assert.equal(hit.deathWalker, 'rat');
  const hop = rat(); hop.jy = 0.8; hop.vy = 3; advance(hop, 0.02); assert.equal(hop.mode, 'run');
});
