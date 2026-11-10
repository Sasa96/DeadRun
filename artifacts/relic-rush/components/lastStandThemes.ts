// Last Stand themes beyond the city/precinct/hospital: subway & sewers, highway bridge, docks & fuel depot,
// military quarantine zone. Everything is pre-merged into vertex-coloured meshes (one draw call per model)
// so the extra scenery stays cheap on phones. Collision silhouettes follow the shared rules:
// hurdles <= 0.8 m tall (jump), overhead parts start >= 1.3 m (slide), gaps keep the pit footprint.
import * as THREE from 'three';
import { OB_POOL_CAP } from '@/lib/game';
import { textGeo } from '@/components/pixelText';

export type NewStage = 'subway' | 'bridge' | 'docks' | 'military';
export const NEW_STAGES: NewStage[] = ['subway', 'bridge', 'docks', 'military'];

// ---------- merged geometry builder ----------
/** b = box [sx,sy,sz], c = cylinder [rTop,rBot,h], t = torus [R,r], s = sphere [r]; then position, rotation, colour */
export type Part =
  | ['b', number, number, number, number, number, number, number, number, number, string]
  | ['c', number, number, number, number, number, number, number, number, number, string]
  | ['t', number, number, number, number, number, number, number, number, number, string]
  | ['s', number, number, number, number, number, number, number, number, number, string];
const B = (sx: number, sy: number, sz: number, x: number, y: number, z: number, col: string, rx = 0, ry = 0, rz = 0): Part => ['b', sx, sy, sz, x, y, z, rx, ry, rz, col];
const Cy = (r0: number, r1: number, h: number, x: number, y: number, z: number, col: string, rx = 0, ry = 0, rz = 0): Part => ['c', r0, r1, h, x, y, z, rx, ry, rz, col];
const To = (R: number, r: number, x: number, y: number, z: number, col: string, rx = 0, ry = 0, rz = 0): Part => ['t', R, r, 0, x, y, z, rx, ry, rz, col];
const Sp = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, col: string): Part => ['s', r, sx, sy, x, y, z, sz, 0, 0, col];

