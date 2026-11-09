// Campaign set dressing for the runner: destination set pieces, wayfinding signs, section gantries,
// mission item meshes (pickup + carried), Ward C escort group, beacon, recovery zone, route-split signs,
// per-dressing sidewalk props, overhead tunnel/bridge structure and per-mission lighting mood.
// Everything is pooled and built from the engine's shared unit box; WebGL1-safe.
import * as THREE from 'three';
import { buildSurvivor, cloneRig, type Rig } from '@/components/characters';
import { idlePose, runPose, wavePose } from '@/components/poses';
import { signText } from '@/components/signText';
import { missionById, missionSection, type CampaignRun, type MissionDefinition, type MissionItem, type MissionSection } from '@/lib/campaign';
import type { Sim } from '@/lib/game';

export type Placer = (sAlong: number, lat: number) => { x: number; z: number; y: number; yaw: number };
type Dressing = MissionSection['dressing'];

const DEST_SHORT: Record<number, string> = { 1: 'SHELTER', 2: 'EVACUATION DESK', 3: 'DISPATCH', 4: 'ST AGNES', 5: 'GENERATOR', 6: 'AMBULANCE BAY', 7: 'RESCUE VEHICLE', 8: 'BRIDGE CHECKPOINT', 9: 'SERVICE LANE', 10: 'RESCUE BOAT' };
const ITEM_SHORT: Record<number, string> = { 3: 'RADIO EQUIPMENT', 5: 'ELECTRICAL STORES', 6: 'WARD C', 7: 'SERVICE DEPOT', 8: 'COMMAND POST', 10: 'POWER STORES' };
const OPEN: Partial<Record<Dressing, true>> = { harbor: true, bridge: true, tunnel: true };

