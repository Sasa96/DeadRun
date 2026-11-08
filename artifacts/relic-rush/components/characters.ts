// Procedural low-poly humanoids for Relic Rush: Dead Run.
// Every bone owns ONE merged, vertex-coloured mesh (one shared Lambert material),
// so each character costs ~11 draw calls. No textures, no DOM, WebGL1-safe.
import * as THREE from 'three';
import { scene as C } from '@/constants/colors';
import type { Sim } from '@/lib/game';

export interface Rig {
  root: THREE.Group; hips: THREE.Group; torso: THREE.Group; head: THREE.Group;
  armL: THREE.Group; armR: THREE.Group; foreL: THREE.Group; foreR: THREE.Group;
  legL: THREE.Group; legR: THREE.Group; shinL: THREE.Group; shinR: THREE.Group;
}
type BoneName = Exclude<keyof Rig, 'root'>;

// ---------- paint (vertex colours) ----------
interface Paint { c: string; noise?: number; ao?: number; blotch?: string; blotchAmt?: number; dirt?: string; dirtAmt?: number }
const colorCache = new Map<string, THREE.Color>();
const col = (h: string) => { let c = colorCache.get(h); if (!c) { c = new THREE.Color(h); colorCache.set(h, c); } return c; };
const n3 = (x: number, y: number, z: number) => Math.sin(x * 31.7 + y * 12.3 + 1.1) * Math.sin(y * 27.1 + z * 17.9 + 0.4) * Math.sin(z * 23.3 + x * 9.1 + 2.3);
const hsh = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

class Builder {
  pos: number[] = []; nor: number[] = []; colr: number[] = [];
  add(g: THREE.BufferGeometry, p: Paint, m?: THREE.Matrix4) {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    ng.computeBoundingBox();
    const bb = ng.boundingBox as THREE.Box3;
    const hy = Math.max(1e-4, bb.max.y - bb.min.y);
    if (m) ng.applyMatrix4(m);
    const P = ng.attributes.position; const N = ng.attributes.normal;
    const base = col(p.c); const tc = new THREE.Color();
    // AO uses pre-transform local height, so recompute from inverse is overkill: use order index fraction
    const inv = m ? m.clone().invert() : null; const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i); const y = P.getY(i); const z = P.getZ(i);
      this.pos.push(x, y, z); this.nor.push(N.getX(i), N.getY(i), N.getZ(i));
      tc.copy(base);
      if (p.blotch) { const f = n3(x * 1.7, y * 1.7, z * 1.7); if (f > 0.12) tc.lerp(col(p.blotch), Math.min(1, (f - 0.12) * 3.2) * (p.blotchAmt ?? 0.6)); }
      if (p.dirt) { const f = n3(x * 3.1 + 5, y * 2.7, z * 3.3); if (f > 0) tc.lerp(col(p.dirt), f * (p.dirtAmt ?? 0.4)); }
      let k = 1 + n3(x * 9, y * 9, z * 9) * (p.noise ?? 0.04);
      if (p.ao) { v.set(x, y, z); if (inv) v.applyMatrix4(inv); k *= 1 - p.ao * (1 - (v.y - bb.min.y) / hy); }
      this.colr.push(tc.r * k, tc.g * k, tc.b * k);
    }
    ng.dispose();
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const _q = new THREE.Quaternion(); const _e = new THREE.Euler();
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

// ---------- shape generators (all smooth-normal) ----------
function lathe(profile: [number, number][], seg = 10) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg);
}
/** Tapered limb hanging from joint at y=0 down to joint at y=-len, with rounded caps so joints overlap. */
function limb(len: number, rTop: number, rBot: number, bulge = 0, at = 0.65, seg = 10) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + (i / 3) * (Math.PI / 2); pts.push([Math.cos(a) * rBot, -len + Math.sin(a) * rBot]); }
  for (let i = 1; i < 7; i++) {
    const t = i / 7; const r = rBot + (rTop - rBot) * t + bulge * Math.exp(-((t - at) ** 2) / 0.05);
    pts.push([r, -len + t * len]);
  }
  for (let i = 0; i <= 3; i++) { const a = (i / 3) * (Math.PI / 2); pts.push([Math.cos(a) * rTop, Math.sin(a) * rTop]); }
  return lathe(pts, seg);
}
/** Superellipsoid: p=2 is an ellipsoid, higher p becomes a rounded box. Seamless smooth normals. */
function blob(sx: number, sy: number, sz: number, p = 2, ws = 12, hs = 9) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const a = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) {
    v.fromBufferAttribute(a, i).normalize();
    const k = Math.pow(Math.abs(v.x) ** p + Math.abs(v.y) ** p + Math.abs(v.z) ** p, -1 / p);
    a.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz);
  }
  g.computeVertexNormals();
  return g;
}
function deform(g: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void) {
  const a = g.attributes.position; const v = new THREE.Vector3();
  for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i); fn(v); a.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}
const ring = (r: number, tube: number, seg = 14) => new THREE.TorusGeometry(r, tube, 5, seg);

/** cloth folds: radial ripple + optional ragged hem below hemY */
function cloth(g: THREE.BufferGeometry, folds: number, hemY: number | null, tatter: number, seed: number) {
  return deform(g, (v) => {
    const ang = Math.atan2(v.z, v.x);
    const k = 1 + folds * Math.sin(ang * 7 + v.y * 22 + seed) * Math.sin(v.y * 9 + seed);
    v.x *= k; v.z *= k;
    if (hemY !== null && tatter > 0 && v.y < hemY) {
      const b = Math.floor((ang + Math.PI) * 4);
      v.y -= hsh(b + seed * 13) * tatter;
      const flare = 1 + (hemY - v.y) * 0.6; v.x *= flare; v.z *= flare;
    }
  });
}

