// Stage-themed collision obstacles for the police station and hospital interiors.
// Silhouettes stay identical to the city rules: hurdle <= 0.8 m tall (jump), overhead parts
// start >= 1.3 m (slide under), gaps keep the same pit footprint. Cheap: shared unit box + a few shared materials.
import * as THREE from 'three';
import { OB_POOL_CAP, obstaclePoolIndex, type ObstacleType } from '@/lib/game';

const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });

export interface ThemedObstacles {
  /** flat array of pools; index via poolIndex() */
  pools: THREE.Group[][];
  poolIndex: (s: number, id: number, type: ObstacleType) => number;
}

export function buildThemedObstacles(opts: {
  world: THREE.Group; unit: THREE.BoxGeometry; LW: number; gapLen: number;
  reg: <G extends THREE.BufferGeometry>(g: G) => G; regM: <M extends THREE.Material>(m: M) => M;
  pitMat: THREE.Material; rimMat: THREE.Material;
  /** existing city pools, in order gap, hurdle, beam */
  city: [THREE.Group[], THREE.Group[], THREE.Group[]];
}): ThemedObstacles {
  const { world, unit, LW, gapLen, reg, regM, pitMat, rimMat } = opts;
  const W = LW * 0.9;
  const M = (c: string) => regM(lam(c));
  // police palette
  const deskWood = M('#6b5844'); const deskTop = M('#8a7458'); const steelGrey = M('#7d8790'); const darkSteel = M('#3a4048');
  const navy = M('#1f2d4d'); const tapeY = M('#e2b52a'); const screen = regM(new THREE.MeshBasicMaterial({ color: '#2f6c8a' }));
  const ledRed = regM(new THREE.MeshBasicMaterial({ color: '#e0453a' })); const ledGreen = regM(new THREE.MeshBasicMaterial({ color: '#56d17a' }));
  const paper = M('#e7e1cf');
  // hospital palette
  const sheet = M('#e9ece6'); const blanket = M('#5fa5a0'); const chrome = M('#b9c2c6'); const curtain = M('#8fc3bf');
  const curtainDark = M('#6aa6a2'); const cabinet = M('#dfe5e3'); const crossRed = M('#c8322b'); const wetY = M('#f0c419'); const blackM = M('#24262a');
  const cyl = reg(new THREE.CylinderGeometry(0.04, 0.04, 1, 6));

  const box = (g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, rz = 0) => {
    const b = new THREE.Mesh(unit, m); b.scale.set(w, h, d); b.position.set(x, y, z); if (rz) b.rotation.z = rz; g.add(b); return b;
  };
  const rod = (g: THREE.Group, m: THREE.Material, h: number, x: number, y: number, z: number) => {
    const r = new THREE.Mesh(cyl, m); r.scale.set(1, h, 1); r.position.set(x, y, z); g.add(r); return r;
  };
  const pool = (n: number, make: (g: THREE.Group) => void) => Array.from({ length: n }, () => {
    const g = new THREE.Group(); make(g); g.visible = false; world.add(g); return g;
  });
  const pit = (g: THREE.Group) => {
    const hole = new THREE.Mesh(unit, pitMat); hole.scale.set(LW * 0.92, 0.02, gapLen); hole.position.set(0, 0.015, -gapLen / 2); g.add(hole);
    for (const zz of [0, -gapLen]) box(g, rimMat, LW * 0.96, 0.12, 0.22, 0, 0.05, zz);
  };

  // ---------- POLICE ----------
  // gap: collapsed floor ringed by navy/white sawhorse barricades
  const polGap = pool(OB_POOL_CAP, (g) => {
    pit(g);
    for (const xx of [-0.78, 0.78]) {
      box(g, paper, 0.5, 0.14, 0.06, xx, 0.62, 0.38); box(g, navy, 0.5, 0.06, 0.07, xx, 0.62, 0.38);
      for (const lx of [-0.2, 0.2]) box(g, darkSteel, 0.05, 0.62, 0.05, xx + lx, 0.31, 0.38);
    }
  });
  // hurdle A: office desk shoved across the lane (front panel, top, monitor face-down, papers)
  const polDesk = pool(OB_POOL_CAP, (g) => {
    box(g, deskWood, W, 0.62, 0.12, 0, 0.33, 0.2);
    box(g, deskTop, W, 0.07, 0.72, 0, 0.7, 0);
    for (const xx of [-W / 2 + 0.24, W / 2 - 0.24]) box(g, deskWood, 0.42, 0.66, 0.6, xx, 0.33, -0.02);
    for (const xx of [-W / 2 + 0.24, W / 2 - 0.24]) for (const yy of [0.2, 0.46]) box(g, steelGrey, 0.26, 0.03, 0.02, xx, yy, 0.29);
    box(g, darkSteel, 0.56, 0.06, 0.38, -0.15, 0.77, -0.05); box(g, screen, 0.48, 0.02, 0.3, -0.15, 0.805, -0.05);
    box(g, paper, 0.3, 0.02, 0.22, 0.48, 0.745, 0.08, 0.1);
    box(g, tapeY, W, 0.06, 0.02, 0, 0.6, 0.27);
  });
  // hurdle B: toppled filing cabinets lying on their backs, drawers facing you
  const polFiles = pool(OB_POOL_CAP, (g) => {
    for (const xx of [-0.45, 0.45]) {
      box(g, steelGrey, 0.86, 0.5, 0.62, xx, 0.25, 0);
      for (let i = 0; i < 3; i++) {
        box(g, darkSteel, 0.24, 0.42, 0.02, xx - 0.28 + i * 0.28, 0.25, 0.32);
        box(g, chrome, 0.12, 0.04, 0.03, xx - 0.28 + i * 0.28, 0.4, 0.34);
      }
    }
    box(g, paper, 0.36, 0.03, 0.26, 0.1, 0.52, 0.05, -0.15); box(g, paper, 0.3, 0.03, 0.22, -0.55, 0.52, -0.1, 0.12);
  });
  // beam: walk-through metal detector at head height + light bar; open below 1.3 m
  const polBeam = pool(OB_POOL_CAP, (g) => {
    for (const sg of [-1, 1]) {
      box(g, darkSteel, 0.16, 2.35, 0.5, sg * LW * 0.47, 1.17, 0);
      box(g, steelGrey, 0.03, 1.6, 0.4, sg * (LW * 0.47 - 0.095), 1.1, 0);
    }
    box(g, darkSteel, LW * 0.98, 0.95, 0.56, 0, 1.82, 0);
    box(g, steelGrey, LW * 0.9, 0.12, 0.6, 0, 1.36, 0);
    box(g, tapeY, LW * 0.9, 0.08, 0.02, 0, 1.47, 0.29);
    box(g, navy, 1.2, 0.3, 0.04, 0, 1.92, 0.29);
    box(g, ledRed, 0.18, 0.12, 0.04, -0.3, 2.18, 0.29); box(g, ledGreen, 0.18, 0.12, 0.04, 0.3, 2.18, 0.29);
  });

  // ---------- HOSPITAL ----------
  // gap: broken floor with yellow wet-floor A-frames
  const hosGap = pool(OB_POOL_CAP, (g) => {
    pit(g);
    for (const xx of [-0.78, 0.78]) {
      box(g, wetY, 0.34, 0.6, 0.04, xx, 0.3, 0.46, 0); box(g, wetY, 0.34, 0.6, 0.04, xx, 0.3, 0.3);
      box(g, blackM, 0.2, 0.05, 0.01, xx, 0.38, 0.485);
    }
  });
  // hurdle A: hospital bed across the lane (rails, mattress, pillow, footboard)
  const hosBed = pool(OB_POOL_CAP, (g) => {
    box(g, chrome, W, 0.06, 0.82, 0, 0.36, 0);
    for (const xx of [-W / 2 + 0.06, W / 2 - 0.06]) for (const zz of [-0.36, 0.36]) rod(g, chrome, 0.34, xx, 0.17, zz);
    box(g, sheet, W - 0.12, 0.2, 0.76, 0, 0.49, 0);
    box(g, blanket, W * 0.6, 0.06, 0.78, 0.18, 0.62, 0);
    box(g, sheet, 0.36, 0.1, 0.5, -W / 2 + 0.3, 0.64, 0);
    box(g, chrome, W * 0.7, 0.04, 0.03, 0.1, 0.72, 0.42); box(g, chrome, W * 0.7, 0.04, 0.03, 0.1, 0.72, -0.42);
    box(g, cabinet, 0.08, 0.42, 0.84, W / 2, 0.58, 0);
  });
  // hurdle B: gurney + toppled red-cross supply cabinet
  const hosCart = pool(OB_POOL_CAP, (g) => {
    box(g, chrome, 1.1, 0.05, 0.6, -0.35, 0.62, 0); box(g, sheet, 1.06, 0.1, 0.56, -0.35, 0.69, 0);
    for (const xx of [-0.85, 0.15]) rod(g, chrome, 0.6, xx, 0.3, 0);
    box(g, blackM, 1.0, 0.04, 0.04, -0.35, 0.08, 0);
    box(g, cabinet, 0.62, 0.48, 0.66, 0.55, 0.24, 0);
    box(g, crossRed, 0.24, 0.07, 0.02, 0.55, 0.28, 0.34); box(g, crossRed, 0.07, 0.24, 0.02, 0.55, 0.28, 0.34);
  });
  // beam: privacy curtain on a ceiling track, hem at 1.35 m, with IV poles at the edges
  const hosBeam = pool(OB_POOL_CAP, (g) => {
    box(g, chrome, LW * 0.98, 0.06, 0.08, 0, 2.32, 0);
    const n = 6; const pw = (LW * 0.94) / n;
    for (let i = 0; i < n; i++) box(g, i % 2 ? curtainDark : curtain, pw, 0.92, 0.06, -LW * 0.47 + pw / 2 + i * pw, 1.84, (i % 2) * 0.05);
    box(g, sheet, LW * 0.94, 0.08, 0.1, 0, 1.4, 0.02);
    for (const sg of [-1, 1]) {
      rod(g, chrome, 2.3, sg * LW * 0.47, 1.15, 0.1);
      box(g, sheet, 0.14, 0.22, 0.06, sg * LW * 0.47, 2.1, 0.12);
    }
    box(g, crossRed, 0.3, 0.09, 0.02, 0, 1.95, 0.1); box(g, crossRed, 0.09, 0.3, 0.02, 0, 1.95, 0.1);
  });

  const [cGap, cHurdle, cBeam] = opts.city;
  // order: city gap,hurdle,beam | police gap,hurdleA,hurdleB,beam | hospital gap,hurdleA,hurdleB,beam
  const pools = [cGap, cHurdle, cBeam, polGap, polDesk, polFiles, polBeam, hosGap, hosBed, hosCart, hosBeam];
  const poolIndex = obstaclePoolIndex;
  return { pools, poolIndex };
}