export function buildMissionScenery(o: {
  world: THREE.Group; unit: THREE.BoxGeometry; charMat: THREE.Material; shadowGeo: THREE.BufferGeometry; shadowMat: THREE.Material;
  reg: <G extends THREE.BufferGeometry>(g: G) => G; regM: <M extends THREE.Material>(m: M) => M; HW: number; SW: number; LW: number;
}) {
  const { world, unit, reg, regM, HW, SW, LW } = o;
  const lam = (c: string) => regM(new THREE.MeshLambertMaterial({ color: c }));
  const basic = (c: string, x: THREE.MeshBasicMaterialParameters = {}) => regM(new THREE.MeshBasicMaterial({ color: c, ...x }));
  const mk = (p: THREE.Object3D, m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0, rz = 0) => {
    const b = new THREE.Mesh(unit, m); b.scale.set(sx, sy, sz); b.position.set(x, y, z); b.rotation.set(0, ry, rz); p.add(b); return b;
  };
  const cylG = reg(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
  const cyl = (p: THREE.Object3D, m: THREE.Material, r: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const c = new THREE.Mesh(cylG, m); c.scale.set(r * 2, h, r * 2); c.position.set(x, y, z); c.rotation.set(rx, 0, rz); p.add(c); return c;
  };

  // palette: survivor wayfinding is reflective amber on charcoal; refuge/goal signage is emergency teal
  const M = {
    concrete: lam('#7C7880'), dark: lam('#2E2C36'), steel: lam('#8E98A4'), rust: lam('#8A4A34'), wood: lam('#6E5A48'),
    amber: lam('#E9A23B'), teal: lam('#2F9C8E'), white: lam('#E8E6DE'), red: lam('#C8362E'), navy: lam('#22304C'), olive: lam('#5E6A3C'),
    sand: lam('#A89470'), hull: lam('#D8D4C8'), water: basic('#2C4A66', { transparent: true, opacity: 0.92 }), deck: lam('#45414A'),
    glass: lam('#6F9AAE'), van: lam('#3E8F86'), drum: lam('#B4442E'), yellow: lam('#E8C23A'),
    ink: basic('#191720'), glowAmber: basic('#FFC76A'), glowTeal: basic('#7EF0DA'), glowRed: basic('#FF5A48'), glowGreen: basic('#6CF08E'),
    signText: basic('#F6EBD2'), board: lam('#1E2230'),
    halo: basic('#7EF0DA', { transparent: true, opacity: 0.5, depthWrite: false }),
    column: basic('#7EF0DA', { transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
    recover: basic('#6CF08E', { transparent: true, opacity: 0.32, depthWrite: false }),
    beam: basic('#FFC76A', { transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
  };
  const dynText: THREE.BufferGeometry[] = [];
  const text = (str: string, px: number) => { const g = signText(str, px); dynText.push(g); return g; };
  const label = (p: THREE.Object3D, str: string, px: number, x: number, y: number, z: number, board: THREE.Material = M.board, ink: THREE.Material = M.signText) => {
    const w = (str.length * 4 - 1) * px + px * 4;
    mk(p, board, w, px * 9, 0.08, x, y, z);
    const t = new THREE.Mesh(text(str, px), ink); t.position.set(x, y, z + 0.05); p.add(t); return t;
  };

  // ---------- items: pickup meshes ----------
  const itemMake: Record<Exclude<MissionItem, 'survivors'>, (s: number) => THREE.Group> = {
    battery: (s) => { const g = new THREE.Group(); mk(g, M.dark, 0.55 * s, 0.38 * s, 0.32 * s, 0, 0, 0); mk(g, M.yellow, 0.56 * s, 0.12 * s, 0.33 * s, 0, 0.05 * s, 0); cyl(g, M.glowRed, 0.05 * s, 0.1 * s, -0.15 * s, 0.24 * s, 0); cyl(g, M.ink, 0.05 * s, 0.1 * s, 0.15 * s, 0.24 * s, 0); return g; },
    fuse: (s) => { const g = new THREE.Group(); cyl(g, M.glass, 0.11 * s, 0.5 * s, 0, 0, 0, 0, Math.PI / 2); cyl(g, M.steel, 0.13 * s, 0.1 * s, -0.27 * s, 0, 0, 0, Math.PI / 2); cyl(g, M.steel, 0.13 * s, 0.1 * s, 0.27 * s, 0, 0, 0, Math.PI / 2); cyl(g, M.glowAmber, 0.025 * s, 0.46 * s, 0, 0, 0, 0, Math.PI / 2); return g; },
    fuel: (s) => { const g = new THREE.Group(); mk(g, M.red, 0.42 * s, 0.55 * s, 0.22 * s, 0, 0, 0); mk(g, M.dark, 0.3 * s, 0.07 * s, 0.08 * s, -0.04 * s, 0.33 * s, 0); cyl(g, M.yellow, 0.04 * s, 0.18 * s, 0.17 * s, 0.34 * s, 0, 0, -0.6); mk(g, M.dark, 0.43 * s, 0.04 * s, 0.23 * s, 0, -0.1 * s, 0); return g; },
    card: (s) => { const g = new THREE.Group(); mk(g, M.white, 0.5 * s, 0.32 * s, 0.03 * s, 0, 0, 0); mk(g, M.navy, 0.5 * s, 0.07 * s, 0.035 * s, 0, 0.08 * s, 0); mk(g, M.yellow, 0.1 * s, 0.08 * s, 0.04 * s, -0.15 * s, -0.04 * s, 0); mk(g, M.glowTeal, 0.18 * s, 0.03 * s, 0.04 * s, 0.1 * s, -0.08 * s, 0); return g; },
    cell: (s) => { const g = new THREE.Group(); cyl(g, M.dark, 0.16 * s, 0.5 * s, 0, 0, 0); cyl(g, M.glowTeal, 0.12 * s, 0.36 * s, 0, 0, 0); for (const y of [-0.27, 0.27]) cyl(g, M.steel, 0.17 * s, 0.06 * s, 0, y * s, 0); cyl(g, M.amber, 0.05 * s, 0.08 * s, 0, 0.33 * s, 0); return g; },
  };
  const items = {} as Record<Exclude<MissionItem, 'survivors'>, { pick: THREE.Group; carry: THREE.Group }>;
  for (const k of Object.keys(itemMake) as Exclude<MissionItem, 'survivors'>[]) {
    const pick = itemMake[k](1.5); pick.visible = false; world.add(pick);
    const carry = itemMake[k](0.65); carry.visible = false;
    items[k] = { pick, carry };
  }
  const halo = new THREE.Mesh(reg(new THREE.RingGeometry(0.55, 0.8, 28)), M.halo); halo.rotation.x = -Math.PI / 2; halo.visible = false; world.add(halo);
  const column = new THREE.Mesh(reg(new THREE.CylinderGeometry(0.5, 0.7, 14, 14, 1, true)), M.column); column.visible = false; world.add(column);
  let carryHost: THREE.Object3D | null = null;

  // ---------- escort group (Ward C survivors) ----------
  const e0 = buildSurvivor(o.charMat, 'medic'); e0.geos.forEach(reg);
  const e1 = buildSurvivor(o.charMat, 'ranger'); e1.geos.forEach(reg);
  const escort: { r: Rig; sh: THREE.Mesh }[] = [e0.rig, e1.rig, cloneRig(e0.rig)].map((r, i) => {
    r.root.scale.setScalar([0.96, 1.03, 0.9][i]); r.root.visible = false; world.add(r.root);
    const sh = new THREE.Mesh(o.shadowGeo, o.shadowMat); sh.rotation.x = -Math.PI / 2; sh.visible = false; world.add(sh);
    return { r, sh };
  });
  const escortLat = [0, 0, 0];
  // Replay the player's successful path, including jumps/slides, instead of steering NPCs into hazards.
  const trail = Array.from({ length: 256 }, () => ({ dist: 0, x: 0, jump: 0, slide: false }));
  let trailHead = 0; let trailCount = 0; let trailDist = -1;

  // ---------- beacon (mission 10) ----------
  const beacon = new THREE.Group();
  mk(beacon, M.concrete, 1.4, 0.5, 1.4, 0, 0.25, 0); cyl(beacon, M.dark, 0.12, 7, 0, 3.7, 0);
  for (let i = 0; i < 4; i++) mk(beacon, M.steel, 0.05, 7, 0.05, (i & 1 ? 0.35 : -0.35), 3.5, (i & 2 ? 0.35 : -0.35));
  mk(beacon, M.dark, 1.0, 0.7, 1.0, 0, 7.4, 0);
  const lens = mk(beacon, M.glowRed, 0.8, 0.55, 0.8, 0, 7.4, 0);
  const beamCone = new THREE.Mesh(reg(new THREE.ConeGeometry(4, 30, 16, 1, true)), M.beam); beamCone.position.set(0, 7.4, -15); beamCone.rotation.x = Math.PI / 2; beacon.add(beamCone);
  const pad = new THREE.Mesh(reg(new THREE.RingGeometry(1.2, 1.6, 32)), M.halo); pad.rotation.x = -Math.PI / 2; pad.visible = false; world.add(pad);
  beacon.visible = false; world.add(beacon);

  // ---------- recovery zone strips ----------
  const strips = Array.from({ length: 10 }, () => { const m = new THREE.Mesh(unit, M.recover); m.scale.set(HW * 2 - 0.4, 0.02, 1.0); m.visible = false; world.add(m); return m; });

  // ---------- sidewalk dressing (local +x faces the corridor) ----------
  const dressMake: Partial<Record<Dressing, () => THREE.Group>> = {
    residential: () => { const g = new THREE.Group(); for (let i = 0; i < 6; i++) mk(g, M.white, 0.06, 0.9, 0.12, 0.6, 0.45, -3 + i * 1.2); mk(g, M.white, 0.04, 0.08, 7, 0.6, 0.75, 0); mk(g, M.navy, 0.3, 0.3, 0.45, 1.1, 1.0, 2.5); mk(g, M.dark, 0.06, 1.0, 0.06, 1.1, 0.45, 2.5); mk(g, M.olive, 0.6, 0.9, 0.6, -0.6, 0.45, 1); return g; },
    checkpoint: () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) mk(g, M.sand, 0.6, 0.3, 0.9, 0.4, 0.15 + j * 0.3, -1 + i * 0.95 + j * 0.3); mk(g, M.dark, 0.08, 3.2, 0.08, -0.4, 1.6, 2); mk(g, M.glowAmber, 0.5, 0.3, 0.3, -0.2, 3.2, 2, 0, -0.4); mk(g, M.concrete, 0.6, 0.8, 2.6, -0.8, 0.4, -3); mk(g, M.red, 0.62, 0.15, 2.62, -0.8, 0.6, -3); return g; },
    garage: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) mk(g, M.steel, 0.7, 0.05, 3, -0.8, 0.4 + i * 0.6, 0); for (const z of [-1.45, 1.45]) mk(g, M.dark, 0.06, 2.4, 0.06, -0.8, 1.2, z); for (let i = 0; i < 5; i++) mk(g, i % 2 ? M.amber : M.wood, 0.5, 0.35, 0.5, -0.8, 0.62 + (i % 3) * 0.6, -1 + i * 0.5); for (let i = 0; i < 3; i++) cyl(g, M.dark, 0.35, 0.22, 0.8, 0.11 + i * 0.22, -2.6); return g; },
    tunnel: () => { const g = new THREE.Group(); mk(g, M.concrete, 0.4, 6.4, 14.2, -SW * 0.4 - 0.3, 3.2, 0); mk(g, M.dark, 0.3, 0.2, 14.2, -SW * 0.4, 4.6, 0); mk(g, M.amber, 0.06, 0.3, 14.2, -SW * 0.4 + 0.02, 1.1, 0); mk(g, M.glowAmber, 0.2, 0.25, 0.8, -SW * 0.4, 3.6, 0); return g; },
    maintenance: () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) cyl(g, i === 1 ? M.rust : M.steel, 0.1, 5, -1.0 + i * 0.25, 2.5, 0); cyl(g, M.red, 0.22, 0.06, -0.5, 1.4, 0, 0, Math.PI / 2); mk(g, M.yellow, 0.06, 1.0, 1.4, -0.3, 1.8, 2); mk(g, M.dark, 0.07, 0.3, 1.4, -0.29, 1.8, 2, 0, 0.6); mk(g, M.steel, 0.5, 1.3, 0.8, -0.9, 0.65, -2.4); mk(g, M.glowGreen, 0.02, 0.08, 0.08, -0.64, 1.1, -2.2); return g; },
    depot: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) cyl(g, M.drum, 0.3, 0.9, -0.5 + (i % 2) * 0.62, 0.45, -1.2 + Math.floor(i / 2) * 0.62); mk(g, M.white, 0.5, 1.6, 0.6, -0.6, 0.8, 2); mk(g, M.red, 0.52, 0.3, 0.62, -0.6, 1.4, 2); cyl(g, M.dark, 0.03, 1.2, -0.3, 1.0, 2.3, 0.6); return g; },
    bridge: () => { const g = new THREE.Group(); mk(g, M.steel, 0.08, 0.08, 14.2, 0.5, 1.05, 0); mk(g, M.steel, 0.08, 0.08, 14.2, 0.5, 0.55, 0); for (let i = 0; i < 6; i++) mk(g, M.steel, 0.08, 1.05, 0.08, 0.5, 0.52, -6 + i * 2.4); mk(g, M.concrete, 1.4, 9, 1.4, -1.3, 4.5, 3); return g; },
    harbor: () => { const g = new THREE.Group(); cyl(g, M.dark, 0.22, 0.6, 0.6, 0.3, -2); cyl(g, M.dark, 0.3, 0.08, 0.6, 0.62, -2); for (let i = 0; i < 3; i++) mk(g, i ? M.wood : M.teal, 1.1, 1.1, 1.1, -1.0 + (i === 2 ? 0.2 : 0), 0.55 + (i === 2 ? 1.1 : 0), 1 + (i === 1 ? 1.15 : 0)); mk(g, M.amber, 0.06, 0.06, 6, 0.9, 0.08, 0); return g; },
  };
  const dressPools: Partial<Record<Dressing, THREE.Group[]>> = {};
  const dressUse: Partial<Record<Dressing, number>> = {};
  for (const k of Object.keys(dressMake) as Dressing[]) dressPools[k] = Array.from({ length: 14 }, () => { const g = dressMake[k]!(); g.visible = false; world.add(g); return g; });
  const water = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(unit, M.water); m.scale.set(26, 0.05, 14.4); m.visible = false; world.add(m); return m; });
  let waterUse = 0;
  // overhead: tunnel ribs, underbridge deck + low (cosmetic, >= 3.3 m) pipes, maintenance ducts
  const overMake = (kind: 'tunnel' | 'bridge' | 'maintenance') => {
    const g = new THREE.Group(); const span = (HW + SW) * 2;
    if (kind === 'tunnel') { mk(g, M.concrete, span, 0.6, 0.8, 0, 6.3, 0); for (const s of [-1, 1]) mk(g, M.concrete, 0.8, 1.2, 0.8, s * (span / 2 - 0.6), 5.6, 0, 0, s * 0.7); mk(g, M.glowAmber, 0.6, 0.08, 0.3, 0, 5.98, 0); }
    else if (kind === 'bridge') { mk(g, M.deck, span + 6, 0.9, 6.2, 0, 7.4, 0); mk(g, M.dark, span + 6, 0.5, 0.4, 0, 6.8, 2.6); cyl(g, M.rust, 0.16, span, 0, 3.5, -1, 0, Math.PI / 2); cyl(g, M.steel, 0.1, span, 0, 3.9, 1.2, 0, Math.PI / 2); mk(g, M.yellow, 0.4, 0.12, 0.34, 0, 3.5, -1); }
    else { cyl(g, M.steel, 0.22, span, 0, 5.4, 0, 0, Math.PI / 2); cyl(g, M.rust, 0.12, span, 0, 5.0, 0.4, 0, Math.PI / 2); mk(g, M.yellow, 0.3, 0.32, 0.5, 0, 5.4, 0); }
    g.visible = false; world.add(g); return g;
  };
  const overPools = { tunnel: Array.from({ length: 16 }, () => overMake('tunnel')), bridge: Array.from({ length: 16 }, () => overMake('bridge')), maintenance: Array.from({ length: 12 }, () => overMake('maintenance')) };
  const overUse = { tunnel: 0, bridge: 0, maintenance: 0 };

  // ---------- per-mission rebuilt objects (text, destination, gantries, wayfinding) ----------
  let mission: MissionDefinition | null = null;
  let dest: THREE.Group | null = null;
  let gantries: { g: THREE.Group; at: number }[] = [];
  let routeSigns: THREE.Group | null = null;
  let wayText: { dest: THREE.BufferGeometry; item: THREE.BufferGeometry | null; beacon: THREE.BufferGeometry | null } | null = null;
  const waySigns = Array.from({ length: 5 }, () => {
    const g = new THREE.Group();
    mk(g, M.dark, 0.1, 3.2, 0.1, 0, 1.6, 0);
    mk(g, M.amber, 3.4, 0.9, 0.08, 0, 3.0, 0);
    mk(g, M.ink, 3.2, 0.72, 0.09, 0, 3.0, 0);
    const t = new THREE.Mesh(undefined, M.glowAmber); t.position.set(0, 3.0, 0.06); g.add(t);
    // up-chevron: keep straight on
    mk(g, M.glowAmber, 0.36, 0.08, 0.05, -0.1, 3.62, 0.05, 0, 0.7); mk(g, M.glowAmber, 0.36, 0.08, 0.05, 0.1, 3.62, 0.05, 0, -0.7);
    g.visible = false; world.add(g); return { g, t };
  });
  let wayUse = 0;

  const clearMission = () => {
    if (dest) { world.remove(dest); dest = null; }
    for (const gt of gantries) world.remove(gt.g);
    gantries = [];
    if (routeSigns) { world.remove(routeSigns); routeSigns = null; }
    for (const g of dynText) g.dispose();
    dynText.length = 0; wayText = null;
  };

  const buildDest = (m: MissionDefinition) => {
    const g = new THREE.Group(); const sp = HW + SW;
    const side = (mat: THREE.Material, h: number) => { for (const s of [-1, 1]) mk(g, mat, sp - 1.6, h, 1.2, s * (sp / 2 + 1.6), h / 2, -1); };
    switch (m.scene) {
      case 'shelter':
        mk(g, M.concrete, sp * 2 + 4, 5.2, 4, 0, 2.6, -3); mk(g, M.dark, 3.2, 3.4, 0.3, 0, 1.7, -0.9);
        for (let i = 0; i < 8; i++) mk(g, i % 2 ? M.ink : M.yellow, 0.4, 3.6, 0.32, -1.85 + (i > 3 ? 3.7 : 0) + (i % 4) * 0.02, 1.8, -0.88 + (i % 4) * 0.001);
        mk(g, M.glowGreen, 0.5, 0.3, 0.2, 0, 3.8, -0.85); label(g, 'MAINTENANCE SHELTER', 0.11, 0, 4.5, -0.8, M.teal);
        mk(g, M.steel, 1.2, 0.18, 0.1, 0.9, 1.6, -0.7); break;
      case 'map':
        side(M.navy, 6.5); mk(g, M.navy, sp * 2, 2.5, 1.2, 0, 5.4, -1);
        mk(g, M.wood, 6, 1.1, 1.2, 0, 0.55, -4); mk(g, M.white, 2.2, 1.5, 0.05, 0, 2.6, -6.2); mk(g, M.red, 1.4, 0.06, 0.06, 0.1, 2.7, -6.15, 0, 0.5);
        label(g, 'EVACUATION DESK', 0.12, 0, 4.0, -0.3, M.navy); for (let i = 0; i < 5; i++) mk(g, i % 2 ? M.glowRed : basic('#5A8CFF'), 0.6, 0.2, 0.2, -1.2 + i * 0.6, 4.65, -0.3); break;
      case 'radio':
        side(M.navy, 6.5); mk(g, M.dark, 4, 1.0, 1.0, 0, 0.5, -4); mk(g, M.steel, 1.6, 0.8, 0.7, 0, 1.4, -4);
        for (let i = 0; i < 4; i++) mk(g, M.glowAmber, 0.12, 0.12, 0.05, -0.5 + i * 0.3, 1.5, -3.62);
        cyl(g, M.steel, 0.04, 5, 1.4, 3.6, -4.2); label(g, 'DISPATCH RADIO', 0.12, 0, 4.4, -0.3, M.navy); break;
      case 'hospital':
        side(M.white, 9); mk(g, M.white, sp * 2 + 2, 2.8, 4.5, 0, 5.4, 1); for (const x of [-3, 3]) mk(g, M.steel, 0.3, 4, 0.3, x, 2, 3);
        mk(g, M.glass, 4, 3.2, 0.1, 0, 1.6, -2); mk(g, M.red, 2.2, 0.7, 0.2, 0, 8.2, -0.8); mk(g, M.red, 0.7, 2.2, 0.2, 0, 8.2, -0.8);
        label(g, 'ST AGNES HOSPITAL', 0.13, 0, 5.4, 3.3, M.white, M.red); break;
      case 'generator':
        side(M.concrete, 6.5); mk(g, M.olive, 4.4, 2.4, 2.4, 0, 1.2, -4); for (const x of [-1.4, 1.4]) cyl(g, M.dark, 0.2, 2.5, x, 3.4, -4.6);
        mk(g, M.steel, 1.6, 1.6, 0.4, 0, 1.6, -2.6); for (let i = 0; i < 3; i++) mk(g, i ? M.glowAmber : M.glowRed, 0.15, 0.15, 0.05, -0.4 + i * 0.4, 2.1, -2.38);
        label(g, 'GENERATOR CONTROL', 0.11, 0, 4.6, -0.3, M.dark, M.glowAmber); break;
      case 'escort':
        side(M.white, 6); mk(g, M.white, 2.4, 2.3, 5.2, 2.2, 1.35, -6); mk(g, M.red, 2.42, 0.3, 5.22, 2.2, 1.2, -6); mk(g, M.glass, 2.1, 0.7, 0.1, 2.2, 1.9, -3.4);
        for (let i = 0; i < 6; i++) mk(g, M.steel, 0.06, 2.4, 0.06, -sp + 1 + i * 0.7, 1.2, -1); mk(g, M.steel, 4.2, 0.06, 0.06, -sp + 2.75, 2.4, -1);
        label(g, 'AMBULANCE BAY', 0.13, 0, 4.4, -0.4, M.white, M.red); break;
      case 'fuel':
        mk(g, M.van, 2.2, 1.8, 4.6, -2.5, 1.2, -5); mk(g, M.glass, 2.0, 0.7, 0.1, -2.5, 1.8, -2.65); for (const x of [-3.4, -1.6]) for (const z of [-3.5, -6.5]) cyl(g, M.dark, 0.38, 0.3, x, 0.38, z, 0, Math.PI / 2);
        for (let i = 0; i < 8; i++) mk(g, M.steel, 0.06, 2.2, 0.06, 1 + i * 0.8, 1.1, -3); mk(g, M.steel, 6, 0.06, 0.06, 3.8, 2.2, -3);
        label(g, 'RESCUE VEHICLE', 0.12, 0, 4.2, -0.5, M.teal); break;
      case 'checkpoint':
        mk(g, M.white, 2.4, 2.8, 2.4, -4.2, 1.4, -3); mk(g, M.glass, 2.42, 0.9, 1.6, -4.2, 1.9, -3); mk(g, M.navy, 2.6, 0.2, 2.6, -4.2, 2.9, -3);
        mk(g, M.dark, 0.4, 1.1, 0.4, -2.6, 0.55, -2); const arm = mk(g, M.white, 8, 0.18, 0.12, 1.4, 1.1, -2); arm.name = 'arm'; for (let i = 0; i < 4; i++) mk(g, M.red, 0.8, 0.2, 0.13, -1.6 + i * 2, 1.1, -2);
        for (let i = 0; i < 5; i++) mk(g, i % 2 ? M.rust : M.van, 2, 1.4, 4, -3 + i * 1.6, 0.7 + (i % 2) * 1.2, -18, i * 0.4);
        label(g, 'BRIDGE CHECKPOINT', 0.12, 0, 4.4, -2.5, M.navy); break;
      case 'barrier':
        mk(g, M.steel, 1.0, 1.6, 0.8, sp - 1, 0.8, -1.5); mk(g, M.glowGreen, 0.2, 0.2, 0.05, sp - 1.2, 1.2, -1.08); mk(g, M.red, 0.2, 0.2, 0.05, sp - 0.8, 1.2, -1.08);
        mk(g, M.yellow, sp * 2 - 2, 0.25, 0.2, 0, 1.15, -3); for (let i = 0; i < 6; i++) mk(g, M.ink, 0.5, 0.26, 0.21, -sp + 2 + i * 2.6, 1.15, -3);
        mk(g, M.deck, sp * 2 + 6, 0.9, 8, 0, 7.4, -3); label(g, 'SERVICE-LANE CONTROLS', 0.1, 0, 5.2, -0.6, M.dark, M.glowAmber); break;
      case 'boat':
        mk(g, M.wood, HW * 2, 0.3, 14, 0, -0.1, -6); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) cyl(g, M.dark, 0.18, 2.4, s * (HW + 0.1), 0, -1 - i * 4);
        mk(g, M.water, 60, 0.05, 50, 0, -0.6, -24);
        { const b = new THREE.Group(); b.name = 'boat'; mk(b, M.hull, 3.2, 1.4, 8, 0, 0.1, 0); mk(b, M.red, 3.22, 0.3, 8.02, 0, -0.35, 0); mk(b, M.white, 2.2, 1.4, 2.8, 0, 1.5, 0.8); mk(b, M.glass, 2.22, 0.5, 2.0, 0, 1.8, 0.6); mk(b, M.glowAmber, 0.2, 0.2, 0.2, 0, 2.4, 0.8); b.position.set(0, 0, -16); g.add(b); }
        label(g, 'PIER 4 · RESCUE BOAT', 0.11, 0, 3.6, 0.2, M.teal); for (const s of [-1, 1]) mk(g, M.dark, 0.1, 3.6, 0.1, s * 2.8, 1.8, 0.1); break;
    }
    g.visible = false; world.add(g); return g;
  };
  const buildGantry = (name: string, accent: THREE.Material) => {
    const g = new THREE.Group(); const w = HW * 2 + 1.2;
    for (const s of [-1, 1]) mk(g, M.dark, 0.22, 5.2, 0.22, s * w / 2, 2.6, 0);
    mk(g, M.dark, w, 0.2, 0.2, 0, 5.0, 0);
    const str = name.toUpperCase().replace(/[^A-Z0-9 .<>-]/g, ' ');
    label(g, str, Math.min(0.1, (w - 0.6) / ((str.length * 4 + 3))), 0, 4.45, 0.12, M.board, accent);
    g.visible = false; world.add(g); return g;
  };
  const setMission = (id: number) => {
    clearMission();
    mission = missionById(id);
    dest = buildDest(mission);
    gantries = mission.sections.slice(1).map((sec) => ({ g: buildGantry(sec.name, M.glowAmber), at: sec.from }));
    wayText = { dest: text(`TO ${DEST_SHORT[id]}`, 0.1), item: ITEM_SHORT[id] ? text(`TO ${ITEM_SHORT[id]}`, 0.1) : null, beacon: mission.activationAt ? text('TO BEACON', 0.1) : null };
    if (id === 4) {
      routeSigns = new THREE.Group();
      const l = new THREE.Group(); label(l, '< SAFE DETOUR', 0.1, 0, 0, 0, M.teal); l.position.set(-(HW + 1.6), 3.2, 0); routeSigns.add(l);
      const r = new THREE.Group(); label(r, 'TUNNEL SHORT >', 0.1, 0, 0, 0, M.rust); r.position.set(HW + 1.6, 3.2, 0); routeSigns.add(r);
      for (const s of [-1, 1]) mk(routeSigns, M.dark, 0.1, 3.0, 0.1, s * (HW + 1.6), 1.5, -0.1);
      routeSigns.visible = false; world.add(routeSigns);
    }
  };

  const sectionAt = (c: CampaignRun, x: number) => missionSection(c, x);
  let curC: CampaignRun | null = null;
  const fogTarget = new THREE.Color(); const fogSm = new THREE.Color('#5B4558'); let moodLight = 1; let moodOn = false;

  return {
    /** call at the start of every runner frame */
    begin(s: Sim) {
      curC = s.campaign;
      if (curC && (!mission || mission.id !== curC.id)) setMission(curC.id);
      if (!curC && mission) { clearMission(); mission = null; }
      for (const k in dressUse) dressUse[k as Dressing] = 0;
      waterUse = 0; wayUse = 0; overUse.tunnel = 0; overUse.bridge = 0; overUse.maintenance = 0;
    },
    /** campaign sections where city buildings should not stand (open water / tunnel walls) */
    openAt(x: number) { return !!curC && !!OPEN[sectionAt(curC, x).dressing]; },
    /** sidewalk dressing for one side of one street segment */
    dress(clo: number, chi: number, sg: number, put: Placer) {
      if (!curC || !mission) return;
      const off = sg > 0 ? 7 : 0;
      for (let n = Math.ceil((clo - off) / 14); n * 14 + off <= chi; n++) {
        const sl = n * 14 + off; if (sl < 6) continue;
        const dr = sectionAt(curC, sl).dressing; const pool = dressPools[dr];
        if (pool) { const u = dressUse[dr] ?? 0; if (u < pool.length) { dressUse[dr] = u + 1; const p = put(sl, sg * (HW + SW * 0.6)); const g = pool[u]; g.visible = true; g.position.set(p.x, 0.2 + p.y, p.z); g.rotation.set(0, p.yaw + (sg < 0 ? 0 : Math.PI), 0); } }
        if ((dr === 'harbor' || dr === 'bridge') && waterUse < water.length) { const p = put(sl, sg * (HW + SW + 13)); const m = water[waterUse++]; m.visible = true; m.position.set(p.x, -0.3, p.z); m.rotation.set(0, p.yaw, 0); }
      }
      // wayfinding: right-hand side every 110 m
      if (sg > 0 && wayText) for (let n = Math.ceil((clo - 40) / 110); n * 110 + 40 <= chi && wayUse < waySigns.length; n++) {
        const sl = n * 110 + 40; if (sl > curC.finish - 30) continue;
        const ws = waySigns[wayUse++]; const p = put(sl, HW + 1.0);
        ws.t.geometry = !curC.collected && wayText.item ? wayText.item : mission.activationAt && !curC.activated && wayText.beacon ? wayText.beacon : wayText.dest;
        ws.g.visible = true; ws.g.position.set(p.x, p.y + 0.2, p.z); ws.g.rotation.set(0, p.yaw, 0);
      }
    },
    /** overhead structure along a segment's centre line */
    overhead(la: number, lb: number, put: Placer) {
      if (!curC) return;
      for (let n = Math.ceil(la / 7); n * 7 <= lb; n++) {
        const sl = n * 7; const dr = sectionAt(curC, sl).dressing;
        const k = dr === 'tunnel' ? 'tunnel' : dr === 'bridge' && (mission?.id === 9 || n % 2 === 0) ? 'bridge' : dr === 'maintenance' && n % 2 === 0 ? 'maintenance' : null;
        if (!k) continue; if (k === 'bridge' && mission?.id !== 9 && sl > 0 && n % 4) continue;
        const pool = overPools[k]; if (overUse[k] >= pool.length) continue;
        const g = pool[overUse[k]++]; const p = put(sl, 0); g.visible = true; g.position.set(p.x, p.y, p.z); g.rotation.set(0, p.yaw, 0);
      }
    },
    /** items, carried item, escort, destination, beacon, gantries, recovery zone; and hides unused pools */
    update(s: Sim, place: Placer, host: THREE.Object3D, sx: number, near: (x: number) => boolean) {
      const c = s.campaign; const d = s.dist; const t = s.time;
      for (const k in dressPools) { const pool = dressPools[k as Dressing]!; for (let i = dressUse[k as Dressing] ?? 0; i < pool.length; i++) pool[i].visible = false; }
      for (let i = waterUse; i < water.length; i++) water[i].visible = false;
      for (let i = wayUse; i < waySigns.length; i++) waySigns[i].g.visible = false;
      for (const k of ['tunnel', 'bridge', 'maintenance'] as const) for (let i = overUse[k]; i < overPools[k].length; i++) overPools[k][i].visible = false;
      for (const k of Object.keys(items) as (keyof typeof items)[]) { items[k].pick.visible = false; items[k].carry.visible = false; }
      halo.visible = false; column.visible = false; beacon.visible = false; pad.visible = false;
      for (const st of strips) st.visible = false;
      const showEscort = [false, false, false];
      if (!c || !mission) { for (const e of escort) { e.r.root.visible = false; e.sh.visible = false; } moodOn = false; return; }
      const m = mission;
      // carried item rides on the pack
      if (host !== carryHost) { for (const k of Object.keys(items) as (keyof typeof items)[]) { items[k].carry.parent?.remove(items[k].carry); host.add(items[k].carry); items[k].carry.position.set(0.02, 0.38, 0.33); } carryHost = host; }
      if (m.item && m.item !== 'survivors') {
        const it = items[m.item];
        if (c.collected) { it.carry.visible = !(m.activationAt && c.activated); it.carry.rotation.set(0, 0, 0.2); }
        else {
          const z = c.itemAt - d;
          if (z < 95 && z > -3) {
            const p = place(c.itemAt, c.itemLane * LW);
            it.pick.visible = true; it.pick.position.set(p.x, p.y + 1.05 + Math.sin(t * 3) * 0.12, p.z); it.pick.rotation.set(0, t * 2, 0);
            halo.visible = true; halo.position.set(p.x, p.y + 0.04, p.z); halo.scale.setScalar(1 + 0.12 * Math.sin(t * 5));
            column.visible = true; column.position.set(p.x, p.y + 7, p.z);
          }
        }
      }
      // recovery zone: hazard-free green strips leading to the re-placed item
      if (c.recoveries > 0 && !c.collected) {
        for (let i = 0; i < strips.length; i++) {
          const sl = c.itemAt - 4 - i * 6; if (sl - d < -2 || sl - d > 90) continue;
          const p = place(sl, 0); const st = strips[i]; st.visible = true; st.position.set(p.x, p.y + 0.025, p.z); st.rotation.set(0, p.yaw, 0);
        }
      }
      // escort group
      if (m.item === 'survivors') {
        if (!c.collected) {
          const z = c.itemAt - d;
          if (z < 90 && z > -4) for (let i = 0; i < 3; i++) {
            const p = place(c.itemAt + [0, 0.9, 1.6][i], c.itemLane * LW + [-0.55, 0.55, 0][i]);
            const e = escort[i]; e.r.root.position.set(p.x, p.y, p.z); e.r.root.rotation.set(0, p.yaw + Math.PI, 0); wavePose(e.r, t + i, i === 1 ? 'L' : 'R');
            e.sh.position.set(p.x, p.y + 0.02, p.z); showEscort[i] = true;
          }
          if (z < 90 && z > -4) { const p = place(c.itemAt, c.itemLane * LW); halo.visible = true; halo.position.set(p.x, p.y + 0.04, p.z); halo.scale.setScalar(1.6); }
        } else {
          if (d < trailDist) { trailHead = 0; trailCount = 0; }
          if (d !== trailDist) {
            const sample = trail[trailHead];
            sample.dist = d; sample.x = sx; sample.jump = s.jy; sample.slide = s.slideT > 0;
            trailHead = (trailHead + 1) % trail.length;
            trailCount = Math.min(trail.length, trailCount + 1); trailDist = d;
          }
          for (let i = 0; i < 3; i++) {
            const back = 2.1 + i * 1.3;
            let sample = trail[(trailHead - 1 + trail.length) % trail.length];
            for (let age = 1; age < trailCount; age++) {
              sample = trail[(trailHead - 1 - age + trail.length) % trail.length];
              if (sample.dist <= d - back) break;
            }
            const p = place(d - back, sample.x);
            const e = escort[i]; e.r.root.position.set(p.x, p.y + sample.jump, p.z); e.r.root.rotation.set(0, p.yaw, 0);
            if (s.mode === 'run' || s.mode === 'complete') runPose(e.r, t + i * 0.37, 1, 10 + i); else idlePose(e.r, t);
            if (sample.slide) { e.r.hips.position.y = 0.42; e.r.torso.rotation.x = -0.7; }
            e.sh.position.set(p.x, p.y + 0.02, p.z); showEscort[i] = true;
          }
        }
      } else if (m.id === 7 && c.finish - d < 90) {
        for (let i = 0; i < 3; i++) {
          const p = place(c.finish + 5 + i * 0.8, -1.6 + i * 1.0);
          const e = escort[i]; e.r.root.position.set(p.x, p.y, p.z); e.r.root.rotation.set(0, p.yaw + Math.PI, 0); wavePose(e.r, t + i * 0.6, i ? 'R' : 'L');
          e.sh.position.set(p.x, p.y + 0.02, p.z); showEscort[i] = true;
        }
      }
      for (let i = 0; i < 3; i++) { escort[i].r.root.visible = showEscort[i]; escort[i].sh.visible = showEscort[i]; }
      if (!showEscort[0]) {
        for (let i = 0; i < 3; i++) escortLat[i] = sx;
        trailCount = 0; trailHead = 0; trailDist = -1;
      }
      // beacon
      if (m.activationAt) {
        const z = m.activationAt - d;
        if (z < 110 && z > -40) {
          const p = place(m.activationAt, HW + 1.6);
          beacon.visible = true; beacon.position.set(p.x, p.y, p.z); beacon.rotation.set(0, p.yaw + (c.activated ? t * 0.8 : 0), 0);
          lens.material = c.activated ? M.glowAmber : c.activationT > 0 && Math.sin(t * 18) > 0 ? M.glowAmber : M.glowRed;
          (M.beam as THREE.MeshBasicMaterial).opacity = c.activated ? 0.14 + 0.04 * Math.sin(t * 4) : c.activationT > 0 ? 0.08 : 0;
          if (!c.activated) { const q = place(m.activationAt, 0); pad.visible = true; pad.position.set(q.x, q.y + 0.04, q.z); pad.scale.setScalar(2 + 0.2 * Math.sin(t * 6)); }
        }
      }
      // destination set piece
      if (dest) {
        const z = c.finish - d; dest.visible = z < 120 && z > -30;
        if (dest.visible) {
          const p = place(c.finish + 4, 0); dest.position.set(p.x, p.y, p.z); dest.rotation.set(0, p.yaw, 0);
          const boat = dest.getObjectByName('boat'); if (boat) { boat.position.y = Math.sin(t * 1.3) * 0.15; boat.rotation.z = Math.sin(t * 0.9) * 0.03; }
        }
      }
      for (const gt of gantries) {
        const z = gt.at - d; gt.g.visible = z < 95 && z > -10 && !near(gt.at);
        if (gt.g.visible) { const p = place(gt.at, 0); gt.g.position.set(p.x, p.y, p.z); gt.g.rotation.set(0, p.yaw, 0); }
      }
      if (routeSigns) {
        const J = s.turn; const show = c.routeChoice === 0 && !!J.branch && J.s - d < 95 && J.s - d > -2;
        routeSigns.visible = show;
        if (show) { const p = place(J.s - 3, 0); routeSigns.position.set(p.x, p.y, p.z); routeSigns.rotation.set(0, p.yaw, 0); }
      }
      // mood
      const sec = sectionAt(c, d); moodOn = true;
      if (m.id === 5) { fogTarget.set('#0F1519'); moodLight = 0.32; }
      else if (m.id === 6) { fogTarget.set('#D3E4DC'); moodLight = 1.45; }
      else if (sec.dressing === 'tunnel') { fogTarget.set('#24242C'); moodLight = 0.6; }
      else if (m.id === 9 || sec.dressing === 'bridge') { fogTarget.set('#3A4252'); moodLight = 0.8; }
      else if (sec.dressing === 'harbor') { fogTarget.set(c.activated ? '#6A5468' : '#34465E'); moodLight = 0.95; }
      else moodOn = false;
    },
    /** lighting override for the current frame; fog colour eases between moods */
    mood(base: THREE.Color) {
      fogSm.lerp(moodOn ? fogTarget : base, 0.06);
      return { fog: fogSm, light: moodOn ? moodLight : 1 };
    },
    dispose() { clearMission(); },
  };
}
export type MissionScenery = ReturnType<typeof buildMissionScenery>;
