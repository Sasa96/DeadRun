import test from 'node:test';
import assert from 'node:assert/strict';
import { superviseLoop } from '../lib/loopPlayback.ts';

function fixture() {
  let time = 0, plays = 0, errors = 0;
  const seeks = [];
  const p = {
    playing: false, isLoaded: true, isBuffering: false,
    currentTime: 10, duration: 45, loop: true,
    play() { plays++; this.playing = true; },
    pause() { this.playing = false; },
    async seekTo(t) { seeks.push(t); this.currentTime = t; },
  };
  const loop = superviseLoop(p, () => errors++, () => time);
  return { p, loop, seeks, plays: () => plays, errors: () => errors, later: () => { time += 1600; } };
}

test('music starts after delayed loading and recovers an unexpected stop without rewinding', () => {
  const f = fixture(); f.p.isLoaded = false;
  f.loop.setWanted(true); assert.equal(f.plays(), 0);
  f.p.isLoaded = true; f.loop.tick(); assert.equal(f.plays(), 1);
  f.p.playing = false; f.later(); f.loop.tick();
  assert.equal(f.plays(), 2); assert.equal(f.p.currentTime, 10);
  assert.deepEqual(f.seeks, []);
});
test('pause, mute/background and disposal cannot be undone by recovery', () => {
  const f = fixture();
  f.loop.setWanted(true); f.loop.setWanted(false);
  f.later(); f.loop.tick(); assert.equal(f.plays(), 1);
  f.loop.setWanted(true); assert.equal(f.plays(), 2);
  f.loop.setWanted(false); f.loop.dispose();
  f.loop.setWanted(true); f.later(); f.loop.tick();
  assert.equal(f.plays(), 2); assert.equal(f.p.playing, false);
});
test('an interrupted loop ending rewinds once and resumes', async () => {
  const f = fixture(); f.p.currentTime = 45;
  f.loop.setWanted(true);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(f.seeks, [0]); assert.equal(f.plays(), 1);
  assert.equal(f.p.loop, true);
});
test('pending restart cannot play after pausing or unmounting', async () => {
  for (const dispose of [false, true]) {
    const f = fixture(); let release;
    f.p.seekTo = () => new Promise(resolve => { release = resolve; });
    f.loop.setWanted(true);
    const restart = f.loop.restart();
    f.loop.setWanted(false); if (dispose) f.loop.dispose();
    release(); await restart;
    assert.equal(f.plays(), 1); assert.equal(f.p.playing, false);
  }
});
test('recovery waits for buffering and bounds unsuccessful play attempts', () => {
  const f = fixture(); f.p.isBuffering = true;
  f.loop.setWanted(true); assert.equal(f.plays(), 0);
  let calls = 0; f.p.isBuffering = false; f.p.play = () => { calls++; };
  for (let i = 0; i < 10; i++) { f.later(); f.loop.tick(); }
  assert.equal(calls, 3); assert.equal(f.errors(), 1);
  f.loop.setWanted(false); f.loop.setWanted(true);
  assert.equal(calls, 4, 'explicit resume gets a fresh recovery attempt');
});
