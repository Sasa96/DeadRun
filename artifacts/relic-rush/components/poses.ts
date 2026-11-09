// Lightweight hand-posed animation for campaign NPCs and cutscene actors (no Sim needed).
import type { Rig } from '@/components/characters';

export function resetPose(r: Rig) {
  r.hips.position.y = 0.95;
  for (const b of [r.hips, r.torso, r.head, r.armL, r.armR, r.foreL, r.foreR, r.legL, r.legR, r.shinL, r.shinR]) b.rotation.set(0, 0, 0);
  r.armL.rotation.z = 0.08; r.armR.rotation.z = -0.08;
}
/** run/walk cycle; amt 0 = stand, 1 = full sprint */
export function runPose(r: Rig, t: number, amt = 1, rate = 9) {
  resetPose(r);
  const p = t * rate; const s = Math.sin(p); const c = Math.cos(p);
  r.legL.rotation.x = s * 0.9 * amt; r.legR.rotation.x = -s * 0.9 * amt;
  r.shinL.rotation.x = Math.max(0, -c) * 1.3 * amt; r.shinR.rotation.x = Math.max(0, c) * 1.3 * amt;
  r.armL.rotation.x = -s * 0.8 * amt; r.armR.rotation.x = s * 0.8 * amt;
  r.foreL.rotation.x = -0.9 * amt; r.foreR.rotation.x = -0.9 * amt;
  r.torso.rotation.x = -0.18 * amt; r.head.rotation.x = 0.12 * amt;
  r.hips.position.y = 0.95 + Math.abs(c) * 0.06 * amt;
}
export function idlePose(r: Rig, t: number) {
  resetPose(r);
  r.torso.rotation.x = Math.sin(t * 1.6) * 0.03; r.head.rotation.y = Math.sin(t * 0.7) * 0.25;
}
export function wavePose(r: Rig, t: number, arm: 'L' | 'R' = 'R') {
  idlePose(r, t);
  const a = arm === 'R' ? r.armR : r.armL; const f = arm === 'R' ? r.foreR : r.foreL;
  a.rotation.x = -2.6; a.rotation.z = (arm === 'R' ? -1 : 1) * (0.3 + Math.sin(t * 8) * 0.35); f.rotation.x = -0.4;
}
/** both arms forward at waist height (holding / inserting / operating) */
export function reachPose(r: Rig, t: number, k: number, lift = 1.2) {
  idlePose(r, t);
  r.armL.rotation.x = -lift * k; r.armR.rotation.x = -lift * k;
  r.foreL.rotation.x = -0.5 * k; r.foreR.rotation.x = -0.5 * k;
  r.torso.rotation.x = 0.12 * k;
}
/** pressed against a surface, catching breath */
export function slumpPose(r: Rig, t: number) {
  resetPose(r);
  r.torso.rotation.x = 0.35 + Math.sin(t * 4) * 0.05; r.head.rotation.x = 0.3;
  r.armL.rotation.x = -0.4; r.armR.rotation.x = -0.4; r.foreL.rotation.x = -0.8; r.foreR.rotation.x = -0.8;
  r.legL.rotation.x = -0.25; r.legR.rotation.x = -0.25; r.shinL.rotation.x = 0.5; r.shinR.rotation.x = 0.5;
  r.hips.position.y = 0.86;
}
