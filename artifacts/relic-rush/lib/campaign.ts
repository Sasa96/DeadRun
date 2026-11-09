export type MissionStage = 'city' | 'police' | 'hospital';
export type MissionItem = 'battery' | 'fuse' | 'survivors' | 'fuel' | 'card' | 'cell';
export interface MissionSection { from: number; stage: MissionStage; name: string; dressing: 'residential' | 'checkpoint' | 'office' | 'garage' | 'tunnel' | 'ward' | 'maintenance' | 'depot' | 'bridge' | 'harbor' }
export interface MissionDefinition {
  id: number; title: string; briefing: string; finish: number; destination: string;
  item?: MissionItem; itemName?: string; itemAt?: number; itemLane?: number;
  activationAt?: number; sections: MissionSection[]; turns: (-1 | 1)[];
  completion: [string, string, string]; scene: 'shelter' | 'map' | 'radio' | 'hospital' | 'generator' | 'escort' | 'fuel' | 'checkpoint' | 'barrier' | 'boat';
}
export const MISSIONS: MissionDefinition[] = [
  { id: 1, title: 'Out the Front Door', briefing: 'Leave your neighborhood. Follow shelter signs and reach the maintenance refuge.', finish: 1200, destination: 'MAINTENANCE SHELTER', turns: [-1, 1, 1, -1],
    sections: [{ from: 0, stage: 'city', name: 'Your neighborhood', dressing: 'residential' }, { from: 650, stage: 'city', name: 'Shelter approach', dressing: 'maintenance' }],
    scene: 'shelter', completion: ['The shelter door slams shut.', 'Emergency radio: All survivors, proceed to Precinct 9.', 'There may still be a way out.'] },
  { id: 2, title: 'Precinct 9', briefing: 'Follow the police broadcast through abandoned checkpoints to the evacuation desk.', finish: 1500, destination: 'EVACUATION DESK', turns: [1, -1, 1, -1, 1],
    sections: [{ from: 0, stage: 'city', name: 'Police checkpoints', dressing: 'checkpoint' }, { from: 750, stage: 'police', name: 'Precinct reception', dressing: 'office' }],
    scene: 'map', completion: ['The evacuation desk is abandoned.', 'A convoy route on the map leads to St. Agnes Hospital.', 'The dispatch radio is dead. Find a battery.'] },
  { id: 3, title: 'Dead Air', briefing: 'Turn toward Radio Equipment, collect a battery in the garage, and return to dispatch.', finish: 1700, destination: 'DISPATCH RADIO', item: 'battery', itemName: 'RADIO BATTERY', itemAt: 680, itemLane: 1, turns: [-1, 1, -1, -1, 1],
    sections: [{ from: 0, stage: 'police', name: 'Police offices', dressing: 'office' }, { from: 550, stage: 'police', name: 'Radio equipment garage', dressing: 'garage' }, { from: 1050, stage: 'police', name: 'Return to dispatch', dressing: 'office' }],
    scene: 'radio', completion: ['The replacement battery clicks into place.', 'Doctor: St. Agnes. Ward C. Please—we are still here.', 'You mark the ambulance route on your map.'] },
  { id: 4, title: 'The Ambulance Route', briefing: 'Reach St. Agnes. At the split, left is a safer street detour; right is a shorter service tunnel.', finish: 1700, destination: 'HOSPITAL ENTRANCE', turns: [1, -1, 1, 1, -1],
    sections: [{ from: 0, stage: 'city', name: 'Ambulance approach', dressing: 'checkpoint' }, { from: 550, stage: 'city', name: 'Service tunnel', dressing: 'tunnel' }, { from: 1250, stage: 'hospital', name: 'St. Agnes entrance', dressing: 'ward' }],
    scene: 'hospital', completion: ['The doctor signals from behind a security window.', 'Doctor: Ward C is locked. The backup power failed.', 'The maintenance entrance is still open.'] },
  { id: 5, title: 'Emergency Power', briefing: 'Find an electrical fuse in the dark maintenance wing. Deliver it to the generator.', finish: 1800, destination: 'GENERATOR CONTROL', item: 'fuse', itemName: 'REPLACEMENT FUSE', itemAt: 680, itemLane: -1, turns: [-1, -1, 1, -1, 1, 1],
    sections: [{ from: 0, stage: 'hospital', name: 'Dark maintenance wing', dressing: 'maintenance' }, { from: 550, stage: 'hospital', name: 'Electrical stores', dressing: 'maintenance' }, { from: 1150, stage: 'hospital', name: 'Generator approach', dressing: 'maintenance' }],
    scene: 'generator', completion: ['The fuse seats. The generator starts.', 'Lights reveal infected behind the ward doors.', 'The alarm is sounding. Reach Ward C.'] },
  { id: 6, title: 'Ward C', briefing: 'Reach the ward, gather the survivors, then lead them to the ambulance bay. They follow your successful route.', finish: 1900, destination: 'AMBULANCE BAY', item: 'survivors', itemName: 'WARD C SURVIVORS', itemAt: 680, itemLane: 0, turns: [1, -1, -1, 1, -1, 1],
    sections: [{ from: 0, stage: 'hospital', name: 'Powered hospital corridors', dressing: 'ward' }, { from: 550, stage: 'hospital', name: 'Ward C', dressing: 'ward' }, { from: 1100, stage: 'hospital', name: 'Evacuation corridor', dressing: 'garage' }],
    scene: 'escort', completion: ['The group slips through the ambulance-bay gate.', 'The driver turns the key. The engine coughs and stops.', 'Driver: Empty. We need fuel.'] },
  { id: 7, title: 'Running on Empty', briefing: 'Leave the group behind the secured gate. Collect fuel at the depot and return by the service road.', finish: 2000, destination: 'WAITING RESCUE VEHICLE', item: 'fuel', itemName: 'FUEL CAN', itemAt: 980, itemLane: 1, turns: [-1, 1, 1, -1, -1, 1],
    sections: [{ from: 0, stage: 'city', name: 'Outbound service road', dressing: 'garage' }, { from: 750, stage: 'city', name: 'Service depot', dressing: 'depot' }, { from: 1250, stage: 'city', name: 'Return road to the group', dressing: 'checkpoint' }],
    scene: 'fuel', completion: ['Fuel pours into the tank. The engine catches.', 'Dispatch: Bridge checkpoint sealed. Police authorization required.', 'The last officer reported from a roadside command post.'] },
  { id: 8, title: 'The Last Officer', briefing: 'Reach the roadside command post, recover an access card, and escape to the checkpoint.', finish: 2100, destination: 'BRIDGE CHECKPOINT', item: 'card', itemName: 'POLICE ACCESS CARD', itemAt: 980, itemLane: -1, turns: [1, 1, -1, 1, -1, -1, 1],
    sections: [{ from: 0, stage: 'city', name: 'Officer transmission route', dressing: 'checkpoint' }, { from: 650, stage: 'police', name: 'Roadside command post', dressing: 'office' }, { from: 1250, stage: 'city', name: 'Escape to the bridge', dressing: 'bridge' }],
    scene: 'checkpoint', completion: ['The recovered card authorizes the crossing.', 'Beyond the checkpoint, wreckage blocks the bridge.', 'A maintenance passage reaches the far-side barrier.'] },
  { id: 9, title: 'Under the Bridge', briefing: 'Follow maintenance signs beneath the bridge. Clear low pipes and broken walkway sections to reach the service-lane controls.', finish: 2200, destination: 'SERVICE-LANE CONTROLS', turns: [-1, 1, -1, 1, 1, -1, 1],
    sections: [{ from: 0, stage: 'city', name: 'Underbridge entrance', dressing: 'bridge' }, { from: 500, stage: 'city', name: 'Maintenance passage', dressing: 'tunnel' }, { from: 1750, stage: 'city', name: 'Far-side barrier', dressing: 'bridge' }],
    scene: 'barrier', completion: ['The service barrier rises. The rescue vehicle crosses.', 'Coastal rescue: One final boat. Light the terminal beacon.', 'The group heads for the harbor.'] },
  { id: 10, title: 'Last Light', briefing: 'Retrieve the power cell, activate the terminal beacon, then sprint down the pier to the rescue boat.', finish: 2400, destination: 'RESCUE BOAT', item: 'cell', itemName: 'BEACON POWER CELL', itemAt: 980, itemLane: 1, activationAt: 1950, turns: [1, -1, 1, -1, -1, 1, 1, -1],
    sections: [{ from: 0, stage: 'city', name: 'Coastal terminal', dressing: 'harbor' }, { from: 750, stage: 'city', name: 'Terminal power stores', dressing: 'depot' }, { from: 1450, stage: 'city', name: 'Beacon approach', dressing: 'harbor' }, { from: 2000, stage: 'city', name: 'Final pier sprint', dressing: 'harbor' }],
    scene: 'boat', completion: ['The beacon lights the harbor. The boat holds its position.', 'You leap aboard as the infected reach the pier.', 'The city recedes. Together, you made it out.'] },
];
export function missionById(id: number) {
  const m = MISSIONS.find((m) => m.id === id);
  if (!m) throw new Error('Unknown campaign mission');
  return m;
}
export interface CampaignRun {
  id: number; collected: boolean; itemAt: number; itemLane: number; finish: number;
  recoveries: number; activated: boolean; activationT: number; routeChoice: -1 | 0 | 1;
}
export function newCampaignRun(id: number): CampaignRun {
  const m = missionById(id);
  return { id, collected: !m.item, itemAt: m.itemAt ?? Infinity, itemLane: m.itemLane ?? 0, finish: m.finish,
    recoveries: 0, activated: false, activationT: 0, routeChoice: 0 };
}
export function missionSection(c: CampaignRun, distance: number): MissionSection {
  const m = missionById(c.id);
  let section = m.sections[0];
  for (const s of m.sections) if (distance >= s.from) section = s;
  if (c.id === 4 && c.routeChoice === -1 && distance >= 550 && distance < 1250) return { from: 550, stage: 'city', name: 'Safer street detour', dressing: 'residential' };
  if (c.recoveries && !c.collected && distance > (m.itemAt ?? Infinity)) return { ...section, name: `Recovery loop · ${m.itemName}` };
  return section;
}
export function missionObjective(c: CampaignRun, distance: number) {
  const m = missionById(c.id);
  if (c.activationT > 0) return 'ACTIVATING THE BEACON';
  if (!c.collected) return `${c.recoveries ? 'RECOVER' : 'COLLECT'} ${m.itemName} · ${Math.max(0, Math.ceil(c.itemAt - distance))} m`;
  if (m.activationAt && !c.activated) return `REACH THE BEACON · ${Math.max(0, Math.ceil(m.activationAt - distance))} m`;
  return `REACH ${m.destination} · ${Math.max(0, Math.ceil(c.finish - distance))} m`;
}
export interface CampaignProgress { completed: number[]; bestTimes: Record<string, number> }
export function normalizeCampaign(raw?: Partial<CampaignProgress>): CampaignProgress {
  const completed: number[] = [];
  for (let id = 1; id <= 10; id++) {
    if (!Array.isArray(raw?.completed) || !raw.completed.includes(id)) break;
    completed.push(id);
  }
  const bestTimes: Record<string, number> = {};
  for (const id of completed) {
    const time = raw?.bestTimes?.[id];
    if (typeof time === 'number' && Number.isFinite(time) && time > 0) bestTimes[id] = time;
  }
  return { completed, bestTimes };
}
export function missionUnlocked(p: CampaignProgress, id: number) {
  return Number.isInteger(id) && id >= 1 && id <= 10 && (id === 1 || p.completed.includes(id - 1));
}
export function finishCampaignMission(p: CampaignProgress, id: number, seconds: number): CampaignProgress {
  if (!missionUnlocked(p, id) || !Number.isFinite(seconds) || seconds <= 0) return p;
  return { completed: [...new Set([...p.completed, id])].sort((a, b) => a - b),
    bestTimes: { ...p.bestTimes, [id]: Math.min(p.bestTimes[id] ?? Infinity, seconds) } };
}