export function merge(parts: Part[]) {
  const pos: number[] = []; const nor: number[] = []; const col: number[] = [];
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const c = new THREE.Color();
  const one = new THREE.Vector3(1, 1, 1); const p = new THREE.Vector3(); const sc = new THREE.Vector3();
  for (const pt of parts) {
    let g: THREE.BufferGeometry; let scale = one;
    if (pt[0] === 'b') g = new THREE.BoxGeometry(pt[1], pt[2], pt[3]);
    else if (pt[0] === 'c') g = new THREE.CylinderGeometry(pt[1], pt[2], pt[3], 10);
    else if (pt[0] === 't') g = new THREE.TorusGeometry(pt[1], pt[2], 5, 14);
    else { g = new THREE.SphereGeometry(pt[1], 10, 7); scale = sc.set(pt[2], pt[3], pt[7]); }
    const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose();
    const rx = pt[0] === 's' ? 0 : pt[7];
    m.compose(p.set(pt[4], pt[5], pt[6]), q.setFromEuler(e.set(rx, pt[8], pt[9])), scale);
    ng.applyMatrix4(m);
    const P = ng.attributes.position; const N = ng.attributes.normal; c.set(pt[10]);
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(c.r, c.g, c.b); }
    ng.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------- stage looks ----------
/** floor/walkway/curb, plus wall/band/ceiling for the enclosed subway */
export const NEW_STAGE_COLORS: Record<NewStage, { road: string; walk: string; curb: string; wall?: string; band?: string; ceil?: string; fog: string; ash: [string, number]; dust: string }> = {
  subway: { road: '#34363C', walk: '#6A665C', curb: '#D2AE2E', wall: '#4E6460', band: '#C9A62E', ceil: '#24262C', fog: '#1C181E', ash: ['#9A8E80', 0.3], dust: '#7A746A' },
  bridge: { road: '#44434A', walk: '#7C7A80', curb: '#A8A6AC', fog: '#6E5C68', ash: ['#B9B0B6', 0.55], dust: '#A0948C' },
  docks: { road: '#4C4840', walk: '#5E5A52', curb: '#D2AE2E', fog: '#4C5664', ash: ['#B0B6BE', 0.45], dust: '#8C8A84' },
  military: { road: '#4A4438', walk: '#5C5644', curb: '#6E6A55', fog: '#4A4A3C', ash: ['#C0B8A0', 0.5], dust: '#8E8670' },
};
/** sewer half of the subway: wet brick walls and a dim ceiling */
export const SEWER_COLORS = { wall: '#4A3E34', band: '#3A5A50', ceil: '#2A2420', walk: '#2F3A2E' };

export interface ThemeBuild {
  /** obstacle pools in OB order per stage: gap, hurdleA, hurdleB, beam */
  obstacles: Record<NewStage, THREE.Group[][]>;
  /** outdoor side structures (wall line of the street), variant geometries per stage */
  sideGeos: Record<'bridge' | 'docks' | 'military', THREE.BufferGeometry[]>;
  /** landmark geometries placed less often (bridge towers, cranes, watchtowers) */
  landmarkGeos: Record<'bridge' | 'docks' | 'military', THREE.BufferGeometry>;
  /** subway / sewer platform props (merged) */
  subwayProps: THREE.BufferGeometry[]; sewerProps: THREE.BufferGeometry[]; trainGeo: THREE.BufferGeometry;
  /** stage entrance portals */
  portals: Record<NewStage, THREE.Group>;
  /** wall sign for the subway (blue METRO plate) */
  metroSign: () => THREE.Group;
  crates: THREE.BufferGeometry; sandbags: THREE.BufferGeometry; armyTruck: THREE.BufferGeometry;
  mat: THREE.Material; glowMats: { red: THREE.Material; white: THREE.Material; amber: THREE.Material; green: THREE.Material };
}

export function buildThemes(opts: {
  world: THREE.Group; LW: number; gapLen: number; HW: number; SW: number;
  reg: <G extends THREE.BufferGeometry>(g: G) => G; regM: <M extends THREE.Material>(m: M) => M;
}): ThemeBuild {
  const { world, LW, gapLen, HW, SW, reg, regM } = opts;
  const mat = regM(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const glow = (c: string) => regM(new THREE.MeshBasicMaterial({ color: c }));
  const glowMats = { red: glow('#FF3A2A'), white: glow('#F4F0E0'), amber: glow('#FFB040'), green: glow('#5CE08A') };
  const G = (parts: Part[]) => reg(merge(parts));
  const W = LW * 0.9; const PW = LW * 0.47;
  const pit = (pitCol: string, rim: string): Part[] => [B(LW * 0.92, 0.02, gapLen, 0, 0.015, -gapLen / 2, pitCol), B(LW * 0.96, 0.12, 0.22, 0, 0.05, 0, rim), B(LW * 0.96, 0.12, 0.22, 0, 0.05, -gapLen, rim)];
  const posts = (col: string, h = 2.35): Part[] => [B(0.16, h, 0.16, -PW, h / 2, 0, col), B(0.16, h, 0.16, PW, h / 2, 0, col)];
  const pool = (geo: THREE.BufferGeometry, extra?: (g: THREE.Group) => void) => Array.from({ length: OB_POOL_CAP }, () => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(geo, mat)); extra?.(g); g.visible = false; world.add(g); return g;
  });
  const lit = (m: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number) => (g: THREE.Group) => {
    const b = new THREE.Mesh(unitBox, m); b.scale.set(sx, sy, sz); b.position.set(x, y, z); g.add(b);
  };
  const unitBox = reg(new THREE.BoxGeometry(1, 1, 1));

  // ---------- obstacles ----------
  // SUBWAY: track pit with rails, turnstile bank, toppled vending machine, fallen platform sign
  const subGap = G([...pit('#0C0B10', '#C9A62E'), B(0.06, 0.03, gapLen, -0.45, 0.03, -gapLen / 2, '#7A7066'), B(0.06, 0.03, gapLen, 0.45, 0.03, -gapLen / 2, '#7A7066'),
    ...[0.6, 1.3, 2.0].map((z) => B(LW * 0.8, 0.025, 0.14, 0, 0.025, -z, '#3A2E26'))]);
  const subTurn = G([B(W, 0.66, 0.5, 0, 0.33, 0, '#8A9096'), B(W, 0.06, 0.54, 0, 0.69, 0, '#B8C0C4'), ...[-0.55, 0, 0.55].flatMap((x) => [Cy(0.05, 0.05, 0.12, x, 0.76, 0, '#2A2C30'),
    B(0.36, 0.04, 0.04, x + 0.12, 0.74, -0.2, '#C8D0D4', 0, 0.5)]), B(0.3, 0.14, 0.02, -0.55, 0.52, 0.26, '#2A6A9A')]);
  const subVend = G([B(W, 0.72, 0.78, 0, 0.36, 0, '#B8302E'), B(W * 0.62, 0.02, 0.6, -0.2, 0.73, 0, '#E8E2D0'), B(0.4, 0.02, 0.5, 0.6, 0.73, 0, '#1E2024'),
    ...[0, 1, 2].map((i) => B(0.18, 0.025, 0.1, -0.45 + i * 0.25, 0.745, 0.15, i === 1 ? '#3A8AC8' : '#E8B83A'))]);
  const subBeam = G([...posts('#2A2C30'), B(LW * 0.98, 0.7, 0.12, 0, 1.75, 0, '#1E3A7A'), B(LW * 0.9, 0.12, 0.13, 0, 1.42, 0, '#C9A62E'),
    B(LW * 0.98, 0.04, 0.04, 0, 2.3, 0, '#2A2C30'), Cy(0.015, 0.015, 1.2, -0.6, 1.3, 0.1, '#1A1A1E', 0, 0, 0.6)]);
  // BRIDGE: collapsed deck with rebar, concrete divider, crushed car, fallen gantry sign
  const brGap = G([...pit('#0E0C12', '#6A6870'), ...[-0.6, -0.2, 0.3, 0.7].map((x, i) => Cy(0.012, 0.012, 0.6, x, 0.15, -0.1 - (i % 2) * gapLen * 0.9, '#6A4A3A', 0.9, 0, (i - 1.5) * 0.3)),
    Cy(0.02, 0.16, 0.5, -0.8, 0.25, 0.35, '#E8792E'), Cy(0.02, 0.16, 0.5, 0.8, 0.25, 0.35, '#E8792E')]);
  const brDivider = G([B(W, 0.3, 0.6, 0, 0.15, 0, '#9C9890'), B(W, 0.45, 0.24, 0, 0.52, 0, '#A8A49C'), ...[-0.6, 0, 0.6].map((x) => B(0.14, 0.06, 0.02, x, 0.6, 0.125, '#FF9A2A'))]);
  const brWreck = G([B(W, 0.42, 1.2, 0, 0.28, 0, '#5A6E8A'), B(W * 0.85, 0.22, 0.7, 0, 0.6, -0.1, '#2C3440', 0.15), B(0.3, 0.1, 0.05, -0.6, 0.35, 0.61, '#E8D8A0'), B(0.3, 0.1, 0.05, 0.6, 0.35, 0.61, '#E8D8A0'),
    Cy(0.3, 0.3, 0.2, -0.75, 0.3, 0.4, '#1D1C22', 0, 0, Math.PI / 2), Cy(0.3, 0.3, 0.2, 0.75, 0.3, 0.4, '#1D1C22', 0, 0, Math.PI / 2)]);
  const brBeam = G([...posts('#6A6E74'), B(LW * 0.98, 0.85, 0.1, 0, 1.85, 0, '#1E6A3E'), B(LW * 0.9, 0.04, 0.11, 0, 1.46, 0, '#E8E8E0'), ...[0, 1, 2].map((i) => B(0.9 - i * 0.2, 0.08, 0.11, -0.2, 1.65 + i * 0.2, 0, '#E8E8E0'))]);
  // DOCKS: open water between piers, pallets + crates, oil drums on their side, hanging spreader beam
  const dkGap = G([...pit('#123A44', '#5A4630'), ...[0.15, gapLen - 0.15].map((z) => B(LW * 0.98, 0.08, 0.3, 0, 0.06, -z, '#6E5438')), Cy(0.09, 0.11, 0.35, -0.85, 0.18, 0.3, '#2A2C30'), Cy(0.09, 0.11, 0.35, 0.85, 0.18, 0.3, '#2A2C30')]);
  const dkCrates = G([B(W, 0.14, 0.9, 0, 0.07, 0, '#8A6A44'), B(0.8, 0.55, 0.75, -0.45, 0.42, 0, '#9A7A4C'), B(0.7, 0.5, 0.7, 0.48, 0.4, 0.02, '#7E6040'),
    ...[-0.45, 0.48].map((x) => B(0.04, 0.5, 0.78, x, 0.42, 0, '#5A4430')), B(0.25, 0.12, 0.02, -0.45, 0.45, 0.38, '#2A2A2A')]);
  const dkDrums = G([...[-0.6, 0, 0.6].map((x, i) => Cy(0.28, 0.28, 0.85, x, 0.28, 0, ['#2E5A8A', '#B8402E', '#3E6A3A'][i], Math.PI / 2, 0, 0)),
    ...[-0.6, 0, 0.6].map((x) => To(0.28, 0.02, x, 0.28, 0.2, '#1A1A1E'))]);
  const dkBeam = G([...posts('#C9A62E'), B(LW * 0.98, 0.4, 0.4, 0, 1.6, 0, '#C9A62E'), ...[0, 1, 2, 3, 4].map((i) => B(0.22, 0.4, 0.41, -0.85 + i * 0.42, 1.6, 0, '#1E1E22')),
    Cy(0.03, 0.03, 1.2, -0.5, 2.4, 0, '#3A3A3E'), Cy(0.03, 0.03, 1.2, 0.5, 2.4, 0, '#3A3A3E')]);
  // MILITARY: trench with sandbag lips, sandbag wall, ammo crates, checkpoint boom
  const bag = (x: number, y: number, z: number, col = '#8A7E5C', ry = 0) => Sp(0.5, 0.3, 0.14, 0.18, x, y, z, col) as Part;
  const miGap = G([...pit('#1A140E', '#5A4A34'), ...[-0.75, -0.25, 0.25, 0.75].map((x, i) => bag(x, 0.12, 0.2, i % 2 ? '#7A6E50' : '#8A7E5C')),
    Cy(0.02, 0.02, 0.9, -0.95, 0.45, 0.3, '#3A3A30'), Cy(0.02, 0.02, 0.9, 0.95, 0.45, 0.3, '#3A3A30'), To(0.12, 0.008, -0.95, 0.8, 0.3, '#8A8A86', 0, Math.PI / 2, 0), To(0.12, 0.008, 0.95, 0.8, 0.3, '#8A8A86', 0, Math.PI / 2, 0)]);
  const sandbagParts: Part[] = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - (r === 2 ? 1 : 0); i++) sandbagParts.push(bag(-0.66 + i * 0.44 + (r % 2) * 0.22, 0.12 + r * 0.24, 0, (i + r) % 2 ? '#7A6E50' : '#8C805E'));
  const miBags = G(sandbagParts);
  const miCrates = G([B(0.8, 0.5, 0.6, -0.45, 0.25, 0, '#4E5636'), B(0.8, 0.5, 0.6, 0.45, 0.25, 0.05, '#46502E'), B(0.7, 0.24, 0.5, 0, 0.62, 0, '#4E5636'),
    ...[-0.45, 0.45].map((x) => B(0.5, 0.08, 0.02, x, 0.3, 0.31, '#D8C878')), Cy(0.1, 0.1, 0.36, 0.85, 0.18, 0.3, '#3E4A2A')]);
  const miBeam = G([B(0.25, 1.1, 0.25, -PW, 0.55, 0, '#3A3E2E'), B(0.16, 2.3, 0.16, PW, 1.15, 0, '#3A3E2E'), ...[0, 1, 2, 3, 4, 5].map((i) => B(LW * 0.94 / 6, 0.18, 0.12, -PW + LW * 0.94 / 12 + i * LW * 0.94 / 6, 1.45, 0, i % 2 ? '#E8E2D2' : '#C8302A')),
    B(0.5, 0.5, 0.04, 0, 1.95, 0.02, '#C8302A'), B(0.4, 0.08, 0.05, 0, 1.95, 0.03, '#F2EEE0')]);

  const obstacles: Record<NewStage, THREE.Group[][]> = {
    subway: [pool(subGap), pool(subTurn), pool(subVend, lit(glowMats.white, W * 0.55, 0.02, 0.4, -0.2, 0.745, 0)), pool(subBeam, lit(glowMats.white, LW * 0.8, 0.1, 0.02, 0, 1.85, 0.07))],
    bridge: [pool(brGap), pool(brDivider), pool(brWreck), pool(brBeam)],
    docks: [pool(dkGap), pool(dkCrates), pool(dkDrums), pool(dkBeam, lit(glowMats.amber, 0.2, 0.12, 0.12, 0, 1.38, 0.2))],
    military: [pool(miGap), pool(miBags), pool(miCrates), pool(miBeam, lit(glowMats.red, 0.14, 0.14, 0.14, -PW, 1.16, 0))],
  };

  // ---------- outdoor side structures (local +x faces the road, origin at the wall line) ----------
  const rail: Part[] = [B(0.12, 0.9, 0.12, 0.2, 0.45, 0, '#8A8C90'), B(0.08, 0.3, 10, 0.25, 0.8, 0, '#A8AAB0'), B(0.06, 0.12, 10, 0.25, 0.45, 0, '#8A8C90')];
  const sideGeos = {
    // bridge deck edge: guardrail; a suspension cable climbs out of every other bay
    bridge: [G([...rail]), G([...rail, Cy(0.05, 0.05, 26, -3, 12, 0, '#3A3C42', 0, 0, -0.25), B(0.4, 0.5, 0.4, 0.1, 0.25, 0, '#5A5C62')])],
    // docks: container stacks, two or three high, assorted liveries with corrugation ribs
    docks: [0, 1, 2, 3].map((v) => {
      const parts: Part[] = []; const cols = ['#9A3A2E', '#2E5A8A', '#2E7A6E', '#C87A2A', '#6A6E72', '#8A2E4A'];
      const n = 2 + (v % 2);
      for (let k = 0; k < n; k++) {
        const c = cols[(v * 3 + k * 2) % cols.length]; const y = 1.3 + k * 2.62; const off = (hash(v * 7 + k) - 0.5) * 0.6;
        parts.push(B(2.44, 2.59, 6.05, -1.3, y, off, c));
        for (let r = 0; r < 9; r++) parts.push(B(0.03, 2.4, 0.08, -0.06, y, off - 2.7 + r * 0.68, '#000000'));
        parts.push(B(0.05, 2.5, 0.05, -0.05, y, off + 3.0, '#2A2A2A'), B(0.05, 2.5, 0.05, -0.05, y, off - 3.0, '#2A2A2A'));
      }
      if (v === 2) parts.push(B(2.44, 2.59, 6.05, -1.3, 1.3, 6.3, cols[5]));
      return G(parts);
    }),
    // military: chain-link fence topped with razor wire, with tents / sandbag bunkers behind
    military: [0, 1, 2].map((v) => {
      const parts: Part[] = [];
      for (const z of [-5, 0, 5]) parts.push(Cy(0.04, 0.04, 2.6, 0.1, 1.3, z, '#5A5C5A'));
      parts.push(B(0.02, 2.2, 10, 0.1, 1.2, 0, '#7A7C78'));
      for (let i = 0; i < 8; i++) parts.push(To(0.22, 0.012, 0.1, 2.75, -4.4 + i * 1.25, '#9A9A96', 0, Math.PI / 2, 0));
      if (v === 0) parts.push(B(3.2, 0.12, 4.6, -2.4, 2.1, 0, '#4E5636', 0, 0, 0.45), B(3.2, 0.12, 4.6, -4.8, 2.1, 0, '#46502E', 0, 0, -0.45), B(0.1, 2.6, 0.1, -3.6, 1.3, 2.2, '#3A3A30'));
      if (v === 1) for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) parts.push(Sp(0.5, 0.36, 0.16, 0.2, -1.4 - (r % 2) * 0.1, 0.14 + r * 0.26, -1.3 + i * 0.5, (i + r) % 2 ? '#7A6E50' : '#8C805E'));
      if (v === 2) parts.push(B(2.6, 1.4, 2.0, -2.2, 0.7, 1, '#4E5636'), B(2.6, 0.12, 2.1, -2.2, 1.45, 1, '#3A3E2E'), B(1.0, 0.06, 0.04, -0.9, 1.0, 1, '#D8C878'));
      return G(parts);
    }),
  };
  const landmarkGeos = {
    // bridge tower: twin concrete pylons rising out of the fog with a portal beam
    bridge: G([B(2.4, 46, 2.4, -2.5, 22, 0, '#7A747A'), B(2.6, 1.4, 2.6, -2.5, 44, 0, '#6A646A'), B(1.8, 2, 2.4, -2.5, 30, 0, '#6A646A'), B(0.3, 0.3, 0.3, -2.5, 46.3, 0, '#C8302A')]),
    // dock crane: tall yellow gantry legs with a jib reaching out over the quay
    docks: G([B(0.7, 26, 0.7, -2, 13, -4, '#C9A62E'), B(0.7, 26, 0.7, -2, 13, 4, '#C9A62E'), B(0.7, 26, 0.7, -9, 13, -4, '#C9A62E'), B(0.7, 26, 0.7, -9, 13, 4, '#C9A62E'),
      B(9, 1.2, 9, -5.5, 26, 0, '#B8962A'), B(30, 1.0, 1.4, 4, 27.5, 0, '#C9A62E'), B(3, 2.4, 3, -6, 28.5, 0, '#8A7020'), Cy(0.04, 0.04, 12, 10, 21, 0, '#2A2A2A')]),
    // watchtower with a floodlight cage over the wire
    military: G([...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => B(0.2, 7, 0.2, -2.2 + a, 3.5, b, '#4A4A3E')), B(2.6, 0.2, 2.6, -2.2, 7, 0, '#3A3A30'), B(2.6, 1.0, 0.1, -2.2, 7.6, 1.3, '#4E5636'),
      B(2.6, 1.0, 0.1, -2.2, 7.6, -1.3, '#4E5636'), B(0.1, 1.0, 2.6, -0.9, 7.6, 0, '#4E5636'), B(2.9, 0.12, 2.9, -2.2, 8.9, 0, '#3A3E2E', 0, 0, 0.1), B(0.5, 0.4, 0.4, -0.8, 8.4, 0, '#2A2A26')]),
  };

  // ---------- subway / sewer props (local +x faces the corridor) ----------
  const subwayProps = [
    G([B(0.5, 0.08, 2.4, -0.2, 0.5, 0, '#8A6A44'), B(0.08, 0.5, 2.4, -0.45, 0.75, 0, '#8A6A44'), B(0.45, 0.5, 0.08, -0.2, 0.25, 1.1, '#2A2C30'), B(0.45, 0.5, 0.08, -0.2, 0.25, -1.1, '#2A2C30')]),
    G([B(0.9, 6.3, 0.9, -0.6, 3.15, 0, '#5C6E6A'), B(0.94, 1.4, 0.94, -0.6, 0.7, 0, '#C9C2A8'), B(0.95, 0.12, 0.95, -0.6, 1.45, 0, '#C9A62E'), B(0.04, 0.6, 0.5, -0.13, 2.2, 0, '#1E3A7A')]),
    G([B(0.7, 1.9, 1.0, -0.7, 0.95, 0, '#2E6A9A'), B(0.04, 1.2, 0.7, -0.33, 1.15, -0.05, '#9ACAE0'), B(0.05, 0.3, 0.25, -0.33, 0.5, 0.25, '#1A1A1E')]),
    G([Cy(0.28, 0.24, 0.8, -0.3, 0.4, 0, '#3A3E44'), To(0.28, 0.03, -0.3, 0.8, 0, '#2A2C30', Math.PI / 2, 0, 0), B(0.5, 0.02, 0.3, 0.2, 0.01, 0.4, '#C8C2B0', 0, 0.4, 0)]),
  ];
  const sewerProps = [
    G([Cy(0.3, 0.3, 4, -0.9, 0.9, 0, '#5A5C50', Math.PI / 2, 0, 0), Cy(0.18, 0.18, 4, -1.1, 2.2, 0, '#6A4A34', Math.PI / 2, 0, 0), To(0.32, 0.05, -0.9, 0.9, 1.2, '#3A3C32', 0, 0, 0), Cy(0.08, 0.08, 1.6, -0.9, 1.6, -1.6, '#5A5C50')]),
    G([Cy(0.28, 0.28, 0.85, -0.4, 0.42, 0, '#4E5A2E'), To(0.28, 0.03, -0.4, 0.84, 0, '#2E3A1E', Math.PI / 2, 0, 0), Sp(0.5, 0.6, 0.06, 0.5, -0.4, 0.03, 0.6, '#3E5A2A')]),
    G([B(1.2, 0.04, 1.2, -0.4, 0.02, 0, '#2A2A26'), ...[0, 1, 2, 3, 4].map((i) => B(0.05, 0.05, 1.1, -0.9 + i * 0.25, 0.04, 0, '#4A4A44'))]),
  ];
  // abandoned train car idling on the far track (sits on the platform band, local +x toward the corridor)
  const trainGeo = G([B(2.8, 3.0, 16, -1.5, 1.7, 0, '#9AA2A8'), B(2.82, 0.4, 16, -1.5, 0.4, 0, '#1E3A7A'), B(2.82, 0.2, 16, -1.5, 2.2, 0, '#1E3A7A'),
    ...[-6, -3, 0, 3, 6].map((z) => B(0.04, 0.9, 1.6, -0.08, 2.0, z, '#1A2228')), B(0.05, 2.1, 1.2, -0.08, 1.35, 4.5, '#3A4048'), B(0.05, 2.1, 1.2, -0.08, 1.35, -4.5, '#3A4048')]);

  const crates = G([B(0.9, 0.7, 0.9, 0, 0.35, 0, '#8A6A44'), B(0.7, 0.6, 0.7, 0.1, 1.0, 0.05, '#7E6040', 0, 0.3, 0), B(0.04, 0.7, 0.92, 0.45, 0.35, 0, '#5A4430')]);
  const sbParts: Part[] = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) sbParts.push(Sp(0.5, 0.34, 0.15, 0.2, (r % 2) * 0.15, 0.14 + r * 0.25, -0.8 + i * 0.5, (i + r) % 2 ? '#7A6E50' : '#8C805E'));
  const sandbags = G(sbParts);
  const armyTruck = G([B(2.2, 1.2, 2.2, 0, 1.1, 2.2, '#4E5636'), B(2.1, 0.8, 1.6, 0, 1.9, 2.4, '#46502E'), B(1.9, 0.6, 0.05, 0, 1.9, 1.62, '#2C3440'), B(2.3, 0.4, 6.6, 0, 0.7, 0, '#3A3E2E'),
    B(2.3, 1.9, 4.2, 0, 2.0, -1.3, '#55603C'), ...[-1.1, 1.1].flatMap((x) => [2.2, 0, -2.4].map((z) => Cy(0.45, 0.45, 0.35, x, 0.45, z, '#1D1C22', 0, 0, Math.PI / 2)))]);

  // ---------- entrance portals (face +z toward the runner) ----------
  const FW = HW + SW;
  const textMesh = (str: string, px: number, m: THREE.Material, x: number, y: number, z: number) => { const t = new THREE.Mesh(reg(textGeo(str, px)), m); t.position.set(x, y, z); return t; };
  const signWhite = glowMats.white;
  const portal = (st: NewStage) => {
    const g = new THREE.Group(); const parts: Part[] = [];
    if (st === 'subway') {
      for (const sg of [-1, 1]) parts.push(B(16, 14, 0.8, sg * (FW + 8.2), 7, 0, '#2A2C30'));
      parts.push(B(FW * 2 + 0.4, 7.6, 0.8, 0, 10, 0, '#2A2C30'), B(FW * 2, 0.3, 0.9, 0, 6.3, 0, '#C9A62E'), B(6.4, 1.6, 0.12, 0, 7.6, 0.46, '#1E3A7A'));
      g.add(new THREE.Mesh(G(parts), mat)); g.add(textMesh('METRO', 0.26, signWhite, 0, 7.6, 0.54));
    } else if (st === 'bridge') {
      parts.push(...[-1, 1].map((sg) => B(0.6, 7.5, 0.6, sg * (FW - 0.5), 3.75, 0, '#6A6E74')), B(FW * 2, 0.6, 0.6, 0, 7.3, 0, '#6A6E74'), B(9, 2.2, 0.14, 0, 6.0, 0.4, '#1E6A3E'),
        B(9.2, 0.08, 0.15, 0, 4.88, 0.4, '#E8E8E0'));
      g.add(new THREE.Mesh(G(parts), mat)); g.add(textMesh('HARBOR BRIDGE', 0.13, signWhite, 0, 6.0, 0.49));
    } else if (st === 'docks') {
      parts.push(...[-1, 1].map((sg) => B(1.4, 8, 1.4, sg * (FW - 0.2), 4, 0, '#C9A62E')), B(FW * 2 + 1.4, 1.6, 1.0, 0, 8.4, 0, '#C9A62E'), B(8, 1.5, 0.12, 0, 8.4, 0.56, '#1E2A3A'),
        ...[0, 1, 2, 3, 4, 5, 6].map((i) => B(0.6, 0.2, 1.42, -FW + 0.2 + (i % 2) * 0.01, 1 + i * 1.0, 0, i % 2 ? '#1E1E22' : '#C9A62E')));
      g.add(new THREE.Mesh(G(parts), mat)); g.add(textMesh('PORT', 0.28, signWhite, 0, 8.4, 0.64));
    } else {
      for (const sg of [-1, 1]) parts.push(...Array.from({ length: 6 }, (_, r) => Sp(0.5, 1.6, 0.4, 1.0, sg * (FW + 1.4), 0.25 + r * 0.42, 0, r % 2 ? '#7A6E50' : '#8C805E')), B(0.3, 6, 0.3, sg * (FW - 0.4), 3, 0, '#3A3E2E'));
      parts.push(B(FW * 2, 1.4, 0.2, 0, 6.2, 0, '#C8302A'), B(FW * 2, 0.12, 0.22, 0, 5.45, 0, '#F2EEE0'), B(FW * 2, 0.12, 0.22, 0, 6.95, 0, '#F2EEE0'));
      g.add(new THREE.Mesh(G(parts), mat)); g.add(textMesh('QUARANTINE ZONE', 0.11, signWhite, 0, 6.2, 0.12));
      for (const sg of [-1, 1]) { const f = new THREE.Mesh(unitBox, glowMats.white); f.scale.set(0.8, 0.5, 0.3); f.position.set(sg * (FW - 0.4), 6.3, 0.2); g.add(f); }
    }
    g.visible = false; world.add(g); return g;
  };
  const portals = { subway: portal('subway'), bridge: portal('bridge'), docks: portal('docks'), military: portal('military') };
  const metroSign = () => {
    const g = new THREE.Group(); g.add(new THREE.Mesh(G([B(2.6, 0.9, 0.06, 0, 0, -0.04, '#1E3A7A'), B(2.6, 0.08, 0.07, 0, -0.42, -0.03, '#C9A62E')]), mat));
    g.add(textMesh('METRO', 0.12, signWhite, 0, 0, 0.002)); g.visible = false; world.add(g); return g;
  };
  return { obstacles, sideGeos, landmarkGeos, subwayProps, sewerProps, trainGeo, portals, metroSign, crates, sandbags, armyTruck, mat, glowMats };
}

