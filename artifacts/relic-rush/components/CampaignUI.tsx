// Campaign UI: mode chooser, escape-route mission map + briefing, in-run objective HUD,
// completion cutscene overlay and mission result / save-failure panels.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import colors from '@/constants/colors';
import { MISSIONS, missionUnlocked, type CampaignProgress, type MissionDefinition } from '@/lib/campaign';
import { cutsceneLength, cutsceneLine, SCENE_KICKER } from '@/components/campaignMeta';

const T = colors.light;
const F = { r: 'Inter_400Regular', m: 'Inter_500Medium', s: 'Inter_600SemiBold', b: 'Inter_700Bold' };
const ITEM_ICON: Record<string, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = {
  battery: 'car-battery', fuse: 'fuse', survivors: 'account-group', fuel: 'gas-station', card: 'card-account-details', cell: 'battery-charging-high',
};
export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------- mode chooser ----------
export function ModeChooser({ top, bottom, best, done, onEscape, onEndless, onBack }: {
  top: number; bottom: number; best: number; done: number; onEscape: () => void; onEndless: () => void; onBack: () => void;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, s.scrim, { paddingTop: top + 8, paddingBottom: bottom + 12 }]} testID="mode-chooser">
      <ScrollView contentContainerStyle={s.chooserBody} showsVerticalScrollIndicator={false}>
        <Pressable testID="campaign-back" onPress={onBack} hitSlop={10} style={s.back}><Feather name="chevron-left" size={20} color={T.foreground} /><Text style={s.backText}>Safehouse</Text></Pressable>
        <Text style={s.kicker}>CHOOSE YOUR NIGHT</Text>
        <Pressable testID="mode-escape" onPress={onEscape} style={({ pressed }) => [s.modeCard, s.modeEscape, pressed && s.pressed]}>
          <View style={s.modeTop}>
            <MaterialCommunityIcons name="map-marker-path" size={30} color={T.primaryForeground} />
            <Text style={s.modeTag}>{done}/10 REACHED</Text>
          </View>
          <Text style={s.modeTitle}>ESCAPE</Text>
          <Text style={s.modeBody}>Ten places between your front door and the last boat out. Find what each one needs, then get there alive.</Text>
          <View style={s.track}><View style={[s.trackFill, { width: `${done * 10}%` }]} /></View>
        </Pressable>
        <Pressable testID="mode-endless" onPress={onEndless} style={({ pressed }) => [s.modeCard, pressed && s.pressed]}>
          <View style={s.modeTop}>
            <MaterialCommunityIcons name="infinity" size={28} color={T.accent} />
            <Text style={[s.modeTag, { color: T.mutedForeground }]}>BEST {best} M</Text>
          </View>
          <Text style={[s.modeTitle, { color: T.foreground }]}>ENDLESS</Text>
          <Text style={[s.modeBody, { color: T.mutedForeground }]}>No destination. City, precinct, hospital, again. Run until they catch you.</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ---------- campaign map ----------
