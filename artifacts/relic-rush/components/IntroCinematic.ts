// Opening cinematic: a dim apartment at 02:47, TV emergency broadcast, eyes at the window, escape through the front door.
// Own THREE.Scene + camera, rendered by the runner's existing WebGL renderer. Built lazily, disposed after.
import * as THREE from 'three';
import { buildSurvivor, buildZombie, animateZombie, type Rig } from '@/components/characters';
import { textGeo } from '@/components/pixelText';
import { scene as C } from '@/constants/colors';
import { DOOR_OPEN_AT, TV_ON_AT, ZOMBIE_AT } from '@/lib/intro';

export interface Intro { scene: THREE.Scene; cam: THREE.PerspectiveCamera; clear: THREE.Color; update: (t: number, aspect: number) => void; dispose: () => void }

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const sm = (x: number) => { const c = clamp(x); return c * c * (3 - 2 * c); };
const seg = (t: number, a: number, b: number) => sm((t - a) / (b - a));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export function createIntro(): Intro {
  const geos: THREE.BufferGeometry[] = []; const mats: THREE.Material[] = [];
  const reg = <G extends THREE.BufferGeometry>(g: G) => { geos.push(g); return g; };
  const regM = <M extends THREE.Material>(m: M) => { mats.push(m); return m; };
  const lam = (c: string) => regM(new THREE.MeshLambertMaterial({ color: c }));
  const basic = (c: string, extra: THREE.MeshBasicMaterialParameters = {}) => regM(new THREE.MeshBasicMaterial({ color: c, ...extra }));
  const unit = reg(new THREE.BoxGeometry(1, 1, 1));

  const scene = new THREE.Scene();
  const clear = new THREE.Color('#0B0E18');
  scene.fog = new THREE.Fog('#0B0E18', 6, 34);
  const cam = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
  const box = (parent: THREE.Object3D, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(unit, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(0, ry, rz); parent.add(m); return m;
  };

  // lighting: cold moon, dim room, TV glow, exterior fire glow
  const hemi = new THREE.HemisphereLight('#3A4670', '#120E14', 0.55); scene.add(hemi);
  const moon = new THREE.DirectionalLight('#7C90D0', 0.5); moon.position.set(6, 5, -1); scene.add(moon);
  const tvLight = new THREE.PointLight('#6FA8FF', 0, 7, 1.4); tvLight.position.set(0.6, 1.25, -2.9); scene.add(tvLight);
  const fire = new THREE.PointLight('#FF8A3D', 2.2, 26, 1.2); fire.position.set(-2.2, 3, -12); scene.add(fire);
  const lampL = new THREE.PointLight('#E8A860', 0.35, 4, 2); lampL.position.set(2.6, 1.3, 1.4); scene.add(lampL);

  // room shell (4C): back wall has the front door, right wall the window
  const wallM = lam('#3E4258'); const trimM = lam('#2A2C3C'); const floorM = lam('#3A3036'); const rugM = lam('#5E3640');
  box(scene, floorM, 8, 0.1, 7, 0, -0.05, -0.2);
  box(scene, rugM, 2.6, 0.02, 2.0, 0.6, 0.01, -1.1);
  box(scene, wallM, 8, 0.2, 7, 0, 2.95, -0.2);
  box(scene, wallM, 0.2, 3, 7, -4, 1.5, -0.2);
  box(scene, wallM, 8, 3, 0.2, 0, 1.5, 3.2);
  // back wall with door gap x ∈ [-2.75, -1.65]
  box(scene, wallM, 1.25, 3, 0.2, -3.375, 1.5, -3.7);
  box(scene, wallM, 5.65, 3, 0.2, 1.175, 1.5, -3.7);
  box(scene, wallM, 1.1, 0.75, 0.2, -2.2, 2.575, -3.7);
  box(scene, trimM, 1.3, 0.1, 0.24, -2.2, 2.22, -3.7);
  // right wall with window gap z ∈ [-1.4, 0.2], y ∈ [0.9, 2.1]
  box(scene, wallM, 0.2, 0.9, 1.6, 4, 0.45, -0.6);
  box(scene, wallM, 0.2, 0.9, 1.6, 4, 2.55, -0.6);
  box(scene, wallM, 0.2, 3, 3.3, 4, 1.5, 1.85);
  box(scene, wallM, 0.2, 3, 2.3, 4, 1.5, -2.55);
  box(scene, trimM, 0.26, 0.08, 1.7, 4, 0.9, -0.6); box(scene, trimM, 0.26, 0.08, 1.7, 4, 2.1, -0.6);
  box(scene, trimM, 0.26, 1.2, 0.06, 4, 1.5, -0.6);
  // a framed photo + shelf for scale
  box(scene, trimM, 0.04, 0.5, 0.7, -3.88, 1.7, 0.4); box(scene, lam('#6A7890'), 0.02, 0.4, 0.6, -3.86, 1.7, 0.4);
  box(scene, lam('#5A4A40'), 0.4, 0.9, 1.4, -3.7, 0.45, 1.6);

  // couch facing the TV
  const couchM = lam('#4E5C74'); const couchD = lam('#3C4860');
  box(scene, couchM, 2.3, 0.42, 0.95, 0.6, 0.21, 0.75); box(scene, couchD, 2.3, 0.7, 0.25, 0.6, 0.62, 1.15);
  box(scene, couchD, 0.22, 0.62, 0.95, -0.55, 0.31, 0.75); box(scene, couchD, 0.22, 0.62, 0.95, 1.75, 0.31, 0.75);
  box(scene, lam('#7A5E78'), 0.5, 0.18, 0.4, 1.4, 0.5, 0.95, 0.3);
  // lamp
  box(scene, trimM, 0.06, 1.2, 0.06, 2.6, 0.6, 1.4); box(scene, lam('#C89A68'), 0.4, 0.3, 0.4, 2.6, 1.3, 1.4);
  // table + bottles
  box(scene, lam('#5A4A40'), 1.0, 0.06, 0.5, 0.6, 0.42, -0.6); box(scene, trimM, 0.9, 0.38, 0.4, 0.6, 0.2, -0.6);
  box(scene, lam('#3F6B5A'), 0.07, 0.24, 0.07, 0.3, 0.57, -0.6); box(scene, lam('#B88A3C'), 0.09, 0.1, 0.09, 0.85, 0.5, -0.55);

  // TV + broadcast (geometry text; captions mirror it in UI)
  box(scene, lam('#2E2A30'), 1.7, 0.5, 0.5, 0.6, 0.25, -3.35);
  box(scene, lam('#121218'), 1.55, 0.95, 0.08, 0.6, 1.2, -3.48);
  const screenM = basic('#0A0C10');
  const screen = new THREE.Mesh(reg(new THREE.PlaneGeometry(1.4, 0.8)), screenM); screen.position.set(0.6, 1.2, -3.435); scene.add(screen);
  const bcast = new THREE.Group(); bcast.position.set(0.6, 1.2, -3.43); scene.add(bcast);
  box(bcast, basic('#C8323C'), 1.4, 0.2, 0.002, 0, 0.27, 0);
  const t1 = new THREE.Mesh(reg(textGeo('EMERGENCY ALERT', 0.016)), basic('#F4F0E6')); t1.position.set(0, 0.27, 0.003); bcast.add(t1);
  const t2 = new THREE.Mesh(reg(textGeo('STAY INSIDE', 0.02)), basic('#FFD45A')); t2.position.set(0, 0.07, 0.003); bcast.add(t2);
  box(bcast, basic('#E07A3A'), 1.4, 0.24, 0.002, 0, -0.26, 0);
  const crowd: THREE.Mesh[] = [];
  const crowdM = basic('#1A1418');
  for (let i = 0; i < 9; i++) crowd.push(box(bcast, crowdM, 0.035, 0.1 + (i % 3) * 0.02, 0.002, 0, -0.25, 0.004));
  const ticker = box(bcast, basic('#F4F0E6'), 0.5, 0.025, 0.002, 0, -0.1, 0.004);
  bcast.visible = false;

  // window: glass, cracks, the thing outside
  const glassM = basic('#6E86B8', { transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const glass = new THREE.Mesh(reg(new THREE.PlaneGeometry(1.6, 1.2)), glassM); glass.rotation.y = -Math.PI / 2; glass.position.set(3.97, 1.5, -0.6); scene.add(glass);
  const crackM = basic('#E4ECF4', { transparent: true, opacity: 0.85 });
  const cracks: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + i * 0.37; const len = 0.18 + ((i * 37) % 7) * 0.05;
    const m = new THREE.Mesh(unit, crackM); m.scale.set(0.006, 0.008, len);
    m.position.set(3.955, 1.55 + Math.sin(a) * len / 2, -0.45 + Math.cos(a) * len / 2); m.rotation.set(-a, 0, 0); m.visible = false; scene.add(m); cracks.push(m);
  }
  // night outside the window
  box(scene, basic('#0E1424'), 0.2, 6, 8, 7.5, 2, -0.6);
  const charMat = regM(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const zb = buildZombie(2, charMat); zb.geos.forEach(reg);
  const zr = zb.rig; zr.root.position.set(4.55, -0.15, -0.55); zr.root.rotation.y = Math.PI / 2; zr.root.visible = false; scene.add(zr.root);
  const eyeM = basic('#DAF25A', { fog: false }); const haloM = basic('#C8F040', { transparent: true, opacity: 0.35, depthWrite: false, fog: false });
  const eyeGeo = reg(new THREE.SphereGeometry(0.017, 8, 6)); const haloGeo = reg(new THREE.SphereGeometry(0.05, 10, 8));
  const halos: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeM); e.position.set(sx * 0.035, 0.115, -0.11); zr.head.add(e);
    const h = new THREE.Mesh(haloGeo, haloM); h.position.set(sx * 0.035, 0.115, -0.12); zr.head.add(h); halos.push(h);
  }

  // front door on a hinge, and the burning street beyond
  const hinge = new THREE.Group(); hinge.position.set(-2.75, 0, -3.68); scene.add(hinge);
  box(hinge, lam('#5A3A34'), 1.1, 2.2, 0.07, 0.55, 1.1, 0); box(hinge, lam('#C8A050'), 0.06, 0.06, 0.1, 0.95, 1.05, 0.03);
  const outM = lam('#3A3440'); const walkM = lam('#5A5058'); const bldM = lam('#2E2834'); const bldM2 = lam('#3A2E36');
  box(scene, outM, 8, 0.1, 40, -2.2, -0.05, -24);
  box(scene, walkM, 3, 0.2, 40, -6.7, 0.1, -24); box(scene, walkM, 3, 0.2, 40, 2.3, 0.1, -24);
  for (let i = 0; i < 6; i++) {
    const h = 6 + ((i * 53) % 5) * 2;
    box(scene, i % 2 ? bldM : bldM2, 5, h, 6, -10.5, h / 2, -8 - i * 6.5); box(scene, i % 2 ? bldM2 : bldM, 5, h + 1, 6, 6.1, (h + 1) / 2, -8 - i * 6.5);
  }
  box(scene, basic('#C8643A', { fog: false }), 30, 14, 0.2, -2.2, 6, -42);
  box(scene, basic('#7A2E2A', { fog: false }), 30, 4, 0.2, -2.2, 14, -41.8);
  box(scene, lam('#6A3A2E'), 1.8, 0.7, 4, 0.4, 0.55, -14, 0.5, 0.1);
  box(scene, basic('#FFB060', { fog: false }), 1.2, 1.4, 0.4, 0.4, 1.4, -14.2);
  box(scene, lam('#8A8478'), 6, 0.04, 0.3, -2.2, 0.02, -6);

  // survivor + go-bag
  const sb = buildSurvivor(charMat); sb.geos.forEach(reg);
  const r = sb.rig; scene.add(r.root);
  const remote = box(r.foreR, lam('#1A1A1E'), 0.04, 0.02, 0.14, 0, -0.34, -0.05); remote.visible = false;
  const bagM = lam(C.packDark);
  const floorBag = box(scene, bagM, 0.5, 0.28, 0.28, -0.85, 0.14, 0.3, 0.4);
  const handBag = box(r.foreR, bagM, 0.28, 0.5, 0.26, 0, -0.55, 0); handBag.visible = false;

  const setRot = (g: THREE.Object3D, x: number, y = 0, z = 0) => g.rotation.set(x, y, z);
  const runPose = (rr: Rig, ph: number) => {
    const sn = Math.sin(ph); const cs = Math.cos(ph);
    rr.hips.position.y = 0.92 + 0.05 * (0.5 + 0.5 * Math.cos(2 * ph));
    setRot(rr.hips, 0, sn * 0.14, cs * 0.05); setRot(rr.torso, -0.3, -sn * 0.3, 0); setRot(rr.head, 0.12, sn * 0.15, 0);
    setRot(rr.legL, 0.12 + sn * 0.95); setRot(rr.legR, 0.12 - sn * 0.95);
    rr.shinL.rotation.x = -(0.2 + 1.45 * sm(Math.max(0, cs))); rr.shinR.rotation.x = -(0.2 + 1.45 * sm(Math.max(0, -cs)));
    setRot(rr.armL, -sn * 0.9, 0, 0.08); rr.foreL.rotation.x = 1.3;
    setRot(rr.armR, 0.4, 0, -0.1); rr.foreR.rotation.x = 0.5;
  };
  const path: [number, number, number][] = [[7.3, 0.3, 0.25], [8.3, -2.2, -2.3], [8.65, -2.2, -3.7], [10.2, -2.2, -17]];
  const along = (t: number) => {
    for (let i = 0; i < path.length - 1; i++) {
      const [ta, xa, za] = path[i]; const [tb, xb, zb2] = path[i + 1];
      if (t <= tb) { const k = clamp((t - ta) / (tb - ta)); return { x: mix(xa, xb, k), z: mix(za, zb2, k), dx: xb - xa, dz: zb2 - za }; }
    }
    const [, x, z] = path[path.length - 1]; return { x, z, dx: 0, dz: -1 };
  };
  const look = new THREE.Vector3();
  const tvOn = new THREE.Color('#2F6AD8'); const tvFlash = new THREE.Color('#E8F0FF'); const tvOff = new THREE.Color('#0A0C10');

  const update = (t: number, aspect: number) => {
    cam.aspect = aspect; cam.fov = aspect > 1 ? 44 : 58; cam.updateProjectionMatrix();
    // ---- survivor body ----
    r.root.position.set(0.6, 0, 0.75); r.root.rotation.set(0, 0, 0);
    r.hips.position.y = 0.5; setRot(r.hips, 0); setRot(r.torso, 0); setRot(r.head, 0);
    remote.visible = t > 2.15 && t < 5.2; handBag.visible = t >= 7.45; floorBag.visible = !handBag.visible;
    if (t < 5) {
      // seated: asleep → jolt → reach remote → recoil in shock
      const jolt = seg(t, 1.2, 1.42); const shock = seg(t, 3.55, 3.8);
      const sway = (1 - jolt) * Math.sin(t * 1.6) * 0.04;
      setRot(r.legL, 1.5, 0, 0.06); setRot(r.legR, 1.5, 0, -0.06); r.shinL.rotation.x = -1.45; r.shinR.rotation.x = -1.45;
      setRot(r.torso, mix(0.32, -0.08, jolt) + shock * 0.42 + sway, 0, mix(0.12, 0, jolt));
      const shake = shock > 0 && t < 4.6 ? Math.sin(t * 34) * 0.06 : 0;
      setRot(r.head, mix(0.6, -0.12, jolt) - shock * 0.22, shake, mix(0.35, 0, jolt));
      const reach = seg(t, 2.05, 2.35) * (1 - seg(t, 2.8, 3.1));
      const guard = shock;
      setRot(r.armL, mix(mix(0.25, 0.7, jolt), 1.95, guard), 0, mix(0.06, 0.4, jolt));
      setRot(r.armR, mix(mix(mix(0.25, 0.7, jolt), 1.35, reach), 1.85, guard), 0, -mix(0.06, 0.35, jolt));
      r.foreL.rotation.x = mix(0.6, 1.9, guard); r.foreR.rotation.x = mix(mix(0.6, 0.2, reach), 1.9, guard);
      r.root.position.y = jolt > 0 && jolt < 1 ? Math.sin(jolt * Math.PI) * 0.06 : 0;
    } else if (t < 7.3) {
      // stand, turn to the window, back off a step
      const up = seg(t, 5.0, 5.45); const turn = seg(t, 5.35, 5.9); const back = seg(t, 6.3, 6.9);
      r.root.position.set(mix(0.6, 0.3, back), 0, mix(0.75, 0.25, up));
      r.root.rotation.y = -Math.PI / 2 * turn + back * 0.25;
      r.hips.position.y = mix(0.5, 0.95, up);
      setRot(r.legL, mix(1.5, 0.05, up)); setRot(r.legR, mix(1.5, -0.05, up)); r.shinL.rotation.x = mix(-1.45, -0.1, up); r.shinR.rotation.x = mix(-1.45, -0.1, up);
      setRot(r.torso, mix(0.3, 0.12, up) + back * 0.15); setRot(r.head, -0.05 - back * 0.1, Math.sin(t * 20) * 0.02 * back);
      setRot(r.armL, 0.9, 0, 0.3); setRot(r.armR, 0.8, 0, -0.3); r.foreL.rotation.x = 1.6; r.foreR.rotation.x = 1.5;
      if (t > 6.3) { r.shinL.rotation.x = -0.35 * back; r.legL.rotation.x = -0.25 * back; }
    } else {
      // grab the bag, sprint for the door
      const p = along(t);
      r.root.position.set(p.x, 0, p.z);
      r.root.rotation.y = Math.atan2(-p.dx, -p.dz);
      runPose(r, t * 13);
      const grab = seg(t, 7.3, 7.45) * (1 - seg(t, 7.45, 7.7));
      if (grab > 0) { r.torso.rotation.x = -0.3 - grab * 0.5; r.armR.rotation.x = 0.4 + grab * 0.8; }
    }

    // ---- TV ----
    const on = t >= TV_ON_AT;
    const flick = on && t < TV_ON_AT + 0.25 ? (Math.sin(t * 90) > 0 ? 1 : 0.3) : 1;
    screenM.color.copy(on ? (t < TV_ON_AT + 0.12 ? tvFlash : tvOn) : tvOff);
    bcast.visible = on && t > TV_ON_AT + 0.12;
    tvLight.intensity = on ? (1.6 + Math.sin(t * 11) * 0.25 + Math.sin(t * 37) * 0.15) * flick : 0;
    if (bcast.visible) {
      for (let i = 0; i < crowd.length; i++) {
        const x = ((i * 0.17 + t * (0.12 + (i % 3) * 0.04)) % 1.3) - 0.65;
        crowd[i].position.x = x; crowd[i].position.y = -0.27 + Math.abs(Math.sin(t * 8 + i)) * 0.015;
      }
      ticker.position.x = 0.45 - ((t * 0.5) % 1.3);
      t1.visible = Math.sin(t * 9) > -0.6;
    }

    // ---- window threat ----
    zr.root.visible = t >= ZOMBIE_AT && t < 9.2;
    if (zr.root.visible) {
      const lean = seg(t, ZOMBIE_AT, 5.6);
      zr.root.position.x = mix(5.4, 4.5, lean);
      animateZombie(zr, zb.gait, t * 3, 0.6);
      zr.armL.rotation.x = 1.75 + Math.sin(t * 9) * 0.18; zr.armR.rotation.x = 1.6 + Math.cos(t * 8) * 0.18;
      zr.head.rotation.set(0.05, 0, 0.12);
      const glow = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 6));
      haloM.opacity = glow; for (const h of halos) h.scale.setScalar(0.9 + glow);
    }
    const nCr = t < 5.8 ? 0 : t < 6.35 ? 3 : t < 6.8 ? 6 : 9;
    for (let i = 0; i < cracks.length; i++) cracks[i].visible = i < nCr;
    glassM.opacity = 0.22 + (nCr / 9) * 0.12;

    // ---- door ----
    const open = seg(t, DOOR_OPEN_AT, DOOR_OPEN_AT + 0.22);
    hinge.rotation.y = open * 1.85;
    lampL.intensity = t < 1.2 ? 0.35 : 0.35 * (Math.sin(t * 40) > 0.2 ? 1 : 0.2);
    fire.intensity = 2.0 + Math.sin(t * 7) * 0.3 + Math.sin(t * 17) * 0.2;

    // ---- camera: distinct shots with cuts ----
    let px: number, py: number, pz: number;
    if (t < 2.0) { const k = t / 2; px = mix(2.5, 2.25, k); py = mix(1.25, 1.35, k); pz = mix(-1.7, -1.45, k); look.set(0.6, 0.85, 0.75); }
    else if (t < 3.6) { const k = (t - 2) / 1.6; px = mix(1.45, 1.25, k); py = 1.6; pz = mix(2.3, 2.0, k); look.set(0.6, 1.1, -3.4); }
    else if (t < 5.0) { const k = (t - 3.6) / 1.4; px = mix(0.78, 0.7, k); py = 1.32; pz = mix(-0.55, -0.35, k); look.set(0.6, 1.22, 0.75); }
    else if (t < 6.2) { const k = (t - 5) / 1.2; px = mix(-1.1, -0.7, k); py = 1.65; pz = mix(1.7, 1.4, k); look.set(4, 1.5, -0.6); }
    else if (t < 7.1) { const k = (t - 6.2) / 0.9; px = mix(2.5, 2.9, k); py = 1.58; pz = -0.35; look.set(4.5, 1.62, -0.58); }
    else if (t < 8.5) { px = 2.9; py = 2.5; pz = 2.5; look.set(r.root.position.x, 1.0, r.root.position.z); }
    else { px = r.root.position.x + 0.5; py = 1.75; pz = r.root.position.z + 2.8; look.set(r.root.position.x, 1.1, r.root.position.z - 5); }
    const jolt = t > 1.22 && t < 1.6 ? Math.sin(t * 70) * 0.03 * (1.6 - t) * 3 : 0;
    const crackShake = t > 6.3 && t < 6.6 ? Math.sin(t * 80) * 0.02 : 0;
    cam.position.set(px + jolt, py + jolt * 0.5 + crackShake, pz);
    cam.lookAt(look);
  };

  const dispose = () => {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    scene.clear();
  };
  return { scene, cam, clear, update, dispose };
}