// ---------- rat swarm ----------
/** One infected rat (~0.6 m nose to tail): merged body, separate tail for the whip, glowing eyes. */
export function buildRat(reg: <G extends THREE.BufferGeometry>(g: G) => G, mat: THREE.Material, eyeMat: THREE.Material) {
  const body = reg(merge([
    Sp(1, 0.13, 0.1, 0.24, 0, 0.13, 0, '#4A4038'), Sp(1, 0.09, 0.08, 0.13, 0, 0.15, -0.22, '#55493E'), Cy(0.005, 0.045, 0.1, 0, 0.14, -0.35, '#6A5446', Math.PI / 2, 0, 0),
    Sp(1, 0.04, 0.05, 0.015, -0.055, 0.22, -0.2, '#8A6A5E'), Sp(1, 0.04, 0.05, 0.015, 0.055, 0.22, -0.2, '#8A6A5E'),
    ...[[-0.08, -0.12], [0.08, -0.12], [-0.09, 0.12], [0.09, 0.12]].map(([x, z]) => B(0.035, 0.1, 0.05, x, 0.05, z, '#5A4A40')),
    Sp(1, 0.06, 0.03, 0.08, 0.07, 0.17, 0.05, '#6A2A2A'), Cy(0.004, 0.004, 0.04, 0.03, 0.1, -0.38, '#E8E0C8', 0.3, 0, 0),
  ]));
  const tailGeo = reg(merge([Cy(0.006, 0.022, 0.38, 0, 0, 0.19, '#8A6A5E', Math.PI / 2, 0, 0)]));
  const eyeGeo = reg(new THREE.SphereGeometry(0.018, 6, 5));
  return () => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(body, mat); g.add(b);
    const tail = new THREE.Mesh(tailGeo, mat); tail.position.set(0, 0.12, 0.22); g.add(tail);
    for (const x of [-0.035, 0.035]) { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(x, 0.18, -0.3); g.add(e); }
    g.visible = false; return { g, body: b, tail };
  };
}
/** scurry: rapid bob and body wiggle, tail whipping side to side */
export function animateRat(r: { g: THREE.Group; body: THREE.Mesh; tail: THREE.Mesh }, t: number) {
  r.body.position.y = Math.abs(Math.sin(t * 22)) * 0.05;
  r.body.rotation.set(Math.sin(t * 22) * 0.08, Math.sin(t * 11) * 0.12, 0);
  r.tail.rotation.set(0.25 + Math.sin(t * 15) * 0.15, Math.sin(t * 9) * 0.7, 0);
}