// ---------- humanoid spec ----------
type HairStyle = 'beanie' | 'short' | 'bald' | 'combover' | 'long' | 'hood' | 'hardhat' | 'policecap' | 'scrubcap';
interface Spec {
  skin: Paint; top: Paint; bottom: Paint; shoe: Paint; hair: Paint; hand?: Paint;
  sleeves: [boolean, boolean]; // forearm covered L/R
  shoulders: number; // width multiplier
  folds: number; tatter: number; seed: number;
  eyeWhite: string; iris: string; lip: string; sunken: boolean; slack: boolean;
  hairStyle: HairStyle;
  extras?: (b: Record<BoneName, Builder>) => void;
}

function addHead(b: Builder, s: Spec) {
  const skin = s.skin;
  const head = deform(new THREE.SphereGeometry(0.105, 18, 14), (v) => {
    v.x *= 0.86; v.y *= 1.13;
    if (v.y < 0) { const t = Math.min(1, -v.y / 0.12); v.x *= 1 - 0.3 * t; if (v.z < 0) v.z *= 1 - 0.12 * t; }
    if (v.y < -0.07 && v.z < -0.02) v.z -= 0.01 * (s.slack ? 0 : 1);
    if (v.z > 0 && v.y > -0.02) v.z *= 1.07;
    if (s.sunken && Math.abs(v.x) > 0.045 && v.y < 0 && v.y > -0.07 && v.z < 0) { v.x *= 0.94; }
    if (s.slack && v.y < -0.08) v.y -= 0.012;
  });
  b.add(head, { ...skin, ao: 0.18 }, M(0, 0.1, 0));
  // jaw line / chin
  b.add(blob(0.05, 0.028, 0.04, 2.2), skin, M(0, 0.01 - (s.slack ? 0.012 : 0), -0.062));
  // nose bridge + tip
  b.add(blob(0.013, 0.03, 0.018), skin, M(0, 0.1, -0.108, -0.25));
  b.add(blob(0.02, 0.013, 0.016), skin, M(0, 0.076, -0.114));
  // brow ridge
  for (const sx of [-1, 1]) {
    b.add(blob(0.03, 0.009, 0.013), { c: s.hair.c, noise: 0.05 }, M(sx * 0.036, 0.137, -0.098, 0, 0, sx * -0.12));
    b.add(blob(0.023, 0.017, 0.008), { c: s.sunken ? '#3B3540' : s.skin.c, ao: 0 }, M(sx * 0.035, 0.115, -0.094));
    b.add(new THREE.SphereGeometry(0.012, 8, 6), { c: s.eyeWhite, noise: 0 }, M(sx * 0.035, 0.115, -0.098));
    b.add(new THREE.SphereGeometry(0.0065, 6, 5), { c: s.iris, noise: 0 }, M(sx * 0.035, 0.115, -0.108));
    // ear
    b.add(blob(0.011, 0.027, 0.019), { ...skin, ao: 0.3 }, M(sx * 0.092, 0.1, 0.008, 0, sx * 0.3));
    // cheekbone
    b.add(blob(0.028, 0.02, 0.025), skin, M(sx * 0.052, 0.085, -0.07));
  }
  // lips / mouth
  b.add(blob(0.026, s.slack ? 0.014 : 0.006, 0.01), { c: s.slack ? '#2A2024' : s.lip, noise: 0.02 }, M(0, 0.047 - (s.slack ? 0.006 : 0), -0.095));
  // hair
  const hairP = s.hair;
  switch (s.hairStyle) {
    case 'beanie': {
      b.add(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, 1.5), { c: C.beanie, noise: 0.08, ao: 0.2 }, M(0, 0.118, 0.006, -0.12, 0, 0, 0.92, 1.12, 1.04));
      b.add(ring(0.1, 0.017, 18), { c: C.beanie, noise: 0.1 }, M(0, 0.135, 0.004, Math.PI / 2 - 0.12, 0, 0, 0.94, 1.06, 1));
      b.add(blob(0.088, 0.05, 0.075), hairP, M(0, 0.085, 0.03));
      break;
    }
    case 'short': b.add(new THREE.SphereGeometry(0.11, 14, 7, 0, Math.PI * 2, 0, 1.25), hairP, M(0, 0.112, 0.012, -0.3, 0, 0, 0.9, 1.12, 1.04)); break;
    case 'combover': b.add(new THREE.SphereGeometry(0.109, 12, 6, 0.6, 3.6, 0.5, 1.0), hairP, M(0, 0.11, 0.01, -0.2, 0, 0, 0.9, 1.12, 1.04)); break;
    case 'long': {
      b.add(new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, 1.45), hairP, M(0, 0.112, 0.012, -0.25, 0, 0, 0.92, 1.12, 1.06));
      b.add(deform(blob(0.09, 0.14, 0.05, 2.4), (v) => { v.y -= Math.abs(Math.sin(v.x * 70)) * 0.015; }), hairP, M(0, 0.0, 0.07));
      break;
    }
    case 'hood': {
      b.add(deform(new THREE.SphereGeometry(0.135, 14, 9, 0, Math.PI * 2, 0, 2.1), (v) => { if (v.z < -0.05) v.z = -0.05 + (v.z + 0.05) * 0.2; }), { ...s.top, ao: 0.3 }, M(0, 0.11, 0.02, -0.35));
      break;
    }
    case 'hardhat': {
      b.add(new THREE.SphereGeometry(0.12, 14, 7, 0, Math.PI * 2, 0, 1.4), { c: '#B89A3A', noise: 0.06, dirt: '#5A4A30', dirtAmt: 0.5 }, M(0, 0.13, 0, -0.1, 0, 0.12, 0.95, 1.0, 1.05));
      b.add(blob(0.13, 0.008, 0.15, 3), { c: '#A68A34', noise: 0.06 }, M(0, 0.14, -0.012, -0.1, 0, 0.12));
      break;
    }
    case 'policecap': {
      b.add(new THREE.SphereGeometry(0.108, 14, 7, 0, Math.PI * 2, 0, 1.2), hairP, M(0, 0.108, 0.012, -0.3, 0, 0, 0.9, 1.1, 1.04));
      b.add(new THREE.CylinderGeometry(0.128, 0.108, 0.075, 16), { c: '#1A2234', noise: 0.05, ao: 0.2 }, M(0, 0.205, 0.004, -0.1));
      b.add(new THREE.CylinderGeometry(0.111, 0.111, 0.03, 16), { c: '#0E121C', noise: 0.02 }, M(0, 0.168, 0.002, -0.1));
      b.add(blob(0.088, 0.008, 0.055, 2.6), { c: '#10141E', noise: 0.02 }, M(0, 0.158, -0.1, -0.28));
      b.add(blob(0.018, 0.022, 0.006), { c: '#C9A445', noise: 0.04 }, M(0, 0.205, -0.124));
      break;
    }
    case 'scrubcap': {
      b.add(new THREE.SphereGeometry(0.114, 16, 8, 0, Math.PI * 2, 0, 1.55), { c: hairP.c, noise: 0.05, ao: 0.15 }, M(0, 0.116, 0.01, -0.15, 0, 0, 0.93, 1.1, 1.05));
      b.add(ring(0.1, 0.012, 18), { c: hairP.c, noise: 0.06 }, M(0, 0.112, 0.008, Math.PI / 2 - 0.15, 0, 0, 0.94, 1.06, 1));
      break;
    }
    case 'bald': break;
  }
}

