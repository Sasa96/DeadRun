// In-engine completion cutscenes: one small THREE.Scene per mission with posed characters, moving props
// and a scripted camera. Rendered by the runner's renderer, built lazily and disposed afterwards.
import * as THREE from 'three';
import { animateZombie, buildSurvivor, buildZombie, type Rig, type ZombieGait } from '@/components/characters';
import { idlePose, reachPose, runPose, slumpPose, wavePose } from '@/components/poses';
import { signText } from '@/components/signText';
import { cutsceneLength } from '@/components/campaignMeta';
import { missionById } from '@/lib/campaign';

export interface MissionCutscene { id: number; scene: THREE.Scene; cam: THREE.PerspectiveCamera; clear: THREE.Color; update: (t: number, aspect: number) => void; dispose: () => void }

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const sm = (x: number) => { const c = clamp(x); return c * c * (3 - 2 * c); };
const seg = (t: number, a: number, b: number) => sm((t - a) / (b - a));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
type V3 = [number, number, number];
const mixV = (a: V3, b: V3, k: number): V3 => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];

export function createMissionCutscene(id: number): MissionCutscene {
  const def = missionById(id); const LEN = cutsceneLength(id);
  const geos: THREE.BufferGeometry[] = []; const mats: THREE.Material[] = [];
  const reg = <G extends THREE.BufferGeometry>(g: G) => { geos.push(g); return g; };
  const regM = <M extends THREE.Material>(m: M) => { mats.push(m); return m; };
  const lam = (c: string) => regM(new THREE.MeshLambertMaterial({ color: c }));
  const basic = (c: string, x: THREE.MeshBasicMaterialParameters = {}) => regM(new THREE.MeshBasicMaterial({ color: c, ...x }));
  const unit = reg(new THREE.BoxGeometry(1, 1, 1)); const cylG = reg(new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
  const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(48, 1, 0.05, 160);
  const box = (p: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, rz = 0, rx = 0) => {
    const b = new THREE.Mesh(unit, m); b.scale.set(sx, sy, sz); b.position.set(x, y, z); b.rotation.set(rx, ry, rz); p.add(b); return b;
  };
  const cyl = (p: THREE.Object3D, m: THREE.Material, r: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const c = new THREE.Mesh(cylG, m); c.scale.set(r * 2, h, r * 2); c.position.set(x, y, z); c.rotation.set(rx, 0, rz); p.add(c); return c;
  };
  const words = (p: THREE.Object3D, s: string, px: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const t = new THREE.Mesh(reg(signText(s, px)), m); t.position.set(x, y, z); t.rotation.y = ry; p.add(t); return t;
  };
  const charMat = regM(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const actor = (look: 'scout' | 'medic' | 'ranger') => { const b = buildSurvivor(charMat, look); b.geos.forEach(reg); scene.add(b.rig.root); return b.rig; };
  const zombie = (k: number) => { const b = buildZombie(k, charMat); b.geos.forEach(reg); scene.add(b.rig.root); return { r: b.rig, g: b.gait as ZombieGait }; };
  const place = (r: Rig, x: number, z: number, ry: number, y = 0) => { r.root.position.set(x, y, z); r.root.rotation.set(0, ry, 0); };

  // palettes
  const P = {
    concrete: lam('#6E6A72'), dark: lam('#2A2830'), steel: lam('#8E98A4'), floor: lam('#3B3A44'), white: lam('#E2E4DC'), navy: lam('#25334F'),
    red: lam('#C8362E'), amber: lam('#E9A23B'), teal: lam('#2F9C8E'), wood: lam('#6E5A48'), glass: lam('#6F9AAE'), olive: lam('#5E6A3C'),
    yellow: lam('#E8C23A'), rust: lam('#8A4A34'), hull: lam('#D8D4C8'), sand: lam('#A89470'), paper: lam('#E8E1CC'),
    water: lam('#24405C'), deck: lam('#45414A'),
    gAmber: basic('#FFC76A'), gGreen: basic('#6CF08E'), gRed: basic('#FF5A48'), gTeal: basic('#7EF0DA'), gWhite: basic('#F4F1E6'), gBlue: basic('#6FA8FF'), ink: basic('#18161E'),
    smoke: basic('#7A7480', { transparent: true, opacity: 0.5, depthWrite: false }),
    cone: basic('#FFD48A', { transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
  };
  const hemi = new THREE.HemisphereLight('#7C80A8', '#1A1620', 0.9); scene.add(hemi);
  const key = new THREE.DirectionalLight('#FFB46A', 1.1); key.position.set(-4, 7, 6); scene.add(key);
  const pt = new THREE.PointLight('#FFC76A', 0, 12, 1.5); scene.add(pt);
  let clear = new THREE.Color('#1A1826');
  const setFog = (c: string, near: number, far: number) => { clear = new THREE.Color(c); scene.fog = new THREE.Fog(c, near, far); };
  setFog('#1A1826', 10, 60);
  const ground = (m: THREE.Material, w = 60, d = 60) => box(scene, m, w, 0.1, d, 0, -0.05, 0);

  const hero = actor('scout');
  let camPath: (t: number) => { p: V3; l: V3 } = () => ({ p: [0, 2, 6], l: [0, 1, 0] });
  let tick: (t: number) => void = () => {};

  switch (def.scene) {
    case 'shelter': {
      setFog('#2A2232', 8, 50); ground(P.floor);
      box(scene, P.concrete, 14, 5, 3, 0, 2.5, -1.5);
      const door = box(scene, P.dark, 2.4, 3.0, 0.25, 0, 1.5, 0.1);
      for (let i = 0; i < 6; i++) box(scene, i % 2 ? P.ink : P.yellow, 0.3, 3.2, 0.3, (i < 3 ? -1.45 : 1.45), 1.6, 0.1 + (i % 3) * 0.001);
      const lampG = box(scene, P.gRed, 0.4, 0.25, 0.2, 0, 3.4, 0.2); words(scene, 'SHELTER', 0.12, P.gTeal, 0, 4.1, 0.05);
      // interior: shelter room behind the door
      box(scene, P.concrete, 6, 3.4, 0.2, 0, 1.7, -5.5); box(scene, P.steel, 2.6, 0.1, 0.8, 1.2, 1.2, -5.0);
      const radio = new THREE.Group(); box(radio, P.dark, 0.6, 0.35, 0.3, 0, 0, 0); cyl(radio, P.steel, 0.015, 0.6, 0.2, 0.45, 0); const led = box(radio, P.gRed, 0.06, 0.06, 0.02, -0.2, 0.08, 0.16); radio.position.set(1.2, 1.45, -5.0); scene.add(radio);
      const zs = [zombie(0), zombie(3), zombie(1)];
      tick = (t) => {
        const run = seg(t, 0, 2.1);
        place(hero, mix(-0.5, 0, run), mix(7, -2.5, run), Math.PI);
        if (t < 2.1) runPose(hero, t); else { slumpPose(hero, t); place(hero, 0.6, -4.6, Math.PI * 0.5); }
        door.position.x = mix(2.4, 0, seg(t, 2.0, 2.6)); lampG.material = t > 2.6 ? P.gGreen : P.gRed;
        zs.forEach((z, i) => { const k = seg(t, 1.6 + i * 0.3, 3.2 + i * 0.3); place(z.r, -1.5 + i * 1.4, mix(12, 0.9 + i * 0.3, k), Math.PI); animateZombie(z.r, z.g, t * 5 + i, t > 2.9 ? 0.8 : 0.2); z.r.root.visible = t < 4; });
        led.material = t > 4.4 && Math.sin(t * 10) > 0 ? P.gGreen : P.gRed; pt.position.set(1.2, 1.9, -4.6); pt.intensity = t > 4 ? 1.2 + 0.4 * Math.sin(t * 9) : 0;
      };
      camPath = (t) => t < 3.8 ? { p: mixV([3, 1.8, 9], [2.4, 2.2, 4], seg(t, 0, 3.8)), l: [0, 1.4, 0] } : { p: mixV([-1.2, 1.7, -2.2], [-0.2, 1.6, -3.2], seg(t, 3.8, 7)), l: [1.1, 1.3, -5] };
      break;
    }
    case 'map': case 'radio': {
      setFog('#1C2436', 8, 40); ground(P.floor); hemi.color.set('#6E86B8');
      box(scene, P.navy, 14, 4, 0.3, 0, 2, -3); box(scene, P.navy, 0.3, 4, 10, -5, 2, 1);
      box(scene, P.wood, 3.4, 0.9, 1.2, 0, 0.45, -1.4); box(scene, P.wood, 3.6, 0.08, 1.4, 0, 0.92, -1.4);
      const map = new THREE.Group(); box(map, P.paper, 1.4, 0.9, 0.02, 0, 0, 0); for (let i = 0; i < 5; i++) box(map, P.steel, 1.3, 0.01, 0.025, 0, -0.35 + i * 0.18, 0.001);
      const route = box(map, P.red, 1, 0.05, 0.03, 0, 0.05, 0.002, 0, 0.35); route.scale.x = 0.001; const cross = box(map, P.red, 0.12, 0.12, 0.03, 0.42, 0.22, 0.003, 0, 0.78);
      scene.add(map);
      const radio = new THREE.Group(); box(radio, P.dark, 1.2, 0.5, 0.5, 0, 0, 0); box(radio, P.steel, 0.4, 0.3, 0.02, -0.3, 0, 0.26);
      const leds = [0, 1, 2, 3].map((i) => box(radio, P.ink, 0.06, 0.06, 0.02, 0.15 + i * 0.1, 0.12, 0.26)); cyl(radio, P.steel, 0.015, 1.1, 0.5, 0.75, 0);
      const slot = box(radio, P.ink, 0.3, 0.22, 0.04, 0.3, -0.1, 0.26); radio.position.set(0.9, 1.2, -1.6); scene.add(radio);
      const batt = new THREE.Group(); box(batt, P.dark, 0.28, 0.2, 0.18, 0, 0, 0); box(batt, P.yellow, 0.29, 0.07, 0.19, 0, 0.03, 0); scene.add(batt);
      words(scene, def.scene === 'map' ? 'EVACUATION' : 'DISPATCH', 0.1, P.gWhite, 0, 3.0, -2.84);
      const isRadio = def.scene === 'radio';
      tick = (t) => {
        const walk = seg(t, 0, 1.6); place(hero, mix(-2.4, isRadio ? 0.9 : -0.3, walk), mix(2.5, -0.5, walk), Math.PI);
        if (t < 1.6) runPose(hero, t, 0.45, 6); else reachPose(hero, t, seg(t, 1.6, 2.2), isRadio ? 1.1 : 1.3);
        if (!isRadio) {
          const lift = seg(t, 2.2, 3.2); map.position.set(mix(-0.3, -0.3, lift), mix(0.96, 1.45, lift), mix(-1.4, -1.05, lift)); map.rotation.set(mix(-Math.PI / 2, -0.5, lift), 0, 0);
          route.scale.x = 0.001 + seg(t, 3.6, 5.6) * 1.0; route.position.x = -0.5 + route.scale.x / 2; cross.visible = t > 5.6;
          batt.visible = false; leds.forEach((l, i) => { l.material = i === 0 && Math.sin(t * 3) > 0.6 ? P.gRed : P.ink; });
          pt.position.set(-0.3, 2.2, -0.4); pt.intensity = 0.8;
        } else {
          const ins = seg(t, 2.0, 2.9); batt.position.set(mix(0.9, 1.2, ins), mix(1.25, 1.1, ins), mix(-0.6, -1.32, ins)); batt.visible = t < 3.0; slot.material = t > 2.9 ? P.gAmber : P.ink;
          leds.forEach((l, i) => { l.material = t > 3.0 + i * 0.15 ? (i === 3 && Math.sin(t * 14) > 0 ? P.gRed : P.gGreen) : P.ink; });
          map.position.set(-0.6, 0.97, -1.3); map.rotation.set(-Math.PI / 2, 0, 0.2);
          route.scale.x = 0.001 + seg(t, 4.8, 6.4); route.position.x = -0.5 + route.scale.x / 2; cross.visible = t > 6.4;
          pt.position.set(0.9, 1.8, -1); pt.intensity = t > 3 ? 1 + 0.5 * Math.sin(t * 20) : 0.2;
        }
      };
      camPath = (t) => t < 3.4 ? { p: mixV([-3.5, 2.2, 4], [-1.6, 1.9, 1.5], seg(t, 0, 3.4)), l: [0.3, 1.1, -1.4] } : { p: mixV([-0.9, 2.1, 0.2], [-0.4, 1.85, -0.5], seg(t, 3.4, 7)), l: isRadio ? [0.3, 1.0, -1.4] : [-0.3, 1.2, -1.2] };
      break;
    }
    case 'hospital': {
      setFog('#3A3448', 10, 60); ground(P.floor);
      box(scene, P.white, 22, 9, 3, 0, 4.5, -3); box(scene, P.white, 9, 0.5, 4, -2, 4.0, 0.5); for (const x of [-5.5, 1.5]) box(scene, P.steel, 0.3, 3.8, 0.3, x, 1.9, 2.2);
      box(scene, P.red, 2, 0.6, 0.2, -2, 7.4, -1.4); box(scene, P.red, 0.6, 2, 0.2, -2, 7.4, -1.4); words(scene, 'ST AGNES', 0.16, P.red, -2, 5.6, -1.4);
      const win = box(scene, P.glass, 2.2, 1.6, 0.1, 3.6, 1.9, -1.45); const winLight = box(scene, P.gAmber, 2.0, 1.4, 0.05, 3.6, 1.9, -1.6);
      const doc = actor('medic'); place(doc, 3.6, -2.0, 0);
      const mDoor = box(scene, P.dark, 1.6, 2.4, 0.1, 8.5, 1.2, -1.45); const mLamp = box(scene, P.gGreen, 0.3, 0.2, 0.1, 8.5, 2.7, -1.4); words(scene, 'MAINTENANCE', 0.07, P.gGreen, 8.5, 3.1, -1.4);
      tick = (t) => {
        const w = seg(t, 0, 2.2); place(hero, mix(-1, 3.2, w), mix(8, 1.3, w), mix(Math.PI, Math.PI * 1.0, w));
        if (t < 2.2) runPose(hero, t, 0.7, 8); else idlePose(hero, t);
        if (t > 4.6) { hero.root.rotation.y = mix(Math.PI, Math.PI * 0.6, seg(t, 4.6, 5.4)); }
        winLight.visible = t > 1.4 && (t > 1.9 || Math.sin(t * 30) > 0); win.visible = true;
        if (t > 2.2 && t < 4.8) wavePose(doc, t); else if (t >= 4.8) { reachPose(doc, t, 0.6, 1.5); doc.root.rotation.y = -0.6; } else idlePose(doc, t);
        mLamp.visible = t < 4.6 || Math.sin(t * 8) > -0.3; mDoor.position.x = 8.5 - seg(t, 5.4, 6.4) * 0.6;
      };
      camPath = (t) => t < 4.6 ? { p: mixV([0, 2.4, 11], [1.8, 1.9, 4.2], seg(t, 0, 4.6)), l: [3.4, 1.7, -1.5] } : { p: mixV([3.6, 2.0, 4.2], [5.6, 2.0, 4.6], seg(t, 4.6, 7)), l: [8.5, 1.6, -1.4] };
      break;
    }
    case 'generator': {
      setFog('#0E1216', 6, 34); ground(P.floor); hemi.intensity = 0.18; key.intensity = 0.15;
      box(scene, P.concrete, 18, 5, 0.3, 0, 2.5, -4); const gen = new THREE.Group(); box(gen, P.olive, 3, 1.8, 1.8, 0, 0.9, 0); cyl(gen, P.dark, 0.16, 1.6, -1, 2.4, -0.4); cyl(gen, P.dark, 0.16, 1.6, 1, 2.4, -0.4); gen.position.set(-2.4, 0, -2.6); scene.add(gen);
      const panel = new THREE.Group(); box(panel, P.steel, 1.2, 1.6, 0.3, 0, 0, 0); const sock = box(panel, P.ink, 0.2, 0.36, 0.05, 0, 0.2, 0.16); const dial = box(panel, P.gRed, 0.12, 0.12, 0.05, -0.35, 0.55, 0.16); panel.position.set(1, 1.4, -3.7); scene.add(panel);
      const fuse = new THREE.Group(); cyl(fuse, P.glass, 0.05, 0.25, 0, 0, 0); cyl(fuse, P.steel, 0.06, 0.05, 0, 0.13, 0); scene.add(fuse);
      const lights = [0, 1, 2, 3, 4].map((i) => box(scene, P.ink, 1.6, 0.08, 0.5, -6 + i * 3, 4.8, -1));
      // ward doors with glass and infected behind
      const doors = new THREE.Group(); box(doors, P.white, 4, 3, 0.2, 0, 1.5, 0); box(doors, P.glass, 1.4, 0.9, 0.22, -0.9, 2, 0); box(doors, P.glass, 1.4, 0.9, 0.22, 0.9, 2, 0); words(doors, 'WARD C', 0.1, P.red, 0, 3.3, 0.12); doors.position.set(6.5, 0, -3.8); scene.add(doors);
      const zs = [zombie(7), zombie(8), zombie(2)];
      const alarm = box(scene, P.gRed, 0.4, 0.4, 0.4, 6.5, 4.4, -3.6);
      tick = (t) => {
        place(hero, 1, -2.9, Math.PI); reachPose(hero, t, seg(t, 0.2, 1.0), 1.25);
        const ins = seg(t, 0.8, 1.8); fuse.position.set(1, mix(1.25, 1.6, ins), mix(-3.0, -3.53, ins)); fuse.visible = t < 1.9; sock.material = t > 1.8 ? P.gAmber : P.ink;
        const on = t > 2.1; gen.position.x = -2.4 + (on ? Math.sin(t * 60) * 0.015 : 0); dial.material = on ? P.gGreen : P.gRed;
        lights.forEach((l, i) => { l.material = t > 2.6 + i * 0.25 ? P.gWhite : P.ink; });
        const lit = seg(t, 2.6, 3.8); hemi.intensity = mix(0.18, 1.0, lit); key.intensity = mix(0.15, 0.8, lit); clear.set('#0E1216').lerp(new THREE.Color('#9CB4AC'), lit); (scene.fog as THREE.Fog).color.copy(clear);
        zs.forEach((z, i) => { place(z.r, 5.6 + i * 0.9, -4.5 - (i % 2) * 0.4, 0); animateZombie(z.r, z.g, t * 4 + i, t > 3.6 ? 0.9 : 0.1); z.r.root.visible = t > 3.2; });
        alarm.visible = t > 4.2 && Math.sin(t * 12) > 0; if (t > 5) { hero.root.rotation.y = mix(Math.PI, Math.PI * 0.6, seg(t, 5, 5.6)); }
        pt.position.set(1, 2, -2.5); pt.intensity = t < 2.6 ? 0.7 : 0;
      };
      camPath = (t) => t < 3 ? { p: mixV([-0.2, 1.9, -0.4], [0.2, 1.8, -1.6], seg(t, 0, 3)), l: [1, 1.4, -3.7] } : { p: mixV([0.5, 2.6, 4], [2.5, 2.2, 2.5], seg(t, 3, 7)), l: [5.2, 1.8, -3.6] };
      break;
    }
    case 'escort': case 'fuel': {
      const fuel = def.scene === 'fuel';
      setFog(fuel ? '#4A3C4E' : '#2E3444', 10, 55); ground(P.floor);
      box(scene, P.concrete, 24, 6, 0.4, 0, 3, -6);
      const veh = new THREE.Group();
      if (!fuel) { box(veh, P.white, 2.4, 2.3, 5.2, 0, 1.35, 0); box(veh, P.red, 2.42, 0.3, 5.22, 0, 1.2, 0); box(veh, P.glass, 2.2, 0.7, 0.1, 0, 1.9, -2.62); }
      else { box(veh, P.teal, 2.3, 1.8, 4.8, 0, 1.2, 0); box(veh, P.glass, 2.1, 0.7, 0.1, 0, 1.75, -2.42); }
      for (const x of [-1.05, 1.05]) for (const z of [-1.6, 1.6]) cyl(veh, P.dark, 0.38, 0.3, x, 0.38, z, 0, Math.PI / 2);
      const hl = [-0.7, 0.7].map((x) => box(veh, P.ink, 0.36, 0.2, 0.05, x, 0.9, -2.5)); veh.position.set(1.5, 0, -2.5); veh.rotation.y = 0.5; scene.add(veh);
      const puffs = [0, 1, 2].map(() => { const m = new THREE.Mesh(reg(new THREE.SphereGeometry(0.25, 8, 6)), P.smoke); scene.add(m); return m; });
      const driver = actor('ranger');
      const group = [actor('medic'), actor('ranger'), actor('medic')];
      const gate = new THREE.Group(); for (let i = 0; i < 7; i++) box(gate, P.steel, 0.06, 2.4, 0.06, -2.1 + i * 0.7, 1.2, 0); box(gate, P.steel, 4.4, 0.06, 0.06, 0, 2.4, 0); gate.position.set(-3.5, 0, 2.5); scene.add(gate);
      words(scene, fuel ? 'SERVICE ROAD' : 'AMBULANCE BAY', 0.12, fuel ? P.gAmber : P.red, 0, 4.6, -5.75);
      const can = new THREE.Group(); box(can, P.red, 0.4, 0.5, 0.2, 0, 0, 0); cyl(can, P.yellow, 0.035, 0.2, 0.17, 0.3, 0, 0, -0.6); scene.add(can);
      tick = (t) => {
        place(driver, 1.0, -3.5, 0.5); idlePose(driver, t); driver.root.visible = !fuel || t > 3.4;
        if (!fuel) {
          group.forEach((g, i) => { const k = seg(t, 0 + i * 0.25, 2.4 + i * 0.25); place(g, mix(-3.5 + i * 0.6, -1.2 + i * 0.9, k), mix(7 + i, 0.6 - i * 0.2, k), Math.PI); if (k < 1) runPose(g, t + i, 0.9, 9); else idlePose(g, t + i); });
          const k = seg(t, 0.4, 2.6); place(hero, mix(-3, 0.2, k), mix(6, 1.6, k), Math.PI); if (k < 1) runPose(hero, t); else slumpPose(hero, t);
          gate.position.x = -3.5 - seg(t, 2.6, 3.4) * 0 ; gate.rotation.y = mix(-1.3, 0, seg(t, 2.6, 3.2));
          const cough = t > 3.6 && t < 5.4; veh.position.x = 1.5 + (cough ? Math.sin(t * 50) * 0.02 : 0);
          hl.forEach((h) => { h.material = cough && Math.sin(t * 9) > 0 ? P.gAmber : P.ink; });
          puffs.forEach((p, i) => { const a = ((t - 3.6) * 0.9 + i * 0.33) % 1; p.visible = cough; p.position.set(2.8 + a * 0.6, 0.4 + a * 1.2, 0.3); p.scale.setScalar(0.5 + a * 1.5); });
          can.visible = false;
        } else {
          group.forEach((g, i) => { place(g, -3.4 + i * 0.9, 3.4, Math.PI * 0.9); if (t > 4.4) wavePose(g, t + i); else idlePose(g, t + i); });
          place(hero, 3.1, -1.6, -Math.PI / 2 + 0.5); reachPose(hero, t, seg(t, 0, 0.8), 1.1);
          const pour = seg(t, 0.5, 1.4); can.position.set(2.6, 1.3, -1.9); can.rotation.set(0, 0.5, -1.6 * pour); can.visible = t < 3.6;
          const run = t > 3.6; veh.position.x = 1.5 + (run ? Math.sin(t * 70) * 0.012 : 0);
          hl.forEach((h) => { h.material = run ? P.gAmber : P.ink; }); P.cone.opacity = 0;
          puffs.forEach((p, i) => { const a = ((t - 3.6) * 0.9 + i * 0.33) % 1; p.visible = run; p.position.set(2.8 + a * 0.8, 0.4 + a * 1.4, 0.3); p.scale.setScalar(0.4 + a * 1.8); });
        }
      };
      camPath = (t) => ({ p: fuel ? mixV([6, 1.8, 2], [5, 2.6, 6.5], seg(t, 0, 7)) : mixV([-6, 2.4, 9], [-4.5, 2.2, 5], seg(t, 0, 7)), l: fuel ? [2, 1.2, -2] : [0, 1.2, -1] });
      break;
    }
    case 'checkpoint': case 'barrier': {
      const isBar = def.scene === 'barrier';
      setFog(isBar ? '#363C4C' : '#4A3C4E', 12, 80); ground(P.floor, 30, 120);
      if (isBar) { box(scene, P.deck, 30, 1, 60, 0, 7.5, -10); for (let i = 0; i < 6; i++) cyl(scene, P.rust, 0.14, 30, 0, 3.6, -i * 6, 0, Math.PI / 2); }
      const booth = new THREE.Group(); box(booth, P.white, 2.2, 2.6, 2.2, 0, 1.3, 0); box(booth, P.glass, 2.22, 0.9, 1.5, 0, 1.8, 0); box(booth, P.navy, 2.4, 0.2, 2.4, 0, 2.7, 0); booth.position.set(-4.4, 0, -1); scene.add(booth);
      const reader = new THREE.Group(); box(reader, P.dark, 0.3, 1.2, 0.3, 0, 0.6, 0); const rl = box(reader, P.gRed, 0.16, 0.16, 0.05, 0, 1.1, 0.16); reader.position.set(-2.6, 0, 0.2); scene.add(reader);
      const pivot = new THREE.Group(); pivot.position.set(-2.4, 1.15, -0.6); scene.add(pivot); box(pivot, P.white, 8, 0.18, 0.14, 4, 0, 0); for (let i = 0; i < 4; i++) box(pivot, P.red, 0.8, 0.2, 0.15, 1 + i * 2, 0, 0);
      const card = new THREE.Group(); box(card, P.white, 0.12, 0.08, 0.01, 0, 0, 0); box(card, P.navy, 0.12, 0.02, 0.012, 0, 0.02, 0); scene.add(card);
      // bridge beyond: deck edges; wreck pile blocks (checkpoint) / rescue van crosses (barrier)
      for (const s of [-1, 1]) box(scene, P.steel, 0.2, 1.1, 80, s * 5.5, 0.55, -45);
      const wreck = [0, 1, 2, 3, 4].map((i) => box(scene, i % 2 ? P.rust : P.teal, 2, 1.4, 4, -3 + i * 1.6, 0.7 + (i % 2) * 1.1, -26, i * 0.5, (i - 2) * 0.1));
      const van = new THREE.Group(); box(van, P.teal, 2.3, 1.8, 4.8, 0, 1.2, 0); box(van, P.glass, 2.1, 0.7, 0.1, 0, 1.75, -2.42); for (const x of [-1.05, 1.05]) for (const z of [-1.6, 1.6]) cyl(van, P.dark, 0.38, 0.3, x, 0.38, z, 0, Math.PI / 2); const vhl = [-0.7, 0.7].map((x) => box(van, P.gAmber, 0.36, 0.2, 0.05, x, 0.9, -2.45)); scene.add(van);
      words(scene, isBar ? 'SERVICE LANE' : 'CHECKPOINT', 0.12, P.gAmber, -4.4, 3.4, 0.2);
      tick = (t) => {
        place(hero, -2.4, 0.9, Math.PI); reachPose(hero, t, seg(t, 0.2, 0.9), 1.2);
        const sw = seg(t, 0.8, 1.6); card.position.set(-2.55, mix(1.0, 1.12, sw), mix(0.6, 0.38, sw)); card.visible = !isBar && t < 2.2;
        rl.material = t > 1.7 ? P.gGreen : P.gRed; pivot.rotation.z = seg(t, 1.8, 2.8) * 1.35;
        wreck.forEach((w) => { w.visible = !isBar; });
        if (isBar) { const k = seg(t, 2.8, 6.4); van.position.set(1.6, 0, mix(10, -40, k)); van.visible = t > 2.6; vhl.forEach((h) => { h.visible = true; }); if (t > 3.2) { hero.root.rotation.y = Math.PI * 0.5; wavePose(hero, t); } }
        else { van.visible = false; if (t > 3) { hero.root.rotation.y = Math.PI; idlePose(hero, t); } }
      };
      camPath = (t) => t < 2.6 ? { p: mixV([-0.6, 1.8, 2.8], [-0.8, 2.0, 2.4], seg(t, 0, 2.6)), l: [-2.5, 1.1, 0] } : isBar ? { p: mixV([3.6, 1.6, 4], [5.5, 2.4, -2], seg(t, 2.6, 7)), l: [1.6, 1.2, mix(6, -30, seg(t, 2.8, 6.4))] } : { p: mixV([-1.5, 2.4, 3.5], [0.5, 3.4, 1.0], seg(t, 2.6, 7)), l: [0, 1.4, -26] };
      break;
    }
    case 'boat': {
      setFog('#4A3A56', 18, 110); hemi.color.set('#9A7EA0');
      box(scene, P.water, 160, 0.1, 160, 0, -0.8, -30);
      box(scene, P.wood, 3.2, 0.3, 30, 0, -0.15, -6); for (const s of [-1, 1]) for (let i = 0; i < 7; i++) cyl(scene, P.dark, 0.15, 2.2, s * 1.65, -0.6, 6 - i * 4.5);
      const beacon = new THREE.Group(); cyl(beacon, P.dark, 0.12, 7, 0, 3.5, 0); const lensB = box(beacon, P.gAmber, 0.8, 0.55, 0.8, 0, 7.2, 0); const cone = new THREE.Mesh(reg(new THREE.ConeGeometry(4, 34, 16, 1, true)), P.cone); cone.rotation.x = Math.PI / 2; cone.position.set(0, 7.2, -17); beacon.add(cone); beacon.position.set(-3.5, 0, 8); scene.add(beacon);
      const boat = new THREE.Group(); box(boat, P.hull, 3.2, 1.4, 8, 0, 0.1, 0); box(boat, P.red, 3.22, 0.3, 8.02, 0, -0.35, 0); box(boat, P.white, 2.2, 1.4, 2.8, 0, 1.5, 1.2); box(boat, P.glass, 2.22, 0.5, 2.0, 0, 1.8, 1.0); box(boat, P.gAmber, 0.2, 0.2, 0.2, 0, 2.4, 1.2); boat.position.set(3.2, -0.3, -18); scene.add(boat);
      const crew = [actor('medic'), actor('ranger'), actor('medic')]; crew.forEach((c) => boat.add(c.root));
      const zs = [0, 3, 4, 1, 5].map((k) => zombie(k));
      // city skyline + fires
      for (let i = 0; i < 18; i++) box(scene, P.dark, 4 + (i % 3), 8 + ((i * 7) % 11) * 2, 4, -40 + i * 4.8, 4, 28);
      const fires = [0, 1, 2].map((i) => box(scene, P.gAmber, 2, 1, 0.5, -20 + i * 18, 6 + i * 3, 25.5));
      tick = (t) => {
        P.cone.opacity = 0.14 + 0.05 * Math.sin(t * 3); beacon.rotation.y = Math.sin(t * 0.6) * 0.3; lensB.visible = true;
        const depart = seg(t, 5.8, 10); boat.position.set(3.2 + depart * 4, -0.3 + Math.sin(t * 1.3) * 0.12, -18 - depart * 26); boat.rotation.set(0, depart * 0.5, Math.sin(t * 0.9) * 0.03);
        crew.forEach((c, i) => { place(c, -0.6 + i * 0.6, -1.5 + i * 0.4, 0, 0.85); if (t < 5) wavePose(c, t + i, i % 2 ? 'L' : 'R'); else idlePose(c, t); c.root.scale.setScalar(0.95); });
        // hero sprints down the pier and leaps aboard at t≈3.9
        if (t < 3.9) { const k = seg(t, 0, 3.6); place(hero, 0, mix(8, -15.5, k), Math.PI); runPose(hero, t, 1, 11); boat.remove(hero.root); if (!hero.root.parent) scene.add(hero.root); }
        else if (t < 4.7) { const k = (t - 3.9) / 0.8; place(hero, mix(0, 2.6, k), mix(-15.5, -18, k), Math.PI - 0.6, Math.sin(k * Math.PI) * 1.6 + mix(0, 0.55, k)); runPose(hero, 0.2, 0.5); }
        else { if (hero.root.parent !== boat) { scene.remove(hero.root); boat.add(hero.root); } place(hero, -0.6, 2.0, 0, 0.85); slumpPose(hero, t); }
        zs.forEach((z, i) => { const k = seg(t, 1.2 + i * 0.25, 5.2 + i * 0.2); place(z.r, (i - 2) * 0.55, mix(14, -12.5 + (i % 2) * 1.2, k), Math.PI); animateZombie(z.r, z.g, t * 6 + i, t > 4.8 ? 1 : 0.4); });
        fires.forEach((f, i) => { f.scale.y = 1 + 0.4 * Math.sin(t * 7 + i); });
      };
      camPath = (t) => t < 4.8 ? { p: mixV([-3, 2.6, 12], [-3.4, 2.4, -7], seg(t, 0, 4.8)), l: [1, 1.2, mix(2, -17, seg(t, 0, 4.4))] } : { p: mixV([1, 4, -24], [10, 6, -64], seg(t, 4.8, 10)), l: mixV([3, 1.2, -18], [0, 4, 20], seg(t, 5.5, 10)) };
      break;
    }
  }

  const update = (t: number, aspect: number) => {
    const tt = Math.max(0, Math.min(LEN, t));
    tick(tt);
    const c = camPath(tt); cam.position.set(c.p[0], c.p[1], c.p[2]); cam.lookAt(c.l[0], c.l[1], c.l[2]);
    cam.aspect = aspect; cam.fov = aspect > 1 ? 42 : 52; cam.updateProjectionMatrix();
  };
  const dispose = () => { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); };
  return { id, scene, cam, get clear() { return clear; }, update, dispose } as MissionCutscene;
}
