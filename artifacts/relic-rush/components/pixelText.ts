import * as THREE from 'three';

// 5-row pixel font for geometry signage (no textures, native-safe)
export const GLYPHS: Record<string, string[]> = {
  P: ['1110', '1001', '1110', '1000', '1000'], O: ['0110', '1001', '1001', '1001', '0110'], L: ['1000', '1000', '1000', '1000', '1111'],
  I: ['111', '010', '010', '010', '111'], C: ['0111', '1000', '1000', '1000', '0111'], E: ['1111', '1000', '1110', '1000', '1111'],
  H: ['1001', '1001', '1111', '1001', '1001'], S: ['0111', '1000', '0110', '0001', '1110'], T: ['11111', '00100', '00100', '00100', '00100'],
  A: ['0110', '1001', '1111', '1001', '1001'], X: ['1001', '1001', '0110', '1001', '1001'], R: ['1110', '1001', '1110', '1010', '1001'],
  M: ['10001', '11011', '10101', '10001', '10001'], G: ['0111', '1000', '1011', '1001', '0111'], N: ['1001', '1101', '1011', '1001', '1001'],
  Y: ['10001', '01010', '00100', '00100', '00100'], D: ['1110', '1001', '1001', '1001', '1110'],
  ' ': ['00', '00', '00', '00', '00'],
};
/** merged quads in the XY plane facing +z, centred, height = 5 * px */
export function textGeo(str: string, px: number) {
  const pos: number[] = []; const nrm: number[] = [];
  let w = 0; for (const ch of str) w += (GLYPHS[ch]?.[0].length ?? 2) + 1; w -= 1;
  let x0 = -w * px / 2;
  for (const ch of str) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < g[r].length; c++) {
      if (g[r][c] !== '1') continue;
      const x = x0 + c * px; const y = (2 - r) * px - px / 2;
      pos.push(x, y, 0, x + px, y, 0, x + px, y + px, 0, x, y, 0, x + px, y + px, 0, x, y + px, 0);
      for (let i = 0; i < 6; i++) nrm.push(0, 0, 1);
    }
    x0 += (g[0].length + 1) * px;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

