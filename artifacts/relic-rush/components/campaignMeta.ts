// Shared campaign presentation metadata (no three.js): cutscene lengths and subtitle timing.
import { missionById } from '@/lib/campaign';

export const cutsceneLength = (id: number) => (id === 10 ? 10 : 7);
/** subtitle line index for a completion scene at time t */
export function cutsceneLine(id: number, t: number): { text: string; index: number } | null {
  const m = missionById(id); const len = cutsceneLength(id);
  if (t < 0.4 || t > len - 0.2) return null;
  const i = Math.min(2, Math.floor(((t - 0.4) / (len - 0.6)) * 3));
  return { text: m.completion[i], index: i };
}
export const SCENE_KICKER: Record<string, string> = {
  shelter: 'MAINTENANCE SHELTER', map: 'PRECINCT 9 · EVACUATION DESK', radio: 'PRECINCT 9 · DISPATCH', hospital: 'ST. AGNES · FRONT ENTRANCE',
  generator: 'ST. AGNES · GENERATOR ROOM', escort: 'ST. AGNES · AMBULANCE BAY', fuel: 'SERVICE ROAD · RESCUE VEHICLE',
  checkpoint: 'BRIDGE CHECKPOINT', barrier: 'UNDER THE BRIDGE · FAR SIDE', boat: 'COASTAL TERMINAL · PIER 4',
};
