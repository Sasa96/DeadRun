import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { Feather } from '@expo/vector-icons';
import colors, { scene as C } from '@/constants/colors';
import { GAP_LEN, OB_POOL_CAP, STAGE_KINDS, STAGE_LEN, routeInfo, simObstaclePoolIndex, simStageAt, stageAt, type Sim, type StageId } from '@/lib/game';
import { textGeo } from '@/components/pixelText';
import { buildThemedObstacles } from '@/components/themedObstacles';
import { createIntro, type Intro } from '@/components/IntroCinematic';
import { createMissionCutscene, type MissionCutscene } from '@/components/MissionCutscene';
import { buildMissionScenery, type Placer } from '@/components/missionScenery';
import { missionById } from '@/lib/campaign';
import { animateSurvivor, animateZombie, animateZombieCharge, animateZombieCrawl, buildSurvivor, buildZombie, cloneRig, ZOMBIE_KINDS, type OutfitLook } from '@/components/characters';

const T = colors.light;
const LW = 2.0; // metres between lane centres
const VIS = 85; // max forward render distance

export interface SceneApi {
  render: (sim: Sim) => void;
  /** draw the opening cinematic at time t (s); builds intro resources lazily */
  renderIntro: (t: number) => void;
  /** dispose intro resources (idempotent) */
  endIntro: () => void;
  /** draw the completion cutscene for a campaign mission at time t (s); builds lazily */
  renderMissionCutscene: (id: number, t: number) => void;
  /** dispose cutscene resources (idempotent) */
  endMissionCutscene: () => void;
}
interface Props { width: number; height: number; onReady: (api: SceneApi | null) => void }

// ---------- helpers ----------
function hash(n: number) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });
const basic = (c: string, extra: THREE.MeshBasicMaterialParameters = {}) => new THREE.MeshBasicMaterial({ color: c, ...extra });

