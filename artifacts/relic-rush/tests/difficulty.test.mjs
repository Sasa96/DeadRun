import test from 'node:test';
import assert from 'node:assert/strict';
import { newMissionSim, simDifficulty, rowSpacing, advance, MAX_SPEED, MIN_ROW_TIME, difficulty, newSim } from '../lib/game.ts';
import { missionById } from '../lib/campaign.ts';

test('every mission starts faster and has stronger pressure at the same relative progress', () => {
  for (const progress of [0.2, 0.5, 0.9]) {
    let previous;
    for (let id = 1; id <= 10; id++) {
      const s = newMissionSim(id);
      const d = simDifficulty(s, missionById(id).finish * progress);
      if (previous) {
        assert(s.speed > previous.speed);
        assert(d.density > previous.d.density);
        assert(d.walkerChance > previous.d.walkerChance);
        assert(d.walkerVMax > previous.d.walkerVMax);
        assert(d.speedCap > previous.d.speedCap);
        assert(rowSpacing(20, d.density) < rowSpacing(20, previous.d.density));
      }
      previous = { speed: s.speed, d };
    }
  }
});
test('campaign pressure rises within every mission without losing fair reaction time', () => {
  for (let id = 1; id <= 10; id++) {
    const s = newMissionSim(id);
    const opening = simDifficulty(s, 0);
    const middle = simDifficulty(s, missionById(id).finish / 2);
    const ending = simDifficulty(s, missionById(id).finish);
    assert(opening.grace); assert.equal(opening.walkerChance, 0);
    assert(ending.level > middle.level && middle.level > opening.level);
    assert(ending.speedCap >= middle.speedCap && ending.speedCap <= MAX_SPEED);
    for (const d of [opening, middle, ending]) for (const r of [0, 1])
      assert(rowSpacing(d.speedCap, d.density, r) / d.speedCap >= MIN_ROW_TIME);
    const before = s.speed;
    s.nextS = 1e9; s.turn.s = Infinity;
    for (let i = 0; i < 200; i++) advance(s, 0.1);
    assert(s.speed > before && s.speed <= simDifficulty(s).speedCap);
    const pressure = simDifficulty(s, 1000).level;
    s.campaign.finish += 1000;
    assert.equal(simDifficulty(s, 1000).level, pressure, 'missed items never lower difficulty');
  }
});
test('Endless keeps distance progression, but row density still matters at maximum speed', () => {
  const s = newSim('run');
  for (const dist of [0, 500, 1500, 3000, 10000])
    assert.deepEqual(simDifficulty(s, dist), difficulty(dist));
  assert(rowSpacing(MAX_SPEED, 1) < rowSpacing(MAX_SPEED, 0));
});