export function CampaignMap({ top, bottom, campaign, loaded, onStart, onReplay, onBack }: {
  top: number; bottom: number; campaign: CampaignProgress; loaded: boolean; onStart: (id: number) => void; onReplay: (id: number) => void; onBack: () => void;
}) {
  const next = MISSIONS.find((m) => !campaign.completed.includes(m.id) && missionUnlocked(campaign, m.id))?.id ?? 10;
  const [sel, setSel] = useState<number>(next);
  useEffect(() => { setSel(next); }, [next]);
  const m = MISSIONS.find((x) => x.id === sel) ?? MISSIONS[0];
  const unlocked = missionUnlocked(campaign, m.id);
  const done = campaign.completed.includes(m.id);
  return (
    <View style={[StyleSheet.absoluteFill, s.scrimDeep, { paddingTop: top + 8, paddingBottom: bottom + 10 }]} testID="campaign-map">
      <View style={s.mapHead}>
        <Pressable testID="campaign-back" onPress={onBack} hitSlop={10} style={s.back}><Feather name="chevron-left" size={20} color={T.foreground} /><Text style={s.backText}>Back</Text></Pressable>
        <Text style={s.kicker}>ESCAPE ROUTE · {campaign.completed.length}/10</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
        {MISSIONS.map((mi, i) => {
          const ok = missionUnlocked(campaign, mi.id); const fin = campaign.completed.includes(mi.id); const isNext = mi.id === next && !fin;
          const on = mi.id === sel;
          return (
            <Pressable key={mi.id} testID={`mission-${mi.id}`} disabled={!ok} accessibilityState={{ disabled: !ok, selected: on }} onPress={() => setSel(mi.id)} style={s.stopRow}>
              <View style={s.rail}>
                {i > 0 && <View style={[s.railLine, { top: 0, height: 22 }, fin || ok ? s.railLit : null]} />}
                <View style={[s.node, fin && s.nodeDone, isNext && s.nodeNext, !ok && s.nodeLocked]}>
                  {fin ? <Feather name="check" size={14} color={T.accentForeground} /> : ok ? <Text style={[s.nodeNum, isNext && { color: T.primaryForeground }]}>{mi.id}</Text> : <Feather name="lock" size={12} color={T.mutedForeground} />}
                </View>
                {i < MISSIONS.length - 1 && <View style={[s.railLine, { top: 46, bottom: 0 }, fin ? s.railLit : null]} />}
              </View>
              <View style={[s.stopCard, on && s.stopOn, isNext && !on && s.stopNext, !ok && { opacity: 0.45 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.stopTitle, !ok && { color: T.mutedForeground }]}>{mi.title}</Text>
                  <Text style={s.stopDest} numberOfLines={1}>{ok ? mi.destination : 'LOCKED · REACH THE PREVIOUS DESTINATION'}</Text>
                </View>
                {fin && campaign.bestTimes[mi.id] ? <Text style={s.stopTime}>{fmtTime(campaign.bestTimes[mi.id])}</Text> : isNext ? <Text style={s.nextTag}>NEXT</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Briefing m={m} unlocked={unlocked} done={done} loaded={loaded} best={campaign.bestTimes[m.id]} onStart={() => onStart(m.id)} onReplay={() => onReplay(m.id)} />
    </View>
  );
}

function Briefing({ m, unlocked, done, loaded, best, onStart, onReplay }: { m: MissionDefinition; unlocked: boolean; done: boolean; loaded: boolean; best?: number; onStart: () => void; onReplay: () => void }) {
  return (
    <View style={s.brief} testID="mission-briefing">
      <View style={s.briefTop}>
        <Text style={s.briefNum}>{String(m.id).padStart(2, '0')}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.briefTitle}>{m.title}</Text>
          <Text style={s.briefMeta}>{m.finish} M · {m.sections.length} SECTIONS{best ? ` · BEST ${fmtTime(best)}` : ''}</Text>
        </View>
      </View>
      <Text style={s.briefBody}>{m.briefing}</Text>
      <View style={s.chips}>
        {m.item && <View style={s.chip}><MaterialCommunityIcons name={ITEM_ICON[m.item]} size={14} color={T.accent} /><Text style={s.chipText}>{m.itemName}</Text></View>}
        {m.activationAt && <View style={s.chip}><MaterialCommunityIcons name="lighthouse" size={14} color={T.primary} /><Text style={s.chipText}>TERMINAL BEACON</Text></View>}
        <View style={s.chip}><Feather name="flag" size={13} color={T.primary} /><Text style={s.chipText}>{m.destination}</Text></View>
      </View>
      <View style={s.briefBtns}>
        {done && (
          <Pressable testID="mission-replay-cutscene" onPress={onReplay} style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
            <Feather name="film" size={16} color={T.accent} /><Text style={s.ghostText}>Scene</Text>
          </Pressable>
        )}
        <Pressable testID="mission-start" disabled={!unlocked || !loaded} onPress={onStart} style={({ pressed }) => [s.cta, { flex: 1 }, pressed && s.pressed, (!unlocked || !loaded) && { opacity: 0.45 }]}>
          <Text style={s.ctaText}>{!loaded ? 'LOADING' : !unlocked ? 'LOCKED' : done ? 'RUN AGAIN' : 'START'}</Text>
          <Feather name={unlocked ? 'arrow-up-right' : 'lock'} size={20} color={T.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

// ---------- in-run objective HUD ----------
export interface MissionHudData { id: number; title: string; objective: string; section: string; item?: string; itemName?: string; collected: boolean; recovering: boolean; progress: number; activating: boolean }
export function MissionHud({ h }: { h: MissionHudData }) {
  return (
    <View style={s.mhWrap} pointerEvents="none" testID="mission-hud">
      <View style={[s.mh, h.recovering && { borderLeftColor: T.accent }, h.activating && { borderLeftColor: T.primary }]}>
        <Text style={s.mhSection} numberOfLines={1}>{String(h.id).padStart(2, '0')} · {h.section.toUpperCase()}</Text>
        <Text style={s.mhObj} numberOfLines={2} testID="mission-objective">{h.objective}</Text>
        <View style={s.mhTrack}><View style={[s.mhFill, { width: `${Math.round(h.progress * 100)}%` }]} /></View>
        {h.item && (
          <View style={s.mhItem}>
            <MaterialCommunityIcons name={ITEM_ICON[h.item]} size={13} color={h.collected ? T.accent : T.mutedForeground} />
            <Text style={[s.mhItemText, h.collected && { color: T.accent }]}>{h.collected ? (h.item === 'survivors' ? 'GROUP FOLLOWING' : `CARRYING ${h.itemName}`) : h.recovering ? 'MISSED · MOVED AHEAD' : 'NOT YET FOUND'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---------- cutscene overlay ----------
export function CutsceneOverlay({ id, t, top, bottom, replay, onSkip }: { id: number; t: number; top: number; bottom: number; replay: boolean; onSkip: () => void }) {
  const m = MISSIONS.find((x) => x.id === id) ?? MISSIONS[0];
  const len = cutsceneLength(id); const line = cutsceneLine(id, t);
  const fade = Math.max(Math.max(0, 1 - t / 0.5), Math.max(0, (t - (len - 0.4)) / 0.4));
  return (
    <View style={StyleSheet.absoluteFill} testID="mission-cutscene">
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: T.background, opacity: fade }]} />
      <View pointerEvents="none" style={[s.letterbox, { top: 0, height: top + 40 }]} />
      <View pointerEvents="none" style={[s.letterbox, { bottom: 0, height: bottom + 96 }]} />
      <View style={[s.cutTop, { top: top + 8 }]} pointerEvents="box-none">
        <View>
          <Text style={s.cutKicker}>{SCENE_KICKER[m.scene]}{replay ? ' · REPLAY' : ''}</Text>
          <Text style={s.cutTitle}>{m.title.toUpperCase()}</Text>
        </View>
        <Pressable testID="mission-cutscene-skip" accessibilityLabel="Skip scene" onPress={onSkip} hitSlop={10} style={({ pressed }) => [s.skip, pressed && s.pressed]}>
          <Text style={s.skipText}>SKIP</Text><Feather name="skip-forward" size={14} color={T.foreground} />
        </Pressable>
      </View>
      {line && (
        <View pointerEvents="none" style={[s.subWrap, { bottom: bottom + 22 }]}>
          <Text key={line.index} style={s.sub} testID="mission-subtitle">{line.text}</Text>
          <View style={s.dots}>{[0, 1, 2].map((i) => <View key={i} style={[s.dot, i <= line.index && s.dotOn]} />)}</View>
        </View>
      )}
    </View>
  );
}

// ---------- completion panels ----------
export function MissionSaving({ top, bottom, title }: { top: number; bottom: number; title: string }) {
  return (
    <View style={[StyleSheet.absoluteFill, s.scrim, s.center, { paddingTop: top, paddingBottom: bottom }]} testID="mission-saving">
      <View style={s.panel}>
        <Text style={[s.kicker, { color: T.accent }]}>DESTINATION REACHED</Text>
        <Text style={s.panelTitle}>{title}</Text>
        <View style={s.saveBar}><View style={s.saveFill} /></View>
        <Text style={s.panelSub}>Writing the route to your logbook before anything else happens.</Text>
      </View>
    </View>
  );
}
export function MissionSaveError({ top, bottom, message, busy, onRetry, onAbandon }: { top: number; bottom: number; message: string; busy: boolean; onRetry: () => void; onAbandon: () => void }) {
  return (
    <View style={[StyleSheet.absoluteFill, s.scrim, s.center, { paddingTop: top, paddingBottom: bottom }]} testID="mission-save-error">
      <View style={s.panel}>
        <Text style={[s.kicker, { color: T.destructive }]}>NOT SAVED YET</Text>
        <Text style={s.panelTitle}>You made it. The logbook did not.</Text>
        <Text style={s.panelSub}>{message}</Text>
        <Pressable testID="mission-save-retry" disabled={busy} onPress={onRetry} style={({ pressed }) => [s.cta, pressed && s.pressed, busy && { opacity: 0.5 }]}>
          <Feather name="save" size={20} color={T.primaryForeground} /><Text style={s.ctaText}>{busy ? 'SAVING' : 'RETRY SAVE'}</Text>
        </Pressable>
        <Pressable testID="campaign-back" onPress={onAbandon} style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
          <Feather name="map" size={16} color={T.accent} /><Text style={s.ghostText}>Leave without saving</Text>
        </Pressable>
      </View>
    </View>
  );
}
export function MissionSuccess({ top, bottom, m, seconds, best, coins, hasNext, onNext, onRetry, onCampaign, onScene }: {
  top: number; bottom: number; m: MissionDefinition; seconds: number; best?: number; coins: number; hasNext: boolean; onNext: () => void; onRetry: () => void; onCampaign: () => void; onScene: () => void;
}) {
  const finale = m.id === 10;
  return (
    <View style={[StyleSheet.absoluteFill, s.scrim, { paddingTop: top, paddingBottom: bottom }]} testID="mission-success">
      <ScrollView contentContainerStyle={s.center} showsVerticalScrollIndicator={false}>
        <View style={s.panel}>
          <Text style={[s.kicker, { color: T.accent }]}>{finale ? 'ESCAPED THE CITY' : `MISSION ${m.id} COMPLETE`}</Text>
          <Text style={s.panelTitle}>{m.destination}</Text>
          <Text style={s.panelSub}>{m.completion[2]}</Text>
          <View style={s.resRow}>
            <View style={s.resCell}><Text style={s.resVal}>{fmtTime(seconds)}</Text><Text style={s.resLab}>TIME</Text></View>
            <View style={s.resDiv} />
            <View style={s.resCell}><Text style={s.resVal}>{best ? fmtTime(best) : '—'}</Text><Text style={s.resLab}>BEST</Text></View>
            <View style={s.resDiv} />
            <View style={s.resCell}><Text style={s.resVal}>{coins}</Text><Text style={s.resLab}>SUPPLIES</Text></View>
          </View>
          {hasNext && (
            <Pressable testID="mission-next" onPress={onNext} style={({ pressed }) => [s.cta, pressed && s.pressed]}>
              <Text style={s.ctaText}>NEXT MISSION</Text><Feather name="arrow-right" size={20} color={T.primaryForeground} />
            </Pressable>
          )}
          <View style={s.rowBtns}>
            <Pressable testID="mission-retry" onPress={onRetry} style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
              <Feather name="rotate-ccw" size={16} color={T.accent} /><Text style={s.ghostText}>Replay mission</Text>
            </Pressable>
            <Pressable testID="mission-scene" onPress={onScene} style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
              <Feather name="film" size={16} color={T.accent} /><Text style={s.ghostText}>Scene</Text>
            </Pressable>
            <Pressable testID="campaign-back" onPress={onCampaign} style={({ pressed }) => [s.ghost, pressed && s.pressed]}>
              <Feather name="map" size={16} color={T.accent} /><Text style={s.ghostText}>Campaign</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scrim: { backgroundColor: T.scrim },
  scrimDeep: { backgroundColor: 'rgba(14,15,26,0.9)' },
  center: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  kicker: { fontFamily: F.s, fontSize: 11, letterSpacing: 2.6, color: T.accent },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { fontFamily: F.s, fontSize: 14, color: T.foreground },
  chooserBody: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, gap: 14, maxWidth: 520, width: '100%', alignSelf: 'center' },
  modeCard: { padding: 18, borderRadius: colors.radius, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, gap: 6 },
  modeEscape: { backgroundColor: T.primary, borderColor: T.primaryEdge, paddingVertical: 22 },
  modeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modeTag: { fontFamily: F.b, fontSize: 11, letterSpacing: 2, color: T.primaryForeground },
  modeTitle: { fontFamily: F.b, fontSize: 34, letterSpacing: 4, color: T.primaryForeground, marginTop: 6 },
  modeBody: { fontFamily: F.m, fontSize: 14, lineHeight: 20, color: T.primaryForeground, opacity: 0.85 },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(34,22,10,0.25)', overflow: 'hidden', marginTop: 8 },
  trackFill: { height: 4, backgroundColor: T.primaryForeground },
  mapHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  stopRow: { flexDirection: 'row', alignItems: 'stretch', minHeight: 66 },
  rail: { width: 40, alignItems: 'center' },
  railLine: { position: 'absolute', width: 2, backgroundColor: T.border },
  railLit: { backgroundColor: T.accent },
  node: { marginTop: 20, width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: T.border, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center' },
  nodeDone: { backgroundColor: T.accent, borderColor: T.accent },
  nodeNext: { backgroundColor: T.primary, borderColor: T.primaryEdge, transform: [{ scale: 1.15 }] },
  nodeLocked: { backgroundColor: T.muted },
  nodeNum: { fontFamily: F.b, fontSize: 12, color: T.foreground },
  stopCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border },
  stopOn: { borderColor: T.accent, backgroundColor: T.secondary },
  stopNext: { borderColor: T.primary },
  stopTitle: { fontFamily: F.b, fontSize: 15, color: T.foreground },
  stopDest: { fontFamily: F.s, fontSize: 10, letterSpacing: 1.6, color: T.mutedForeground, marginTop: 3 },
  stopTime: { fontFamily: F.b, fontSize: 13, color: T.accent, fontVariant: ['tabular-nums'] },
  nextTag: { fontFamily: F.b, fontSize: 10, letterSpacing: 2, color: T.primary },
  brief: { marginHorizontal: 12, padding: 16, borderRadius: colors.radius, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, gap: 10 },
  briefTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  briefNum: { fontFamily: F.b, fontSize: 30, color: T.primary, fontVariant: ['tabular-nums'] },
  briefTitle: { fontFamily: F.b, fontSize: 19, color: T.foreground },
  briefMeta: { fontFamily: F.s, fontSize: 10, letterSpacing: 1.6, color: T.mutedForeground, marginTop: 2 },
  briefBody: { fontFamily: F.r, fontSize: 14, lineHeight: 20, color: T.foreground, opacity: 0.9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 99, backgroundColor: T.muted },
  chipText: { fontFamily: F.s, fontSize: 10, letterSpacing: 1.2, color: T.foreground },
  briefBtns: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: T.primary, paddingVertical: 15, paddingHorizontal: 20, borderRadius: colors.radius, borderBottomWidth: 3, borderBottomColor: T.primaryEdge },
  ctaText: { fontFamily: F.b, fontSize: 17, letterSpacing: 3, color: T.primaryForeground },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, paddingHorizontal: 12 },
  ghostText: { fontFamily: F.s, fontSize: 14, color: T.foreground },
  mhWrap: { alignItems: 'flex-start', marginLeft: 16, marginTop: 8, marginRight: 90 },
  mh: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: T.glass, borderLeftWidth: 3, borderLeftColor: T.accent, gap: 4, maxWidth: 300 },
  mhSection: { fontFamily: F.s, fontSize: 10, letterSpacing: 1.8, color: T.mutedForeground },
  mhObj: { fontFamily: F.b, fontSize: 13, letterSpacing: 1, color: T.foreground, fontVariant: ['tabular-nums'] },
  mhTrack: { height: 3, borderRadius: 2, backgroundColor: T.border, overflow: 'hidden' },
  mhFill: { height: 3, backgroundColor: T.primary },
  mhItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mhItemText: { fontFamily: F.s, fontSize: 10, letterSpacing: 1.4, color: T.mutedForeground },
  letterbox: { position: 'absolute', left: 0, right: 0, backgroundColor: '#0B0C14' },
  cutTop: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cutKicker: { fontFamily: F.s, fontSize: 10, letterSpacing: 2.6, color: T.accent },
  cutTitle: { fontFamily: F.b, fontSize: 14, letterSpacing: 2.5, color: T.foreground, marginTop: 2 },
  skip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border },
  skipText: { fontFamily: F.b, fontSize: 12, letterSpacing: 2, color: T.foreground },
  subWrap: { position: 'absolute', left: 22, right: 22, alignItems: 'center', gap: 10 },
  sub: { fontFamily: F.s, fontSize: 17, lineHeight: 24, color: T.foreground, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 18, height: 3, borderRadius: 2, backgroundColor: T.border },
  dotOn: { backgroundColor: T.primary },
  panel: { width: '100%', maxWidth: 440, alignSelf: 'center', padding: 22, borderRadius: colors.radius, backgroundColor: T.card, borderWidth: 1, borderColor: T.border, gap: 12 },
  panelTitle: { fontFamily: F.b, fontSize: 26, color: T.foreground, letterSpacing: 0.5 },
  panelSub: { fontFamily: F.r, fontSize: 14, lineHeight: 20, color: T.mutedForeground },
  saveBar: { height: 3, borderRadius: 2, backgroundColor: T.border, overflow: 'hidden' },
  saveFill: { width: '60%', height: 3, backgroundColor: T.accent },
  resRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: T.glass, borderWidth: 1, borderColor: T.border },
  resCell: { flex: 1, alignItems: 'center' },
  resVal: { fontFamily: F.b, fontSize: 20, color: T.foreground, fontVariant: ['tabular-nums'] },
  resLab: { fontFamily: F.s, fontSize: 9, letterSpacing: 1.8, color: T.mutedForeground, marginTop: 3 },
  resDiv: { width: 1, height: 28, backgroundColor: T.border },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
