import test from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, missionById, missionSection, missionObjective, normalizeCampaign, finishCampaignMission, missionUnlocked } from '../lib/campaign.ts';
import { newMissionSim, newSim, advance, setLane, requestTurn, turnInfo, simStageAt, simObstaclePoolIndex } from '../lib/game.ts';
import { normalizeProgress } from '../lib/progression.ts';

test('all ten linked missions have distinct endings, authored routes and correct item requirements', () => {
  assert.equal(MISSIONS.length, 10);
  assert.equal(new Set(MISSIONS.map((m) => m.scene)).size, 10);
  assert.equal(new Set(MISSIONS.map((m) => m.title)).size, 10);
  for (const m of MISSIONS) {
    assert(m.finish >= 1200);
    assert.equal(m.sections[0].from, 0);
    assert.equal(m.completion.length, 3);
    assert(m.turns.length > 0);
    if (m.item) assert(m.itemAt < m.finish - 100);
  }
  assert.throws(() => newMissionSim(0));
  assert.throws(() => newMissionSim(11));
});

test('one mission unlocks exactly the next; failed attempts do not alter saved campaign', () => {
  let p = normalizeCampaign();
  assert(missionUnlocked(p, 1)); assert(!missionUnlocked(p, 2));
  assert.equal(finishCampaignMission(p, 10, 200), p);
  for (let id = 1; id <= 10; id++) {
    assert(missionUnlocked(p, id));
    p = finishCampaignMission(p, id, 200);
    assert.equal(p.completed.length, id);
    if (id < 10) assert(missionUnlocked(p, id + 1));
    if (id < 9) assert(!missionUnlocked(p, id + 2));
  }
  p = finishCampaignMission(p, 1, 250);
  assert.equal(p.bestTimes[1], 200);
  p = finishCampaignMission(p, 1, 150);
  assert.equal(p.bestTimes[1], 150);
  assert.equal(p.completed.length, 10);
  assert.deepEqual(normalizeCampaign(JSON.parse(JSON.stringify(p))), p);
  assert.deepEqual(normalizeCampaign({ completed: [1, 3, 10] }).completed, [1]);
});

test('all ten missions can be completed by collecting goals and taking their actual authored corners', () => {
  for (const m of MISSIONS) {
    const s = newMissionSim(m.id);
    s.nextS = 1e9; // isolate route and mission state from separately tested random hazards
    let completed = 0;
    let activationSeen = false;
    for (let i = 0; i < 25000 && s.mode === 'run'; i++) {
      setLane(s, s.campaign.collected ? 0 : s.campaign.itemLane);
      if (turnInfo(s).open) requestTurn(s, s.turn.dir);
      const ev = advance(s, 0.1);
      completed += Number(ev.completed);
      if (s.campaign.activationT > 0) activationSeen = true;
    }
    assert.equal(s.mode, 'complete', m.title);
    assert.equal(completed, 1, m.title);
    assert.equal(s.dist, s.campaign.finish, m.title);
    assert.equal(s.campaign.collected, true);
    assert(s.turnsTaken >= 3);
    if (m.id === 10) assert(activationSeen && s.campaign.activated);
    const before = JSON.stringify(s);
    assert.equal(advance(s, 0.1).completed, false);
    assert.equal(JSON.stringify(s), before);
  }
});

test('missing an essential item opens a safe recovery opportunity and cannot complete the mission', () => {
  const s = newMissionSim(3); s.nextS = 1e9;
  s.turn.s = 1000;
  s.dist = s.campaign.itemAt + 5; s.px = -1; s.lane = -1;
  const originalFinish = s.campaign.finish;
  advance(s, 0.01);
  assert.equal(s.campaign.collected, false);
  assert.equal(s.campaign.recoveries, 1);
  assert(s.campaign.itemAt > s.dist + 100);
  assert(s.campaign.finish > originalFinish);
  assert(missionObjective(s.campaign, s.dist).startsWith('RECOVER'));
  s.dist = s.campaign.itemAt - 0.5; s.px = s.campaign.itemLane; s.lane = s.campaign.itemLane;
  s.turn.s = s.dist + 200;
  assert(advance(s, 0.05).missionPickup);
  assert(s.campaign.collected);
});

test('mission retry resets only its local state; legacy records and prior completions remain intact', () => {
  const raw = { best: 900, totalCoins: 45, campaign: { completed: [1, 2, 3], bestTimes: { 3: 123 } } };
  const p = normalizeProgress(raw);
  const s = newMissionSim(4); s.campaign.collected = true; s.campaign.recoveries = 3; s.dist = 600;
  const retry = newMissionSim(4);
  assert.equal(retry.dist, 0); assert.equal(retry.campaign.recoveries, 0);
  assert.equal(retry.campaign.id, 4);
  assert.deepEqual(p.campaign.completed, [1, 2, 3]);
  assert.equal(p.best, 900); assert.equal(p.totalCoins, 45);
  assert.deepEqual(normalizeProgress({ best: 500 }).campaign.completed, []);
});

test('police/hospital hazards and walkers follow mission sections rather than endless stage cycling', () => {
  const police = newMissionSim(3);
  assert.equal(simStageAt(police, 0), 'police');
  assert.equal(simStageAt(police, 1500), 'police');
  assert.equal(simObstaclePoolIndex(police, 10, 2, 'hurdle'), 4);
  const hospital = newMissionSim(5);
  assert.equal(simStageAt(hospital, 0), 'hospital');
  assert.equal(simObstaclePoolIndex(hospital, 10, 2, 'hurdle'), 8);
  const approach = newMissionSim(2);
  assert.equal(simStageAt(approach, 700), 'city');
  assert.equal(simStageAt(approach, 800), 'police');
  assert.equal(simStageAt(newSim('run'), 0), 'city');
});

test('ambulance branch choices affect distance and route, while both remain valid', () => {
  for (const dir of [-1, 1]) {
    const s = newMissionSim(4); s.nextS = 1e9; s.dist = 239.8;
    assert(s.turn.branch); requestTurn(s, dir); advance(s, 0.05);
    assert.equal(s.mode, 'run'); assert.equal(s.campaign.routeChoice, dir);
    assert.equal(s.campaign.finish, missionById(4).finish + (dir === -1 ? 160 : 0));
    assert.equal(missionSection(s.campaign, 700).dressing, dir === -1 ? 'residential' : 'tunnel');
  }
});

test('finale beacon activation pauses movement and must finish before the final sprint', () => {
  const s = newMissionSim(10); s.nextS = 1e9; s.turn.s = 1e9;
  s.campaign.collected = true; s.dist = 1950;
  advance(s, 0.01); assert(s.campaign.activationT > 0);
  const at = s.dist;
  advance(s, 0.1); assert.equal(s.dist, at);
  s.mode = 'paused'; const timer = s.campaign.activationT;
  advance(s, 0.1); assert.equal(s.campaign.activationT, timer);
  s.mode = 'run';
  for (let i = 0; i < 30; i++) advance(s, 0.1);
  assert(s.campaign.activated); assert(s.dist > at);
});
