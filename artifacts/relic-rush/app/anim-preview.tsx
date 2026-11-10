// Dev-only animation bench (web): the survivor running in place under game lighting, seen from the side
// and three-quarter view, to tune the run cycle by eye. Renders nothing outside development builds.
// Query: ?speed=11..40 &mode=run|jump|slide &slow=0.25 (time scale) &view=side|back|both
//        &strip=8 (side-view filmstrip: N frozen poses spread over one stride)
import React, { useCallback } from 'react';
import { Platform, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { scene as C } from '@/constants/colors';
import { animateSurvivor, buildSurvivor } from '@/components/characters';
import { newSim, type Sim } from '@/lib/game';

function param(name: string, def: string) {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return def;
  return new URLSearchParams(location.search).get(name) ?? def;
}

export default function AnimPreview() {
  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    const canvas = (gl as unknown as { canvas: HTMLCanvasElement }).canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, antialias: true });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    renderer.setScissorTest(true);
    const scn = new THREE.Scene(); scn.background = new THREE.Color(C.fog);
    scn.add(new THREE.HemisphereLight(C.skyLow, C.asphaltDark, 1.25));
    const sun = new THREE.DirectionalLight(C.sun, 1.6); sun.position.set(-6, 7, -12); scn.add(sun);
    const rim = new THREE.DirectionalLight(C.supply, 0.35); rim.position.set(5, 4, 8); scn.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: C.asphalt }));
    floor.rotation.x = -Math.PI / 2; scn.add(floor);
    const grid = new THREE.GridHelper(40, 80, 0x77707a, 0x4a4650); grid.position.y = 0.002; scn.add(grid);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const { rig } = buildSurvivor(mat, 'scout'); scn.add(rig.root);
    const strip = Number(param('strip', '0'));
    if (strip > 0) {
      rig.root.visible = false;
      const W0 = gl.drawingBufferWidth; const H0 = gl.drawingBufferHeight;
      const cam = new THREE.OrthographicCamera(-strip * 0.55, strip * 0.55, (strip * 0.55) * H0 / W0, -(strip * 0.55) * H0 / W0, 0.1, 100);
      cam.position.set(10, 1.0, 0); cam.lookAt(0, 1.0, 0);
      const rigs = Array.from({ length: strip }, (_, i) => { const b = buildSurvivor(mat, 'scout').rig; b.root.position.z = (i - (strip - 1) / 2) * 1.1; scn.add(b.root); return b; });
      const s0: Sim = newSim('run'); s0.speed = Number(param('speed', '18')); s0.horde = 9;
      rigs.forEach((r, i) => { s0.phase = (i / strip) * Math.PI * 2; animateSurvivor(r, s0); });
      renderer.setScissorTest(false); renderer.render(scn, cam); gl.endFrameEXP();
      return;
    }

    const W = gl.drawingBufferWidth; const H = gl.drawingBufferHeight;
    const view = param('view', 'both');
    const side = new THREE.PerspectiveCamera(30, (view === 'both' ? W / 2 : W) / H, 0.1, 100);
    side.position.set(5.2, 1.1, 0); side.lookAt(0, 0.95, 0);
    const back = new THREE.PerspectiveCamera(30, (view === 'both' ? W / 2 : W) / H, 0.1, 100);
    // same framing as the in-game chase camera
    back.fov = 62; back.updateProjectionMatrix(); back.position.set(0, 4.3, 7.6); back.lookAt(0, 1.2, -9);

    const s: Sim = newSim('run');
    s.speed = Number(param('speed', '18')); s.horde = 9;
    const mode = param('mode', 'run'); const slow = Number(param('slow', '1'));
    let last = performance.now(); let jumpT = 0;
    const tick = () => {
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000) * slow; last = now;
      s.time += dt;
      s.phase += dt * Math.min(14.5, 7.5 + s.speed * 0.22);
      if (mode === 'jump') { jumpT += dt; if (jumpT > 1.6) { jumpT = 0; s.vy = 9.5; s.jy = 0.01; } s.vy -= 28 * dt; s.jy = Math.max(0, s.jy + s.vy * dt); if (s.jy === 0) s.vy = 0; }
      if (mode === 'slide') { jumpT += dt; s.slideT = jumpT % 2 < 0.8 ? 0.5 : 0; }
      rig.root.position.y = Math.max(0, s.jy);
      animateSurvivor(rig, s);
      if (view === 'side' || view === 'both') { renderer.setViewport(0, 0, view === 'both' ? W / 2 : W, H); renderer.setScissor(0, 0, view === 'both' ? W / 2 : W, H); renderer.render(scn, side); }
      if (view === 'back' || view === 'both') { const x0 = view === 'both' ? W / 2 : 0; renderer.setViewport(x0, 0, view === 'both' ? W / 2 : W, H); renderer.setScissor(x0, 0, view === 'both' ? W / 2 : W, H); renderer.render(scn, back); }
      gl.endFrameEXP();
      requestAnimationFrame(tick);
    };
    tick();
  }, []);
  if (!__DEV__ || Platform.OS !== 'web') return null;
  return <View style={{ flex: 1 }}><GLView style={{ flex: 1 }} onContextCreate={onContextCreate} /></View>;
}
