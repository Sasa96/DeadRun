// Full 3x5 pixel font for mission wayfinding signs (merged quads, XY plane facing +z, centred).
import * as THREE from 'three';

const F: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', '<': '001010100010001', '>': '100010001010100', '-': '000000111000000', '.': '000000000000010',
  ' ': '000000000000000',
};

export function signText(str: string, px: number) {
  const s = str.toUpperCase();
  const pos: number[] = []; const nrm: number[] = [];
  const w = s.length * 4 - 1;
  let x0 = -w * px / 2;
  for (const ch of s) {
    const g = F[ch] ?? F[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r * 3 + c] !== '1') continue;
      const x = x0 + c * px; const y = (2 - r) * px - px / 2;
      pos.push(x, y, 0, x + px, y, 0, x + px, y + px, 0, x, y, 0, x + px, y + px, 0, x, y + px, 0);
      for (let i = 0; i < 6; i++) nrm.push(0, 0, 1);
    }
    x0 += 4 * px;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}
/** world width of a string at px */
export const signWidth = (str: string, px: number) => (str.length * 4 - 1) * px;