function makeFacadeGeo(seed: number) {
  // unit-space window grid on the +x face of a 1x1x1 box
  const pos: number[] = []; const col: number[] = [];
  const lit = new THREE.Color(C.windowLit); const dim = new THREE.Color(C.windowDim);
  const rows = 9; const colsN = 5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < colsN; c++) {
    const y0 = -0.45 + r * (0.9 / rows) + 0.02; const y1 = y0 + 0.9 / rows - 0.05;
    const z0 = -0.42 + c * (0.84 / colsN) + 0.03; const z1 = z0 + 0.84 / colsN - 0.07;
    const k = hash(seed * 97 + r * 13 + c);
    const cc = k > 0.82 ? lit : dim;
    const x = 0.502;
    pos.push(x, y0, z0, x, y1, z0, x, y1, z1, x, y0, z0, x, y1, z1, x, y0, z1);
    for (let i = 0; i < 6; i++) col.push(cc.r, cc.g, cc.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// ---------- engine ----------
function createEngine(gl: ExpoWebGLRenderingContext, w: number, h: number) {
  const isWeb = Platform.OS === 'web';
  const canvas = isWeb && (gl as unknown as { canvas?: HTMLCanvasElement }).canvas
    ? (gl as unknown as { canvas: HTMLCanvasElement }).canvas
    : ({
      width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, style: {}, clientHeight: gl.drawingBufferHeight,
      addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
    } as unknown as HTMLCanvasElement);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
  renderer.setClearColor(new THREE.Color(C.fog));
  renderer.shadowMap.enabled = false;

  const scn = new THREE.Scene();
  scn.fog = new THREE.Fog(C.fog, 22, VIS);
  const cam = new THREE.PerspectiveCamera(62, w / Math.max(1, h), 0.1, 260);

  const hemiL = new THREE.HemisphereLight(C.skyLow, C.asphaltDark, 1.25); scn.add(hemiL);
  const sunL = new THREE.DirectionalLight(C.sun, 1.6); sunL.position.set(-6, 7, -12); scn.add(sunL);
  const rim = new THREE.DirectionalLight(C.supply, 0.35); rim.position.set(5, 4, 8); scn.add(rim);

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const reg = <G extends THREE.BufferGeometry>(g: G) => { geos.push(g); return g; };
  const regM = <M extends THREE.Material>(m: M) => { mats.push(m); return m; };

  // sky backdrop
  const skyGeo = reg(new THREE.PlaneGeometry(520, 160, 1, 4));
  const sc = new THREE.Color(); const skyCols: number[] = [];
  const sp = skyGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const t = (sp.getY(i) + 80) / 160;
    if (t > 0.5) sc.set(C.skyMid).lerp(new THREE.Color(C.skyTop), (t - 0.5) * 2); else sc.set(C.skyLow).lerp(new THREE.Color(C.skyMid), t * 2);
    skyCols.push(sc.r, sc.g, sc.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCols, 3));
  const sky = new THREE.Mesh(skyGeo, regM(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false })));
  sky.position.set(0, 52, -200); scn.add(sky);
  const sun = new THREE.Mesh(reg(new THREE.CircleGeometry(14, 32)), regM(basic(C.sun, { fog: false, transparent: true, opacity: 0.9 })));
  sun.position.set(-18, 10, -190); scn.add(sun);
  const halo = new THREE.Mesh(reg(new THREE.CircleGeometry(30, 32)), regM(basic(C.sun, { fog: false, transparent: true, opacity: 0.18, depthWrite: false })));
  halo.position.set(-18, 10, -191); scn.add(halo);
  // skyline silhouettes
  const silMat = regM(basic(C.silhouette, { fog: false }));
  const unit = reg(new THREE.BoxGeometry(1, 1, 1));
  const skyline = new THREE.Group(); scn.add(skyline);
  for (let i = 0; i < 26; i++) {
    const bh = 10 + hash(i) * 34; const bw = 6 + hash(i + 50) * 10;
    const b = new THREE.Mesh(unit, silMat); b.scale.set(bw, bh, 6);
    b.position.set(-130 + i * 10.5 + hash(i + 9) * 4, bh / 2 - 2, -170); skyline.add(b);
  }
  const smokeMat = regM(basic(C.smoke, { fog: false, transparent: true, opacity: 0.55, depthWrite: false }));
  const smokes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(reg(new THREE.CylinderGeometry(4 + i, 1.5, 70, 6, 1, true)), smokeMat);
    s.position.set(-60 + i * 55, 30, -165); scn.add(s); smokes.push(s);
  }

  // ---------- street world (segment-local frames) ----------
  const world = new THREE.Group(); scn.add(world);
  const HW = LW * 1.5 + 0.6; const SW = 5;
  const roadMat = regM(lam(C.asphalt));
  const walkMat = regM(lam(C.sidewalk)); const curbMat = regM(lam(C.curb));
  // stage palettes: city street, police precinct interior, hospital ward interior
  interface StageMats { road: THREE.Material; walk: THREE.Material; curb: THREE.Material; wall: THREE.Material | null; band: THREE.Material | null; ceil: THREE.Material | null }
  const SM: Record<StageId, StageMats> = {
    city: { road: roadMat, walk: walkMat, curb: curbMat, wall: null, band: null, ceil: null },
    police: { road: regM(lam('#56637A')), walk: regM(lam('#6C788C')), curb: regM(lam('#C9CED6')), wall: regM(lam('#25334F')), band: regM(basic('#3E74D8')), ceil: regM(lam('#2C384E')) },
    hospital: { road: regM(lam('#B6C8C0')), walk: regM(lam('#D0DAD3')), curb: regM(lam('#3C9894')), wall: regM(lam('#E0E5DC')), band: regM(lam('#3C9894')), ceil: regM(lam('#C4CDC6')) },
  };
  const FOG: Record<StageId, THREE.Color> = { city: new THREE.Color(C.fog), police: new THREE.Color('#283550'), hospital: new THREE.Color('#BCD0C8') };
  const fogNow = new THREE.Color(C.fog);
  // generic box pieces for floors, sidewalks, curbs, interior walls and ceilings
  const pieces: THREE.Mesh[] = [];
  for (let i = 0; i < 132; i++) { const m = new THREE.Mesh(unit, roadMat); m.visible = false; world.add(m); pieces.push(m); }
  const crackMat = regM(basic(C.asphaltDark));
  const crackGeo = reg(new THREE.PlaneGeometry(1, 1));
  const cracks: THREE.Mesh[] = [];
  for (let i = 0; i < 12; i++) { const c = new THREE.Mesh(crackGeo, crackMat); c.rotation.order = 'YXZ'; world.add(c); cracks.push(c); }

  // buildings
  const bMats = [regM(lam(C.bldA)), regM(lam(C.bldB)), regM(lam(C.bldC))];
  const trimMat = regM(lam(C.bldTrim));
  const winMat = regM(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const facades = [reg(makeFacadeGeo(1)), reg(makeFacadeGeo(2)), reg(makeFacadeGeo(3))];
  const BSP = 10;
  type Bld = { g: THREE.Group; body: THREE.Mesh; face: THREE.Mesh; roof: THREE.Mesh };
  const blds: Bld[] = [];
  for (let k = 0; k < 46; k++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(unit, bMats[0]); g.add(body);
    const face = new THREE.Mesh(facades[0], winMat); g.add(face);
    const roof = new THREE.Mesh(unit, trimMat); g.add(roof);
    g.visible = false; world.add(g); blds.push({ g, body, face, roof });
  }

  // street lamps
  const postMat = regM(lam(C.bldTrim));
  const lampMat = regM(basic(C.lampGlow));
  const poolMat = regM(basic(C.lampGlow, { transparent: true, opacity: 0.16, depthWrite: false }));
  const postGeo = reg(new THREE.CylinderGeometry(0.07, 0.09, 5, 6));
  const armGeo = reg(new THREE.BoxGeometry(1.4, 0.08, 0.08));
  const bulbGeo = reg(new THREE.BoxGeometry(0.45, 0.12, 0.25));
  const poolGeo = reg(new THREE.CircleGeometry(2.2, 20));
  const LSP = 20;
  const lamps: { g: THREE.Group; pool: THREE.Mesh; bulb: THREE.Mesh; arm: THREE.Mesh }[] = [];
  for (let k = 0; k < 14; k++) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(postGeo, postMat); post.position.y = 2.5; g.add(post);
    const arm = new THREE.Mesh(armGeo, postMat); arm.position.set(0.65, 4.95, 0); g.add(arm);
    const bulb = new THREE.Mesh(bulbGeo, lampMat); bulb.position.set(1.25, 4.85, 0); g.add(bulb);
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(1.6, 0.03, 0); g.add(pool);
    g.visible = false; world.add(g); lamps.push({ g, pool, bulb, arm });
  }

  // wrecked cars
  const carMats = [regM(lam(C.carRust)), regM(lam(C.carTeal)), regM(lam(C.carCream))];
  const glassMat = regM(lam(C.glass)); const tireMat = regM(lam(C.tire));
  const wheelGeo = reg(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10));
  const CSP = 27;
  const cars: { g: THREE.Group; body: THREE.Mesh }[] = [];
  for (let k = 0; k < 8; k++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(unit, carMats[0]); body.scale.set(1.8, 0.65, 4.1); body.position.y = 0.62; g.add(body);
    const cab = new THREE.Mesh(unit, glassMat); cab.scale.set(1.55, 0.55, 2.1); cab.position.set(0, 1.2, 0.2); g.add(cab);
    for (const wx of [-0.85, 0.85]) for (const wz of [-1.35, 1.35]) {
      const wh = new THREE.Mesh(wheelGeo, tireMat); wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.32, wz); g.add(wh);
    }
    g.visible = false; world.add(g); cars.push({ g, body });
  }

  // junction props: dead-end barricade + mirrored arrow signage (scale.x = dir)
  const concreteJ = regM(lam(C.concrete)); const hazardJ = regM(lam(C.hazard)); const inkJ = regM(lam(C.hazardDark));
  const paintJ = regM(basic(C.laneMark, { transparent: true, opacity: 0.85 }));
  const glowJ = regM(basic(C.hazard));
  const junctions = [0, 1].map(() => {
    const g = new THREE.Group();
    const add = (parent: THREE.Object3D, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, rz = 0, ry = 0) => {
      const m = new THREE.Mesh(unit, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(0, ry, rz); parent.add(m); return m;
    };
    const wallZ = -(HW + 0.6);
    add(g, concreteJ, HW * 2, 0.85, 0.55, 0, 0.42, wallZ);
    add(g, hazardJ, HW * 2, 0.16, 0.57, 0, 0.6, wallZ);
    add(g, inkJ, HW * 2 + SW, 2.6, 0.08, 0, 1.3, wallZ - 0.5);
    const mir = new THREE.Group(); g.add(mir);
    // big arrow board on the dead-end fence
    add(mir, hazardJ, 3.4, 1.3, 0.1, 0, 2.15, wallZ - 0.42);
    for (let i = 0; i < 3; i++) {
      const x = -0.9 + i * 0.85;
      add(mir, inkJ, 0.62, 0.16, 0.06, x, 2.34, wallZ - 0.34, -Math.PI / 4);
      add(mir, inkJ, 0.62, 0.16, 0.06, x, 1.96, wallZ - 0.34, Math.PI / 4);
    }
    // painted bent arrows on the asphalt before the corner
    for (const z0 of [9, 22]) {
      add(mir, paintJ, 0.42, 0.02, 3.2, 0, 0.022, z0 + 0.6);
      add(mir, paintJ, 1.5, 0.02, 0.42, 0.55, 0.022, z0 - 0.8);
      add(mir, paintJ, 0.95, 0.02, 0.3, 1.25, 0.022, z0 - 0.55, 0, -Math.PI / 4);
      add(mir, paintJ, 0.95, 0.02, 0.3, 1.25, 0.022, z0 - 1.05, 0, Math.PI / 4);
    }
    // roadside warning diamond on the opening side
    for (const z0 of [40, 16]) {
      add(mir, inkJ, 0.1, 2.6, 0.1, HW + 0.9, 1.3, z0);
      add(mir, hazardJ, 0.95, 0.95, 0.06, HW + 0.9, 2.7, z0, Math.PI / 4);
      add(mir, inkJ, 0.42, 0.1, 0.08, HW + 0.9, 2.78, z0 + 0.01, -Math.PI / 4);
      add(mir, inkJ, 0.42, 0.1, 0.08, HW + 0.9, 2.62, z0 + 0.01, Math.PI / 4);
    }
    // amber corner beacons
    add(mir, glowJ, 0.18, 0.18, 0.18, HW + 0.4, 1.0, -HW - 0.2);
    add(mir, glowJ, 0.18, 0.18, 0.18, HW + 0.4, 1.0, HW + 0.2);
    // branch splits: a mirrored copy shares geometry/materials and lights the second opening
    const mir2 = mir.clone(true); mir2.visible = false; g.add(mir2);
    g.visible = false; world.add(g);
    return { g, mir, mir2 };
  });

  // ---------- interior dressing ----------
  const mk = (parent: THREE.Object3D, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(unit, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(0, ry, rz); parent.add(m); return m;
  };
  const steel = regM(lam('#8E98A4')); const darkSteel = regM(lam('#3A4250')); const wood = regM(lam('#6E5A48'));
  const navy = regM(lam('#22304C')); const copBlue = regM(basic('#3E74D8')); const copRed = regM(basic('#D8433E'));
  const screenM = regM(basic('#7FC4E8')); const sheet = regM(lam('#E8ECE6')); const mint = regM(lam('#8CC4B4'));
  const curtainM = regM(lam('#9CC8B8')); const crossRed = regM(basic('#D23A40')); const signWhite = regM(basic('#F2F0E8'));
  const exitGreen = regM(basic('#3EB86A')); const lightPanel = regM(basic('#EEF4F2'));
  // props live on the sidewalk band; local +x faces the corridor
  const propMakers: Record<string, () => THREE.Group> = {
    desk: () => { const g = new THREE.Group(); mk(g, wood, 1.4, 0.08, 2.4, 0, 0.78, 0); mk(g, darkSteel, 1.2, 0.74, 0.08, 0, 0.37, 1.1); mk(g, darkSteel, 1.2, 0.74, 0.08, 0, 0.37, -1.1); mk(g, darkSteel, 0.5, 0.42, 0.06, -0.2, 1.05, 0.3, Math.PI / 2); mk(g, screenM, 0.44, 0.34, 0.02, -0.16, 1.05, 0.3, Math.PI / 2); mk(g, sheet, 0.3, 0.02, 0.4, 0.2, 0.83, -0.5); return g; },
    lockers: () => { const g = new THREE.Group(); mk(g, steel, 0.6, 2.2, 3.2, -0.9, 1.1, 0); for (let i = 0; i < 4; i++) mk(g, darkSteel, 0.02, 2.0, 0.04, -0.59, 1.1, -1.2 + i * 0.8); for (let i = 0; i < 4; i++) mk(g, darkSteel, 0.02, 0.12, 0.3, -0.59, 1.9, -1.2 + i * 0.8 + 0.4); return g; },
    barrier: () => { const g = new THREE.Group(); mk(g, darkSteel, 0.14, 2.3, 0.14, 0.6, 1.15, -0.5); mk(g, darkSteel, 0.14, 2.3, 0.14, -1.2, 1.15, -0.5); mk(g, steel, 2.0, 0.3, 0.3, -0.3, 2.3, -0.5); mk(g, copBlue, 0.5, 0.1, 0.32, -0.3, 2.47, -0.5); mk(g, steel, 1.6, 0.08, 0.08, -0.3, 1.0, 0.8); mk(g, steel, 0.08, 1.0, 0.08, 0.5, 0.5, 0.8); mk(g, steel, 0.08, 1.0, 0.08, -1.1, 0.5, 0.8); return g; },
    bench: () => { const g = new THREE.Group(); mk(g, navy, 0.6, 0.1, 2.6, -0.4, 0.5, 0); mk(g, navy, 0.1, 0.6, 2.6, -0.7, 0.8, 0); mk(g, darkSteel, 0.5, 0.5, 0.08, -0.4, 0.25, 1.1); mk(g, darkSteel, 0.5, 0.5, 0.08, -0.4, 0.25, -1.1); return g; },
    bed: () => { const g = new THREE.Group(); mk(g, steel, 1.0, 0.1, 2.1, -0.2, 0.55, 0); mk(g, sheet, 0.95, 0.18, 1.9, -0.2, 0.7, 0.05); mk(g, mint, 0.96, 0.06, 1.0, -0.2, 0.81, 0.45); mk(g, sheet, 0.6, 0.12, 0.35, -0.2, 0.84, -0.75); mk(g, steel, 1.0, 0.7, 0.06, -0.2, 0.75, -1.05); for (const z of [-0.95, 0.95]) for (const x of [-0.6, 0.2]) mk(g, darkSteel, 0.05, 0.5, 0.05, x, 0.25, z); mk(g, steel, 0.04, 1.8, 0.04, -0.85, 0.9, -1.1); mk(g, screenM, 0.18, 0.3, 0.06, -0.85, 1.75, -1.1); return g; },
    gurney: () => { const g = new THREE.Group(); mk(g, steel, 0.7, 0.06, 2.0, 0.1, 0.85, 0, 0.12); mk(g, sheet, 0.66, 0.1, 1.8, 0.1, 0.92, 0, 0.12); for (const z of [-0.8, 0.8]) mk(g, darkSteel, 0.05, 0.8, 0.05, 0.1, 0.42, z); mk(g, crossRed, 0.5, 0.02, 0.3, 0.1, 0.98, 0.4, 0.12); return g; },
    curtain: () => { const g = new THREE.Group(); mk(g, steel, 0.05, 0.05, 3.0, 0.4, 2.4, 0); for (let i = 0; i < 6; i++) mk(g, curtainM, 0.04, 2.0, 0.5, 0.4 + (i % 2) * 0.06, 1.35, -1.25 + i * 0.5); mk(g, sheet, 0.8, 0.5, 1.8, -0.6, 0.6, 0); return g; },
    cabinet: () => { const g = new THREE.Group(); mk(g, sheet, 0.5, 1.6, 1.4, -0.8, 0.8, 0); mk(g, crossRed, 0.02, 0.36, 0.1, -0.54, 1.25, 0); mk(g, crossRed, 0.02, 0.1, 0.36, -0.54, 1.25, 0); mk(g, steel, 0.02, 0.6, 0.02, -0.54, 0.6, 0.3); return g; },
  };
  const PROPS: Record<StageId, string[]> = { city: [], police: ['desk', 'lockers', 'barrier', 'bench'], hospital: ['bed', 'gurney', 'curtain', 'cabinet'] };
  const propPools: Record<string, THREE.Group[]> = {};
  for (const k of Object.keys(propMakers)) propPools[k] = Array.from({ length: 6 }, () => { const g = propMakers[k](); g.visible = false; world.add(g); return g; });
  const propUse: Record<string, number> = {};
  // text signs
  const txtPolice = reg(textGeo('POLICE', 0.13)); const txtHosp = reg(textGeo('HOSPITAL', 0.12)); const txtExit = reg(textGeo('EXIT', 0.14));
  const wallSign = (st: StageId) => {
    const g = new THREE.Group();
    if (st === 'police') {
      mk(g, navy, 2.4, 1.0, 0.06, 0, 0, -0.04); mk(g, copBlue, 2.4, 0.08, 0.07, 0, -0.46, -0.03);
      const t = new THREE.Mesh(txtPolice, signWhite); t.position.z = 0.002; g.add(t);
    } else {
      mk(g, signWhite, 2.9, 1.0, 0.06, 0, 0, -0.04);
      mk(g, crossRed, 0.5, 0.16, 0.02, -1.1, 0, 0); mk(g, crossRed, 0.16, 0.5, 0.02, -1.1, 0, 0);
      const t = new THREE.Mesh(txtHosp, crossRed); t.scale.setScalar(0.8); t.position.set(0.3, 0, 0.002); g.add(t);
    }
    g.visible = false; world.add(g); return g;
  };
  const signPools: Record<'police' | 'hospital', THREE.Group[]> = { police: [0, 1, 2, 3].map(() => wallSign('police')), hospital: [0, 1, 2, 3].map(() => wallSign('hospital')) };
  const ceilLights: THREE.Mesh[] = [];
  for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(unit, lightPanel); m.scale.set(1.8, 0.06, 0.6); m.visible = false; world.add(m); ceilLights.push(m); }
  const strobes: THREE.Mesh[] = [];
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(unit, copBlue); m.scale.set(0.14, 0.2, 0.5); m.visible = false; world.add(m); strobes.push(m); }
  // stage entrances: building facade + header sign across the corridor mouth (faces +z, toward the runner)
  const FW = HW + SW;
  const portal = (st: StageId) => {
    const g = new THREE.Group();
    const face = st === 'police' ? navy : st === 'hospital' ? sheet : darkSteel;
    for (const sg of [-1, 1]) mk(g, face, 16, 14, 0.8, sg * (FW + 8.2), 7, 0);
    mk(g, face, FW * 2 + 0.4, 7.6, 0.8, 0, 6.2 + 3.8, 0);
    for (const sg of [-1, 1]) mk(g, steel, 0.5, 6.4, 1.0, sg * (FW + 0.25), 3.2, 0);
    if (st === 'police') {
      mk(g, signWhite, 6.0, 1.5, 0.1, 0, 7.6, 0.46);
      const t = new THREE.Mesh(txtPolice, navy); t.scale.setScalar(1.7); t.position.set(0, 7.6, 0.52); g.add(t);
      for (let i = 0; i < 6; i++) mk(g, i % 2 ? copRed : copBlue, 0.9, 0.24, 0.3, -2.25 + i * 0.9, 6.55, 0.5);
      for (const sg of [-1, 1]) { mk(g, copBlue, 0.6, 0.6, 0.12, sg * (FW + 3), 9.2, 0.45); }
    } else if (st === 'hospital') {
      mk(g, signWhite, 7.4, 1.5, 0.1, 0, 7.6, 0.46);
      const t = new THREE.Mesh(txtHosp, crossRed); t.scale.setScalar(1.6); t.position.set(0.5, 7.6, 0.52); g.add(t);
      mk(g, crossRed, 2.4, 0.8, 0.2, 0, 11.2, 0.5); mk(g, crossRed, 0.8, 2.4, 0.2, 0, 11.2, 0.5);
      mk(g, crossRed, 0.36, 0.12, 0.1, -3.0, 7.6, 0.53); mk(g, crossRed, 0.12, 0.36, 0.1, -3.0, 7.6, 0.53);
    } else {
      mk(g, exitGreen, 3.0, 1.1, 0.1, 0, 5.6, -0.46);
      const t = new THREE.Mesh(txtExit, signWhite); t.scale.setScalar(1.2); t.rotation.y = Math.PI; t.position.set(0, 5.6, -0.52); g.add(t);
    }
    g.visible = false; world.add(g); return g;
  };
  const portals: Record<StageId, THREE.Group> = { city: portal('city'), police: portal('police'), hospital: portal('hospital') };

  // obstacles
  const concrete = regM(lam(C.concrete)); const hazard = regM(lam(C.hazard)); const hazardDark = regM(lam(C.hazardDark));
  const red = regM(lam(C.barrierRed)); const white = regM(lam(C.barrierWhite));
  const pitMat = regM(basic(C.pit)); const rimMat = regM(lam(C.pitRim));
  const mkPool = <X,>(n: number, make: () => X) => Array.from({ length: n }, make);
  const gapPool = mkPool(OB_POOL_CAP, () => {
    const g = new THREE.Group();
    const hole = new THREE.Mesh(unit, pitMat); hole.scale.set(LW * 0.92, 0.02, GAP_LEN); hole.position.set(0, 0.015, -GAP_LEN / 2); g.add(hole);
    for (const zz of [0, -GAP_LEN]) {
      const lip = new THREE.Mesh(unit, rimMat); lip.scale.set(LW * 0.96, 0.12, 0.22); lip.position.set(0, 0.05, zz); lip.rotation.z = zz ? 0.04 : -0.05; g.add(lip);
    }
    for (const xx of [-0.8, 0.8]) {
      const cone = new THREE.Mesh(reg(new THREE.ConeGeometry(0.16, 0.5, 6)), hazard); cone.position.set(xx, 0.25, 0.35); g.add(cone);
    }
    g.visible = false; world.add(g); return g;
  });
  const hurdlePool = mkPool(OB_POOL_CAP, () => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(unit, concrete); base.scale.set(LW * 0.9, 0.3, 0.6); base.position.y = 0.15; g.add(base);
    const top = new THREE.Mesh(unit, concrete); top.scale.set(LW * 0.9, 0.5, 0.3); top.position.y = 0.55; g.add(top);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(unit, i % 2 ? hazardDark : hazard); st.scale.set(LW * 0.9 / 4, 0.14, 0.02); st.position.set(-LW * 0.45 + LW * 0.9 / 8 + i * LW * 0.9 / 4, 0.62, 0.16); g.add(st);
    }
    g.visible = false; world.add(g); return g;
  });
  const beamPool = mkPool(OB_POOL_CAP, () => {
    const g = new THREE.Group();
    for (const xx of [-LW * 0.47, LW * 0.47]) { const p = new THREE.Mesh(unit, hazardDark); p.scale.set(0.16, 2.3, 0.16); p.position.set(xx, 1.15, 0); g.add(p); }
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(unit, i % 2 ? white : red); s.scale.set(LW * 0.94 / 6, 0.3, 0.14); s.position.set(-LW * 0.47 + LW * 0.94 / 12 + i * LW * 0.94 / 6, 1.45, 0); g.add(s);
    }
    const sign = new THREE.Mesh(unit, hazard); sign.scale.set(1.0, 0.42, 0.05); sign.position.set(0, 1.98, 0); g.add(sign);
    const band = new THREE.Mesh(unit, hazardDark); band.scale.set(0.8, 0.08, 0.06); band.position.set(0, 1.98, 0); g.add(band);
    g.visible = false; world.add(g); return g;
  });

  const themed = buildThemedObstacles({ world, unit, LW, gapLen: GAP_LEN, reg, regM, pitMat, rimMat, city: [gapPool, hurdlePool, beamPool] });
  const obPools = themed.pools; const obCount = new Int32Array(obPools.length);
  // supplies
  const caseMat = regM(lam(C.supplyCase)); const glowMat = regM(basic(C.supply));
  const canGeo = reg(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 8)); const capGeo = reg(new THREE.CylinderGeometry(0.21, 0.21, 0.1, 8));
  const supPool = mkPool(40, () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(canGeo, caseMat));
    const c1 = new THREE.Mesh(capGeo, glowMat); c1.position.y = 0.2; g.add(c1);
    const c2 = new THREE.Mesh(capGeo, glowMat); c2.position.y = -0.2; g.add(c2);
    g.rotation.z = 0.35; g.visible = false; world.add(g); return g;
  });
  const ringMat = regM(basic(C.ring, { transparent: true, opacity: 1, depthWrite: false }));
  const ringGeo = reg(new THREE.RingGeometry(0.3, 0.4, 20));
  const ringPool = mkPool(8, () => { const r = new THREE.Mesh(ringGeo, ringMat.clone()); mats.push(r.material as THREE.Material); r.visible = false; world.add(r); return r; });

  // humans: merged vertex-coloured meshes, one shared material
  const charMat = regM(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const shadowMat = regM(basic(C.ink, { transparent: true, opacity: 0.38, depthWrite: false }));
  const shadowGeo = reg(new THREE.CircleGeometry(0.42, 16));
  // one rig per outfit, built once; only the equipped one is visible (no per-frame material work)
  const survRigs = {} as Record<OutfitLook, ReturnType<typeof buildSurvivor>['rig']>;
  for (const o of ['scout', 'medic', 'ranger'] as const) { const b = buildSurvivor(charMat, o); b.geos.forEach(reg); b.rig.root.visible = o === 'scout'; world.add(b.rig.root); survRigs[o] = b.rig; }
  let surv = survRigs.scout;
  const survShadow = new THREE.Mesh(shadowGeo, shadowMat); survShadow.rotation.x = -Math.PI / 2; survShadow.position.y = 0.02; world.add(survShadow);
  const zombies = [0, 1, 2, 3, 4].map((i) => {
    const zb = buildZombie(i, charMat); zb.geos.forEach(reg);
    const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; world.add(sh);
    zb.rig.root.scale.setScalar(0.95 + hash(i + 3) * 0.1);
    world.add(zb.rig.root);
    return { r: zb.rig, gait: zb.gait, sh, lane: [-0.25, 0.85, -0.95, 0.35, 1.05][i], off: [0, 0.9, 1.4, 2.4, 3.1][i], ph: i * 1.7 };
  });

  // incoming walkers: one sculpted base per kind, clones share geometry; WALKER_PER_KIND each
  const walkerPools: { r: ReturnType<typeof cloneRig>; gait: ReturnType<typeof buildZombie>['gait']; sh: THREE.Mesh; used: boolean }[][] = [];
  for (let k = 0; k < ZOMBIE_KINDS; k++) {
    const needed = Object.values(STAGE_KINDS).some((ks) => ks.includes(k));
    if (!needed) { walkerPools.push([]); continue; }
    const base = buildZombie(k, charMat); base.geos.forEach(reg);
    walkerPools.push([0, 1, 2].map((i) => {
      const r = i === 0 ? base.rig : cloneRig(base.rig);
      r.root.visible = false; world.add(r.root);
      const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.rotation.x = -Math.PI / 2; sh.visible = false; world.add(sh);
      return { r, gait: base.gait, sh, used: false };
    }));
  }

  // ---------- pickups, power-up effects, hazard telegraphs, route dressing ----------
  const shieldM = regM(basic(C.supply)); const lightM = regM(basic(C.lampGlow)); const flareM = regM(basic(C.barrierRed));
  const pickBody = regM(lam(C.hazardDark)); const pickWhite = regM(lam(C.barrierWhite));
  const haloGeo = reg(new THREE.RingGeometry(0.42, 0.56, 24));
  const haloMats = { shield: regM(basic(C.supply, { transparent: true, opacity: 0.55, depthWrite: false })), flashlight: regM(basic(C.lampGlow, { transparent: true, opacity: 0.55, depthWrite: false })), distraction: regM(basic(C.barrierRed, { transparent: true, opacity: 0.55, depthWrite: false })) };
  const hexGeo = reg(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 6)); const hexIn = reg(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 6));
  const torchGeo = reg(new THREE.CylinderGeometry(0.07, 0.09, 0.5, 8)); const lensGeo = reg(new THREE.CylinderGeometry(0.15, 0.1, 0.14, 10));
  const flareGeo = reg(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8)); const tipGeo = reg(new THREE.SphereGeometry(0.11, 8, 6));
  type PickType = 'shield' | 'flashlight' | 'distraction';
  const pickMake: Record<PickType, () => THREE.Group> = {
    shield: () => { const g = new THREE.Group(); const a = new THREE.Mesh(hexGeo, shieldM); a.rotation.x = Math.PI / 2; g.add(a); const b = new THREE.Mesh(hexIn, pickBody); b.rotation.x = Math.PI / 2; g.add(b); return g; },
    flashlight: () => { const g = new THREE.Group(); const a = new THREE.Mesh(torchGeo, pickBody); a.rotation.x = Math.PI / 2; g.add(a); const b = new THREE.Mesh(lensGeo, lightM); b.rotation.x = Math.PI / 2; b.position.z = -0.3; g.add(b); return g; },
    distraction: () => { const g = new THREE.Group(); const a = new THREE.Mesh(flareGeo, pickWhite); a.rotation.z = 0.5; g.add(a); const b = new THREE.Mesh(tipGeo, flareM); b.position.set(-0.13, 0.25, 0); g.add(b); return g; },
  };
  const pickPools = {} as Record<PickType, { g: THREE.Group; halo: THREE.Mesh }[]>;
  for (const t of ['shield', 'flashlight', 'distraction'] as const) pickPools[t] = mkPool(4, () => {
    const g = pickMake[t](); g.visible = false; world.add(g);
    const halo = new THREE.Mesh(haloGeo, haloMats[t]); halo.rotation.x = -Math.PI / 2; halo.visible = false; world.add(halo);
    return { g, halo };
  });
  const pickUse = { shield: 0, flashlight: 0, distraction: 0 };
  // shield bubble around the survivor
  const bubbleM = regM(basic(C.supply, { transparent: true, opacity: 0.18, depthWrite: false }));
  const bubble = new THREE.Mesh(reg(new THREE.IcosahedronGeometry(0.95, 1)), bubbleM); bubble.visible = false; world.add(bubble);
  const bubbleWire = new THREE.Mesh(bubble.geometry, regM(basic(C.ring, { wireframe: true, transparent: true, opacity: 0.35 }))); bubble.add(bubbleWire);
  // flashlight beam: open cone + ground pool ahead of the runner
  const beamM = regM(basic(C.lampGlow, { transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
  const beamCone = new THREE.Mesh(reg(new THREE.ConeGeometry(2.6, 16, 14, 1, true)), beamM); beamCone.rotation.x = -Math.PI / 2; beamCone.visible = false; world.add(beamCone);
  const lightPool = new THREE.Mesh(reg(new THREE.CircleGeometry(2.4, 20)), regM(basic(C.lampGlow, { transparent: true, opacity: 0.16, depthWrite: false }))); lightPool.rotation.x = -Math.PI / 2; lightPool.scale.set(1, 2.6, 1); lightPool.visible = false; world.add(lightPool);
  // distraction flare dropped behind: red stick + glow disc the horde turns toward
  const flareG = new THREE.Group(); { const a = new THREE.Mesh(flareGeo, pickWhite); a.rotation.z = 1.3; a.position.y = 0.08; flareG.add(a); const b = new THREE.Mesh(tipGeo, flareM); b.position.set(-0.27, 0.12, 0); flareG.add(b); }
  const flareGlowM = regM(basic(C.barrierRed, { transparent: true, opacity: 0.3, depthWrite: false }));
  const flareGlow = new THREE.Mesh(reg(new THREE.CircleGeometry(1.6, 18)), flareGlowM); flareGlow.rotation.x = -Math.PI / 2; flareGlow.position.y = 0.03; flareG.add(flareGlow);
  flareG.visible = false; world.add(flareG);
  // hazard telegraph: amber floor chevron before every hazard; brighter under the flashlight
  const telM = regM(basic(C.hazard, { transparent: true, opacity: 0.22, depthWrite: false }));
  const telLitM = regM(basic(C.hazard, { transparent: true, opacity: 0.6, depthWrite: false }));
  const telGeo = reg(new THREE.PlaneGeometry(LW * 0.8, 0.5));
  const tels = mkPool(28, () => { const m = new THREE.Mesh(telGeo, telM); m.rotation.x = -Math.PI / 2; m.visible = false; world.add(m); return m; });
  // route dressing: alleys get dumpsters + cables, collapsed corridors get rubble + fallen slabs (sidewalk only)
  const rustM = regM(lam(C.carRust)); const tealM = regM(lam(C.carTeal)); const rubbleM = regM(lam(C.pitRim));
  const rubbleGeo = reg(new THREE.DodecahedronGeometry(0.5, 0));
  const routeMake: Record<'alley' | 'collapsed', () => THREE.Group> = {
    alley: () => { const g = new THREE.Group(); mk(g, tealM, 1.2, 1.1, 2.0, -0.6, 0.55, 0); mk(g, darkSteel, 1.3, 0.1, 2.1, -0.6, 1.15, 0, 0, 0.12); mk(g, rustM, 0.5, 0.5, 0.5, 0.4, 0.25, 1.4, 0.4); mk(g, darkSteel, 0.03, 0.03, 9, 0, 5.6, 0, 0, 0); mk(g, darkSteel, 0.02, 0.02, 8, 1.2, 5.2, 0, 0.3, 0); return g; },
    collapsed: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(rubbleGeo, i % 2 ? concrete : rubbleM); r.position.set(-0.5 + hash(i) * 0.8, 0.2 + i * 0.05, -1 + i * 0.6); r.scale.setScalar(0.5 + hash(i + 5) * 0.6); r.rotation.set(i, i * 2, 0); g.add(r); } mk(g, concrete, 2.6, 0.25, 1.4, -0.3, 1.2, 0, 0.2, 0.75); mk(g, darkSteel, 0.06, 2.4, 0.06, 0.3, 1.0, 0.8, 0, 0.5); return g; },
  };
  const routePools = { alley: mkPool(10, routeMake.alley), collapsed: mkPool(10, routeMake.collapsed) };
  for (const k of ['alley', 'collapsed'] as const) for (const g of routePools[k]) { g.visible = false; world.add(g); }
  const routeCache = new Map<number, 'boulevard' | 'alley' | 'collapsed'>();
  const routeAt = (x: number) => { const b = Math.floor(Math.max(0, x) / 50); let r = routeCache.get(b); if (!r) { r = routeInfo(b * 50 + 1).id; if (routeCache.size > 400) routeCache.clear(); routeCache.set(b, r); } return r; };
  const routeUse = { alley: 0, collapsed: 0 };

  const flashMat = regM(basic(C.barrierRed, { transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
  const flash = new THREE.Mesh(reg(new THREE.PlaneGeometry(4, 4)), flashMat); flash.renderOrder = 999; flash.position.set(0, 0, -0.5); cam.add(flash); scn.add(cam);

  // segment frames: 0 = previous street, 1 = current, 2 = next (after the corner)
  interface Seg { on: boolean; id: number; cx: number; cz: number; fx: number; fz: number; rx: number; rz: number; s0: number; yaw: number; from: number; to: number; sC: number | null; dS: number; eC: number | null; dE: number; dE2: number; y: number }
  const mkSeg = (): Seg => ({ on: false, id: 0, cx: 0, cz: 0, fx: 0, fz: -1, rx: 1, rz: 0, s0: 0, yaw: 0, from: 0, to: 0, sC: null, dS: 0, eC: null, dE: 0, dE2: 0, y: 0 });
  // 3 = the second opening of a branch junction (visual stub only; the sim decides which way you went)
  const segs = [mkSeg(), mkSeg(), mkSeg(), mkSeg(), mkSeg()]; // 4 = unused opening of the branch just taken
  const P = { x: 0, z: 0 };
  const at = (g: Seg, sAlong: number, lat: number) => { P.x = g.cx + g.fx * (sAlong - g.s0) + g.rx * lat; P.z = g.cz + g.fz * (sAlong - g.s0) + g.rz * lat; return P; };
  const segOf = (sAlong: number) => (segs[0].on && segs[0].eC !== null && sAlong < segs[0].eC ? segs[0] : segs[2].on && sAlong > (segs[1].eC ?? Infinity) ? segs[2] : segs[1]);
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const SWING = 0.42;
  let curSeen = 0; let prevSeen = -1;
  let pi = 0;
  const piece = (mat: THREE.Material, g: Seg, a: number, b: number, lat: number, wdt: number, hgt: number, y: number) => {
    if (b - a <= 0.05 || pi >= pieces.length) return;
    const m = pieces[pi++]; m.material = mat; m.visible = true;
    at(g, (a + b) / 2, lat); m.position.set(P.x, y, P.z); m.rotation.set(0, g.yaw, 0); m.scale.set(wdt, hgt, b - a);
  };
  // split [a,b] at a stage boundary (at most one inside any visible range)
  // campaign missions slice stages by their own sections; endless keeps the 900 m cycle
  let curSim: Sim | null = null; let bounds: number[] | null = null; let boundsFor = -1;
  const stAt = (x: number): StageId => (curSim && curSim.campaign ? simStageAt(curSim, x) : stageAt(x));
  const ranges = (a: number, b: number, fn: (a: number, b: number, st: StageId) => void) => {
    if (b - a <= 0.05) return;
    if (bounds) { let B2 = -1; for (const x of bounds) if (x > a && x < b) { B2 = x; break; } if (B2 > 0) { fn(a, B2, stAt(a)); fn(B2, b, stAt(B2 + 0.01)); } else fn(a, b, stAt(a + 0.01)); return; }
    const B = Math.ceil(a / STAGE_LEN) * STAGE_LEN;
    if (B > a && B < b) { fn(a, B, stageAt(a)); fn(B, b, stageAt(B)); } else fn(a, b, stageAt(a + 0.01));
  };
  const nearBoundary = (x: number, m: number) => { if (bounds) { for (const b of bounds) if (Math.abs(x - b) < m) return true; return false; } const r = ((x % STAGE_LEN) + STAGE_LEN) % STAGE_LEN; return r < m || STAGE_LEN - r < m; };

  const scenery = buildMissionScenery({ world, unit, charMat, shadowGeo, shadowMat, reg, regM, HW, SW, LW });
  const Q = { x: 0, z: 0, y: 0, yaw: 0 };
  const placeG: Placer = (sl, lat) => { const g = segOf(sl); at(g, sl, lat); Q.x = P.x; Q.z = P.z; Q.y = g.y; Q.yaw = g.yaw; return Q; };
  let W = w; let H = h;
  const render = (s: Sim) => {
    const d = s.dist; const L = s.lastTurn; const J = s.turn;
    curSim = s;
    if (s.campaign) {
      if (boundsFor !== s.campaign.id) { boundsFor = s.campaign.id; const secs = missionById(s.campaign.id).sections; bounds = []; for (let i = 1; i < secs.length; i++) if (secs[i].stage !== secs[i - 1].stage) bounds.push(secs[i].from); }
    } else { bounds = null; boundsFor = -1; }
    scenery.begin(s);
    const curId = L ? L.id : 0;
    if (curId !== curSeen) { prevSeen = curSeen; curSeen = curId; }
    const [prv, cur, nxt, alt, alt2] = segs;
    Object.assign(cur, { on: true, id: curId, cx: 0, cz: 0, fx: 0, fz: -1, rx: 1, rz: 0, s0: d, yaw: 0, from: d - 40, to: Math.min(J.s + HW + SW, d + VIS + 10), sC: L ? L.s : null, dS: L ? L.dir : 0, eC: J.s, dE: J.dir, dE2: J.branch ? -J.dir : 0, y: 0 });
    Object.assign(nxt, { on: J.s - d < VIS + 10, id: J.id, cx: 0, cz: -(J.s - d), fx: J.dir, fz: 0, rx: 0, rz: J.dir, s0: J.s, yaw: -J.dir * Math.PI / 2, from: J.s - HW - SW, to: J.s + Math.max(20, VIS - (J.s - d)), sC: J.s, dS: J.dir, eC: null, dE: 0, dE2: 0, y: 0.006 });
    if (J.branch && J.s - d < VIS + 10) Object.assign(alt, { on: true, id: J.id + 5000, cx: 0, cz: -(J.s - d), fx: -J.dir, fz: 0, rx: 0, rz: -J.dir, s0: J.s, yaw: J.dir * Math.PI / 2, from: J.s - HW - SW, to: J.s + 34, sC: J.s, dS: -J.dir, eC: null, dE: 0, dE2: 0, y: 0.006 });
    else alt.on = false;
    if (L && d - L.s < 45) Object.assign(prv, { on: true, id: prevSeen, cx: 0, cz: -(L.s - d), fx: -L.dir, fz: 0, rx: 0, rz: -L.dir, s0: L.s, yaw: L.dir * Math.PI / 2, from: L.s - 60, to: L.s + HW + SW, sC: null, dS: 0, eC: L.s, dE: L.dir, dE2: 0, y: 0.006 });
    else prv.on = false;
    prv.dE2 = prv.on && L && L.branch ? -L.dir : 0;
    if (prv.on && L && L.branch) Object.assign(alt2, { on: true, id: L.id + 7000, cx: 0, cz: d - L.s, fx: 0, fz: 1, rx: -1, rz: 0, s0: L.s, yaw: Math.PI, from: L.s - HW - SW, to: L.s + 34, sC: L.s, dS: -L.dir, eC: null, dE: 0, dE2: 0, y: 0.006 });
    else alt2.on = false;

    let bi2 = 0; let li = 0; let ci2 = 0; pi = 0; let cl = 0; let sb = 0; const signUse = { police: 0, hospital: 0 };
    for (const k in propUse) propUse[k] = 0;
    routeUse.alley = 0; routeUse.collapsed = 0;
    for (let k = 0; k < segs.length; k++) {
      const g = segs[k];
      if (!g.on) continue;
      const ra = Math.max(g.from, g.sC !== null ? g.sC - HW : -Infinity); const rb = Math.min(g.to, g.eC !== null ? g.eC + HW : Infinity);
      ranges(ra, rb, (a, b, st) => piece(SM[st].road, g, a, b, 0, HW * 2, 0.02, -0.01 + g.y));
      // ceiling over interiors
      const ca0 = Math.max(g.from, g.sC !== null ? g.sC - FW : -Infinity); const cb0 = Math.min(g.to, g.eC !== null ? g.eC + FW : Infinity);
      ranges(ca0, cb0, (a, b, st) => { const cm = SM[st].ceil; if (cm) piece(cm, g, a, b, 0, FW * 2 + 0.8, 0.2, 6.5 + g.y * 4); });
      for (let q = 0; q < 2; q++) {
        const sg = q ? 1 : -1;
        const a = Math.max(g.from, g.sC !== null ? (sg === g.dS ? g.sC + HW : g.sC - HW - SW) : -Infinity);
        const b = Math.min(g.to, g.eC !== null ? ((sg === g.dE || sg === g.dE2) ? g.eC - HW : g.eC + HW + SW) : Infinity);
        ranges(a, b, (a2, b2, st) => piece(SM[st].walk, g, a2, b2, sg * (HW + SW / 2), SW, 0.2, 0.1 + g.y));
        const cb = Math.min(g.to, g.eC !== null ? ((sg === g.dE || sg === g.dE2) ? g.eC - HW : g.eC + HW) : Infinity);
        const ca = Math.max(g.from, g.sC !== null ? (sg === g.dS ? g.sC + HW : g.sC - HW) : -Infinity);
        ranges(ca, cb, (a2, b2, st) => piece(SM[st].curb, g, a2, b2, sg * (HW + 0.12), 0.25, 0.24, 0.12 + g.y));
        // interior walls close the corridor and meet exactly at both corner types
        const wa = Math.max(g.from, g.sC !== null ? (sg === g.dS ? g.sC + FW : g.sC - FW) : -Infinity);
        const wb = Math.min(g.to, g.eC !== null ? ((sg === g.dE || sg === g.dE2) ? g.eC - FW : g.eC + FW) : Infinity);
        ranges(wa, wb, (a2, b2, st) => {
          const wm = SM[st].wall; const bm = SM[st].band; if (!wm || !bm) return;
          piece(wm, g, a2, b2, sg * (FW + 0.2), 0.4, 6.6, 3.3 + g.y);
          piece(bm, g, a2, b2, sg * (FW - 0.02), 0.06, 0.3, 1.1 + g.y);
        });
        // city buildings
        const lo = Math.max(g.from, g.sC !== null ? (sg === g.dS ? g.sC + HW + SW + 5 : g.sC - HW) : -Infinity);
        const hi = Math.min(g.to, g.eC !== null ? ((sg === g.dE || sg === g.dE2) ? g.eC - HW - SW - 5 : g.eC + HW) : Infinity);
        for (let n = Math.ceil(lo / BSP); n * BSP <= hi && bi2 < blds.length; n++) {
          if (stAt(n * BSP) !== 'city' || nearBoundary(n * BSP, 4) || scenery.openAt(n * BSP)) continue;
          const b2 = blds[bi2++]; const seed = n * 31 + g.id * 977 + sg * 7;
          const bh = 7 + hash(seed) * 16; const bw = 6 + hash(seed + 1) * 3; const bd = BSP - 0.6 - hash(seed + 2) * 1.5;
          b2.body.scale.set(bw, bh, bd); b2.body.position.set(0, bh / 2, 0); b2.body.material = bMats[Math.floor(hash(seed + 3) * 3)];
          b2.face.scale.set(bw, bh * 0.82, bd); b2.face.position.set(0, bh * 0.47, 0); b2.face.geometry = facades[Math.floor(hash(seed + 4) * 3)];
          b2.roof.scale.set(bw + 0.3, 0.35, bd + 0.3); b2.roof.position.set(0, bh + 0.17, 0);
          at(g, n * BSP, sg * (HW + SW + bw / 2));
          b2.g.visible = true; b2.g.position.set(P.x, 0, P.z); b2.g.rotation.set(0, g.yaw + (sg < 0 ? 0 : Math.PI), 0);
        }
        if (k === 0) continue;
        const clo = Math.max(g.from, g.sC !== null ? g.sC + HW + SW + 2 : -Infinity);
        const chi = Math.min(g.to, g.eC !== null ? g.eC - HW - SW - 2 : Infinity);
        const off = sg > 0 ? LSP / 2 : 0;
        for (let n = Math.ceil((clo - off) / LSP); n * LSP + off <= chi && li < lamps.length; n++) {
          const sl = n * LSP + off; if (stAt(sl) !== 'city' || nearBoundary(sl, 6) || scenery.openAt(sl)) continue;
          const lp = lamps[li++]; at(g, sl, sg * (HW + 0.7));
          lp.g.visible = true; lp.g.position.set(P.x, g.y, P.z); lp.g.rotation.set(0, g.yaw + (sg < 0 ? 0 : Math.PI), 0);
          const sd = n * 5 + g.id * 3 + sg; const dead = hash(sd) > 0.8; const flick = hash(sd + 9) > 0.6 && Math.sin(s.time * 23 + n * 3) > 0.6;
          lp.bulb.visible = !dead && !flick; lp.pool.visible = lp.bulb.visible;
        }
        const coff = sg > 0 ? 13 : 0;
        for (let n = Math.ceil((clo - coff) / CSP); n * CSP + coff <= chi && ci2 < cars.length; n++) {
          const sl = n * CSP + coff; if (stAt(sl) !== 'city' || nearBoundary(sl, 6) || scenery.openAt(sl)) continue;
          const cr = cars[ci2++]; const sd = n * 11 + g.id * 5 + sg * 3;
          at(g, sl, sg * (HW + 2.0 + hash(sd) * 0.8));
          cr.g.visible = true; cr.g.position.set(P.x, g.y, P.z);
          cr.g.rotation.set(0, g.yaw + (hash(sd + 1) - 0.5) * 0.9, sg * hash(sd + 2) * 0.12);
          cr.body.material = carMats[Math.floor(hash(sd + 3) * 3)];
        }
        // interior props along the walls (desks/lockers/barriers or beds/gurneys/bays)
        const poff = sg > 0 ? 4.5 : 0;
        for (let n = Math.ceil((clo - poff) / 9); n * 9 + poff <= chi; n++) {
          const sl = n * 9 + poff; const st = stAt(sl); if (st === 'city' || nearBoundary(sl, 6)) continue;
          const sd = n * 13 + sg * 5; const list = PROPS[st]; const kind = list[Math.floor(hash(sd) * list.length)];
          const pool = propPools[kind]; const u = propUse[kind] ?? 0; if (u >= pool.length) continue; propUse[kind] = u + 1;
          const pg = pool[u]; at(g, sl, sg * (HW + SW * 0.62));
          pg.visible = true; pg.position.set(P.x, 0.2 + g.y, P.z); pg.rotation.set(0, g.yaw + (sg < 0 ? 0 : Math.PI), 0);
        }
        // route dressing on this side's sidewalk
        for (let n = Math.ceil((clo - (sg > 0 ? 6 : 0)) / 12); n * 12 + (sg > 0 ? 6 : 0) <= chi; n++) {
          const sl = n * 12 + (sg > 0 ? 6 : 0); if (nearBoundary(sl, 6)) continue;
          const rid = routeAt(sl); if (rid === 'boulevard') continue;
          const pool = routePools[rid]; if (routeUse[rid] >= pool.length) continue;
          const rg = pool[routeUse[rid]++]; at(g, sl, sg * (HW + SW * 0.45));
          rg.visible = true; rg.position.set(P.x, 0.2 + g.y, P.z); rg.rotation.set(0, g.yaw + (sg < 0 ? 0 : Math.PI), 0);
        }
        // campaign sidewalk dressing + wayfinding
        const putG: Placer = (sl2, lat) => { at(g, sl2, lat); Q.x = P.x; Q.z = P.z; Q.y = g.y; Q.yaw = g.yaw; return Q; };
        scenery.dress(clo, chi, sg, putG);
        // wall signs + police strobes / hospital wall lights
        for (let n = Math.ceil((clo - (sg > 0 ? 18 : 0)) / 36); n * 36 + (sg > 0 ? 18 : 0) <= chi; n++) {
          const sl = n * 36 + (sg > 0 ? 18 : 0); const st = stAt(sl); if (st === 'city' || nearBoundary(sl, 8)) continue;
          const pool = signPools[st]; if (signUse[st] >= pool.length) continue;
          const sgG = pool[signUse[st]++]; at(g, sl, sg * (FW - 0.04));
          sgG.visible = true; sgG.position.set(P.x, 4.0 + g.y, P.z); sgG.rotation.set(0, g.yaw - sg * Math.PI / 2, 0);
        }
        for (let n = Math.ceil(clo / 14); n * 14 <= chi && sb < strobes.length; n++) {
          const sl = n * 14 + (sg > 0 ? 7 : 0); const st = stAt(sl); if (st === 'city' || sl > chi || nearBoundary(sl, 4)) continue;
          const m = strobes[sb++]; at(g, sl, sg * (FW - 0.06));
          m.visible = true; m.position.set(P.x, 5.2 + g.y, P.z); m.rotation.set(0, g.yaw, 0);
          m.material = st === 'police' ? (((n + Math.floor(s.time * 3)) & 1) ? copRed : copBlue) : (n & 1 ? exitGreen : crossRed);
        }
      }
      // ceiling light panels down the corridor centre
      {
        const la = Math.max(g.from, g.sC !== null ? g.sC - HW : -Infinity); const lb = Math.min(g.to, g.eC !== null ? g.eC + HW : Infinity);
        scenery.overhead(la, lb, (sl2, lat) => { at(g, sl2, lat); Q.x = P.x; Q.z = P.z; Q.y = g.y; Q.yaw = g.yaw; return Q; });
        for (let n = Math.ceil(la / 8); n * 8 <= lb && cl < ceilLights.length; n++) {
          if (stAt(n * 8) === 'city' || nearBoundary(n * 8, 2)) continue;
          const m = ceilLights[cl++]; at(g, n * 8, 0);
          m.visible = true; m.position.set(P.x, 6.36 + g.y * 4, P.z); m.rotation.set(0, g.yaw, 0);
        }
      }
    }
    for (let i = pi; i < pieces.length; i++) pieces[i].visible = false;
    for (let i = bi2; i < blds.length; i++) blds[i].g.visible = false;
    for (let i = li; i < lamps.length; i++) lamps[i].g.visible = false;
    for (let i = ci2; i < cars.length; i++) cars[i].g.visible = false;
    for (let i = cl; i < ceilLights.length; i++) ceilLights[i].visible = false;
    for (let i = sb; i < strobes.length; i++) strobes[i].visible = false;
    for (const k of ['alley', 'collapsed'] as const) { const pool = routePools[k]; for (let i = routeUse[k]; i < pool.length; i++) pool[i].visible = false; }
    for (const k in propPools) { const pool = propPools[k]; for (let i = propUse[k] ?? 0; i < pool.length; i++) pool[i].visible = false; }
    for (const st of ['police', 'hospital'] as const) { const pool = signPools[st]; for (let i = signUse[st]; i < pool.length; i++) pool[i].visible = false; }
    // stage entrance portal (nearest boundary ahead, or just behind)
    let B = Math.ceil((d - 12) / STAGE_LEN) * STAGE_LEN;
    if (bounds) { B = -1; for (const x of bounds) if (x >= d - 12) { B = x; break; } }
    const bst = stAt(B);
    for (const st of ['city', 'police', 'hospital'] as const) {
      const pg = portals[st];
      if (st !== bst || B <= 0 || B - d > VIS + 20 || Math.abs(B - J.s) < 16 || (L && Math.abs(B - L.s) < 16)) { pg.visible = false; continue; }
      const sg = segOf(B); at(sg, B, 0);
      pg.visible = true; pg.position.set(P.x, sg.y, P.z); pg.rotation.set(0, sg.yaw, 0);
    }
    // fog/clear colour eases into the stage the runner is in
    const curSt = stAt(d); let into = (((d % STAGE_LEN) + STAGE_LEN) % STAGE_LEN);
    if (bounds) { into = d + 1000; for (const x of bounds) if (x <= d) into = d - x; }
    const prevSt = stAt(d - into - 1);
    fogNow.copy(FOG[prevSt]).lerp(FOG[curSt], Math.min(1, into / 30));
    const md = scenery.mood(fogNow); fogNow.copy(md.fog);
    hemiL.intensity = 1.25 * md.light; sunL.intensity = 1.6 * md.light; rim.intensity = 0.35 * Math.max(0.6, md.light);
    (scn.fog as THREE.Fog).color.copy(fogNow); renderer.setClearColor(fogNow);
    // asphalt cracks on city streets only
    const crA = Math.max(d - 10, L ? L.s + HW : -Infinity); const crB = Math.min(d + 80, J.s - HW);
    for (let i = 0; i < cracks.length; i++) {
      const sl = Math.ceil(crA / 9) * 9 + i * 9; const cm = cracks[i];
      if (sl > crB || stAt(sl) !== 'city') { cm.visible = false; continue; }
      const sd = Math.round(sl / 9) * 7;
      cm.visible = true; cm.position.set((hash(sd) - 0.5) * LW * 2.6, 0.012, -(sl - d));
      cm.rotation.set(-Math.PI / 2, 0, hash(sd + 3) * 3); cm.scale.set(0.4 + hash(sd + 1) * 1.2, 0.15 + hash(sd + 2) * 0.6, 1);
    }
    // junction props
    const jset: [Seg, number, number, boolean][] = [];
    if (J.s - d < VIS + 10) jset.push([cur, J.s, J.dir, !!J.branch]);
    if (prv.on && L) jset.push([prv, L.s, L.dir, !!L.branch]);
    for (let i = 0; i < junctions.length; i++) {
      const jn = junctions[i]; const e = jset[i];
      if (!e) { jn.g.visible = false; continue; }
      at(e[0], e[1], 0); jn.g.visible = true; jn.g.position.set(P.x, e[0].y, P.z); jn.g.rotation.set(0, e[0].yaw, 0); jn.mir.scale.x = e[2]; jn.mir2.visible = e[3]; jn.mir2.scale.x = -e[2];
    }
    for (let i = 0; i < smokes.length; i++) smokes[i].rotation.y = s.time * 0.05 * (i + 1);

    // obstacles
    obCount.fill(0);
    const lit = s.flashlightT > 0; let ti = 0;
    for (const o of s.obstacles) {
      const z = o.s - d;
      if (z > VIS + 30 || z < -8) continue;
      if (z > 2 && z < (lit ? 70 : 45) && ti < tels.length) {
        const tm = tels[ti++]; const sgT = segOf(o.s - 1.6); at(sgT, o.s - 1.6, o.lane * LW);
        tm.visible = true; tm.material = lit ? telLitM : telM; tm.position.set(P.x, 0.03 + sgT.y, P.z); tm.rotation.set(-Math.PI / 2, 0, sgT.yaw);
      }
      const pi = s.campaign ? simObstaclePoolIndex(s, o.s, o.id, o.type) : themed.poolIndex(o.s, o.id, o.type);
      const g = obPools[pi][obCount[pi]++]; if (!g) continue;
      const sg2 = segOf(o.s); at(sg2, o.s, o.lane * LW);
      g.visible = true; g.position.set(P.x, sg2.y, P.z); g.rotation.y = sg2.yaw;
    }
    for (let i = ti; i < tels.length; i++) tels[i].visible = false;
    telM.opacity = 0.18 + 0.08 * Math.sin(s.time * 6); telLitM.opacity = 0.5 + 0.15 * Math.sin(s.time * 8);
    for (let p = 0; p < obPools.length; p++) { const pl = obPools[p]; for (let i = obCount[p]; i < pl.length; i++) pl[i].visible = false; }
    let ci = 0;
    for (const c of s.coins) {
      const z = c.s - d; if (c.taken || z > VIS * 0.8 || z < -3 || ci >= supPool.length) continue;
      const sg3 = segOf(c.s); at(sg3, c.s, c.lane * LW);
      const g = supPool[ci++]; g.visible = true; g.position.set(P.x, c.h, P.z); g.rotation.y = s.time * 3 + c.id;
    }
    for (let i = ci; i < supPool.length; i++) supPool[i].visible = false;
    pickUse.shield = 0; pickUse.flashlight = 0; pickUse.distraction = 0;
    for (const pk of s.pickups) {
      const z = pk.s - d; if (pk.taken || z > VIS * 0.85 || z < -3) continue;
      const pool = pickPools[pk.type]; if (!pool || pickUse[pk.type] >= pool.length) continue;
      const it = pool[pickUse[pk.type]++]; const sgP = segOf(pk.s); at(sgP, pk.s, pk.lane * LW);
      it.g.visible = true; it.g.position.set(P.x, 1.0 + Math.sin(s.time * 3 + pk.id) * 0.12 + sgP.y, P.z); it.g.rotation.y = s.time * 2.2 + pk.id;
      it.halo.visible = true; it.halo.position.set(P.x, 0.035 + sgP.y, P.z); it.halo.scale.setScalar(1 + 0.15 * Math.sin(s.time * 5 + pk.id));
    }
    for (const t of ['shield', 'flashlight', 'distraction'] as const) { const pool = pickPools[t]; for (let i = pickUse[t]; i < pool.length; i++) { pool[i].g.visible = false; pool[i].halo.visible = false; } }
    for (let i = 0; i < ringPool.length; i++) {
      const p = s.pops[i]; const r = ringPool[i];
      if (!p) { r.visible = false; continue; }
      r.visible = true; r.position.set(p.lane * LW, p.h + p.age * 2, -0.3); r.scale.setScalar(1 + p.age * 4);
      (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p.age / 0.6);
    }

    // survivor
    const want = survRigs[s.outfit as OutfitLook] ?? survRigs.scout;
    if (want !== surv) { surv.root.visible = false; surv = want; surv.root.visible = true; }
    const sx = s.px * LW;
    const fallen = s.deathCause === 'gap' && (s.mode === 'dying' || s.mode === 'over');
    surv.root.position.set(sx, fallen ? Math.min(0, s.jy) * 0.7 : Math.max(0, s.jy), 0);
    animateSurvivor(surv, s);
    survShadow.position.x = sx; survShadow.visible = !fallen;
    survShadow.scale.setScalar(1 - Math.min(0.6, s.jy / 4));
    const alive = s.mode === 'run' || s.mode === 'paused';
    bubble.visible = alive && s.shieldT > 0 && (s.shieldT > 2 || Math.sin(s.time * 20) > 0);
    if (bubble.visible) { bubble.position.set(sx, Math.max(0, s.jy) + 0.95, 0); bubble.rotation.y = s.time * 0.8; bubbleM.opacity = 0.14 + 0.06 * Math.sin(s.time * 5); }
    const beamOn = alive && s.flashlightT > 0 && (s.flashlightT > 2 || Math.sin(s.time * 16) > -0.3);
    beamCone.visible = beamOn; lightPool.visible = beamOn;
    if (beamOn) { beamCone.position.set(sx, 1.3, -8.6); lightPool.position.set(sx, 0.04, -9); beamM.opacity = 0.08 + 0.02 * Math.sin(s.time * 9); }
    // invulnerability blink after a stumble
    surv.root.visible = !(s.invulnerableT > 0 && s.mode === 'run' && Math.sin(s.time * 30) > 0.4);

    // campaign: items, carried item, escort, beacon, destination, gantries
    scenery.update(s, placeG, surv.torso, sx, (x) => Math.abs(x - J.s) < 16 || (!!L && Math.abs(x - L.s) < 16));

    // corner swing: survivor snaps toward the new street, camera/world eases around the survivor
    const swingT = L && s.turnFx < SWING ? ease(Math.min(1, s.turnFx / SWING)) : 1;
    const alpha = L ? -L.dir * (Math.PI / 2) * (1 - swingT) : 0;
    world.rotation.y = alpha;
    world.position.set(sx - sx * Math.cos(alpha), 0, sx * Math.sin(alpha));
    if (L && s.turnFx < 0.22) surv.root.rotation.y += L.dir * (Math.PI / 2) * (1 - ease(s.turnFx / 0.22));

    // horde follows the path, including around the last corner
    const dying = s.mode === 'dying' || s.mode === 'over';
    const lunge = dying ? Math.min(1, s.dieT * 1.5) : 0;
    const reach = dying ? lunge : Math.max(0, Math.min(0.75, (2.4 - s.horde) / 1.6));
    const distracted = s.distractionT > 0 && !dying;
    flareG.visible = distracted;
    if (distracted) { const fz = d - Math.max(1.5, s.horde - 1.2); const fg = segOf(fz); at(fg, fz, 0); flareG.position.set(P.x, fg.y, P.z); flareGlowM.opacity = 0.22 + 0.12 * Math.abs(Math.sin(s.time * 13)); }
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      const back = s.horde + z.off * (dying ? 1 - lunge * 0.6 : 1);
      const lat = dying && i < 2 ? sx + (i ? 0.45 : -0.45) * (1 - lunge * 0.4) : (s.px * 0.55 + z.lane) * LW * 0.85;
      const zs = d - back; const g = segOf(zs); at(g, zs, lat);
      const t = s.time * (5.2 + i * 0.4) + z.ph;
      z.r.root.position.set(P.x, g.y, P.z);
      z.r.root.rotation.y = g.yaw + (distracted ? (i & 1 ? 0.9 : -0.9) + Math.sin(t * 0.3) * 0.2 : Math.atan2(-(sx - lat), 4) * 0.4);
      animateZombie(z.r, z.gait, t, distracted ? 0 : reach);
      z.sh.position.set(P.x, 0.02 + g.y, P.z);
    }

    // incoming walkers: straight down their lane toward the runner, facing the camera
    for (const pool of walkerPools) for (const w of pool) w.used = false;
    for (const wk of s.walkers) {
      const z = wk.s - d; if (z > VIS + 30 || z < -8) continue;
      const pool = walkerPools[wk.kind]; if (!pool) continue;
      let slot = null; for (const w of pool) if (!w.used) { slot = w; break; }
      if (!slot) continue;
      slot.used = true;
      const g = segOf(wk.s); at(g, wk.s, wk.lane * LW);
      const caught = dying && s.deathCause === 'walker' && Math.abs(z) < 1.5;
      // brutes are 1.8x tall and wide, spanning the two lanes they block
      const size = wk.type === 'brute' ? 1.8 : 1;
      slot.r.root.visible = true; slot.r.root.position.set(P.x, g.y, P.z); slot.r.root.rotation.y = g.yaw + Math.PI;
      slot.r.root.scale.setScalar(size);
      if (caught) animateZombie(slot.r, slot.gait, s.time * (4 + wk.v * 0.6) + wk.id, lunge);
      else if (wk.type === 'crawler') animateZombieCrawl(slot.r, slot.gait, s.time * 5 + wk.id);
      else if (wk.type === 'brute') animateZombie(slot.r, slot.gait, s.time * 3.2 + wk.id, 0.6);
      else animateZombieCharge(slot.r, slot.gait, s.time * (wk.type === 'sprinter' ? 14 : 7 + wk.v) + wk.id);
      slot.sh.visible = true; slot.sh.position.set(P.x, 0.02 + g.y, P.z); slot.sh.scale.setScalar(size);
    }
    for (const pool of walkerPools) for (const w of pool) if (!w.used) { w.r.root.visible = false; w.sh.visible = false; }

    // camera
    const shake = s.shake > 0 ? Math.sin(s.time * 80) * s.shake * 0.25 : 0;
    cam.position.set(s.px * LW * 0.5 + shake, 4.3, 7.6);
    cam.lookAt(s.px * LW * 0.35, 1.2, -9);
    flashMat.opacity = s.flash * 0.35;
    flash.visible = s.flash > 0.01;

    renderer.render(scn, cam);
    if (!isWeb) gl.endFrameEXP();
  };

  let intro: Intro | null = null;
  const renderIntro = (t: number) => {
    if (!intro) intro = createIntro();
    intro.update(t, W / Math.max(1, H));
    renderer.setClearColor(intro.clear);
    renderer.render(intro.scene, intro.cam);
    if (!isWeb) gl.endFrameEXP();
  };
  const endIntro = () => { if (intro) { intro.dispose(); intro = null; } };
  let cut: MissionCutscene | null = null;
  const renderMissionCutscene = (id: number, t: number) => {
    if (cut && cut.id !== id) { cut.dispose(); cut = null; }
    if (!cut) cut = createMissionCutscene(id);
    cut.update(t, W / Math.max(1, H));
    renderer.setClearColor(cut.clear);
    renderer.render(cut.scene, cut.cam);
    if (!isWeb) gl.endFrameEXP();
  };
  const endMissionCutscene = () => { if (cut) { cut.dispose(); cut = null; } };

  const resize = (nw: number, nh: number) => {
    W = nw; H = nh;
    cam.aspect = W / Math.max(1, H);
    cam.fov = W > H ? 52 : 62;
    cam.updateProjectionMatrix();
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
  };
  resize(W, H);

  const dispose = () => {
    endIntro(); endMissionCutscene(); scenery.dispose();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    renderer.dispose();
  };
  return { render, renderIntro, endIntro, renderMissionCutscene, endMissionCutscene, resize, dispose };
}

type Engine = ReturnType<typeof createEngine>;

export function RunnerScene({ width, height, onReady }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<number>(0);
  const engineRef = useRef<Engine | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    try {
      const eng = createEngine(gl, width, height);
      engineRef.current = eng;
      let failed = false;
      onReadyRef.current({
        render: (sim) => {
          if (failed) return;
          try { eng.render(sim); } catch (e) {
            failed = true; onReadyRef.current(null);
            setError(e instanceof Error ? e.message : 'The renderer stopped responding.');
          }
        },
        renderIntro: (t) => {
          if (failed) return;
          try { eng.renderIntro(t); } catch (e) {
            failed = true; onReadyRef.current(null);
            setError(e instanceof Error ? e.message : 'The renderer stopped responding.');
          }
        },
        endIntro: () => { try { eng.endIntro(); } catch {} },
        renderMissionCutscene: (id, t) => {
          if (failed) return;
          try { eng.renderMissionCutscene(id, t); } catch (e) {
            failed = true; onReadyRef.current(null);
            setError(e instanceof Error ? e.message : 'The renderer stopped responding.');
          }
        },
        endMissionCutscene: () => { try { eng.endMissionCutscene(); } catch {} },
      });
    } catch (e) {
      onReadyRef.current(null);
      setError(e instanceof Error ? e.message : 'This device could not start the 3D renderer.');
    }
    // width/height only seed the first frame; resizes are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => { engineRef.current?.resize(width, height); }, [width, height]);
  useEffect(() => () => {
    onReadyRef.current(null);
    try { engineRef.current?.dispose(); } catch {}
    engineRef.current = null;
  }, [attempt]);

  if (error) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.err]}>
        <View style={styles.errCard}>
          <Feather name="alert-octagon" size={26} color={T.destructive} />
          <Text style={styles.errTitle}>The city went dark</Text>
          <Text style={styles.errBody}>3D rendering failed on this device. Your records are safe.</Text>
          <Text style={styles.errDetail} numberOfLines={2}>{error}</Text>
          <Pressable testID="gl-retry" onPress={() => { setError(null); setAttempt((a) => a + 1); }} style={({ pressed }) => [styles.errBtn, pressed && { opacity: 0.8 }]}>
            <Feather name="refresh-cw" size={18} color={T.primaryForeground} />
            <Text style={styles.errBtnText}>RETRY RENDERER</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return <GLView key={attempt} msaaSamples={0} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />;
}

const styles = StyleSheet.create({
  err: { zIndex: 100, backgroundColor: T.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errCard: { alignItems: 'center', gap: 10, maxWidth: 360, padding: 22, borderRadius: colors.radius, backgroundColor: T.card, borderWidth: 1, borderColor: T.border },
  errTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, color: T.foreground },
  errBody: { fontFamily: 'Inter_400Regular', fontSize: 14, color: T.mutedForeground, textAlign: 'center' },
  errDetail: { fontFamily: 'Inter_400Regular', fontSize: 11, color: T.mutedForeground, opacity: 0.7, textAlign: 'center' },
  errBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: T.primary, paddingHorizontal: 18, paddingVertical: 12, borderRadius: colors.radius, marginTop: 6 },
  errBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, letterSpacing: 2, color: T.primaryForeground },
});