function buildHumanoid(s: Spec, mat: THREE.Material) {
  const bld = {} as Record<BoneName, Builder>;
  (['hips', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR'] as BoneName[]).forEach((k) => { bld[k] = new Builder(); });
  const sw = s.shoulders;

  // pelvis
  bld.hips.add(cloth(lathe([[0, -0.13], [0.095, -0.12], [0.14, -0.07], [0.148, 0], [0.138, 0.09], [0, 0.1]], 12), s.folds * 0.5, null, 0, s.seed), { ...s.bottom, ao: 0.25 }, M(0, 0, 0, 0, 0, 0, 1.15, 1, 0.8));
  bld.hips.add(ring(0.145, 0.013, 16), { c: '#2E2620', noise: 0.04 }, M(0, 0.06, 0, Math.PI / 2, 0, 0, 1.15, 0.8, 1));

  // torso (hips → neck)
  const torso = lathe([[0, -0.02], [0.135, 0.0], [0.128, 0.09], [0.14, 0.2], [0.158, 0.31], [0.165, 0.4], [0.155, 0.46], [0.11, 0.515], [0.06, 0.545], [0, 0.55]], 14);
  bld.torso.add(cloth(torso, s.folds, 0.04, s.tatter, s.seed), { ...s.top, ao: 0.35 }, M(0, 0, 0, 0, 0, 0, 1.2 * sw, 1, 0.74));
  // traps / deltoids so shoulder joint is covered
  for (const sx of [-1, 1]) bld.torso.add(blob(0.072, 0.065, 0.07), s.top, M(sx * 0.19 * sw, 0.465, 0));
  bld.torso.add(limb(0.09, 0.046, 0.054, 0, 0.5, 9), s.skin, M(0, 0.62, 0.005));

  // head
  addHead(bld.head, s);

  // arms
  const arm = (k: 'L' | 'R', i: number) => {
    const up = k === 'L' ? bld.armL : bld.armR; const fo = k === 'L' ? bld.foreL : bld.foreR;
    up.add(cloth(limb(0.29, 0.058, 0.047, 0.008, 0.6), s.folds * 0.7, null, 0, s.seed + i), { ...s.top, ao: 0.2 });
    const covered = s.sleeves[i];
    fo.add(limb(0.255, 0.048, 0.035, 0.009, 0.75), covered ? { ...s.top, ao: 0.15 } : { ...s.skin, ao: 0.1 });
    if (covered) fo.add(ring(0.04, 0.009, 12), s.top, M(0, -0.225, 0, Math.PI / 2));
    else up.add(deform(ring(0.052, 0.012, 12), (v) => { v.z += hsh(Math.floor(Math.atan2(v.y, v.x) * 3) + i) * 0.03; }), s.top, M(0, -0.25, 0, Math.PI / 2));
    const hp = s.hand ?? s.skin;
    fo.add(blob(0.032, 0.048, 0.022, 2.3), hp, M(0, -0.3, -0.004, 0.1));
    fo.add(blob(0.012, 0.026, 0.012), hp, M(0, -0.29, -0.028, -0.4));
    fo.add(blob(0.03, 0.022, 0.024, 2.4), hp, M(0, -0.345, -0.012, 0.4));
  };
  arm('L', 0); arm('R', 1);

  // legs
  const leg = (k: 'L' | 'R', i: number) => {
    const th = k === 'L' ? bld.legL : bld.legR; const sh = k === 'L' ? bld.shinL : bld.shinR;
    th.add(cloth(limb(0.42, 0.084, 0.056, 0.012, 0.7, 11), s.folds * 0.6, null, 0, s.seed + 3 + i), { ...s.bottom, ao: 0.18 }, M(0, 0, 0, 0, 0, 0, 1, 1, 1.05));
    sh.add(cloth(limb(0.39, 0.057, 0.042, 0.012, 0.72, 10), s.folds * 0.6, null, 0, s.seed + 5 + i), { ...s.bottom, ao: 0.15 });
    // footwear: shaft, foot, toe cap, sole
    sh.add(lathe([[0.048, -0.43], [0.052, -0.38], [0.054, -0.32], [0.05, -0.3]], 10), s.shoe);
    sh.add(blob(0.05, 0.04, 0.11, 2.6), { ...s.shoe, ao: 0.3 }, M(0, -0.432, -0.05));
    sh.add(blob(0.046, 0.03, 0.05, 2.2), { c: s.shoe.c, noise: 0.1, dirt: '#1C1714', dirtAmt: 0.4 }, M(0, -0.44, -0.12));
    sh.add(blob(0.054, 0.012, 0.125, 4), { c: '#1E1A18', noise: 0.03 }, M(0, -0.468, -0.052));
  };
  leg('L', 0); leg('R', 1);

  s.extras?.(bld);

  // assemble skeleton
  const root = new THREE.Group();
  const g = {} as Record<BoneName, THREE.Group>;
  const geos: THREE.BufferGeometry[] = [];
  (Object.keys(bld) as BoneName[]).forEach((k) => {
    g[k] = new THREE.Group(); g[k].name = k;
    const geo = bld[k].build(); geos.push(geo);
    g[k].add(new THREE.Mesh(geo, mat));
  });
  g.hips.position.y = 0.95; root.add(g.hips);
  g.hips.add(g.torso);
  g.head.position.y = 0.56; g.torso.add(g.head);
  g.armL.position.set(-0.2 * sw, 0.47, 0); g.armR.position.set(0.2 * sw, 0.47, 0); g.torso.add(g.armL, g.armR);
  g.foreL.position.y = -0.29; g.foreR.position.y = -0.29; g.armL.add(g.foreL); g.armR.add(g.foreR);
  g.legL.position.set(-0.092, -0.04, 0); g.legR.position.set(0.092, -0.04, 0); g.hips.add(g.legL, g.legR);
  g.shinL.position.y = -0.42; g.shinR.position.y = -0.42; g.legL.add(g.shinL); g.legR.add(g.shinR);
  return { rig: { root, ...g } as Rig, geos };
}

// ---------- characters ----------
export function buildSurvivor(mat: THREE.Material) {
  return buildHumanoid({
    skin: { c: C.skin, noise: 0.04 }, top: { c: C.jacket, noise: 0.05, dirt: C.jacketDark, dirtAmt: 0.45 },
    bottom: { c: C.jeans, noise: 0.06, dirt: '#2A3448', dirtAmt: 0.4 }, shoe: { c: C.boots, noise: 0.08 },
    hair: { c: C.hair, noise: 0.08 }, hand: { c: '#3A3430', noise: 0.06 },
    sleeves: [true, true], shoulders: 1.0, folds: 0.03, tatter: 0, seed: 1,
    eyeWhite: '#E6DED2', iris: '#3A2A20', lip: '#A86A56', sunken: false, slack: false, hairStyle: 'beanie',
    extras: (b) => {
      const pk = { c: C.pack, noise: 0.06, ao: 0.35, dirt: C.packDark, dirtAmt: 0.4 };
      // hood bunched at collar, zipper, collar, chest pocket
      b.torso.add(blob(0.12, 0.055, 0.065, 2.2), { c: C.jacket, ao: 0.4, dirt: C.jacketDark, dirtAmt: 0.5 }, M(0, 0.53, 0.07));
      b.torso.add(ring(0.065, 0.02, 14), { c: C.jacketDark }, M(0, 0.53, 0, Math.PI / 2, 0, 0, 1.1, 0.9, 1));
      b.torso.add(blob(0.006, 0.24, 0.006, 2), { c: '#2A2522', noise: 0 }, M(0, 0.27, -0.123));
      b.torso.add(blob(0.045, 0.035, 0.008, 3), { c: C.jacketDark }, M(0.075, 0.36, -0.118, 0, 0.2));
      // backpack: main body, lid, front pocket, side bottle, bedroll, straps
      b.torso.add(blob(0.165, 0.2, 0.085, 3.4, 14, 10), pk, M(0, 0.3, 0.19));
      b.torso.add(blob(0.17, 0.055, 0.1, 2.6), { c: C.packDark, noise: 0.06 }, M(0, 0.48, 0.19, 0.15));
      b.torso.add(blob(0.11, 0.075, 0.035, 3.2), { c: C.packDark, noise: 0.05 }, M(0, 0.2, 0.28));
      b.torso.add(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 10), { c: C.beanie, noise: 0.04 }, M(0.18, 0.22, 0.18));
      b.torso.add(new THREE.CylinderGeometry(0.068, 0.068, 0.4, 12), { c: C.bedroll, noise: 0.08, ao: 0.2 }, M(0, 0.57, 0.2, 0, 0, Math.PI / 2));
      for (const sx of [-1, 1]) {
        b.torso.add(ring(0.069, 0.01, 10), { c: C.packDark }, M(sx * 0.12, 0.57, 0.2, 0, Math.PI / 2));
        b.torso.add(blob(0.022, 0.21, 0.01, 3), { c: C.packDark }, M(sx * 0.1, 0.32, -0.12, 0.1, 0, sx * 0.05));
        b.torso.add(blob(0.024, 0.012, 0.13, 3), { c: C.packDark }, M(sx * 0.11, 0.5, 0.03, -0.25));
      }
      // knee patch + utility pouch on belt
      b.legR.add(blob(0.05, 0.05, 0.012, 3), { c: '#33415C', noise: 0.08 }, M(0, -0.36, -0.07));
      b.hips.add(blob(0.05, 0.045, 0.035, 3), { c: C.packDark, noise: 0.05 }, M(0.15, 0.0, -0.06, 0, 0.6));
    },
  }, mat);
}

export interface ZombieGait { drag: 0 | 1; reachL: number; reachR: number; rate: number; tilt: number; hunch: number }

const BRUISE = '#5E4D63'; const VEIN = '#53624E'; const GRIME = '#3A3530';
const ZOMBIES: { spec: Omit<Spec, 'eyeWhite' | 'iris' | 'lip' | 'sunken'>; gait: ZombieGait }[] = [
  { // office worker: torn shirt, loose tie, combover
    spec: {
      skin: { c: C.zSkin, blotch: BRUISE, blotchAmt: 0.55, noise: 0.07 }, top: { c: '#B7B2A4', dirt: GRIME, dirtAmt: 0.55, noise: 0.06 },
      bottom: { c: C.zPants, noise: 0.06 }, shoe: { c: '#2A2220' }, hair: { c: '#4A4038', noise: 0.1 },
      sleeves: [true, false], shoulders: 0.96, folds: 0.04, tatter: 0.06, seed: 11, slack: true, hairStyle: 'combover',
      extras: (b) => {
        b.torso.add(blob(0.018, 0.13, 0.008, 2.2), { c: '#5A2E34', noise: 0.05 }, M(0.02, 0.33, -0.124, 0, 0, 0.12));
        b.torso.add(blob(0.022, 0.018, 0.012), { c: '#5A2E34' }, M(0, 0.48, -0.108));
      },
    }, gait: { drag: 1, reachL: 1.45, reachR: 0.55, rate: 1, tilt: 0.35, hunch: 0.3 },
  },
  { // road worker: faded hi-vis vest, hard hat
    spec: {
      skin: { c: C.zSkinB, blotch: VEIN, blotchAmt: 0.5, noise: 0.07 }, top: { c: C.zShirtB, dirt: GRIME, dirtAmt: 0.5 },
      bottom: { c: '#3E4A52', noise: 0.06, dirt: GRIME, dirtAmt: 0.4 }, shoe: { c: '#3A2E26' }, hair: { c: '#2E2620' },
      sleeves: [true, true], shoulders: 1.1, folds: 0.03, tatter: 0.03, seed: 23, slack: false, hairStyle: 'hardhat',
      extras: (b) => {
        b.torso.add(cloth(lathe([[0.143, 0.1], [0.162, 0.25], [0.17, 0.38], [0.15, 0.46]], 14), 0.03, 0.12, 0.04, 7), { c: '#A9A04A', dirt: GRIME, dirtAmt: 0.5 }, M(0, 0, 0, 0, 0, 0, 1.27, 1, 0.78));
        b.torso.add(lathe([[0.168, 0.28], [0.172, 0.31]], 14), { c: '#C8C6B8' }, M(0, 0, 0, 0, 0, 0, 1.28, 1, 0.79));
      },
    }, gait: { drag: 0, reachL: 0.7, reachR: 1.5, rate: 0.9, tilt: -0.25, hunch: 0.4 },
  },
  { // hospital patient: gown, bare arms, bald, very sallow
    spec: {
      skin: { c: '#A8AE90', blotch: VEIN, blotchAmt: 0.7, noise: 0.08 }, top: { c: '#7E9AA0', noise: 0.05, dirt: GRIME, dirtAmt: 0.35 },
      bottom: { c: '#7E9AA0', noise: 0.05 }, shoe: { c: '#8E8A80' }, hair: { c: '#6E6A60' },
      sleeves: [false, false], shoulders: 0.9, folds: 0.05, tatter: 0.07, seed: 37, slack: true, hairStyle: 'bald',
      extras: (b) => {
        b.hips.add(cloth(lathe([[0.15, -0.36], [0.16, -0.2], [0.15, 0.0], [0.14, 0.08]], 14), 0.05, -0.3, 0.08, 9), { c: '#7E9AA0', dirt: GRIME, dirtAmt: 0.4 }, M(0, 0, 0, 0, 0, 0, 1.2, 1, 0.9));
        b.hips.add(blob(0.04, 0.012, 0.012), { c: '#D8D4C6' }, M(-0.12, -0.05, -0.12));
      },
    }, gait: { drag: 1, reachL: 1.3, reachR: 1.25, rate: 0.8, tilt: 0.5, hunch: 0.5 },
  },
  { // jogger: hoodie up
    spec: {
      skin: { c: '#94A08C', blotch: BRUISE, blotchAmt: 0.45, noise: 0.06 }, top: { c: '#4A5A72', noise: 0.06, dirt: GRIME, dirtAmt: 0.45 },
      bottom: { c: '#2E3038', noise: 0.05 }, shoe: { c: '#7A6E66' }, hair: { c: '#2E2620' },
      sleeves: [true, true], shoulders: 1.0, folds: 0.045, tatter: 0.04, seed: 51, slack: false, hairStyle: 'hood',
      extras: (b) => { b.torso.add(blob(0.11, 0.06, 0.03, 3), { c: '#3E4C62' }, M(0, 0.17, -0.11)); },
    }, gait: { drag: 0, reachL: 1.55, reachR: 1.35, rate: 1.15, tilt: 0.15, hunch: 0.25 },
  },
  { // shopper: blouse, skirt, long hair
    spec: {
      skin: { c: '#A49A88', blotch: VEIN, blotchAmt: 0.55, noise: 0.07 }, top: { c: '#7A5A6A', noise: 0.06, dirt: GRIME, dirtAmt: 0.45 },
      bottom: { c: '#3A3440', noise: 0.05 }, shoe: { c: '#3A2A2A' }, hair: { c: '#4A3A2C', noise: 0.12 },
      sleeves: [false, true], shoulders: 0.86, folds: 0.04, tatter: 0.06, seed: 67, slack: true, hairStyle: 'long',
      extras: (b) => { b.hips.add(cloth(lathe([[0.17, -0.3], [0.165, -0.15], [0.15, 0.0], [0.14, 0.08]], 14), 0.06, -0.24, 0.07, 3), { c: '#4A4052', dirt: GRIME, dirtAmt: 0.4 }, M(0, 0, 0, 0, 0, 0, 1.18, 1, 0.92)); },
    }, gait: { drag: 1, reachL: 0.5, reachR: 1.5, rate: 1.05, tilt: -0.4, hunch: 0.35 },
  },
  { // 5 police officer: navy uniform, peaked cap, gold badge, duty belt
    spec: {
      skin: { c: '#A3A88E', blotch: BRUISE, blotchAmt: 0.5, noise: 0.07 }, top: { c: '#2A3956', noise: 0.05, dirt: GRIME, dirtAmt: 0.4 },
      bottom: { c: '#1E283C', noise: 0.05 }, shoe: { c: '#15161A' }, hair: { c: '#2A231E' },
      sleeves: [true, true], shoulders: 1.08, folds: 0.03, tatter: 0.04, seed: 79, slack: true, hairStyle: 'policecap',
      extras: (b) => {
        b.torso.add(blob(0.026, 0.03, 0.008, 2.2), { c: '#D4AE48', noise: 0.04 }, M(-0.075, 0.37, -0.124));
        b.torso.add(blob(0.03, 0.008, 0.006), { c: '#C8C6B8' }, M(0.075, 0.38, -0.122));
        b.torso.add(blob(0.02, 0.035, 0.02), { c: '#111318' }, M(0.1, 0.43, -0.105));
        for (const sx of [-1, 1]) b.torso.add(blob(0.03, 0.035, 0.008, 2.2), { c: '#3E6FC8', noise: 0.04 }, M(sx * 0.215, 0.39, 0, 0, sx * Math.PI / 2));
        b.hips.add(ring(0.15, 0.022, 16), { c: '#121418', noise: 0.03 }, M(0, 0.05, 0, Math.PI / 2, 0, 0, 1.15, 0.8, 1));
        b.hips.add(blob(0.035, 0.07, 0.03, 2.4), { c: '#121418' }, M(0.17, -0.02, 0.0));
        b.hips.add(blob(0.03, 0.03, 0.02), { c: '#121418' }, M(-0.16, 0.02, -0.05));
      },
    }, gait: { drag: 0, reachL: 1.4, reachR: 1.2, rate: 1.1, tilt: 0.2, hunch: 0.3 },
  },
  { // 6 patrol officer: lighter short-sleeve shirt, tie, cap, hi-vis band
    spec: {
      skin: { c: '#9AA088', blotch: VEIN, blotchAmt: 0.55, noise: 0.07 }, top: { c: '#4D6A92', noise: 0.05, dirt: GRIME, dirtAmt: 0.45 },
      bottom: { c: '#1E283C', noise: 0.05 }, shoe: { c: '#15161A' }, hair: { c: '#3A2E24' },
      sleeves: [false, false], shoulders: 1.0, folds: 0.04, tatter: 0.06, seed: 83, slack: false, hairStyle: 'policecap',
      extras: (b) => {
        b.torso.add(blob(0.016, 0.14, 0.007, 2.2), { c: '#1A2234' }, M(0, 0.33, -0.124));
        b.torso.add(blob(0.026, 0.03, 0.008, 2.2), { c: '#D4AE48', noise: 0.04 }, M(-0.08, 0.38, -0.122));
        b.torso.add(lathe([[0.162, 0.2], [0.164, 0.24]], 14), { c: '#C9D24A' }, M(0, 0, 0, 0, 0, 0, 1.22, 1, 0.76));
        b.hips.add(ring(0.15, 0.022, 16), { c: '#121418' }, M(0, 0.05, 0, Math.PI / 2, 0, 0, 1.15, 0.8, 1));
      },
    }, gait: { drag: 1, reachL: 1.5, reachR: 0.8, rate: 0.95, tilt: -0.3, hunch: 0.35 },
  },
  { // 7 doctor: long white coat, stethoscope, teal scrubs
    spec: {
      skin: { c: '#A6A890', blotch: BRUISE, blotchAmt: 0.55, noise: 0.07 }, top: { c: '#E4E2DA', noise: 0.04, dirt: '#7A3A36', dirtAmt: 0.35 },
      bottom: { c: '#3E7C80', noise: 0.05 }, shoe: { c: '#D8D6CE' }, hair: { c: '#5A5048', noise: 0.1 },
      sleeves: [true, true], shoulders: 1.0, folds: 0.04, tatter: 0.05, seed: 91, slack: true, hairStyle: 'short',
      extras: (b) => {
        b.hips.add(cloth(lathe([[0.17, -0.42], [0.165, -0.22], [0.155, 0.0], [0.145, 0.08]], 14), 0.04, -0.36, 0.06, 5), { c: '#E2E0D6', dirt: '#7A3A36', dirtAmt: 0.3 }, M(0, 0, 0, 0, 0, 0, 1.22, 1, 0.92));
        b.torso.add(blob(0.05, 0.2, 0.01, 3), { c: '#3E7C80' }, M(0, 0.3, -0.122));
        b.torso.add(ring(0.075, 0.009, 14), { c: '#1E2024' }, M(0, 0.5, -0.02, Math.PI / 2 - 0.5));
        for (const sx of [-1, 1]) b.torso.add(blob(0.007, 0.08, 0.007), { c: '#1E2024' }, M(sx * 0.04, 0.4, -0.125, 0, 0, sx * 0.2));
        b.torso.add(new THREE.SphereGeometry(0.018, 8, 6), { c: '#B8BCC0', noise: 0 }, M(0, 0.32, -0.13));
        b.torso.add(blob(0.04, 0.05, 0.008, 3), { c: '#D6D4CA' }, M(-0.08, 0.36, -0.12));
      },
    }, gait: { drag: 0, reachL: 1.35, reachR: 1.45, rate: 1.0, tilt: 0.3, hunch: 0.3 },
  },
  { // 8 nurse: teal scrubs, scrub cap, lanyard badge, short sleeves
    spec: {
      skin: { c: '#A49C8A', blotch: VEIN, blotchAmt: 0.6, noise: 0.07 }, top: { c: '#4E9AA0', noise: 0.05, dirt: GRIME, dirtAmt: 0.35 },
      bottom: { c: '#4E9AA0', noise: 0.05 }, shoe: { c: '#E0DCD2' }, hair: { c: '#6CB0B4', noise: 0.06 },
      sleeves: [false, false], shoulders: 0.88, folds: 0.04, tatter: 0.05, seed: 97, slack: true, hairStyle: 'scrubcap',
      extras: (b) => {
        b.torso.add(blob(0.07, 0.04, 0.008, 3), { c: '#3E8288' }, M(0, 0.45, -0.115));
        b.torso.add(blob(0.005, 0.1, 0.005), { c: '#C8323C' }, M(0.03, 0.37, -0.126, 0, 0, -0.2));
        b.torso.add(blob(0.022, 0.03, 0.005, 3), { c: '#ECEAE2', noise: 0 }, M(0.05, 0.27, -0.128));
        b.torso.add(blob(0.04, 0.035, 0.008, 3), { c: '#3E8288' }, M(-0.08, 0.2, -0.12));
      },
    }, gait: { drag: 1, reachL: 1.2, reachR: 1.5, rate: 1.05, tilt: -0.3, hunch: 0.4 },
  },
];
export const ZOMBIE_KINDS = ZOMBIES.length;

export function buildZombie(i: number, mat: THREE.Material) {
  const z = ZOMBIES[i % ZOMBIES.length];
  const built = buildHumanoid({ ...z.spec, eyeWhite: '#C9CDB4', iris: C.zEye, lip: '#6E5A5E', sunken: true }, mat);
  return { ...built, gait: z.gait };
}

// ---------- animation ----------
const sm = (x: number) => x * x * (3 - 2 * x);

export function animateSurvivor(r: Rig, s: Sim) {
  const p = s.phase; const sn = Math.sin(p); const cs = Math.cos(p);
  const sliding = s.slideT > 0 && s.jy < 0.05; const air = s.jy > 0.02;
  const steer = Math.max(-1, Math.min(1, s.lane - s.px));
  r.root.rotation.set(0, -steer * 0.35, -steer * 0.22);
  r.torso.rotation.set(0, 0, 0); r.hips.rotation.set(0, 0, 0); r.head.rotation.set(0, 0, 0);
  r.armL.rotation.set(0, 0, 0.06); r.armR.rotation.set(0, 0, -0.06);
  r.legL.rotation.set(0, 0, 0); r.legR.rotation.set(0, 0, 0);

  if (s.mode === 'dying' || s.mode === 'over') {
    const t = sm(Math.min(1, s.dieT * 2.5));
    if (s.deathCause === 'beam') { r.torso.rotation.x = 0.9 * t; r.hips.position.y = 0.95 - 0.55 * t; r.head.rotation.x = -0.5 * t; }
    else { r.torso.rotation.x = -1.1 * t; r.hips.position.y = 0.95 - 0.5 * t; r.head.rotation.x = 0.5 * t; }
    r.armL.rotation.x = 2.3 * t; r.armR.rotation.x = 2.0 * t; r.armL.rotation.z = 0.4 * t; r.armR.rotation.z = -0.4 * t;
    r.foreL.rotation.x = 0.5; r.foreR.rotation.x = 0.7;
    r.legL.rotation.x = 0.7 * t; r.legR.rotation.x = -0.2 * t; r.shinL.rotation.x = -1.1 * t; r.shinR.rotation.x = -0.4 * t;
    return;
  }
  if (sliding) {
    r.hips.position.y = 0.36; r.torso.rotation.x = 0.85; r.head.rotation.x = -0.75;
    r.legL.rotation.x = 1.4; r.legR.rotation.x = 1.05; r.shinL.rotation.x = -0.1; r.shinR.rotation.x = -0.75;
    r.armL.rotation.set(-0.5, 0, 0.5); r.armR.rotation.set(0.6, 0, -0.35); r.foreL.rotation.x = 0.4; r.foreR.rotation.x = 0.9;
    return;
  }
  if (air) {
    const up = Math.max(0, Math.min(1, s.vy / 10));
    r.hips.position.y = 0.95; r.torso.rotation.x = -0.25 - up * 0.1; r.head.rotation.x = 0.2;
    r.legL.rotation.x = 1.1; r.legR.rotation.x = 0.15 + up * 0.3; r.shinL.rotation.x = -1.55; r.shinR.rotation.x = -0.6 - up * 0.6;
    r.armL.rotation.x = -0.8; r.armR.rotation.x = 1.3; r.armL.rotation.z = 0.35; r.armR.rotation.z = -0.25;
    r.foreL.rotation.x = 0.7; r.foreR.rotation.x = 0.9;
    return;
  }
  // run cycle: double-bob, pelvic twist + counter-rotating shoulders, knee drive on swing
  r.hips.position.y = 0.92 + 0.05 * (0.5 + 0.5 * Math.cos(2 * p));
  r.hips.rotation.y = sn * 0.14; r.hips.rotation.z = cs * 0.05;
  r.torso.rotation.x = -0.24; r.torso.rotation.y = -sn * 0.3; r.torso.rotation.z = -cs * 0.04;
  r.head.rotation.x = 0.16; r.head.rotation.y = sn * 0.18;
  r.legL.rotation.x = 0.12 + sn * 0.9; r.legR.rotation.x = 0.12 - sn * 0.9;
  r.shinL.rotation.x = -(0.2 + 1.45 * sm(Math.max(0, cs))) - 0.25 * Math.max(0, -sn);
  r.shinR.rotation.x = -(0.2 + 1.45 * sm(Math.max(0, -cs))) - 0.25 * Math.max(0, sn);
  r.armL.rotation.x = -sn * 0.85; r.armR.rotation.x = sn * 0.85;
  r.foreL.rotation.x = 1.25 + 0.35 * Math.max(0, -sn); r.foreR.rotation.x = 1.25 + 0.35 * Math.max(0, sn);
}

/** Asymmetric shamble: one dragging leg, uneven reaching arms, head lolls and twitches. Leaves root.rotation.y for the caller. */
export function animateZombie(r: Rig, g: ZombieGait, t: number, lunge: number) {
  const tt = t * g.rate; const sn = Math.sin(tt); const cs = Math.cos(tt);
  const good = g.drag === 0 ? 'R' : 'L';
  const swingGood = sn * 0.65; const swingDrag = -sn * 0.28;
  const lift = Math.max(0, g.drag === 0 ? -sn : sn); // drag leg plants heavy
  r.root.rotation.z = sn * 0.07 + (g.drag === 0 ? -1 : 1) * 0.04;
  r.hips.position.y = 0.93 + Math.abs(cs) * 0.04 - lift * 0.03;
  r.hips.rotation.set(0, sn * 0.12, (g.drag === 0 ? 1 : -1) * 0.06 * lift);
  r.torso.rotation.set(-g.hunch - lunge * 0.45 + Math.sin(tt * 2) * 0.05, -sn * 0.12, Math.sin(tt * 0.5) * 0.08);
  const twitch = Math.sin(tt * 0.9) > 0.8 ? Math.sin(tt * 19) * 0.12 : 0;
  r.head.rotation.set(0.25 - lunge * 0.3, twitch, g.tilt + Math.sin(tt * 0.7) * 0.12);
  const [gl, dl] = good === 'L' ? [r.legL, r.legR] : [r.legR, r.legL];
  const [gs, ds] = good === 'L' ? [r.shinL, r.shinR] : [r.shinR, r.shinL];
  gl.rotation.set(0.05 + swingGood, 0, 0); gs.rotation.x = -(0.15 + 0.9 * sm(Math.max(0, good === 'L' ? cs : -cs)));
  dl.rotation.set(0.05 + swingDrag, 0, (good === 'L' ? 1 : -1) * 0.12); ds.rotation.x = -0.08;
  const reachL = g.reachL + Math.sin(tt * 1.3) * 0.12 + lunge * (1.6 - g.reachL);
  const reachR = g.reachR + Math.cos(tt * 1.1) * 0.14 + lunge * (1.6 - g.reachR);
  r.armL.rotation.set(reachL, 0, -0.08 + (reachL < 1 ? 0.12 : 0)); r.armR.rotation.set(reachR, 0, 0.1 - (reachR < 1 ? 0.12 : 0));
  r.foreL.rotation.x = reachL > 1 ? 0.15 + Math.sin(tt * 2.1) * 0.08 : 0.3 + sn * 0.2;
  r.foreR.rotation.x = reachR > 1 ? 0.2 + Math.cos(tt * 1.7) * 0.08 : 0.3 - sn * 0.2;
}

/** Clone a built rig sharing geometry/material (pooled walkers). */
export function cloneRig(r: Rig): Rig {
  const root = r.root.clone(true);
  const out = { root } as Rig;
  (['hips', 'torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR'] as const).forEach((k) => {
    (out as unknown as Record<string, THREE.Object3D>)[k] = root.getObjectByName(k) as THREE.Object3D;
  });
  return out;
}
