import { normalizeCampaign, type CampaignProgress } from './campaign.ts';
export type OutfitId = 'scout' | 'medic' | 'ranger';
export interface RunStats { turns: number; jumps: number; slides: number; pickups: number }
export interface Progress {
  best: number; totalCoins: number; runs: number;
  distance: number; turns: number; jumps: number; slides: number; pickups: number;
  claimed: string[]; owned: OutfitId[]; outfit: OutfitId;
  unlockedTrophies: string[];
  campaign: CampaignProgress;
  settings: { control: 'tilt' | 'touch'; sensitivity: number };
}
export const DEFAULT_PROGRESS: Progress = {
  best: 0, totalCoins: 0, runs: 0, distance: 0, turns: 0, jumps: 0, slides: 0, pickups: 0,
  claimed: [], owned: ['scout'], outfit: 'scout', unlockedTrophies: [], campaign: { completed: [], bestTimes: {} }, settings: { control: 'tilt', sensitivity: 1 },
};
export interface Trophy {
  id: string; title: string; description: string; rank: 'bronze' | 'silver' | 'gold';
  target: number; progress: number; unlocked: boolean;
}
const TROPHIES = [
  { id: 'survivor', title: 'Outbreak Survivor', description: 'Run 1,500 m in a single escape.', rank: 'bronze' as const, key: 'best' as const, target: 1500 },
  { id: 'districts', title: 'No Safe Place', description: 'Complete the city, precinct and hospital in one run: 2,700 m.', rank: 'silver' as const, key: 'best' as const, target: 2700 },
  { id: 'relentless', title: 'Relentless', description: 'Run 3,000 m in a single escape.', rank: 'silver' as const, key: 'best' as const, target: 3000 },
  { id: 'untouchable', title: 'Last One Standing', description: 'Run 6,000 m in a single escape.', rank: 'gold' as const, key: 'best' as const, target: 6000 },
  { id: 'navigator', title: 'Know Every Exit', description: 'Successfully take 100 corners across your runs.', rank: 'silver' as const, key: 'turns' as const, target: 100 },
  { id: 'resourceful', title: 'Resourceful', description: 'Collect 100 special pickups across your runs.', rank: 'silver' as const, key: 'pickups' as const, target: 100 },
  { id: 'road-veteran', title: 'Road Veteran', description: 'Survive 25,000 m across your runs.', rank: 'gold' as const, key: 'distance' as const, target: 25000 },
];
const count = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
export function normalizeProgress(raw: Partial<Progress> = {}): Progress {
  const p = { ...DEFAULT_PROGRESS };
  for (const key of ['best', 'totalCoins', 'runs', 'distance', 'turns', 'jumps', 'slides', 'pickups'] as const) p[key] = count(raw[key]);
  // Retain legacy metadata for save compatibility, but removed features cannot spend currency.
  p.claimed = Array.isArray(raw.claimed) ? raw.claimed.filter((id) => typeof id === 'string') : [];
  p.owned = ['scout'];
  p.outfit = 'scout';
  p.unlockedTrophies = Array.isArray(raw.unlockedTrophies) ? raw.unlockedTrophies.filter((id) => TROPHIES.some((t) => t.id === id)) : [];
  p.campaign = normalizeCampaign(raw.campaign);
  p.settings = { control: raw.settings?.control === 'touch' ? 'touch' : 'tilt', sensitivity: Math.min(1.6, Math.max(0.6, typeof raw.settings?.sensitivity === 'number' && Number.isFinite(raw.settings.sensitivity) ? raw.settings.sensitivity : 1)) };
  return unlockEarned(p);
}
export function trophiesOf(p: Progress): Trophy[] {
  return TROPHIES.map((t) => ({
    id: t.id, title: t.title, description: t.description, rank: t.rank, target: t.target,
    progress: Math.min(t.target, p[t.key]), unlocked: p.unlockedTrophies.includes(t.id) || p[t.key] >= t.target,
  }));
}
function unlockEarned(p: Progress): Progress {
  const earned = TROPHIES.filter((t) => p[t.key] >= t.target).map((t) => t.id);
  return { ...p, unlockedTrophies: [...new Set([...p.unlockedTrophies, ...earned])] };
}
export function addRun(p: Progress, distance: number, coins: number, stats?: RunStats): Progress {
  return unlockEarned({ ...p, best: Math.max(p.best, count(distance)), distance: p.distance + count(distance),
    totalCoins: p.totalCoins + count(coins), runs: p.runs + 1,
    turns: p.turns + count(stats?.turns), jumps: p.jumps + count(stats?.jumps), slides: p.slides + count(stats?.slides), pickups: p.pickups + count(stats?.pickups) });
}
